import { AppTabCountBadge, getAppTabButtonClassName } from './AppTabs';
import { uiCx, uiLayout, uiTypography } from './tokens';

export type AppQuickFilterSegment = {
  key: string;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
};

type Props = {
  segments: AppQuickFilterSegment[];
  label?: string;
  className?: string;
};

/** Toggle pills below list search — same layout as Opportunities / Projects quick filters. */
export function AppQuickFilterRow({ segments, label = 'Quick filters:', className }: Props) {
  if (segments.length === 0) return null;

  return (
    <div
      className={uiCx(
        'mt-3 border-t border-gray-100 pt-3',
        uiLayout.actionsRow,
        'flex-wrap items-center gap-2',
        className,
      )}
    >
      <span className={uiCx(uiTypography.overline, 'inline-flex shrink-0 items-center leading-none')}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {segments.map((segment) => (
          <button
            key={segment.key}
            type="button"
            onClick={segment.onClick}
            className={getAppTabButtonClassName(segment.active)}
            aria-pressed={segment.active}
          >
            <span>{segment.label}</span>
            {typeof segment.count === 'number' ? (
              <AppTabCountBadge count={segment.count} isActive={segment.active} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
