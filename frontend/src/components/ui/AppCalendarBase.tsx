import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

type CalendarDay = {
  dateLabel: string;
  isMuted?: boolean;
  isToday?: boolean;
  isSelected?: boolean;
};

type AppCalendarBaseProps = {
  monthLabel: string;
  weekDayLabels?: string[];
  days: CalendarDay[];
  onPrevious?: () => void;
  onNext?: () => void;
  className?: string;
};

export function AppCalendarBase({
  monthLabel,
  days,
  onPrevious,
  onNext,
  className,
  weekDayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}: AppCalendarBaseProps) {
  return (
    <section className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, className)}>
      <header className="flex items-center justify-between border-b border-gray-100 p-3">
        <button
          type="button"
          onClick={onPrevious}
          className={uiCx(
            'inline-flex h-8 w-8 items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
            uiRadius.control,
            uiBorders.input,
          )}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className={uiTypography.sectionTitle}>{monthLabel}</h3>
        <button
          type="button"
          onClick={onNext}
          className={uiCx(
            'inline-flex h-8 w-8 items-center justify-center bg-white text-gray-600 transition-colors hover:bg-gray-100',
            uiRadius.control,
            uiBorders.input,
          )}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </header>
      <div className="grid grid-cols-7 gap-px bg-gray-200">
        {weekDayLabels.map((label) => (
          <div key={label} className="bg-gray-50 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {label}
          </div>
        ))}
        {days.map((day, index) => (
          <button
            key={`${day.dateLabel}-${index}`}
            type="button"
            className={uiCx(
              'min-h-14 bg-white px-2 py-1.5 text-left text-xs transition-colors hover:bg-gray-50',
              day.isMuted ? 'text-gray-400' : 'text-gray-700',
              day.isToday ? 'font-semibold text-brand-red' : '',
              day.isSelected ? 'bg-red-50 ring-1 ring-brand-red/25' : '',
            )}
          >
            {day.dateLabel}
          </button>
        ))}
      </div>
    </section>
  );
}
