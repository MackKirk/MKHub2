import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import type { Task, TaskBuckets } from '@/components/tasks/types';
import { ClockActionTile } from '@/components/ClockActionTile';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppSectionHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, ListTodo, Loader2, MapPin } from 'lucide-react';
import ShiftAckPanel from '@/components/ShiftAckPanel';
import { ShiftAckQuickActions } from '@/components/ShiftAckQuickActions';
import {
  SCHEDULE_PENDING_ACK_QUERY_KEY,
  shiftAckMeta,
  shiftAckNeedsResponse,
  shiftAckTracked,
} from '@/lib/shiftAck';

function attendanceBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'danger';
}

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return formatDateLocal(d);
}

function dayHeading(dateStr: string, todayStr: string): { kicker: string; label: string } {
  const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (dateStr === todayStr) return { kicker: 'Today', label };
  if (dateStr === addDays(todayStr, 1)) return { kicker: 'Tomorrow', label };
  return { kicker: label, label: '' };
}

type Shift = {
  id: string;
  project_id: string;
  project_name?: string;
  worker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  job_name?: string;
  notes?: string | null;
  ack_status?: string | null;
  ack_note?: string | null;
  geofences?: any[];
};

type Attendance = {
  id: string;
  shift_id: string;
  type?: 'in' | 'out'; // For backward compatibility
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null; // For backward compatibility
  status: string;
  source: string;
};

export default function ScheduleCard() {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get('date');
  const shiftParam = searchParams.get('shift');
  const todayStr = formatDateLocal(new Date());

  const [selectedDate, setSelectedDate] = useState(() =>
    dateParam ? dateParam.slice(0, 10) : formatDateLocal(new Date()),
  );
  const [calMonth, setCalMonth] = useState(() => {
    const src = dateParam ? dateParam.slice(0, 10) : formatDateLocal(new Date());
    const d = new Date(`${src}T12:00:00`);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month');

  const dateRange = useMemo(() => {
    const tomorrow = addDays(todayStr, 1);
    let start = todayStr;
    let end = tomorrow;
    if (viewMode === 'day') {
      start = selectedDate < start ? selectedDate : start;
      end = selectedDate > end ? selectedDate : end;
    } else if (viewMode === 'week') {
      const weekStart = startOfWeek(selectedDate);
      const weekEnd = addDays(weekStart, 6);
      start = weekStart < start ? weekStart : start;
      end = weekEnd > end ? weekEnd : end;
    } else {
      const monthStart = formatDateLocal(new Date(calMonth.getFullYear(), calMonth.getMonth(), 1));
      const monthEnd = formatDateLocal(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
      start = monthStart < start ? monthStart : start;
      end = monthEnd > end ? monthEnd : end;
    }
    return `${start},${end}`;
  }, [calMonth, selectedDate, todayStr, viewMode]);

  // Fetch current user first
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });

  // Fetch shifts - always filter by current user's worker_id
  // This ensures only the logged-in user's shifts are shown in the schedule
  const { data: shifts = [], isLoading: shiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['schedule-shifts', dateRange, currentUser?.id],
    queryFn: () => {
      // Always filter by current user's ID to show only their shifts
      const workerId = currentUser?.id;
      if (!workerId) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
    },
    enabled: !!currentUser?.id,
  });

  const { data: pendingAckShifts = [] } = useQuery({
    queryKey: [...SCHEDULE_PENDING_ACK_QUERY_KEY, 'list', currentUser?.id],
    queryFn: async () => {
      const workerId = currentUser?.id;
      if (!workerId) return [] as Shift[];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      const range = `${formatDateLocal(start)},${formatDateLocal(end)}`;
      const upcoming = await api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${encodeURIComponent(range)}&worker_id=${encodeURIComponent(workerId)}`,
      ).catch(() => [] as Shift[]);
      return upcoming
        .filter((shift) => shiftAckNeedsResponse(shift.ack_status))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start_time).localeCompare(String(b.start_time)));
    },
    enabled: !!currentUser?.id,
    staleTime: 30_000,
  });

  const { data: taskBuckets } = useQuery({
    queryKey: ['schedule-tasks', currentUser?.id],
    queryFn: () => api<TaskBuckets>('GET', '/tasks?limit=300'),
    enabled: !!currentUser?.id,
    retry: false,
  });

  useEffect(() => {
    if (!dateParam) return;
    const day = dateParam.slice(0, 10);
    setSelectedDate(day);
    const d = new Date(`${day}T12:00:00`);
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [dateParam]);

  useEffect(() => {
    if (!shiftParam || shifts.length === 0) return;
    const shift = shifts.find((s) => s.id === shiftParam);
    if (shift) setSelectedShift(shift);
  }, [shiftParam, shifts]);

  // Fetch employees for worker names
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  // Fetch project details when a shift is selected
  const { data: project } = useQuery({
    queryKey: ['project', selectedShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${selectedShift?.project_id}`),
    enabled: !!selectedShift?.project_id,
  });

  // Fetch worker's employee profile to get supervisor
  const { data: workerProfile } = useQuery({
    queryKey: ['worker-profile', selectedShift?.worker_id],
    queryFn: () => api<any>('GET', `/users/${selectedShift?.worker_id}`),
    enabled: !!selectedShift?.worker_id,
  });

  // Fetch all attendances for shifts in the current month
  const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
  const { data: attendances = [], refetch: refetchAttendances } = useQuery({
    queryKey: ['schedule-attendances', shiftIds.join(',')],
    queryFn: async () => {
      if (shiftIds.length === 0) return [];
      const promises = shiftIds.map(async (shiftId) => {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shiftId}/attendance`);
          return atts;
        } catch (e) {
          console.error(`Failed to fetch attendance for shift ${shiftId}:`, e);
          return [];
        }
      });
      const allAttendances = await Promise.all(promises);
      return allAttendances.flat();
    },
    enabled: shiftIds.length > 0,
  });

  // Fetch attendances for selected shift
  const { data: selectedShiftAttendances = [], refetch: refetchSelectedShiftAttendances } = useQuery({
    queryKey: ['shift-attendances', selectedShift?.id],
    queryFn: () => api<Attendance[]>('GET', `/dispatch/shifts/${selectedShift?.id}/attendance`),
    enabled: !!selectedShift?.id,
  });

  const openTasks = useMemo(() => {
    const buckets = taskBuckets;
    if (!buckets) return [] as Task[];
    return [...(buckets.accepted || []), ...(buckets.in_progress || []), ...(buckets.blocked || [])].filter(
      (task) => Boolean(task.due_date),
    );
  }, [taskBuckets]);

  const shiftsByDate = useMemo(() => {
    const grouped: Record<string, Shift[]> = {};
    shifts.forEach((shift) => {
      const dateKey = String(shift.date || '').slice(0, 10);
      if (!dateKey) return;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(shift);
    });
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')),
    );
    return grouped;
  }, [shifts]);

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    openTasks.forEach((task) => {
      const dateKey = String(task.due_date || '').slice(0, 10);
      if (!dateKey) return;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(task);
    });
    return grouped;
  }, [openTasks]);

  const monthCells = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= lastDay; day++) {
      cells.push(formatDateLocal(new Date(year, month, day)));
    }
    return cells;
  }, [calMonth]);

  const weekDates = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selectedDate]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'day') {
      return new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
    }
    if (viewMode === 'week') {
      const start = new Date(`${weekDates[0]}T12:00:00`);
      const end = new Date(`${weekDates[6]}T12:00:00`);
      const sameMonth = start.getMonth() === end.getMonth();
      const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endLabel = end.toLocaleDateString('en-US', {
        month: sameMonth ? undefined : 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${startLabel} – ${endLabel}`;
    }
    return calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calMonth, selectedDate, viewMode, weekDates]);

  const goToPeriod = (direction: -1 | 1) => {
    if (viewMode === 'month') {
      setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + direction, 1));
      return;
    }
    const next = addDays(selectedDate, direction * (viewMode === 'week' ? 7 : 1));
    setSelectedDate(next);
    const d = new Date(`${next}T12:00:00`);
    setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const agendaDates = [todayStr, addDays(todayStr, 1)];

  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [clockModalSubmitting, setClockModalSubmitting] = useState(false);

  const handleCloseClockModal = () => {
    setClockType(null);
    void refetchShifts();
    void refetchAttendances();
    void refetchSelectedShiftAttendances();
  };

  // Get worker info
  const worker = useMemo(() => {
    if (!selectedShift) return null;
    return employees?.find((e: any) => e.id === selectedShift.worker_id);
  }, [selectedShift, employees]);

  // Get clock-in/out status
  // NEW MODEL: Get the attendance record (which may have both clock_in and clock_out)
  const attendance = selectedShift ? attendances.find((a: Attendance) => a.shift_id === selectedShift.id) : null;
  const clockIn = attendance?.clock_in_time ? attendance : null;
  const clockOut = attendance?.clock_out_time ? attendance : null;
  const canClockIn = selectedShift ? (!attendance?.clock_in_time || attendance.status === 'rejected') : false;
  const canClockOut = selectedShift
    ? attendance?.clock_in_time && (attendance.status === 'approved' || attendance.status === 'pending') && !attendance.clock_out_time
    : false;
  const isOwnShift = currentUser && selectedShift && String(currentUser.id) === String(selectedShift.worker_id);

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const chipTime = (timeStr: string) => formatTime12h(timeStr).replace(':00', '').replace(' ', '').toLowerCase();

  const chipsFor = (dateStr: string) => [
    ...(shiftsByDate[dateStr] || []).map((shift) => ({
      key: `s-${shift.id}`,
      kind: 'shift' as const,
      label: `${chipTime(shift.start_time)} ${shift.project_name || 'Shift'}`,
      shift,
    })),
    ...(tasksByDate[dateStr] || []).map((task) => ({
      key: `t-${task.id}`,
      kind: 'task' as const,
      label: task.title,
      task,
    })),
  ];

  const dayNumber = (dateStr: string) => (
    <button
      type="button"
      onClick={() => setSelectedDate(dateStr)}
      className={uiCx(
        'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
        dateStr === selectedDate
          ? 'bg-[#c22033] text-white'
          : dateStr === todayStr
            ? 'bg-sky-100 text-sky-800'
            : 'text-gray-800 hover:bg-gray-100',
      )}
    >
      {Number(dateStr.slice(8, 10))}
    </button>
  );

  return (
    <div className="space-y-4">
      {pendingAckShifts.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-950">
                {pendingAckShifts.length === 1
                  ? '1 shift needs your confirmation'
                  : `${pendingAckShifts.length} shifts need your confirmation`}
              </h2>
              <p className="mt-0.5 text-sm text-amber-800">
                Say if you are going before the shift. Accept or decline each one below.
              </p>
              <ul className="mt-3 space-y-2">
                {pendingAckShifts.map((shift) => {
                  const dateLabel = new Date(`${String(shift.date).slice(0, 10)}T12:00:00`).toLocaleDateString(
                    'en-US',
                    { weekday: 'short', month: 'short', day: 'numeric' },
                  );
                  return (
                    <li
                      key={shift.id}
                      className="rounded-lg border border-amber-200 bg-white px-3 py-2.5"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          const day = String(shift.date).slice(0, 10);
                          setSelectedDate(day);
                          const d = new Date(`${day}T12:00:00`);
                          setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                          setSelectedShift(shift);
                        }}
                      >
                        <span className="block text-sm font-semibold text-gray-900">
                          {dateLabel} · {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                        </span>
                        <span className="block text-sm text-gray-600">{shift.project_name || 'Shift'}</span>
                      </button>
                      <ShiftAckQuickActions
                        shiftId={shift.id}
                        ackStatus={shift.ack_status}
                        onUpdated={(updated) => {
                          setSelectedShift((prev) =>
                            prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
                          );
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'min-w-0 overflow-hidden')}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <AppButton type="button" variant="secondary" size="sm" onClick={() => goToPeriod(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </AppButton>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => goToPeriod(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </AppButton>
            <h2 className="truncate text-lg font-semibold text-gray-900">{periodLabel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const now = new Date();
                setSelectedDate(formatDateLocal(now));
                setCalMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
            >
              Today
            </AppButton>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(['day', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setViewMode(mode);
                    if (mode === 'month') {
                      const d = new Date(`${selectedDate}T12:00:00`);
                      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                    }
                  }}
                  className={uiCx(
                    'rounded-md px-3 py-1 text-sm font-semibold capitalize',
                    viewMode === mode ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </header>

        {viewMode === 'day' ? (
          <div className="min-h-[28rem] p-4">
            <div className="mb-4 flex items-center gap-3">
              {dayNumber(selectedDate)}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {selectedDate === todayStr ? 'Today' : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
                </div>
                <div className="text-base font-semibold text-gray-900">
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>
            {chipsFor(selectedDate).length === 0 ? (
              <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Nothing scheduled</p>
            ) : (
              <div className="space-y-2">
                {chipsFor(selectedDate).map((chip) =>
                  chip.kind === 'shift' ? (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setSelectedShift((prev) => (prev?.id === chip.shift.id ? null : chip.shift))}
                      className={uiCx(
                        'flex w-full gap-3 rounded-lg border px-3 py-3 text-left',
                        selectedShift?.id === chip.shift.id
                          ? 'border-[#c22033] bg-red-50'
                          : 'border-gray-200 bg-white hover:border-gray-300',
                      )}
                    >
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#7f1010]" aria-hidden />
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">
                          {formatTime12h(chip.shift.start_time)} – {formatTime12h(chip.shift.end_time)}
                        </span>
                        <span className="block text-sm text-gray-700">{chip.shift.project_name || 'Shift'}</span>
                      </span>
                    </button>
                  ) : (
                    <Link
                      key={chip.key}
                      to="/tasks"
                      className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3"
                    >
                      <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                      <span>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Task</span>
                        <span className="block text-sm font-semibold text-gray-900">{chip.label}</span>
                      </span>
                    </Link>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {weekdayLabels.map((label) => (
                <div
                  key={label}
                  className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {(viewMode === 'week' ? weekDates : monthCells).map((dateStr, index) => {
                if (!dateStr) {
                  return (
                    <div
                      key={`pad-${index}`}
                      className="min-h-[7.5rem] border-b border-r border-gray-100 bg-gray-50/70"
                    />
                  );
                }
                const chips = chipsFor(dateStr);
                const limit = viewMode === 'week' ? 6 : 3;
                const visible = chips.slice(0, limit);
                const extra = chips.length - visible.length;
                return (
                  <div
                    key={dateStr}
                    className={uiCx(
                      'flex flex-col border-b border-r border-gray-100 p-1.5',
                      viewMode === 'week' ? 'min-h-[22rem]' : 'min-h-[7.5rem]',
                      dateStr === selectedDate ? 'bg-red-50/70' : 'bg-white',
                    )}
                  >
                    <div className="mb-1">{dayNumber(dateStr)}</div>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                      {visible.map((chip) =>
                        chip.kind === 'shift' ? (
                          <button
                            key={chip.key}
                            type="button"
                            title={chip.label}
                            onClick={() => {
                              setSelectedDate(dateStr);
                              setSelectedShift(chip.shift);
                            }}
                            className={uiCx(
                              'truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold leading-4',
                              selectedShift?.id === chip.shift.id
                                ? 'bg-[#c22033] text-white'
                                : 'bg-red-50 text-[#7f1010] hover:bg-red-100',
                            )}
                          >
                            {chip.label}
                          </button>
                        ) : (
                          <Link
                            key={chip.key}
                            to="/tasks"
                            title={chip.label}
                            onClick={() => setSelectedDate(dateStr)}
                            className="truncate rounded bg-gray-100 px-1.5 py-0.5 text-left text-[11px] font-semibold leading-4 text-gray-700 hover:bg-gray-200"
                          >
                            {chip.label}
                          </Link>
                        ),
                      )}
                      {extra > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(dateStr);
                            setViewMode('day');
                          }}
                          className="px-1 text-left text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                        >
                          +{extra} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <aside className="min-w-0 space-y-3">
        {agendaDates.map((dateStr) => {
          const heading = dayHeading(dateStr, todayStr);
          const dayShifts = shiftsByDate[dateStr] || [];
          const dayTasks = tasksByDate[dateStr] || [];
          const empty = dayShifts.length === 0 && dayTasks.length === 0;
          return (
            <section key={dateStr} className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'p-4')}>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{heading.kicker}</div>
                  {heading.label ? <div className="text-base font-semibold text-gray-900">{heading.label}</div> : null}
                </div>
                {dayShifts.length + dayTasks.length > 0 ? (
                  <span className="text-sm text-gray-500">
                    {dayShifts.length + dayTasks.length} item{dayShifts.length + dayTasks.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              {shiftsLoading && shifts.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'flex items-center gap-2 text-gray-500')}>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading schedule…
                </p>
              ) : empty ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Nothing scheduled</p>
              ) : (
                <div className="space-y-2">
                  {dayTasks.map((task) => (
                    <Link
                      key={task.id}
                      to="/tasks"
                      className="flex gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-300"
                    >
                      <ListTodo className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Task</span>
                        <span className="block text-sm font-semibold text-gray-900">{task.title}</span>
                        {task.project?.name ? (
                          <span className="block text-sm text-gray-600">{task.project.name}</span>
                        ) : null}
                      </span>
                    </Link>
                  ))}
                  {dayShifts.map((shift) => {
                    const isSelected = selectedShift?.id === shift.id;
                    return (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={() => setSelectedShift((prev) => (prev?.id === shift.id ? null : shift))}
                        className={uiCx(
                          'flex w-full gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'border-[#c22033] bg-red-50'
                            : 'border-gray-200 bg-white hover:border-gray-300',
                        )}
                      >
                        <Clock className={uiCx('mt-0.5 h-4 w-4 shrink-0', isSelected ? 'text-[#c22033]' : 'text-gray-400')} aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900">
                            {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                          </span>
                          <span className="block text-sm text-gray-700">{shift.project_name || 'Shift'}</span>
                          {shift.job_name ? <span className="block text-sm text-gray-500">{shift.job_name}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {selectedShift ? (
      <AppCard title="Shift Details" className="min-w-0">
          <div className={uiSpacing.sectionStack}>
            {/* Core Info Section */}
            <div className={uiSpacing.sectionStack}>
              <AppSectionHeader title="Core Info" />
              
              {/* Project Card */}
              {selectedShift.project_name && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Project</div>
                  <div className={uiTypography.sectionTitle}>{selectedShift.project_name}</div>
                </div>
              )}

              {/* Date & Time Card */}
              <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Date & Time</div>
                <div className={uiTypography.sectionTitle}>
                  {new Date(selectedShift.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <p className={uiCx(uiTypography.body, 'mt-1')}>
                  {formatTime12h(selectedShift.start_time)} - {formatTime12h(selectedShift.end_time)}
                </p>
              </div>

              {/* Job Type Card */}
              {selectedShift.job_name && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Job Type</div>
                  <div className={uiTypography.sectionTitle}>{selectedShift.job_name}</div>
                </div>
              )}

              {selectedShift.notes?.trim() ? (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Note</div>
                  <div className="text-sm text-gray-900 whitespace-pre-wrap">{selectedShift.notes.trim()}</div>
                </div>
              ) : null}

              {shiftAckTracked(selectedShift.ack_status) ? (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Confirmation</div>
                  <ShiftAckPanel
                    mode="worker"
                    shift={selectedShift}
                    onUpdated={(updated) => {
                      setSelectedShift((prev) =>
                        prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
                      );
                      void refetchShifts();
                    }}
                  />
                </div>
              ) : null}
            </div>

            {/* People Section */}
            <div className={uiCx(uiSpacing.sectionStack, "border-t border-gray-100 pt-2")}>
              <AppSectionHeader title="People" />
              
              {/* Worker Card */}
              {worker && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Worker</div>
                  <div className={uiTypography.sectionTitle}>{worker.name || worker.username}</div>
                </div>
              )}

              {/* Supervisor Card */}
              {workerProfile?.manager_user_id && (
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Supervisor</div>
                  <div className={uiTypography.sectionTitle}>
                    {(() => {
                      const supervisor = employees?.find((e: any) => e.id === workerProfile.manager_user_id);
                      return supervisor?.name || supervisor?.username || 'N/A';
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Location Section */}
            {project && (
              <div className={uiCx(uiSpacing.sectionStack, "border-t border-gray-100 pt-2")}>
                <AppSectionHeader title="Location" />
                
                <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding)}>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Address</div>
                      <div className="text-sm text-gray-900">
                        {(() => {
                          let addressParts = [
                            project.address,
                            project.address_city,
                            project.address_province,
                            project.address_country,
                          ].filter(Boolean);
                          
                          if (addressParts.length === 0) {
                            addressParts = [
                              project.site_address_line1,
                              project.site_city,
                              project.site_province,
                              project.site_country,
                            ].filter(Boolean);
                          }
                          
                          return addressParts.length > 0
                            ? addressParts.join(', ')
                            : 'No address available';
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Status Card */}
            <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding, "border-t border-gray-100 pt-2")}>
              <AppSectionHeader title="Attendance Status" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Clock In:</span>
                  </div>
                  {clockIn ? (
                    <div className="flex items-center gap-2">
                      <AppBadge
                        variant={attendanceBadgeVariant(clockIn.status)}
                        className="normal-case tracking-normal text-sm"
                      >
                        {clockIn.status === 'approved' ? 'Approved' : clockIn.status === 'pending' ? 'Pending' : 'Rejected'}
                      </AppBadge>
                      <span className={uiTypography.sectionTitle}>
                        {clockIn.clock_in_time ? new Date(clockIn.clock_in_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockIn.time_selected_utc ? new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">Not clocked in</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">Clock Out:</span>
                  </div>
                  {clockOut ? (
                    <div className="flex items-center gap-2">
                      <AppBadge
                        variant={attendanceBadgeVariant(clockOut.status)}
                        className="normal-case tracking-normal text-sm"
                      >
                        {clockOut.status === 'approved' ? 'Approved' : clockOut.status === 'pending' ? 'Pending' : 'Rejected'}
                      </AppBadge>
                      <span className={uiTypography.sectionTitle}>
                        {clockOut.clock_out_time ? new Date(clockOut.clock_out_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockOut.time_selected_utc ? new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-600">Not clocked out</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Actions */}
            {isOwnShift && (
              <div className="border-t border-gray-100 pt-4">
                <AppSectionHeader title="Actions" />
                <div className="space-y-3">
                  <ClockActionTile
                    kind="in"
                    enabled={canClockIn}
                    disabled={clockModalSubmitting}
                    onClick={() => setClockType('in')}
                    title={!canClockIn ? 'Cannot clock in for this shift' : undefined}
                  />
                  <ClockActionTile
                    kind="out"
                    enabled={canClockOut}
                    disabled={clockModalSubmitting}
                    onClick={() => setClockType('out')}
                    title={
                      !canClockOut && attendance?.clock_in_time
                        ? 'Clock-in must be approved or pending'
                        : !canClockOut
                          ? 'Clock in first to clock out'
                          : undefined
                    }
                  />
                </div>
              </div>
            )}
          </div>
      </AppCard>
        ) : null}
      </aside>

      {clockType && selectedShift && (
        <ClockInOutModalLayer
          selectedDate={selectedShift.date}
          clockType={clockType}
          onClose={handleCloseClockModal}
          shiftById={selectedShift}
          onBusyChange={setClockModalSubmitting}
        />
      )}
    </div>
    </div>
  );
}



