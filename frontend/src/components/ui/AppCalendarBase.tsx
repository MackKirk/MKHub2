import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

export type AppCalendarDay = {
  dateLabel: string;
  isMuted?: boolean;
  isToday?: boolean;
  isSelected?: boolean;
  /** e.g. shift indicator dot */
  hasMarker?: boolean;
  onClick?: () => void;
  title?: string;
};

export type AppCalendarBaseProps = {
  monthLabel: string;
  weekDayLabels?: string[];
  days: AppCalendarDay[];
  onPrevious?: () => void;
  onNext?: () => void;
  /** Rendered under the month label (e.g. Today button). */
  headerExtra?: ReactNode;
  /** Omit outer card shell — use inside AppCard / widget wrapper. */
  bare?: boolean;
  /** Denser cells for dashboard widgets. */
  compact?: boolean;
  className?: string;
};

export function AppCalendarBase({
  monthLabel,
  days,
  onPrevious,
  onNext,
  headerExtra,
  bare = false,
  compact = false,
  className,
  weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}: AppCalendarBaseProps) {
  const Shell = bare ? 'div' : 'section';

  const headerPad = compact ? 'p-2' : 'p-3';
  const navBtn = compact ? 'h-6 w-6' : 'h-8 w-8';
  const navIcon = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const weekdayClass = compact
    ? 'bg-gray-50 px-1 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-gray-500'
    : 'bg-gray-50 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500';

  const dayCellClass = (day: AppCalendarDay) =>
    uiCx(
      'relative bg-white transition-colors',
      compact
        ? 'flex aspect-square min-h-0 min-w-0 flex-col items-center justify-center px-0.5 py-0.5 text-[10px] font-medium'
        : 'min-h-14 px-2 py-1.5 text-left text-xs',
      day.isMuted && !day.dateLabel
        ? 'pointer-events-none bg-gray-50/50'
        : day.isMuted
          ? 'text-gray-400'
          : 'text-gray-700 hover:bg-gray-50',
      day.isToday &&
        (compact
          ? 'bg-brand-red/15 font-semibold text-brand-red ring-1 ring-brand-red/20'
          : 'font-semibold text-brand-red'),
      day.isSelected && !day.isToday && 'bg-red-50 ring-1 ring-brand-red/25',
      !day.isMuted && day.hasMarker && !day.isToday && (compact ? 'bg-blue-50/80 hover:bg-blue-100/80' : ''),
      !day.isMuted && day.onClick && 'cursor-pointer active:scale-95',
    );

  return (
    <Shell className={uiCx(!bare && uiRadius.card, !bare && uiBorders.subtle, !bare && uiColors.surface, className)}>
      <header className={uiCx('flex items-center justify-between border-b border-gray-100', headerPad)}>
        <button
          type="button"
          onClick={onPrevious}
          className={uiCx(
            'inline-flex items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
            uiRadius.control,
            uiBorders.input,
            navBtn,
          )}
          aria-label="Previous month"
        >
          <ChevronLeft className={navIcon} />
        </button>
        <div className="min-w-0 flex flex-col items-center gap-0.5">
          <h3 className={compact ? uiTypography.controlLabel : uiTypography.sectionTitle}>{monthLabel}</h3>
          {headerExtra}
        </div>
        <button
          type="button"
          onClick={onNext}
          className={uiCx(
            'inline-flex items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
            uiRadius.control,
            uiBorders.input,
            navBtn,
          )}
          aria-label="Next month"
        >
          <ChevronRight className={navIcon} />
        </button>
      </header>
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {weekDayLabels.map((label, i) => (
          <div key={`${label}-${i}`} className={weekdayClass}>
            {label}
          </div>
        ))}
        {days.map((day, index) => {
          const isEmptyPad = day.isMuted && !day.dateLabel;
          if (isEmptyPad) {
            return <div key={`empty-${index}`} className={dayCellClass(day)} aria-hidden />;
          }
          const clickable = Boolean(day.onClick);
          const Cell = clickable ? 'button' : 'div';
          return (
            <Cell
              key={`${day.dateLabel}-${index}`}
              type={clickable ? 'button' : undefined}
              onClick={day.onClick}
              title={day.title}
              className={dayCellClass(day)}
            >
              {day.dateLabel}
              {day.hasMarker ? (
                <span
                  className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-600"
                  aria-hidden
                />
              ) : null}
            </Cell>
          );
        })}
      </div>
    </Shell>
  );
}
