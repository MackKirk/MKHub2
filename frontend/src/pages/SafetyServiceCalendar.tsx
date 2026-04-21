import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';

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

  const goToPreviousMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const goToNextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const today = new Date();
  const isToday = (date: Date | null) => date && date.toDateString() === today.toDateString();
  const getDayEvents = (date: Date | null) => (date ? eventsByDay[formatDateLocal(date)] || [] : []);

  return (
    <div className={embedView ? 'space-y-4' : 'p-4 max-w-6xl mx-auto space-y-4'}>
      {!embedView && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900">Safety schedule</h1>
          <Link
            to="/safety/inspections"
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Inspections list
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900 tracking-tight">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            {isLoading && <span className="text-xs text-gray-400">Loading…</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToPreviousMonth}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600"
            >
              ←
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goToNextMonth}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-600"
            >
              →
            </button>
            {canSchedule && onScheduleNew && (
              <button
                type="button"
                onClick={onScheduleNew}
                className="ml-1 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 text-xs font-medium transition-colors"
              >
                Schedule new inspection
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dayNames.map((day) => (
            <div key={day} className="text-center text-[10px] font-bold text-gray-500 py-1.5 uppercase">
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
                className={`min-h-[100px] border rounded-lg p-1.5 flex flex-col ${
                  dayIsToday ? 'border-2 border-brand-red bg-red-50/30' : 'border-gray-200'
                }`}
              >
                <span className={`text-xs font-medium ${dayIsToday ? 'text-brand-red' : 'text-gray-700'}`}>
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-1 flex-1 overflow-auto">
                  {dayEvents.slice(0, 5).map((ev) => (
                    <button
                      key={`${ev.id}-${date.toISOString()}`}
                      type="button"
                      onClick={() => navigate(projectHref(ev))}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded-lg border truncate block shadow-sm ${
                        ev.status === 'finalized'
                          ? 'bg-green-50 hover:bg-green-100 border-green-200/80 text-green-900'
                          : 'bg-amber-50 hover:bg-amber-100 border-amber-200/80 text-amber-900'
                      }`}
                      title={`${ev.project_name} (${ev.status})`}
                    >
                      <span className="font-medium block truncate">{ev.project_name}</span>
                      <span className="text-[10px] opacity-80">{ev.project_code}</span>
                    </button>
                  ))}
                  {dayEvents.length > 5 && (
                    <span className="text-[10px] text-gray-500">+{dayEvents.length - 5} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!isLoading && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-center gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-green-100 border border-green-200" />
              Finalized
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200" />
              Draft
            </span>
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <div className="mt-5 text-center py-5 text-gray-500 border-t border-gray-100">
            <div className="text-sm font-medium mb-1">No safety inspections this month</div>
            <div className="text-xs text-gray-400">
              Use Schedule new inspection on the calendar page, or open a project&apos;s Safety tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
