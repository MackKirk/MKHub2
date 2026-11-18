import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { uiBorders, uiCx, uiRadius, uiTypography } from '@/components/ui';
import { getBcStatutoryHolidays } from '@/lib/bcStatutoryHolidays';
import { formatDateLocal } from '@/lib/dateUtils';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import { ProjectCalendarProjectChip } from './ProjectCalendarProjectChip';
import { dayDropId } from './projectCalendar.dnd';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Widget is "comfortable" enough for the larger calendar chips. */
const WIDGET_COMFORTABLE_MIN_W = 560;
const WIDGET_COMFORTABLE_MIN_H = 420;

type Density = 'page' | 'widget';
type ChipMode = boolean | 'dense';

type Props = {
  currentMonth: Date;
  daysByKey: Record<string, ProjectCalendarDayEntry[]>;
  onDayClick: (date: Date, entries: ProjectCalendarDayEntry[]) => void;
  onProjectClick: (entry: ProjectCalendarDayEntry, date: Date) => void;
  density?: Density;
  /** Register day droppables (page calendar with schedule rail only). */
  enableDropTargets?: boolean;
  /** When true, day cells show droppable idle affordance. */
  dragActive?: boolean;
};

type DayCellSharedProps = {
  date: Date;
  dayKey: string;
  entries: ProjectCalendarDayEntry[];
  dayIsToday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  overflow: boolean;
  maxChips: number;
  chipMode: ChipMode;
  cellMinH: string;
  cellPad: string;
  isWidget: boolean;
  useLargerChips: boolean;
  dragActive: boolean;
  isOver: boolean;
  setNodeRef?: (node: HTMLElement | null) => void;
  onDayClick: (date: Date, entries: ProjectCalendarDayEntry[]) => void;
  onProjectClick: (entry: ProjectCalendarDayEntry, date: Date) => void;
};

function DayCellShell({
  date,
  entries,
  dayIsToday,
  holidayName,
  isWeekend,
  overflow,
  maxChips,
  chipMode,
  cellMinH,
  cellPad,
  isWidget,
  useLargerChips,
  dragActive,
  isOver,
  setNodeRef,
  onDayClick,
  onProjectClick,
}: DayCellSharedProps) {
  return (
    <div
      ref={setNodeRef}
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
        'relative flex cursor-pointer flex-col transition-[background-color,box-shadow,border-color] duration-150',
        cellMinH,
        cellPad,
        uiRadius.control,
        dayIsToday
          ? 'border-2 border-brand-red bg-red-50/30'
          : holidayName
            ? uiCx(uiBorders.subtle, 'bg-red-50')
            : isWeekend
              ? uiCx(uiBorders.subtle, 'bg-gray-100')
              : uiCx(uiBorders.subtle, 'bg-white'),
        !dragActive && 'hover:bg-gray-50/80',
        dragActive && !isOver && 'outline outline-1 outline-dashed outline-gray-300/80',
        isOver && 'z-[1] bg-red-50/80 ring-2 ring-[#c22033]/40 outline-none',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={uiCx(
            'font-semibold text-sm',
            dayIsToday ? 'text-brand-red' : holidayName ? 'text-red-700' : 'text-gray-700',
          )}
        >
          {date.getDate()}
        </span>
        {entries.length > 0 ? (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">
            {entries.length}
          </span>
        ) : null}
      </div>
      {holidayName ? (
        <span
          className="mt-0.5 truncate text-[11px] font-semibold leading-tight text-red-700"
          title={holidayName}
        >
          {holidayName}
        </span>
      ) : null}
      <div
        className={uiCx(
          'flex-1 overflow-hidden',
          isWidget && !useLargerChips ? 'mt-0.5 space-y-0.5' : 'mt-1 space-y-1',
        )}
      >
        {entries.slice(0, maxChips).map((entry) => (
          <ProjectCalendarProjectChip
            key={entry.project_id}
            entry={entry}
            compact={chipMode}
            onOpen={() => onProjectClick(entry, date)}
          />
        ))}
        {overflow ? (
          <button
            type="button"
            className="w-full text-left text-xs font-semibold text-brand-red hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onDayClick(date, entries);
            }}
          >
            +{entries.length - maxChips} more
          </button>
        ) : null}
      </div>
      {isOver ? (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-[#c22033]/90 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white shadow-sm">
          Drop to schedule
        </div>
      ) : null}
    </div>
  );
}

function DroppableDayCell(props: Omit<DayCellSharedProps, 'isOver' | 'setNodeRef' | 'dragActive'> & { dragActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dayDropId(props.dayKey),
    data: { dayKey: props.dayKey, date: props.date },
  });
  return <DayCellShell {...props} setNodeRef={setNodeRef} isOver={isOver} />;
}

export function ProjectCalendarMonthGrid({
  currentMonth,
  daysByKey,
  onDayClick,
  onProjectClick,
  density = 'page',
  enableDropTargets = false,
  dragActive = false,
}: Props) {
  const today = new Date();
  const isWidget = density === 'widget';
  const rootRef = useRef<HTMLDivElement>(null);
  const [widgetComfortable, setWidgetComfortable] = useState(false);

  useEffect(() => {
    if (!isWidget) return;
    const grid = rootRef.current;
    // Measure the widget body (fixed by dashboard tile), not the grid itself —
    // cell min-heights change with density and would feedback-loop.
    const el = grid?.parentElement;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setWidgetComfortable(width >= WIDGET_COMFORTABLE_MIN_W && height >= WIDGET_COMFORTABLE_MIN_H);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isWidget]);

  const useLargerChips = !isWidget || widgetComfortable;
  const maxChips = isWidget ? (widgetComfortable ? 3 : 2) : 3;
  const chipMode: ChipMode = !isWidget ? true : widgetComfortable ? true : 'dense';
  const cellMinH = !isWidget ? 'min-h-[120px]' : widgetComfortable ? 'min-h-[96px]' : 'min-h-[72px]';
  const cellPad = !isWidget ? 'p-1.5' : widgetComfortable ? 'p-1.5' : 'p-1';
  const gridGap = !isWidget ? 'gap-1' : widgetComfortable ? 'gap-1' : 'gap-0.5';

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

  const holidaysByKey = useMemo(
    () => getBcStatutoryHolidays(currentMonth.getFullYear()),
    [currentMonth],
  );

  const isToday = (date: Date | null) =>
    Boolean(date && date.toDateString() === today.toDateString());

  return (
    <div ref={rootRef} className={uiCx('grid grid-cols-7', gridGap)}>
      {DAY_NAMES.map((day, index) => {
        const isWeekendHeader = index === 0 || index === 6;
        return (
          <div
            key={day}
            className={uiCx(
              uiTypography.overline,
              isWidget && !useLargerChips ? 'py-1 text-center !text-xs' : 'py-1.5 text-center',
              isWeekendHeader && 'text-gray-400',
            )}
          >
            {day}
          </div>
        );
      })}
      {calendarDays.map((date, index) => {
        if (!date) {
          return <div key={`empty-${index}`} className={cellMinH} />;
        }
        const dayKey = formatDateLocal(date);
        const entries = daysByKey[dayKey] || [];
        const dayIsToday = isToday(date);
        const holidayName = holidaysByKey.get(dayKey) ?? null;
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const overflow = entries.length > maxChips;

        const shared = {
          date,
          dayKey,
          entries,
          dayIsToday,
          holidayName,
          isWeekend,
          overflow,
          maxChips,
          chipMode,
          cellMinH,
          cellPad,
          isWidget,
          useLargerChips,
          dragActive: enableDropTargets && dragActive,
          onDayClick,
          onProjectClick,
        };
        return enableDropTargets ? (
          <DroppableDayCell key={date.toISOString()} {...shared} />
        ) : (
          <DayCellShell key={date.toISOString()} {...shared} isOver={false} />
        );
      })}
    </div>
  );
}
