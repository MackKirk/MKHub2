import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock3 } from 'lucide-react';
import { api } from '@/lib/api';
import { getTodayLocal } from '@/lib/dateUtils';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { uiCx, uiRadius, uiTypography } from '@/components/ui';

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

type ClockInOutWidgetProps = {
  config?: Record<string, unknown>;
};

export function ClockInOutWidget({ config: _config }: ClockInOutWidgetProps) {
  const { ready } = useAnimationReady();
  const todayStr = getTodayLocal();
  const [clockModal, setClockModal] = useState<'in' | 'out' | null>(null);

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

  const { data: allAttendancesData, isLoading: loadingAttendances } = useQuery({
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
  const canClockOut = hasOpenClockIn && !!openClockIn && (openClockIn.status === 'approved' || openClockIn.status === 'pending');
  const showSummary = !loadingAttendances;

  if (!currentUser?.id) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      {clockModal ? (
        <ClockInOutModalLayer
          selectedDate={todayStr}
          clockType={clockModal}
          onClose={() => setClockModal(null)}
        />
      ) : null}

      <div className="mb-2.5 shrink-0">
        <div className={uiCx(uiTypography.overline, 'flex items-center gap-1.5')}>
          <Clock3 className="h-3 w-3" aria-hidden />
          Today
        </div>
        <div className="text-sm font-semibold text-gray-900">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <div className="mb-3 flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => canClockIn && setClockModal('in')}
          disabled={!canClockIn}
          className={uiCx(
            'flex-1 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors',
            uiRadius.control,
            'bg-green-600 hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          Log hours
        </button>
        <button
          type="button"
          onClick={() => canClockOut && setClockModal('out')}
          disabled={!canClockOut}
          className={uiCx(
            'flex-1 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors',
            uiRadius.control,
            'bg-amber-600 hover:bg-amber-700 disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          Clock out
        </button>
      </div>

      {loadingAttendances && (
        <LoadingOverlay isLoading minHeight="min-h-[100px]" className="min-h-0 flex-1">
          <div className="min-h-[100px]" />
        </LoadingOverlay>
      )}

      {showSummary && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto text-xs">
          {hasOpenClockIn ? (
            <div
              className={uiCx(
                'border border-amber-200/80 bg-amber-50/70 px-2.5 py-2',
                uiRadius.control,
              )}
            >
              <span className="font-medium text-amber-900">Entry is missing an end time</span>
            </div>
          ) : null}
          {!hasOpenClockIn && nextPendingShift ? (
            <div className={uiCx('bg-gray-50 px-2.5 py-2 text-gray-700', uiRadius.control)}>
              <span className="font-medium">Next:</span>{' '}
              {nextPendingShift.project_name || 'Shift'} ({formatTime12h(nextPendingShift.start_time)} –{' '}
              {formatTime12h(nextPendingShift.end_time)})
            </div>
          ) : null}
          {allAttendancesForDate.length > 0 ? (
            <div className="divide-y divide-gray-100 text-gray-600">
              {allAttendancesForDate
                .filter((a) => a.clock_in_time || a.clock_out_time)
                .slice(0, 3)
                .map((a) => (
                  <div key={a.id} className="flex justify-between gap-2 py-1.5 tabular-nums">
                    <span>{formatTime12h(a.clock_in_time ? new Date(a.clock_in_time).toTimeString().slice(0, 5) : null)}</span>
                    <span className="text-gray-400">–</span>
                    <span>
                      {a.clock_out_time
                        ? formatTime12h(new Date(a.clock_out_time).toTimeString().slice(0, 5))
                        : '--:--'}
                    </span>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      )}

      <div className="mt-auto shrink-0 border-t border-gray-100 pt-2">
        <Link to="/clock-in-out" className="text-xs font-medium text-brand-red hover:underline">
          Open full page →
        </Link>
      </div>
    </FadeInOnMount>
  );
}
