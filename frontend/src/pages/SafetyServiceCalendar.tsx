import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type SafetyCalEvent = {
  id: string;
  project_id: string;
  project_name: string;
  project_code: string;
  business_line?: string;
  inspection_date: string;
  status: string;
};

function projectHref(ev: SafetyCalEvent): string {
  const base = ev.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
  const q = new URLSearchParams({ tab: 'safety', safety_inspection: ev.id });
  return `${base}/${encodeURIComponent(ev.project_id)}?${q.toString()}`;
}

type SafetyServiceCalendarProps = {
  embedView?: boolean;
  /** When set, shows “Schedule new inspection” next to month navigation (dashed style). */
  canSchedule?: boolean;
  onScheduleNew?: () => void;
};

const MONTH_NAMES = [
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
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const weekdayHeaderClass =
  'bg-gray-50 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500';

function eventButtonClass(status: string) {
  return uiCx(
    'w-full truncate text-left text-xs px-2 py-1.5 shadow-sm transition-colors',
    uiRadius.control,
    uiBorders.subtle,
    status === 'finalized'
      ? 'bg-green-50 hover:bg-green-100 border-green-200/80 text-green-900'
      : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200/80 text-yellow-900',
  );
}

export default function SafetyServiceCalendar({
  embedView,
  canSchedule,
  onScheduleNew,
}: SafetyServiceCalendarProps) {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthStart = useMemo(() => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1), [currentMonth]);
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth]
  );
  const startStr = formatDateLocal(monthStart);
  const endStr = formatDateLocal(monthEnd);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['safetyInspectionsCalendar', startStr, endStr],
    queryFn: () =>
      api<SafetyCalEvent[]>(
        'GET',
        `/safety/inspections/calendar?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`
      ),
  });

  const eventsByDay = useMemo(() => {
    const map: Record<string, SafetyCalEvent[]> = {};
    const dayKey = (iso: string) => formatDateLocal(new Date(iso));
    const monthStartStr = startStr;
    const monthEndStr = endStr;
    events.forEach((ev) => {
      const day = dayKey(ev.inspection_date);
      if (day >= monthStartStr && day <= monthEndStr) {
        if (!map[day]) map[day] = [];
        map[day].push(ev);
      }
    });
    Object.keys(map).forEach((day) =>
      map[day].sort((a, b) => (a.inspection_date || '').localeCompare(b.inspection_date || ''))
    );
    return map;
  }, [events, startStr, endStr]);

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

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  return (
    <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
      {!embedView && (
        <AppSectionHeader
          title="Safety schedule"
          description="Month view of scheduled inspections"
          className="mb-4"
        />
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={uiTypography.sectionTitle}>{monthLabel}</h2>
          {isLoading ? <span className={uiTypography.helper}>Loading…</span> : null}
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={goToPreviousMonth}
            aria-label="Previous month"
            className="!px-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </AppButton>
          <AppButton type="button" variant="secondary" size="sm" onClick={goToToday}>
            Today
          </AppButton>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={goToNextMonth}
            aria-label="Next month"
            className="!px-2"
          >
            <ChevronRight className="h-4 w-4" />
          </AppButton>
          {canSchedule && onScheduleNew ? (
            <AppButton type="button" variant="ghost" size="sm" onClick={onScheduleNew} className="border border-dashed border-gray-300">
              Schedule new inspection
            </AppButton>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((day) => (
          <div key={day} className={weekdayHeaderClass}>
            {day}
          </div>
        ))}
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-[100px]" aria-hidden />;
          }
          const dayEvents = getDayEvents(date);
          const dayIsToday = isToday(date);
          return (
            <div
              key={date.toISOString()}
              className={uiCx(
                'min-h-[100px] flex flex-col p-1.5',
                uiRadius.control,
                uiBorders.subtle,
                dayIsToday ? 'border-2 border-brand-red bg-red-50/30' : uiColors.surface,
              )}
            >
              <span
                className={uiCx(
                  'text-xs font-medium',
                  dayIsToday ? 'text-brand-red' : uiColors.textBody,
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 flex-1 space-y-1 overflow-auto">
                {dayEvents.slice(0, 5).map((ev) => (
                  <button
                    key={`${ev.id}-${date.toISOString()}`}
                    type="button"
                    onClick={() => navigate(projectHref(ev))}
                    className={eventButtonClass(ev.status)}
                    title={`${ev.project_name} (${ev.status})`}
                  >
                    <span className="block truncate font-medium">{ev.project_name}</span>
                    <span className="block truncate text-[10px] opacity-80">{ev.project_code}</span>
                  </button>
                ))}
                {dayEvents.length > 5 ? (
                  <span className={uiTypography.helper}>+{dayEvents.length - 5} more</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && (
        <div
          className={uiCx(
            'mt-3 flex flex-wrap items-center justify-center gap-4 border-t border-gray-100 pt-3',
            uiTypography.helper,
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <AppBadge variant="success">Finalized</AppBadge>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <AppBadge variant="warning">Draft</AppBadge>
          </span>
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <AppEmptyState
            title="No safety inspections this month"
            description="Use Schedule new inspection on the calendar page, or open a project's Safety tab."
          />
        </div>
      )}
    </AppCard>
  );
}
