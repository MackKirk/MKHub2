import type { LucideIcon } from 'lucide-react';
import { uiCx } from './tokens';

export type AppChoiceOption<T extends string = string> = {
  value: T;
  title: string;
  description?: string;
  icon?: LucideIcon;
  disabled?: boolean;
  comingSoon?: boolean;
};

export type AppChoiceCardsProps<T extends string = string> = {
  options: AppChoiceOption<T>[];
  value?: T | null;
  onChange: (value: T) => void;
  /** Grid columns from `sm` breakpoint up. Default 2. */
  columns?: 1 | 2 | 3;
  disabled?: boolean;
  className?: string;
  /**
   * `default` — template-options padding.
   * `comfortable` — roomier document-wizard padding.
   * `compact` — dense title row. Icon shows inline when provided; description is hidden.
   */
  size?: 'default' | 'comfortable' | 'compact';
};

const COLUMN_CLASS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
};

/**
 * Selectable choice cards — same pattern as Document Creator
 * (“How do you want to use this template?” / scope pickers).
 */
export function AppChoiceCards<T extends string = string>({
  options,
  value,
  onChange,
  columns = 2,
  disabled = false,
  className,
  size = 'default',
}: AppChoiceCardsProps<T>) {
  const isCompact = size === 'compact';
  const pad = size === 'comfortable' ? 'p-5' : isCompact ? 'px-3 py-2' : 'p-4';
  const gap = isCompact ? 'gap-2' : 'gap-3';

  return (
    <div className={uiCx('grid', gap, COLUMN_CLASS[columns], className)}>
      {options.map((opt) => {
        const Icon = opt.icon;
        const comingSoon = Boolean(opt.comingSoon);
        const isDisabled = disabled || opt.disabled || comingSoon;
        const selected = !comingSoon && value != null && value === opt.value;

        if (comingSoon) {
          return (
            <div
              key={opt.value}
              aria-disabled
              className={uiCx(
                'relative border-2 border-dashed border-gray-200 rounded-lg text-left bg-gray-50/80 cursor-not-allowed select-none',
                pad,
              )}
            >
              <span className="absolute top-3 right-3 text-xs font-semibold uppercase tracking-wide text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                Coming soon
              </span>
              {Icon ? <Icon className="h-5 w-5 mb-2 text-gray-400" aria-hidden /> : null}
              <div className={uiCx('font-semibold text-gray-600', !isCompact && 'mb-1')}>
                {opt.title}
              </div>
              {!isCompact && opt.description ? (
                <div className="text-sm text-gray-600">{opt.description}</div>
              ) : null}
            </div>
          );
        }

        return (
          <button
            key={opt.value}
            type="button"
            disabled={isDisabled}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={uiCx(
              'border-2 rounded-lg text-left transition-all',
              isCompact ? 'flex items-center gap-1.5' : 'flex flex-col gap-2',
              pad,
              selected
                ? 'border-brand-red bg-red-50'
                : 'border-gray-200 hover:border-brand-red hover:bg-red-50/60',
              isDisabled && 'opacity-60 cursor-not-allowed',
            )}
          >
            {Icon ? (
              <Icon
                className={uiCx(
                  'shrink-0',
                  isCompact ? 'h-3.5 w-3.5' : 'h-5 w-5',
                  selected ? 'text-brand-red' : 'text-gray-500',
                )}
                aria-hidden
              />
            ) : null}
            <div className={isCompact ? 'min-w-0' : undefined}>
              <div
                className={uiCx(
                  'font-semibold',
                  isCompact ? 'text-sm text-gray-900' : 'text-gray-900 mb-0.5',
                  selected && isCompact && 'text-[#7f1010]',
                )}
              >
                {opt.title}
              </div>
              {!isCompact && opt.description ? (
                <div className="text-sm text-gray-600">{opt.description}</div>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
