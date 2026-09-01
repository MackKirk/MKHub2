import { useMemo } from 'react';
import { uiBorders, uiCx, uiRadius, uiTypography } from '@/components/ui';
import { formatDateLocal } from '@/lib/dateUtils';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import { ProjectCalendarProjectChip } from './ProjectCalendarProjectChip';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS_PER_DAY = 3;

type Props = {
  currentMonth: Date;
  daysByKey: Record<string, ProjectCalendarDayEntry[]>;
  onDayClick: (date: Date, entries: ProjectCalendarDayEntry[]) => void;
  onProjectClick: (entry: ProjectCalendarDayEntry, date: Date) => void;
};

export function ProjectCalendarMonthGrid({
  currentMonth,
  daysByKey,
  onDayClick,
  onProjectClick,
}: Props) {
  const today = new Date();

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

  const isToday = (date: Date | null) =>
    Boolean(date && date.toDateString() === today.toDateString());

  return (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((day) => (
        <div key={day} className={uiCx(uiTypography.overline, 'py-1.5 text-center')}>
          {day}
        </div>
      ))}
      {calendarDays.map((date, index) => {
        if (!date) {
          return <div key={`empty-${index}`} className="min-h-[120px]" />;
        }
        const dayKey = formatDateLocal(date);
        const entries = daysByKey[dayKey] || [];
        const dayIsToday = isToday(date);
        const overflow = entries.length > MAX_CHIPS_PER_DAY;

        return (
          <div
            key={date.toISOString()}
            role="button"
            tabIndex={0}
            onClick={() => onDayClick(date, entries)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onDayClick(date, entries);
              }
            }}
            className={uiCx(
              'flex min-h-[120px] cursor-pointer flex-col p-1.5 transition-colors hover:bg-gray-50/80',
              uiRadius.control,
              dayIsToday ? 'border-2 border-brand-red bg-red-50/30' : uiBorders.subtle,
              'bg-white',
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className={uiCx('text-xs font-medium', dayIsToday ? 'text-brand-red' : 'text-gray-700')}>
                {date.getDate()}
              </span>
              {entries.length > 0 ? (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600">
                  {entries.length}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex-1 space-y-1 overflow-hidden">
              {entries.slice(0, MAX_CHIPS_PER_DAY).map((entry) => (
                <ProjectCalendarProjectChip
                  key={entry.project_id}
                  entry={entry}
                  compact
                  onOpen={() => onProjectClick(entry, date)}
                />
              ))}
              {overflow ? (
                <button
                  type="button"
                  className="w-full text-left text-[10px] font-medium text-brand-red hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(date, entries);
                  }}
                >
                  +{entries.length - MAX_CHIPS_PER_DAY} more
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
