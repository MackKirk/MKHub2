import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, ChevronLeft, ChevronRight, Clock, Coffee, Info, LogOut, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import { MyTimeOffPanel } from '@/pages/clock/MyTimeOffPanel';
import {
  AppButton,
  AppCard,
  AppDatePicker,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type PersonalTab = 'hours' | 'time-off' | 'sick';

type Shift = {
  id: string;
  project_id?: string;
  project_name?: string;
  worker_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
};

type Attendance = {
  id: string;
  shift_id: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  time_selected_utc?: string | null;
  reason_text?: string;
  break_minutes?: number | null;
};

type WeeklySummaryDay = {
  date: string;
  day_name: string;
  clock_in: string | null;
  clock_out: string | null;
  job_name?: string;
  hours_worked_minutes: number;
  hours_worked_formatted: string;
};

type WeeklySummary = {
  week_start: string;
  week_end: string;
  days: WeeklySummaryDay[];
  total_minutes: number;
  total_hours_formatted: string;
  reg_hours_formatted?: string;
  total_break_formatted?: string;
};

const TAB_PATH: Record<PersonalTab, string> = {
  hours: '/clock-in-out',
  'time-off': '/time-off',
  sick: '/sick-leave',
};

function tabFromPath(pathname: string): PersonalTab {
  if (pathname === '/sick-leave') return 'sick';
  if (pathname === '/time-off') return 'time-off';
  return 'hours';
}

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatClockTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function capitalizeWeekday(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function weekStartSunday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function isHoursWorked(a: Attendance): boolean {
  return !!a.reason_text && a.reason_text.includes('HOURS_WORKED:');
}

function HoursPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const shiftIdFromUrl = searchParams.get('shift_id');
  const typeFromUrl = searchParams.get('type') as 'in' | 'out' | null;
  const dateFromUrl = searchParams.get('date');
  const todayStr = getTodayLocal();

  const [selectedDate, setSelectedDate] = useState(() => dateFromUrl || todayStr);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [weekStart, setWeekStart] = useState(() => weekStartSunday());

  const weekStartStr = useMemo(() => formatDateLocal(weekStart), [weekStart]);

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
  });

  const { data: shiftById } = useQuery({
    queryKey: ['shift-by-id', shiftIdFromUrl],
    queryFn: () => {
      if (!shiftIdFromUrl) return Promise.resolve(null);
      return api<Shift>('GET', `/dispatch/shifts/${shiftIdFromUrl}`);
    },
    enabled: !!shiftIdFromUrl,
  });

  const { data: allAttendancesData } = useQuery({
    queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [] as Attendance[], shifts: [] as Shift[] };
      const shifts = await api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${selectedDate},${selectedDate}&worker_id=${currentUser.id}`,
      ).catch(() => []);
      const attendances: Attendance[] = [];
      for (const shift of shifts ?? []) {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`);
          attendances.push(...(atts ?? []));
        } catch {
          // keep going
        }
      }
      try {
        const direct = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${selectedDate}`);
        attendances.push(...(direct ?? []));
      } catch {
        // optional
      }
      return { attendances, shifts: shifts ?? [] };
    },
    enabled: !!currentUser?.id,
  });

  const allAttendancesForDate = allAttendancesData?.attendances ?? [];
  const shiftsForDate = allAttendancesData?.shifts ?? [];

  const { openClockIn, hasOpenClockIn } = useMemo(() => {
    const events = allAttendancesForDate
      .filter((a) => !!(a.clock_in_time || a.clock_out_time))
      .map((a) => ({ a, tMs: new Date((a.clock_in_time || a.clock_out_time)!).getTime() }))
      .sort((x, y) => x.tMs - y.tMs);

    const openStack: Attendance[] = [];
    for (const { a } of events) {
      if (isHoursWorked(a)) continue;
      if (a.clock_in_time && a.clock_out_time) continue;
      if (a.clock_in_time && !a.clock_out_time) {
        openStack.push(a);
        continue;
      }
      if (a.clock_out_time && !a.clock_in_time && openStack.length) openStack.pop();
    }
    const open = openStack.length ? openStack[openStack.length - 1] : null;
    return { openClockIn: open, hasOpenClockIn: !!open };
  }, [allAttendancesForDate]);

  const canClockOut =
    hasOpenClockIn &&
    !!openClockIn &&
    (openClockIn.status === 'approved' || openClockIn.status === 'pending');

  const shiftCompletionById = useMemo(() => {
    const map = new Map<string, boolean>();
    const byShift = new Map<string, Attendance[]>();
    for (const a of allAttendancesForDate) {
      if (!a.shift_id) continue;
      const arr = byShift.get(a.shift_id) ?? [];
      arr.push(a);
      byShift.set(a.shift_id, arr);
    }
    for (const [id, arr] of byShift) {
      map.set(id, arr.some((x) => x.clock_in_time && x.clock_out_time));
    }
    return map;
  }, [allAttendancesForDate]);

  const nextPendingShift = useMemo(() => {
    const scheduled = shiftsForDate
      .filter((s) => s.status === 'scheduled')
      .slice()
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    return scheduled.find((s) => !shiftCompletionById.get(s.id)) ?? null;
  }, [shiftsForDate, shiftCompletionById]);

  const { data: weeklySummary } = useQuery({
    queryKey: ['weekly-attendance-summary', weekStartStr, currentUser?.id],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('week_start', weekStartStr);
      if (currentUser?.id) params.set('worker_id', currentUser.id);
      return api<WeeklySummary>('GET', `/dispatch/attendance/weekly-summary?${params.toString()}`);
    },
    enabled: !!currentUser?.id,
  });

  useEffect(() => {
    if (shiftIdFromUrl && typeFromUrl && shiftById) {
      if (dateFromUrl) setSelectedDate(dateFromUrl);
      setClockType(typeFromUrl);
      const next = new URLSearchParams(searchParams);
      next.delete('shift_id');
      next.delete('type');
      next.delete('date');
      setSearchParams(next, { replace: true });
    }
  }, [shiftIdFromUrl, typeFromUrl, shiftById, dateFromUrl, searchParams, setSearchParams]);

  const isToday = selectedDate === todayStr;
  const isCurrentWeek = weekStartStr === formatDateLocal(weekStartSunday());
  const weekRangeLabel = weeklySummary
    ? `${formatShortDate(weeklySummary.week_start)} – ${formatShortDate(weeklySummary.week_end)}`
    : '';

  const infoBanner = hasOpenClockIn
    ? 'This entry is missing an end time. Use Clock out to add one.'
    : nextPendingShift
      ? `Next scheduled shift: ${nextPendingShift.project_name || 'Unknown'} (${formatTime12h(nextPendingShift.start_time)} – ${formatTime12h(nextPendingShift.end_time)})`
      : 'At the end of the day, log your start time and end time.';

  const daysWithHours = (weeklySummary?.days ?? []).filter(
    (day) => day.clock_in || day.clock_out || (day.hours_worked_minutes && day.hours_worked_minutes > 0),
  );

  return (
    <div className={uiCx(uiSpacing.sectionStack, 'max-w-2xl')}>
      <div className="flex flex-wrap items-center gap-2">
        <AppButton
          variant="secondary"
          size="sm"
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          onClick={() => {
            const d = new Date(`${selectedDate}T00:00:00`);
            d.setDate(d.getDate() - 1);
            setSelectedDate(formatDateLocal(d));
          }}
          aria-label="Previous day"
        />
        <AppButton variant="secondary" size="sm" onClick={() => setSelectedDate(todayStr)}>
          {isToday ? 'Today' : formatShortDate(selectedDate)}
        </AppButton>
        <AppButton
          variant="secondary"
          size="sm"
          rightIcon={<ChevronRight className="h-4 w-4" />}
          onClick={() => {
            const d = new Date(`${selectedDate}T00:00:00`);
            d.setDate(d.getDate() + 1);
            setSelectedDate(formatDateLocal(d));
          }}
          aria-label="Next day"
        />
        <AppDatePicker
          id="hours-date"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          triggerClassName="w-[9.5rem]"
          aria-label="Select date"
        />
      </div>

      <button
        type="button"
        disabled={modalSubmitting}
        onClick={() => setClockType('in')}
        className={uiCx(
          'flex min-h-[5.25rem] w-full items-center gap-3 bg-gradient-to-br from-green-500 via-green-600 to-emerald-800 px-4 py-5 text-left text-white shadow-md',
          uiRadius.card,
          'hover:brightness-105 disabled:opacity-60',
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-green-700">
          <Clock className="h-5 w-5" />
        </span>
        <span className="flex-1 text-lg font-semibold">Log hours</span>
        <ChevronRight className="h-5 w-5 opacity-90" />
      </button>

      {hasOpenClockIn && canClockOut ? (
        <button
          type="button"
          disabled={modalSubmitting}
          onClick={() => setClockType('out')}
          className={uiCx(
            'flex h-12 w-full items-center justify-center gap-2 border border-red-200 bg-red-50 text-sm font-semibold text-red-800',
            uiRadius.control,
            'hover:bg-red-100 disabled:opacity-60',
          )}
        >
          <LogOut className="h-4 w-4" />
          Clock out
        </button>
      ) : null}

      <div className="flex items-center gap-1">
        <AppButton
          variant="ghost"
          size="sm"
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          onClick={() => {
            const next = new Date(weekStart);
            next.setDate(next.getDate() - 7);
            setWeekStart(next);
          }}
          aria-label="Previous week"
        />
        <button
          type="button"
          onClick={() => setWeekStart(weekStartSunday())}
          className={uiCx(
            'min-h-12 flex-1 rounded-xl px-3 py-2 text-center',
            isCurrentWeek ? 'bg-emerald-50' : '',
          )}
        >
          <div className={uiCx('text-sm font-semibold', isCurrentWeek ? 'text-emerald-800' : 'text-gray-900')}>
            {weekRangeLabel || 'This week'}
          </div>
          {isCurrentWeek ? <div className="text-xs font-semibold text-emerald-700">this week</div> : null}
        </button>
        <AppButton
          variant="ghost"
          size="sm"
          rightIcon={<ChevronRight className="h-4 w-4" />}
          onClick={() => {
            const next = new Date(weekStart);
            next.setDate(next.getDate() + 7);
            setWeekStart(next);
          }}
          aria-label="Next week"
        />
      </div>

      <AppCard>
        {weeklySummary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <WeekMetric icon={<Clock className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-700" label="Total hours" value={weeklySummary.total_hours_formatted || '0h 00m'} />
              <WeekMetric icon={<Briefcase className="h-4 w-4" />} tint="bg-blue-50 text-blue-700" label="Regular" value={weeklySummary.reg_hours_formatted || '0h 00m'} />
              <WeekMetric icon={<Zap className="h-4 w-4" />} tint="bg-orange-50 text-orange-700" label="Overtime" value="0h 00m" />
              <WeekMetric icon={<Coffee className="h-4 w-4" />} tint="bg-gray-100 text-gray-600" label="Breaks" value={weeklySummary.total_break_formatted || '0h 00m'} />
            </div>
            {daysWithHours.length > 0 ? (
              <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                {daysWithHours.map((day, index) => {
                  const inT = day.clock_in ? formatClockTimestamp(day.clock_in) : null;
                  const outT = day.clock_out ? formatClockTimestamp(day.clock_out) : null;
                  const range = inT && outT ? `${inT} – ${outT}` : inT ? `${inT} – --:--` : null;
                  return (
                    <button
                      key={`${day.date}-${day.clock_in || 'no-in'}-${index}`}
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-gray-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {capitalizeWeekday(day.day_name)} · {formatShortDate(day.date)}
                        </div>
                        {range ? <div className="mt-0.5 text-sm text-gray-600">{range}</div> : null}
                      </div>
                      <div className="text-sm font-semibold tabular-nums text-gray-900">
                        {day.hours_worked_formatted || '0h 00m'}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-center text-sm text-gray-600">No hours logged this week</p>
            )}
          </>
        ) : (
          <div className={uiTypography.helper}>Loading this week’s hours…</div>
        )}
      </AppCard>

      <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-3.5 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
          <Info className="h-4 w-4" />
        </span>
        <p className="pt-1 text-sm text-emerald-800">{infoBanner}</p>
      </div>

      {clockType ? (
        <ClockInOutModalLayer
          selectedDate={selectedDate}
          clockType={clockType}
          onClose={() => setClockType(null)}
          onDateChange={setSelectedDate}
          shiftById={shiftById ?? null}
          onBusyChange={setModalSubmitting}
        />
      ) : null}
    </div>
  );
}

function WeekMetric({
  icon,
  tint,
  label,
  value,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={uiCx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tint)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold tabular-nums text-gray-900">{value}</div>
        <div className="text-xs text-gray-600">{label}</div>
      </div>
    </div>
  );
}

export default function ClockInOut() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromHome = location.state?.fromHome === true;
  const tab = tabFromPath(location.pathname);

  const title = tab === 'sick' ? 'Sick Leave' : tab === 'time-off' ? 'Time Off' : 'Clock In / Out';
  const subtitle =
    tab === 'sick'
      ? 'Report an absence. Same-day sick leave is allowed.'
      : tab === 'time-off'
        ? 'Request vacation or a day off at least 24 hours in advance.'
        : 'Log start and end times at the end of the day. Times use 15-minute steps.';

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title={title}
        subtitle={subtitle}
        icon={<Clock className="h-4 w-4" />}
        onBack={fromHome ? () => navigate('/home') : undefined}
      />
      <AppTabs
        tabs={[
          { key: 'hours', label: 'Hours' },
          { key: 'time-off', label: 'Time Off' },
          { key: 'sick', label: 'Sick Leave' },
        ]}
        value={tab}
        onChange={(key) => navigate(TAB_PATH[key as PersonalTab])}
      />
      {tab === 'hours' ? <HoursPanel /> : <MyTimeOffPanel mode={tab === 'sick' ? 'sick' : 'vacation'} />}
    </div>
  );
}
