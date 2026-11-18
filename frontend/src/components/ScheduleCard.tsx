import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateLocal, formatTimeVancouver } from '@/lib/dateUtils';
import type { Task, TaskBuckets } from '@/components/tasks/types';
import { ClockActionTile } from '@/components/ClockActionTile';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import {
  AppBadge,
  AppButton,
  AppFormModal,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  ListTodo,
  Loader2,
  MapPin,
  Users,
  XCircle,
} from 'lucide-react';
import ShiftAckPanel from '@/components/ShiftAckPanel';
import { ShiftAckQuickActions } from '@/components/ShiftAckQuickActions';
import { ShiftLocationMapEmbed } from '@/components/ShiftLocationMapEmbed';
import {
  SCHEDULE_PENDING_ACK_QUERY_KEY,
  shiftAckMeta,
  shiftAckNeedsResponse,
  shiftAckTracked,
} from '@/lib/shiftAck';

/** Visual theme for Shift Details — matches TimeOff / Log hours modals. */
function shiftDetailTheme(ackStatus?: string | null) {
  const tracked = shiftAckTracked(ackStatus);
  const s = (ackStatus || 'pending').toLowerCase();
  if (!tracked) {
    return {
      heroGradient: 'bg-gradient-to-br from-[#c22033] via-[#a31414] to-[#7f1010]',
      iconTone: 'text-[#c22033]',
      tintSoft: 'bg-red-50',
      tintText: 'text-red-800',
      tipClass: 'border-red-100 bg-red-50 text-red-800',
      statusLabel: 'SCHEDULED',
      statusHint: 'No confirmation required for this shift.',
      tip: 'Review the details and location before you head out.',
      HeroIcon: Briefcase,
    };
  }
  if (s === 'accepted') {
    return {
      heroGradient: 'bg-gradient-to-br from-green-500 via-green-600 to-emerald-800',
      iconTone: 'text-green-700',
      tintSoft: 'bg-green-50',
      tintText: 'text-green-800',
      tipClass: 'border-green-100 bg-green-50 text-green-800',
      statusLabel: 'ACCEPTED',
      statusHint: 'You confirmed you will attend.',
      tip: 'You can clock in when the shift starts.',
      HeroIcon: CheckCircle2,
    };
  }
  if (s === 'declined') {
    return {
      heroGradient: 'bg-gradient-to-br from-red-500 via-red-600 to-rose-800',
      iconTone: 'text-red-700',
      tintSoft: 'bg-red-50',
      tintText: 'text-red-800',
      tipClass: 'border-red-100 bg-red-50 text-red-800',
      statusLabel: 'DECLINED',
      statusHint: 'You declined this shift.',
      tip: null,
      HeroIcon: XCircle,
    };
  }
  return {
    heroGradient: 'bg-gradient-to-br from-amber-400 via-amber-500 to-orange-700',
    iconTone: 'text-amber-700',
    tintSoft: 'bg-amber-50',
    tintText: 'text-amber-900',
    tipClass: 'border-amber-100 bg-amber-50 text-amber-900',
    statusLabel: 'NEEDS RESPONSE',
    statusHint: 'Accept or decline before the day starts.',
    /** No tip — confirmation actions are on the left; status card already explains. */
    tip: null,
    HeroIcon: AlertTriangle,
  };
}

function projectAddressParts(project: any): string[] {
  let parts = [
    project?.address,
    project?.address_city,
    project?.address_province,
    project?.address_country,
  ].filter(Boolean) as string[];
  if (parts.length === 0) {
    parts = [
      project?.site_address_line1,
      project?.site_city,
      project?.site_province,
      project?.site_country,
    ].filter(Boolean) as string[];
  }
  return parts;
}

function parseProjectCoord(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function attendanceBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'danger';
}

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
  project_address?: string | null;
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
  type?: 'in' | 'out';
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null;
  status: string;
  source: string;
};

function sortShiftsByDateTime(a: Shift, b: Shift) {
  return (
    String(a.date).localeCompare(String(b.date)) ||
    String(a.start_time).localeCompare(String(b.start_time))
  );
}

export default function ScheduleCard() {
  const queryClient = useQueryClient();
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
  const detailShift = selectedShift;
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

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });

  const { data: shifts = [], isLoading: shiftsLoading, refetch: refetchShifts } = useQuery({
    queryKey: ['schedule-shifts', dateRange, currentUser?.id],
    queryFn: () => {
      const workerId = currentUser?.id;
      if (!workerId) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
    },
    enabled: !!currentUser?.id,
  });

  /** Next ~30 days for confirm queue + upcoming list (left column). */
  const { data: windowShifts = [], isLoading: windowShiftsLoading } = useQuery({
    queryKey: [...SCHEDULE_PENDING_ACK_QUERY_KEY, 'list', currentUser?.id],
    queryFn: async () => {
      const workerId = currentUser?.id;
      if (!workerId) return [] as Shift[];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      const range = `${formatDateLocal(start)},${formatDateLocal(end)}`;
      return api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${encodeURIComponent(range)}&worker_id=${encodeURIComponent(workerId)}`,
      ).catch(() => [] as Shift[]);
    },
    enabled: !!currentUser?.id,
    staleTime: 30_000,
  });

  const pendingAckShifts = useMemo(
    () => windowShifts.filter((shift) => shiftAckNeedsResponse(shift.ack_status)).slice().sort(sortShiftsByDateTime),
    [windowShifts],
  );

  const upcomingShifts = useMemo(
    () =>
      windowShifts
        .filter((shift) => !shiftAckNeedsResponse(shift.ack_status))
        .slice()
        .sort(sortShiftsByDateTime),
    [windowShifts],
  );

  const leftColumnShifts = pendingAckShifts.length > 0 ? pendingAckShifts : upcomingShifts;
  const leftShowingPending = pendingAckShifts.length > 0;

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

  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const { data: project } = useQuery({
    queryKey: ['project', detailShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${detailShift?.project_id}`),
    enabled: !!detailShift?.project_id,
  });

  const { data: workerProfile } = useQuery({
    queryKey: ['worker-profile', detailShift?.worker_id],
    queryFn: () => api<any>('GET', `/users/${detailShift?.worker_id}`),
    enabled: !!detailShift?.worker_id,
  });

  const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
  const { data: attendances = [], refetch: refetchAttendances } = useQuery({
    queryKey: ['schedule-attendances', shiftIds.join(',')],
    queryFn: async () => {
      if (shiftIds.length === 0) return [];
      const promises = shiftIds.map(async (shiftId) => {
        try {
          return await api<Attendance[]>('GET', `/dispatch/shifts/${shiftId}/attendance`);
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

  const { refetch: refetchSelectedShiftAttendances } = useQuery({
    queryKey: ['shift-attendances', detailShift?.id],
    queryFn: () => api<Attendance[]>('GET', `/dispatch/shifts/${detailShift?.id}/attendance`),
    enabled: !!detailShift?.id,
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

  const worker = useMemo(() => {
    if (!detailShift) return null;
    return employees?.find((e: any) => e.id === detailShift.worker_id);
  }, [detailShift, employees]);

  const attendance = detailShift ? attendances.find((a: Attendance) => a.shift_id === detailShift.id) : null;
  const clockIn = attendance?.clock_in_time ? attendance : null;
  const clockOut = attendance?.clock_out_time ? attendance : null;
  const canClockIn = detailShift ? !attendance?.clock_in_time || attendance.status === 'rejected' : false;
  const canClockOut = detailShift
    ? Boolean(
        attendance?.clock_in_time &&
          (attendance.status === 'approved' || attendance.status === 'pending') &&
          !attendance.clock_out_time,
      )
    : false;
  const isOwnShift = Boolean(
    currentUser && detailShift && String(currentUser.id) === String(detailShift.worker_id),
  );

  const openShiftDetail = (shift: Shift) => {
    const day = String(shift.date || '').slice(0, 10);
    if (day) {
      setSelectedDate(day);
      const d = new Date(`${day}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
      }
    }
    setSelectedShift(shift);
  };

  const closeShiftDetail = () => {
    setSelectedShift(null);
  };

  const invalidatePendingAcks = () => {
    void queryClient.invalidateQueries({ queryKey: [...SCHEDULE_PENDING_ACK_QUERY_KEY] });
  };

  const applyDetailShiftUpdate = (updated: any) => {
    if (selectedShift?.id === updated.id) {
      setSelectedShift((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    }
    void refetchShifts();
    invalidatePendingAcks();
  };

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const chipTime = (timeStr: string) => formatTime12h(timeStr).replace(':00', '').replace(' ', '').toLowerCase();

  const renderAckDot = (status?: string | null, size: 'sm' | 'md' = 'sm') => {
    if (!shiftAckTracked(status)) return null;
    const meta = shiftAckMeta(status);
    return (
      <AppTooltip content={meta.longLabel} placement="top">
        <span
          className={uiCx(
            'shrink-0 rounded-full ring-1 ring-white/90',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
            meta.dotClass,
          )}
          aria-label={meta.longLabel}
        />
      </AppTooltip>
    );
  };

  const renderShiftDetailBody = (shift: Shift) => {
    const canShowClockActions =
      isOwnShift && (!shiftAckTracked(shift.ack_status) || shift.ack_status === 'accepted');
    /** Hide attendance until accepted (or ack is not required). Pending/declined stay hidden. */
    const showAttendance =
      !shiftAckNeedsResponse(shift.ack_status) &&
      (shift.ack_status || '').toLowerCase() !== 'declined';
    const addressParts = project ? projectAddressParts(project) : [];
    const addressLabel = addressParts.length > 0 ? addressParts.join(', ') : null;
    const mapLat = parseProjectCoord(project?.lat);
    const mapLng = parseProjectCoord(project?.lng);
    const mapsUrl = addressLabel
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLabel)}`
      : mapLat != null && mapLng != null
        ? `https://www.google.com/maps/search/?api=1&query=${mapLat},${mapLng}`
        : null;
    const theme = shiftDetailTheme(shift.ack_status);
    const HeroIcon = theme.HeroIcon;
    const isAccepted = (shift.ack_status || '').toLowerCase() === 'accepted';
    const attendanceOnLeft = showAttendance && isAccepted;
    const dateLabel = new Date(`${String(shift.date).slice(0, 10)}T12:00:00`).toLocaleDateString(
      'en-US',
      { weekday: 'short', month: 'short', day: 'numeric' },
    );
    const supervisor = workerProfile?.manager_user_id
      ? employees?.find((e: any) => e.id === workerProfile.manager_user_id)
      : null;

    const attendanceCard = showAttendance ? (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Clock className="h-3.5 w-3.5 text-gray-500" />
          Attendance
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-600">Clock In</span>
            {clockIn ? (
              <div className="flex items-center gap-2">
                <AppBadge
                  variant={attendanceBadgeVariant(clockIn.status)}
                  className="normal-case tracking-normal text-sm"
                >
                  {clockIn.status === 'approved'
                    ? 'Approved'
                    : clockIn.status === 'pending'
                      ? 'Pending'
                      : 'Rejected'}
                </AppBadge>
                <span className="text-sm font-semibold text-gray-900">
                  {clockIn.clock_in_time
                    ? formatTimeVancouver(clockIn.clock_in_time, {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : clockIn.time_selected_utc
                      ? formatTimeVancouver(clockIn.time_selected_utc, {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '--'}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-600">Not clocked in</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-600">Clock Out</span>
            {clockOut ? (
              <div className="flex items-center gap-2">
                <AppBadge
                  variant={attendanceBadgeVariant(clockOut.status)}
                  className="normal-case tracking-normal text-sm"
                >
                  {clockOut.status === 'approved'
                    ? 'Approved'
                    : clockOut.status === 'pending'
                      ? 'Pending'
                      : 'Rejected'}
                </AppBadge>
                <span className="text-sm font-semibold text-gray-900">
                  {clockOut.clock_out_time
                    ? formatTimeVancouver(clockOut.clock_out_time, {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : clockOut.time_selected_utc
                      ? formatTimeVancouver(clockOut.time_selected_utc, {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : '--'}
                </span>
              </div>
            ) : (
              <span className="text-sm text-gray-600">Not clocked out</span>
            )}
          </div>
        </div>
      </div>
    ) : null;

    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] md:items-start">
        <div className="space-y-3">
          <div
            className={uiCx(
              'flex items-center gap-3 px-4 py-3.5 text-white shadow-sm',
              uiRadius.card,
              theme.heroGradient,
            )}
          >
            <span
              className={uiCx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white',
                theme.iconTone,
              )}
            >
              <HeroIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {shift.project_name || 'Shift'}
              </div>
              <div className="text-sm text-white/85">
                {dateLabel} · {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
              </div>
            </div>
          </div>

          {shift.job_name ? (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <div className="text-xs font-semibold text-gray-600">Job type</div>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">{shift.job_name}</div>
            </div>
          ) : null}

          {shift.notes?.trim() ? (
            <div className="rounded-xl border border-gray-200 bg-slate-50 px-3 py-2.5">
              <div className="text-xs font-semibold text-gray-600">Note</div>
              <div className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">
                {shift.notes.trim()}
              </div>
            </div>
          ) : null}

          <div className={uiCx('rounded-xl border px-3 py-2.5', theme.tintSoft, 'border-transparent')}>
            <div className={uiCx('mb-2 flex items-center gap-2 text-sm font-semibold', theme.tintText)}>
              <Users className="h-3.5 w-3.5" />
              People
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs font-semibold text-gray-600">Worker</div>
                <div className="text-sm font-semibold text-gray-900">
                  {worker?.name || worker?.username || 'No worker info'}
                </div>
              </div>
              {workerProfile?.manager_user_id ? (
                <div>
                  <div className="text-xs font-semibold text-gray-600">Supervisor</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {supervisor?.name || supervisor?.username || 'N/A'}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {shiftAckTracked(shift.ack_status) ? (
            <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
              <div className="mb-2 text-xs font-semibold tracking-wide text-gray-600">
                Confirmation
              </div>
              <ShiftAckPanel mode="worker" shift={shift} onUpdated={applyDetailShiftUpdate} />
            </div>
          ) : null}

          {attendanceOnLeft ? attendanceCard : null}
        </div>

        <div className="space-y-3">
          <div className={uiCx('rounded-2xl px-3.5 py-3.5', theme.tintSoft)}>
            <div className={uiCx('text-xs font-semibold tracking-wide', theme.tintText)}>
              {theme.statusLabel}
            </div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{theme.statusHint}</div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              Location
            </div>
            <div className="text-sm text-gray-900">{addressLabel || 'No address available'}</div>
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-sm font-semibold text-[#c22033] hover:underline"
              >
                Open in Google Maps
              </a>
            ) : null}
            {mapLat != null && mapLng != null ? (
              <ShiftLocationMapEmbed
                className="mt-3"
                lat={mapLat}
                lng={mapLng}
                label={shift.project_name || addressLabel || 'Shift location'}
                height={180}
              />
            ) : null}
          </div>

          {!attendanceOnLeft ? attendanceCard : null}

          {theme.tip ? (
            <div
              className={uiCx(
                'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
                theme.tipClass,
              )}
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{theme.tip}</span>
            </div>
          ) : null}

          {canShowClockActions ? (
            <div className="space-y-2">
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
          ) : null}
        </div>
      </div>
    );
  };

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
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
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

  const renderLeftShiftCard = (shift: Shift, showActions: boolean) => {
    const dateLabel = new Date(`${String(shift.date).slice(0, 10)}T12:00:00`).toLocaleDateString(
      'en-US',
      { weekday: 'short', month: 'short', day: 'numeric' },
    );
    const isSelected = selectedShift?.id === shift.id;
    return (
      <li
        key={shift.id}
        className={uiCx(
          'rounded-lg border px-3 py-3',
          isSelected ? 'border-[#c22033] bg-red-50/60' : 'border-gray-200 bg-white',
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => (isSelected ? closeShiftDetail() : openShiftDetail(shift))}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <span className="mt-1.5">{renderAckDot(shift.ack_status, 'md')}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">
                {dateLabel} · {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
              </span>
              <span className="block text-sm text-gray-700">{shift.project_name || 'Shift'}</span>
              {shift.project_address ? (
                <span className="block text-sm text-gray-500">{shift.project_address}</span>
              ) : null}
              {shift.job_name ? <span className="block text-sm text-gray-500">{shift.job_name}</span> : null}
            </span>
          </button>
          {showActions ? (
            <div className="w-[14rem] shrink-0">
              <ShiftAckQuickActions
                shiftId={shift.id}
                ackStatus={shift.ack_status}
                onUpdated={applyDetailShiftUpdate}
                className="mt-0"
              />
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <div
      className={uiCx(
        'grid min-h-0 grid-cols-1 gap-3',
        'h-full max-xl:overflow-y-auto max-xl:content-start',
        'xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-stretch xl:overflow-hidden',
      )}
    >
      {/* Left ~60%: confirm queue or upcoming shifts */}
      <section
        className={uiCx(
          uiRadius.card,
          uiBorders.subtle,
          uiColors.surface,
          'flex min-h-0 min-w-0 flex-col overflow-hidden',
          'max-xl:max-h-[min(55vh,32rem)] xl:h-full',
        )}
      >
        <header className="shrink-0 border-b border-gray-100 px-4 py-3">
          {leftShowingPending ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900">
                {pendingAckShifts.length === 1
                  ? '1 shift needs your attention'
                  : `${pendingAckShifts.length} shifts need your attention`}
              </h2>
              <p className="mt-0.5 text-sm text-gray-600">
                Accept or decline each shift. Tap a card for full details.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Your upcoming shifts</h2>
              <p className="mt-0.5 text-sm text-gray-600">
                You&apos;re all set — nothing waiting for confirmation.
              </p>
            </>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {windowShiftsLoading && windowShifts.length === 0 ? (
            <p className={uiCx(uiTypography.helper, 'flex items-center gap-2 text-gray-500')}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading shifts…
            </p>
          ) : leftColumnShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden />
              <p className="text-sm font-semibold text-gray-900">You&apos;re all set</p>
              <p className={uiCx(uiTypography.helper, 'text-gray-500')}>
                No upcoming shifts in the next 30 days.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {!leftShowingPending ? (
                <li className="mb-1 flex items-center gap-2 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  <span>All confirmations done. Tap a shift for details.</span>
                </li>
              ) : null}
              {leftColumnShifts.map((shift) => renderLeftShiftCard(shift, leftShowingPending))}
            </ul>
          )}
        </div>
      </section>

      {/* Right ~40%: Today / Tomorrow + compact calendar */}
      <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden xl:h-full">
        <div className="flex max-h-[38%] min-h-0 shrink-0 flex-col gap-3 overflow-y-auto xl:max-h-[40%]">
        {agendaDates.map((dateStr) => {
          const heading = dayHeading(dateStr, todayStr);
          const dayShifts = shiftsByDate[dateStr] || [];
          const dayTasks = tasksByDate[dateStr] || [];
          const empty = dayShifts.length === 0 && dayTasks.length === 0;
          return (
            <section
              key={dateStr}
              className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, 'shrink-0 p-3')}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {heading.kicker}
                  </div>
                  {heading.label ? (
                    <div className="text-sm font-semibold text-gray-900">{heading.label}</div>
                  ) : null}
                </div>
                {dayShifts.length + dayTasks.length > 0 ? (
                  <span className="text-xs text-gray-500">
                    {dayShifts.length + dayTasks.length} item
                    {dayShifts.length + dayTasks.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              {shiftsLoading && shifts.length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'flex items-center gap-2 text-gray-500')}>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </p>
              ) : empty ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Nothing scheduled</p>
              ) : (
                <div className="space-y-1.5">
                  {dayTasks.map((task) => (
                    <Link
                      key={task.id}
                      to="/tasks"
                      className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 transition-colors hover:border-gray-300"
                    >
                      <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Task
                        </span>
                        <span className="block text-sm font-semibold text-gray-900">{task.title}</span>
                      </span>
                    </Link>
                  ))}
                  {dayShifts.map((shift) => {
                    const isSelected = selectedShift?.id === shift.id;
                    return (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={() => (isSelected ? closeShiftDetail() : openShiftDetail(shift))}
                        className={uiCx(
                          'flex w-full gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                          isSelected
                            ? 'border-[#c22033] bg-red-50'
                            : 'border-gray-200 bg-white hover:border-gray-300',
                        )}
                      >
                        <Clock
                          className={uiCx(
                            'mt-0.5 h-3.5 w-3.5 shrink-0',
                            isSelected ? 'text-[#c22033]' : 'text-gray-400',
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-sm font-semibold text-gray-900">
                              {formatTime12h(shift.start_time)} – {formatTime12h(shift.end_time)}
                            </span>
                            {renderAckDot(shift.ack_status, 'sm')}
                          </span>
                          <span className="block text-sm text-gray-700">
                            {shift.project_name || 'Shift'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        </div>

        <section
          className={uiCx(
            uiRadius.card,
            uiBorders.subtle,
            uiColors.surface,
            'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          )}
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
            <div className="flex min-w-0 items-center gap-1">
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => goToPeriod(-1)}
                aria-label="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => goToPeriod(1)}
                aria-label="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </AppButton>
              <h2 className="truncate text-sm font-semibold text-gray-900">{periodLabel}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
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
              <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
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
                      'rounded px-2 py-0.5 text-xs font-semibold capitalize',
                      viewMode === mode
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:text-gray-900',
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {viewMode === 'day' ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="mb-3 flex items-center gap-2">
                {dayNumber(selectedDate)}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    {selectedDate === todayStr
                      ? 'Today'
                      : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
                          weekday: 'long',
                        })}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">
                    {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>
              {chipsFor(selectedDate).length === 0 ? (
                <p className={uiCx(uiTypography.helper, 'text-gray-500')}>Nothing scheduled</p>
              ) : (
                <div className="space-y-1.5">
                  {chipsFor(selectedDate).map((chip) =>
                    chip.kind === 'shift' ? (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() =>
                          selectedShift?.id === chip.shift.id
                            ? closeShiftDetail()
                            : openShiftDetail(chip.shift)
                        }
                        className={uiCx(
                          'flex w-full gap-2 rounded-lg border px-2.5 py-2 text-left',
                          selectedShift?.id === chip.shift.id
                            ? 'border-[#c22033] bg-red-50'
                            : 'border-gray-200 bg-white hover:border-gray-300',
                        )}
                      >
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#7f1010]" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-sm font-semibold text-gray-900">
                              {formatTime12h(chip.shift.start_time)} –{' '}
                              {formatTime12h(chip.shift.end_time)}
                            </span>
                            {renderAckDot(chip.shift.ack_status, 'sm')}
                          </span>
                          <span className="block text-sm text-gray-700">
                            {chip.shift.project_name || 'Shift'}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <Link
                        key={chip.key}
                        to="/tasks"
                        className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2"
                      >
                        <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                        <span>
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                            Task
                          </span>
                          <span className="block text-sm font-semibold text-gray-900">{chip.label}</span>
                        </span>
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="grid shrink-0 grid-cols-7 border-b border-gray-200 bg-gray-50">
                {weekdayLabels.map((label) => (
                  <div
                    key={label}
                    className="px-0.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {label.slice(0, 2)}
                  </div>
                ))}
              </div>
              <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
                {(viewMode === 'week' ? weekDates : monthCells).map((dateStr, index) => {
                  if (!dateStr) {
                    return (
                      <div
                        key={`pad-${index}`}
                        className="min-h-0 border-b border-r border-gray-100 bg-gray-50/70"
                      />
                    );
                  }
                  const chips = chipsFor(dateStr);
                  const limit = viewMode === 'week' ? 4 : 2;
                  const visible = chips.slice(0, limit);
                  const extra = chips.length - visible.length;
                  return (
                    <div
                      key={dateStr}
                      className={uiCx(
                        'flex min-h-0 flex-col border-b border-r border-gray-100 p-1',
                        viewMode === 'week' ? 'min-h-[5.5rem]' : 'min-h-[2.75rem]',
                        dateStr === selectedDate ? 'bg-red-50/70' : 'bg-white',
                      )}
                    >
                      <div className="mb-0.5">{dayNumber(dateStr)}</div>
                      <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                        {visible.map((chip) =>
                          chip.kind === 'shift' ? (
                            <button
                              key={chip.key}
                              type="button"
                              title={chip.label}
                              onClick={() => openShiftDetail(chip.shift)}
                              className={uiCx(
                                'relative truncate rounded px-1 py-0.5 pr-3 text-left text-[10px] font-semibold leading-3',
                                selectedShift?.id === chip.shift.id
                                  ? 'bg-[#c22033] text-white'
                                  : 'bg-red-50 text-[#7f1010] hover:bg-red-100',
                              )}
                            >
                              {chip.label}
                              {shiftAckTracked(chip.shift.ack_status) ? (
                                <span
                                  className={uiCx(
                                    'absolute right-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ring-1',
                                    selectedShift?.id === chip.shift.id
                                      ? 'ring-white/50'
                                      : 'ring-white/90',
                                    shiftAckMeta(chip.shift.ack_status).dotClass,
                                  )}
                                  title={shiftAckMeta(chip.shift.ack_status).longLabel}
                                  aria-label={shiftAckMeta(chip.shift.ack_status).longLabel}
                                />
                              ) : null}
                            </button>
                          ) : (
                            <Link
                              key={chip.key}
                              to="/tasks"
                              title={chip.label}
                              onClick={() => setSelectedDate(dateStr)}
                              className="truncate rounded bg-gray-100 px-1 py-0.5 text-left text-[10px] font-semibold leading-3 text-gray-700 hover:bg-gray-200"
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
                            className="px-0.5 text-left text-[10px] font-semibold text-gray-500 hover:text-gray-800"
                          >
                            +{extra}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </aside>

      {selectedShift ? (
        <AppFormModal
          open
          onClose={closeShiftDetail}
          title="Shift Details"
          description={selectedShift.project_name || 'Scheduled shift'}
          formWidth="wide"
          dialogClassName="!w-[min(96vw,56rem)] !max-w-[min(96vw,56rem)]"
          scrollBody={false}
          bodyFill={false}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeShiftDetail}>
                Close
              </AppButton>
            </div>
          }
        >
          {/* overflow-y-auto only shows a scrollbar when content exceeds max height */}
          <div className="max-h-[min(70vh,42rem)] overflow-y-auto overflow-x-hidden pr-0.5">
            {renderShiftDetailBody(selectedShift)}
          </div>
        </AppFormModal>
      ) : null}

      {clockType && detailShift ? (
        <ClockInOutModalLayer
          selectedDate={detailShift.date}
          clockType={clockType}
          onClose={handleCloseClockModal}
          shiftById={detailShift}
          onBusyChange={setClockModalSubmitting}
        />
      ) : null}
    </div>
  );
}
