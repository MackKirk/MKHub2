import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

export type AppCalendarDayBadgeTone = 'neutral' | 'accent' | 'emphasis';

/** Booking-style range highlight (travel-site calendar). */
export type AppCalendarRangeRole = 'start' | 'end' | 'middle' | 'alone';

export type AppCalendarDay = {
  dateLabel: string;
  isMuted?: boolean;
  isToday?: boolean;
  isSelected?: boolean;
  /** Non-interactive / past day */
  isDisabled?: boolean;
  /** e.g. shift indicator dot */
  hasMarker?: boolean;
  /** Centered count badge (e.g. director meeting slots per day). */
  badge?: number | string;
  badgeTone?: AppCalendarDayBadgeTone;
  /** Continuous range bar segment (picker density). */
  rangeRole?: AppCalendarRangeRole;
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
  /** With `compact`, `square` keeps equal cell height/width; `flat` uses a fixed short row height (wide calendars). */
  compactCellProfile?: 'square' | 'flat';
  /**
   * `picker` — compact booking calendar: smaller cells, day number top-right,
   * today in blue, selection/range bar in brand red.
   */
  density?: 'default' | 'picker';
  className?: string;
  footer?: ReactNode;
};

function shouldShowDayBadge(day: AppCalendarDay): boolean {
  if (day.badge == null) return false;
  if (typeof day.badge === 'number' && day.badge === 0 && day.badgeTone !== 'accent') return false;
  return true;
}

function calendarBadgeClass(tone: AppCalendarDayBadgeTone | undefined, compact: boolean) {
  const size = compact ? 'h-5 min-w-[1.1rem] px-1 text-xs' : 'h-6 min-w-[1.25rem] px-1 text-xs';
  const base = uiCx('inline-flex items-center justify-center rounded-full font-bold leading-none', size);
  switch (tone) {
    case 'accent':
      return uiCx(base, 'bg-brand-red text-white shadow-sm');
    case 'emphasis':
      return uiCx(base, 'bg-gray-700 text-white shadow-sm');
    case 'neutral':
    default:
      return uiCx(base, uiBorders.strong, 'bg-white text-gray-600');
  }
}

export function AppCalendarBase({
  monthLabel,
  days,
  onPrevious,
  onNext,
  headerExtra,
  bare = false,
  compact = false,
  compactCellProfile = 'square',
  density = 'default',
  className,
  footer,
  weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}: AppCalendarBaseProps) {
  const Shell = bare ? 'div' : 'section';
  const isPicker = density === 'picker';
  const flatCompact = compact && compactCellProfile === 'flat' && !isPicker;
  const isCompact = compact || isPicker;

  const headerPad = flatCompact ? 'px-2 py-1.5' : isCompact ? 'p-2' : 'p-3';
  const navBtn = isCompact ? 'h-6 w-6' : 'h-8 w-8';
  const navIcon = isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const weekdayClass = isCompact
    ? 'bg-gray-50 px-1 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500'
    : 'bg-gray-50 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-600';

  const compactCellSize = flatCompact
    ? 'flex h-full min-h-10 min-w-0 px-0.5 py-0.5 text-sm font-semibold'
    : isPicker
      ? 'flex h-7 min-h-7 min-w-0 px-0.5 py-0.5 text-xs font-semibold'
      : 'flex aspect-square min-h-0 min-w-0 px-0.5 py-0.5 text-sm font-semibold';

  const dayCellClass = (day: AppCalendarDay) => {
    const hasBadge = shouldShowDayBadge(day);
    if (isPicker) {
      const disabled = Boolean(day.isDisabled);
      const role = day.rangeRole;
      // Only one background class at a time — Tailwind conflict would keep bg-white over brand-red.
      // Muted + not disabled = weekend skipped inside range (Exclude weekends)
      const excludedInRange = Boolean(day.isMuted && day.dateLabel && !disabled && !role);
      return uiCx(
        'relative min-w-0 transition-colors',
        compactCellSize,
        day.isMuted && !day.dateLabel && 'pointer-events-none bg-white',
        disabled && 'pointer-events-none bg-white text-gray-300',
        !disabled && day.onClick && 'cursor-pointer',
        // Weekends skipped inside a range — soft gray, not red
        excludedInRange && 'bg-gray-100 text-gray-400 hover:bg-gray-100',
        // Default / today (not selected)
        !disabled &&
          !role &&
          !excludedInRange &&
          (day.isToday
            ? 'bg-sky-50 text-gray-800 hover:bg-sky-100'
            : 'bg-white text-gray-800 hover:bg-gray-50'),
        // Selection / range — solid red, darker on hover
        role === 'alone' && 'bg-[#c22033] text-white hover:bg-[#9a1212]',
        role === 'start' && 'rounded-l-md bg-[#c22033] text-white hover:bg-[#9a1212]',
        role === 'end' && 'rounded-r-md bg-[#c22033] text-white hover:bg-[#9a1212]',
        role === 'middle' && 'bg-[#c22033]/20 text-[#9a1212] hover:bg-[#c22033]/30',
      );
    }
    return uiCx(
      'relative bg-white transition-colors',
      compact
        ? hasBadge
          ? uiCx(compactCellSize, 'flex-col items-stretch')
          : uiCx(compactCellSize, 'flex-col items-center justify-center')
        : hasBadge
          ? 'flex min-h-14 flex-col px-2 py-1.5 text-left text-base'
          : 'min-h-14 px-2 py-1.5 text-left text-base',
      day.isMuted && !day.dateLabel
        ? 'pointer-events-none bg-gray-50/50'
        : day.isMuted
          ? 'text-gray-400'
          : 'text-gray-700 hover:bg-gray-50',
      day.isDisabled && 'pointer-events-none text-gray-300',
      day.isToday &&
        (compact
          ? 'bg-brand-red/15 font-semibold text-brand-red ring-1 ring-brand-red/20'
          : 'font-semibold text-brand-red'),
      day.isSelected && !day.isToday && 'bg-red-50 ring-1 ring-brand-red/25',
      !day.isMuted && day.hasMarker && !day.isToday && (compact ? 'bg-blue-50/80 hover:bg-blue-100/80' : ''),
      !day.isMuted && !day.isDisabled && day.onClick && 'cursor-pointer active:scale-95',
    );
  };

  const renderPickerDayCell = (day: AppCalendarDay, index: number) => {
    const isEmptyPad = day.isMuted && !day.dateLabel;
    if (isEmptyPad) {
      return <div key={`empty-${index}`} className={dayCellClass(day)} aria-hidden />;
    }
    const disabled = Boolean(day.isDisabled);
    const clickable = Boolean(day.onClick) && !disabled;
    const role = day.rangeRole;
    const isEdge = role === 'start' || role === 'end' || role === 'alone';
    const Cell = clickable ? 'button' : 'div';

    return (
      <Cell
        key={`${day.dateLabel}-${index}`}
        type={clickable ? 'button' : undefined}
        onClick={clickable ? day.onClick : undefined}
        title={day.title}
        aria-disabled={disabled || undefined}
        className={dayCellClass(day)}
      >
        <span
          className={uiCx(
            'absolute right-1 top-1 z-10 tabular-nums text-xs leading-none font-bold',
            disabled && 'text-gray-300',
            isEdge && 'text-white',
            role === 'middle' && 'text-[#9a1212]',
            !role && day.isMuted && !disabled && 'text-gray-400',
            !role && day.isToday && !disabled && !day.isMuted && 'text-sky-800',
            !role && !day.isToday && !disabled && !day.isMuted && 'text-gray-800',
          )}
        >
          {day.dateLabel}
        </span>

        {shouldShowDayBadge(day) ? (
          <span
            className={uiCx(
              'absolute bottom-1 left-1 z-10 text-[10px] font-bold leading-none tabular-nums',
              isEdge ? 'text-white/90' : 'text-brand-red',
              disabled && 'text-gray-300',
            )}
          >
            {day.badge}
          </span>
        ) : null}
      </Cell>
    );
  };

  const renderDayCell = (day: AppCalendarDay, index: number) => {
    if (isPicker) return renderPickerDayCell(day, index);

    const isEmptyPad = day.isMuted && !day.dateLabel;
    if (isEmptyPad) {
      return <div key={`empty-${index}`} className={dayCellClass(day)} aria-hidden />;
    }
    const clickable = Boolean(day.onClick) && !day.isDisabled;
    const Cell = clickable ? 'button' : 'div';
    return (
      <Cell
        key={`${day.dateLabel}-${index}`}
        type={clickable ? 'button' : undefined}
        onClick={clickable ? day.onClick : undefined}
        title={day.title}
        className={dayCellClass(day)}
      >
        {shouldShowDayBadge(day) ? (
          <>
            <span
              className={uiCx(
                'self-start pl-0.5 pt-0.5 tabular-nums leading-none',
                day.isToday && 'font-semibold text-brand-red',
              )}
            >
              {day.dateLabel}
            </span>
            <div className="flex min-h-0 flex-1 items-center justify-center px-0.5 pb-0.5">
              <span className={calendarBadgeClass(day.badgeTone, compact)}>{day.badge}</span>
            </div>
          </>
        ) : (
          <>
            {day.dateLabel}
            {day.hasMarker ? (
              <span
                className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-600"
                aria-hidden
              />
            ) : null}
          </>
        )}
      </Cell>
    );
  };

  const weekdayRow = weekDayLabels.map((label, i) => (
    <div key={`${label}-${i}`} className={weekdayClass}>
      {label}
    </div>
  ));

  return (
    <Shell
      className={uiCx(
        !bare && uiRadius.card,
        !bare && uiBorders.subtle,
        !bare && uiColors.surface,
        !bare && 'overflow-hidden',
        flatCompact && 'flex h-full min-h-0 flex-col',
        className,
      )}
    >
      <header className={uiCx('flex shrink-0 items-center justify-between border-b border-gray-100', headerPad)}>
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
      {flatCompact ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-7 gap-px bg-gray-200">{weekdayRow}</div>
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-px bg-gray-200">
            {days.map((day, index) => renderDayCell(day, index))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {weekdayRow}
          {days.map((day, index) => renderDayCell(day, index))}
        </div>
      )}
      {footer ? (
        <div className={uiCx('shrink-0 border-t border-gray-100 px-3 py-2 leading-relaxed', uiTypography.helper)}>
          {footer}
        </div>
      ) : null}
    </Shell>
  );
}
