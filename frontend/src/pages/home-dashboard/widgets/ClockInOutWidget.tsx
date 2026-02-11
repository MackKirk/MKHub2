import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';

type Shift = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  project_name?: string;
  status?: string;
};

type Attendance = {
  id: string;
  shift_id: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  reason_text?: string;
  job_type?: string;
};

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function isHoursWorked(a: Attendance): boolean {
  return !!a.reason_text && a.reason_text.includes('HOURS_WORKED:');
}

function getJobTypeFromAttendance(a: Attendance): string | null {
  if (a.job_type) return a.job_type;
  if (a.reason_text?.startsWith('JOB_TYPE:')) {
    const part = a.reason_text.split('|')[0] ?? '';
    return part.replace('JOB_TYPE:', '') || null;
  }
  return null;
}

type ClockInOutWidgetProps = {
  config?: Record<string, unknown>;
};

export function ClockInOutWidget({ config: _config }: ClockInOutWidgetProps) {
  const { ready } = useAnimationReady();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const todayStr = getTodayLocal();
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const { data: shiftsForDate = [] } = useQuery<Shift[]>({
    queryKey: ['clock-in-out-shifts', todayStr, currentUser?.id],
    queryFn: () => {
      if (!currentUser?.id) return Promise.resolve([]);
      return api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${todayStr},${todayStr}&worker_id=${currentUser.id}&status=scheduled`
      );
    },
    enabled: !!currentUser?.id,
  });

  const scheduledShifts = useMemo(
    () => (Array.isArray(shiftsForDate) ? shiftsForDate.filter((s) => s.status === 'scheduled') : []),
    [shiftsForDate]
  );

  const { data: allAttendancesData, isLoading: loadingAttendances, refetch: refetchAllAttendances } = useQuery({
    queryKey: ['clock-in-out-all-attendances', todayStr, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [], shifts: [] };
      const shifts = await api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${todayStr},${todayStr}&worker_id=${currentUser.id}`
      );
      const attendances: Attendance[] = [];
      for (const shift of shifts ?? []) {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`);
          attendances.push(...(atts ?? []));
        } catch {
          // ignore
        }
      }
      try {
        const direct = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${todayStr}`);
        attendances.push(...(direct ?? []));
      } catch {
        // ignore
      }
      return { attendances, shifts: shifts ?? [] };
    },
    enabled: !!currentUser?.id,
  });

  const allAttendancesForDate = allAttendancesData?.attendances ?? [];

  const { openClockIn, hasOpenClockIn } = useMemo(() => {
    const events = allAttendancesForDate
      .filter((a) => !!(a.clock_in_time || a.clock_out_time))
      .map((a) => ({ a, tMs: new Date((a.clock_in_time || a.clock_out_time)!).getTime() }))
      .sort((x, y) => x.tMs - y.tMs);

    const openStack: { att: Attendance }[] = [];
    for (const { a } of events) {
      if (isHoursWorked(a)) continue;
      if (a.clock_in_time && a.clock_out_time) continue;
      if (a.clock_in_time && !a.clock_out_time) {
        openStack.push({ att: a });
        continue;
      }
      if (a.clock_out_time && !a.clock_in_time && openStack.length) openStack.pop();
    }
    const open = openStack.length ? openStack[openStack.length - 1].att : null;
    return { openClockIn: open, hasOpenClockIn: !!open };
  }, [allAttendancesForDate]);

  const shiftCompletionById = useMemo(() => {
    const map = new Map<string, boolean>();
    const byShift = new Map<string, Attendance[]>();
    for (const a of allAttendancesForDate) {
      if (!a.shift_id) continue;
      const arr = byShift.get(a.shift_id) ?? [];
      arr.push(a);
      byShift.set(a.shift_id, arr);
    }
    for (const [, arr] of byShift) {
      const completed = arr.some((x) => x.clock_in_time && x.clock_out_time);
      for (const a of arr) if (a.shift_id) map.set(a.shift_id, completed);
    }
    return map;
  }, [allAttendancesForDate]);

  const nextPendingShift = useMemo(() => {
    for (const s of scheduledShifts) {
      if (!shiftCompletionById.get(s.id)) return s;
    }
    return null;
  }, [scheduledShifts, shiftCompletionById]);

  const canClockIn = !hasOpenClockIn;
  const canClockOut = hasOpenClockIn && openClockIn;

  const clockInJobType = useMemo(() => {
    if (!openClockIn) return null;
    return getJobTypeFromAttendance(openClockIn);
  }, [openClockIn]);

  const workingDurationLive = useMemo(() => {
    if (!hasOpenClockIn || !openClockIn?.clock_in_time) return null;
    const clockInDate = new Date(openClockIn.clock_in_time);
    const diffMs = currentTime.getTime() - clockInDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return diffHours > 0 ? `${diffHours}h ${diffMinutes}m` : `${diffMinutes}m`;
  }, [hasOpenClockIn, openClockIn, currentTime]);

  useEffect(() => {
    if (!hasOpenClockIn) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(interval);
  }, [hasOpenClockIn]);

  const mutateClock = useMutation({
    mutationFn: async (params: { type: 'in' | 'out' }) => {
      const now = new Date();
      const dateStr = formatDateLocal(now);
      const hours = now.getHours();
      const minutes = Math.floor(now.getMinutes() / 5) * 5;
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      const timeSelectedLocal = `${dateStr}T${timeStr}:00`;

      if (params.type === 'out') {
        if (!openClockIn) throw new Error('No open clock-in to close');
        if (openClockIn.shift_id) {
          return api('POST', '/dispatch/attendance', {
            type: 'out',
            time_selected_local: timeSelectedLocal,
            shift_id: openClockIn.shift_id,
          });
        }
        const jobType = clockInJobType ?? '0';
        return api('POST', '/dispatch/attendance/direct', {
          type: 'out',
          time_selected_local: timeSelectedLocal,
          job_type: jobType,
        });
      }

      if (nextPendingShift?.id) {
        return api('POST', '/dispatch/attendance', {
          type: 'in',
          time_selected_local: timeSelectedLocal,
          shift_id: nextPendingShift.id,
        });
      }
      return api('POST', '/dispatch/attendance/direct', {
        type: 'in',
        time_selected_local: timeSelectedLocal,
        job_type: '0',
      });
    },
    onSuccess: (_data: { status?: string }, variables) => {
      const status = _data?.status ?? 'pending';
      if (status === 'approved') toast.success(`Clock-${variables.type} approved`);
      else toast.success(`Clock-${variables.type} submitted for approval`);
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-all-attendances', todayStr, currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-shifts'] });
      refetchAllAttendances();
    },
    onError: (err: { response?: { data?: { detail?: string } }; message?: string }) => {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to submit';
      toast.error(msg);
    },
  });

  const handleClockIn = async () => {
    if (!canClockIn) return;
    const result = await confirm({
      title: 'Clock In',
      message: 'Clock in now with current time?',
      confirmText: 'Clock In',
      cancelText: 'Cancel',
    });
    if (result === 'confirm') mutateClock.mutate({ type: 'in' });
  };

  const handleClockOut = async () => {
    if (!canClockOut) return;
    const result = await confirm({
      title: 'Clock Out',
      message: 'Clock out now with current time?',
      confirmText: 'Clock Out',
      cancelText: 'Cancel',
    });
    if (result === 'confirm') mutateClock.mutate({ type: 'out' });
  };

  const showSummary = !loadingAttendances;

  if (!currentUser?.id) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }

  const submitting = mutateClock.isPending;

  return (
    <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full">
      <div className="shrink-0 mb-2">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Today</div>
        <div className="text-sm font-semibold text-gray-900">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="flex gap-2 shrink-0 mb-3">
        <button
          type="button"
          onClick={handleClockIn}
          disabled={!canClockIn || submitting}
          className="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          Clock In
        </button>
        <button
          type="button"
          onClick={handleClockOut}
          disabled={!canClockOut || submitting}
          className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white font-semibold text-sm shadow-sm hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          Clock Out
        </button>
      </div>

      {loadingAttendances && (
        <LoadingOverlay isLoading minHeight="min-h-[100px]" className="flex-1 min-h-0">
          <div className="min-h-[100px]" />
        </LoadingOverlay>
      )}

      {showSummary && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 text-xs">
          {hasOpenClockIn && workingDurationLive && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2">
              <span className="font-medium text-amber-800">Working for {workingDurationLive}</span>
            </div>
          )}
          {!hasOpenClockIn && nextPendingShift && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-gray-700">
              Next: {nextPendingShift.project_name || 'Shift'} ({formatTime12h(nextPendingShift.start_time)} –{' '}
              {formatTime12h(nextPendingShift.end_time)})
            </div>
          )}
          {allAttendancesForDate.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-gray-600">
              {allAttendancesForDate
                .filter((a) => a.clock_in_time || a.clock_out_time)
                .slice(0, 3)
                .map((a) => (
                  <div key={a.id} className="flex justify-between gap-2 py-0.5">
                    <span>{formatTime12h(a.clock_in_time ? new Date(a.clock_in_time).toTimeString().slice(0, 5) : null)}</span>
                    <span>–</span>
                    <span>
                      {a.clock_out_time
                        ? new Date(a.clock_out_time).toTimeString().slice(0, 5)
                        : '--:--'}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 pt-2 border-t border-gray-100 mt-auto">
        <Link to="/clock-in-out" className="text-xs font-medium text-brand-red hover:underline">
          Open full page →
        </Link>
      </div>
    </FadeInOnMount>
  );
}
