import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

type WorkOrderCalendarEvent = {
  type: 'work_order';
  id: string;
  work_order_number: string;
  entity_id: string;
  scheduled_start_at: string | null;
  estimated_duration_minutes: number | null;
  expected_end_at: string | null;
  status: string;
  asset_name: string | null;
  unit_number?: string | null;
  work_order_type?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  created_at?: string | null;
};

type ScheduleCalendarEvent = {
  type: 'inspection_schedule';
  id: string;
  scheduled_at: string;
  fleet_asset_name: string | null;
  unit_number?: string | null;
  status: string;
  body_inspection_id?: string | null;
  mechanical_inspection_id?: string | null;
};

type CalendarEvent = WorkOrderCalendarEvent | ScheduleCalendarEvent;

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function calendarVehicleLines(
  vehicleName: string | null | undefined,
  unit: string | null | undefined,
  fallback: string
): { primary: string; unitLine: string | null; hint: string } {
  const name = (vehicleName ?? '').trim();
  const u = (unit ?? '').trim();
  let primary = name;
  let unitLine: string | null = null;
  if (u) {
    if (name) {
      unitLine = `Unit ${u}`;
    } else {
      primary = `Unit ${u}`;
    }
  }
  if (!primary) primary = fallback;
  const hint = [name || null, u ? `Unit ${u}` : null].filter(Boolean).join(' \u00b7 ') || fallback;
  return { primary, unitLine, hint };
}

function daysInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (end < start) return [startStr];
  const d = new Date(start);
  while (d <= end) {
    out.push(formatDateLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type FleetServiceCalendarProps = {
  embedView?: boolean;
  canSchedule?: boolean;
  onScheduleNew?: () => void;
  onNewWorkOrder?: () => void;
};

export default function FleetServiceCalendar({
  embedView,
  canSchedule = true,
  onScheduleNew,
  onNewWorkOrder,
}: FleetServiceCalendarProps) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthStart = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  }, [currentMonth]);
  const monthEnd = useMemo(() => {
    return new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  }, [currentMonth]);
  const startStr = formatDateLocal(monthStart);
  const endStr = formatDateLocal(monthEnd);

  const { data: woEvents = [], isLoading: woLoading } = useQuery({
    queryKey: ['fleet-work-orders-calendar', startStr, endStr],
    queryFn: () => api<any[]>('GET', `/fleet/work-orders/calendar?start=${startStr}&end=${endStr}`),
  });

  const { data: scheduleEvents = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['fleet-inspection-schedules-calendar', startStr, endStr],
    queryFn: () => api<any[]>('GET', `/fleet/inspection-schedules/calendar?start=${startStr}&end=${endStr}`),
  });

  const isLoading = woLoading || schedulesLoading;

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    const dayKey = (iso: string) => formatDateLocal(new Date(iso));
    const monthStartStr = startStr;
    const monthEndStr = endStr;

    woEvents.forEach((ev) => {
      const wo: WorkOrderCalendarEvent = { type: 'work_order', ...ev };
      const startDateIso = wo.scheduled_start_at || wo.check_in_at || wo.created_at;
      const endDateIso = wo.expected_end_at ?? wo.check_out_at ?? startDateIso;
      if (!startDateIso) return;
      const startDay = dayKey(startDateIso);
      const endDay = endDateIso ? dayKey(endDateIso) : startDay;
      const days = daysInRange(startDay, endDay);
      days.forEach((day) => {
        if (day >= monthStartStr && day <= monthEndStr) {
          if (!map[day]) map[day] = [];
          map[day].push(wo);
        }
      });
    });

    scheduleEvents.forEach((ev) => {
      const s: ScheduleCalendarEvent = { type: 'inspection_schedule', ...ev };
      const day = dayKey(s.scheduled_at);
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });

    Object.keys(map).forEach((day) =>
      map[day].sort((a, b) => {
        const tA = a.type === 'work_order' ? (a.scheduled_start_at || a.check_in_at || a.created_at) : a.scheduled_at;
        const tB = b.type === 'work_order' ? (b.scheduled_start_at || b.check_in_at || b.created_at) : b.scheduled_at;
        return (tA || '').localeCompare(tB || '');
      })
    );
    return map;
  }, [woEvents, scheduleEvents, startStr, endStr]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day));
    return days;
  }, [currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const today = new Date();
  const isToday = (date: Date | null) => date && date.toDateString() === today.toDateString();
  const getDayEvents = (date: Date | null) => (date ? eventsByDay[formatDateLocal(date)] || [] : []);

  const monthLabel = `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  const sectionHeaderActions =
    canSchedule && (onScheduleNew || onNewWorkOrder) ? (
      <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-end')}>
        {onScheduleNew ? (
          <AppButton type="button" variant="secondary" size="sm" onClick={onScheduleNew}>
            Schedule inspection
          </AppButton>
        ) : null}
        {onNewWorkOrder ? (
          <AppButton type="button" size="sm" onClick={onNewWorkOrder}>
            New service
          </AppButton>
        ) : null}
      </div>
    ) : null;

  const calendarBody = (
    <>
      <div className={uiCx('mb-4 flex flex-wrap items-center justify-between gap-3')}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={uiTypography.sectionTitle}>{monthLabel}</span>
          {isLoading ? <span className={uiTypography.helper}>Loading…</span> : null}
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToPreviousMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </AppButton>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToToday}>
            Today
          </AppButton>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToNextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </AppButton>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((day) => (
          <div key={day} className={uiCx(uiTypography.overline, 'py-1.5 text-center')}>
            {day}
          </div>
        ))}
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-[100px]" />;
          }
          const dayEvents = getDayEvents(date);
          const dayIsToday = isToday(date);
          return (
            <div
              key={date.toISOString()}
              className={uiCx(
                'flex min-h-[100px] flex-col p-1.5',
                uiRadius.control,
                dayIsToday ? 'border-2 border-brand-red bg-red-50/30' : uiBorders.subtle,
                'bg-white',
              )}
            >
              <span className={uiCx('text-xs font-medium', dayIsToday ? 'text-brand-red' : 'text-gray-700')}>
                {date.getDate()}
              </span>
              <div className="mt-1 flex-1 space-y-1 overflow-auto">
                {dayEvents.slice(0, 5).map((ev) => {
                  if (ev.type === 'work_order') {
                    const woLines = calendarVehicleLines(ev.asset_name, ev.unit_number, ev.work_order_number);
                    return (
                      <button
                        key={`wo-${ev.id}-${date.toISOString()}`}
                        type="button"
                        onClick={() => navigate(`/fleet/work-orders/${ev.id}`)}
                        className={uiCx(
                          'w-full rounded-lg border px-2 py-1.5 text-left text-xs shadow-sm',
                          ev.work_order_type === 'mechanical'
                            ? 'border-green-200/80 bg-green-50 text-green-900 hover:bg-green-100'
                            : ev.work_order_type === 'body'
                              ? 'border-blue-200/80 bg-blue-50 text-blue-900 hover:bg-blue-100'
                              : 'border-gray-200/80 bg-gray-100 text-gray-800 hover:bg-gray-200',
                        )}
                        title={`Work order \u00b7 ${
                          ev.work_order_type === 'mechanical'
                            ? 'Mechanical'
                            : ev.work_order_type === 'body'
                              ? 'Body'
                              : 'Service'
                        } \u00b7 ${ev.work_order_number} — ${woLines.hint}`}
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          <div className="flex shrink-0 flex-col items-center gap-0.5" title="Work order">
                            <span className="w-full rounded border border-black/10 bg-white/80 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-gray-700">
                              WO
                            </span>
                            {ev.work_order_type === 'mechanical' && (
                              <span
                                className="rounded border border-green-400/50 bg-white/80 px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-green-900"
                                title="Mechanical"
                              >
                                MECH
                              </span>
                            )}
                            {ev.work_order_type === 'body' && (
                              <span
                                className="rounded border border-blue-400/50 bg-white/80 px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-blue-900"
                                title="Body (exterior)"
                              >
                                BODY
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <span className="block line-clamp-2 font-medium leading-snug">{woLines.primary}</span>
                            {woLines.unitLine ? (
                              <span className="block line-clamp-1 text-[10px] leading-tight opacity-85">
                                {woLines.unitLine}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  const inLines = calendarVehicleLines(ev.fleet_asset_name, ev.unit_number, 'Scheduled');
                  return (
                    <button
                      key={`sched-${ev.id}`}
                      type="button"
                      onClick={() => navigate(`/fleet/inspections/${ev.id}`)}
                      className="w-full rounded-lg border border-violet-200/80 bg-violet-50 px-2 py-1.5 text-left text-xs text-violet-900 shadow-sm hover:bg-violet-100"
                      title={`Inspection schedule — ${inLines.hint} \u00b7 ${formatTime(ev.scheduled_at)}`}
                    >
                      <div className="flex min-w-0 items-start gap-1.5">
                        <span
                          className="shrink-0 rounded border border-violet-300/60 bg-white/80 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-800"
                          title="Inspection"
                        >
                          INSP
                        </span>
                        <div className="min-w-0 flex-1 text-left">
                          <span className="block line-clamp-2 font-medium leading-snug text-violet-900">
                            {inLines.primary}
                          </span>
                          {inLines.unitLine ? (
                            <span className="block line-clamp-1 text-[10px] leading-tight text-violet-700/90">
                              {inLines.unitLine}
                            </span>
                          ) : null}
                          <span className="block text-[10px] text-violet-600">{formatTime(ev.scheduled_at)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {dayEvents.length > 5 ? (
                  <span className={uiTypography.helper}>+{dayEvents.length - 5} more</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading ? (
        <div
          className={uiCx(
            'mt-3 flex flex-col flex-wrap items-stretch justify-center gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:gap-6',
            uiTypography.helper,
          )}
        >
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-center sm:justify-start')}>
            <span className={uiCx(uiTypography.overline, 'w-full text-center sm:mr-1 sm:w-auto sm:text-left')}>
              Work orders
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-green-200 bg-green-100" />
              <span>Mechanical</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-blue-200 bg-blue-100" />
              <span>Body</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-gray-300 bg-gray-200" />
              <span>Other</span>
            </span>
          </div>
          <div className="hidden h-4 w-px self-center bg-gray-200 sm:block" aria-hidden />
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-center')}>
            <span className={uiCx(uiTypography.overline, 'mr-1 text-violet-600/90')}>Inspections</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-violet-200 bg-violet-100" />
              <span>Scheduled (INSP)</span>
            </span>
          </div>
        </div>
      ) : null}

      {!isLoading && woEvents.length === 0 && scheduleEvents.length === 0 ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <AppEmptyState
            title="No appointments this month"
            description="Use Schedule inspection to add."
            className="border-0 bg-transparent p-0 shadow-none"
          />
        </div>
      ) : null}
    </>
  );

  if (embedView) {
    return (
      <AppCard className="min-w-0">
        <AppSectionHeader
          title="Calendar"
          description="Work orders and inspection schedules by day. Click an event to open details."
          action={sectionHeaderActions}
          {...appSectionPresetProps('workload')}
        />
        <div className={uiSpacing.cardPadding}>{calendarBody}</div>
      </AppCard>
    );
  }

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader title="Schedule" icon={<Calendar className="h-4 w-4" />} />
      <AppCard className="min-w-0">
        <AppSectionHeader
          title="Calendar"
          description="Work orders and inspection schedules by day. Click an event to open details."
          action={sectionHeaderActions}
          {...appSectionPresetProps('workload')}
        />
        <div className={uiSpacing.cardPadding}>{calendarBody}</div>
      </AppCard>
    </div>
  );
}
