import { uiBorders, uiColors, uiCx, uiRadius, uiTypography } from './tokens';

export type AppTabItem = {
  key: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

type AppTabsProps = {
  tabs: AppTabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  /** `community` uses mobile-aligned green active pills. */
  tone?: 'brand' | 'community';
  size?: 'md' | 'sm';
};

export function AppTabCountBadge({
  count,
  isActive,
  size = 'md',
}: {
  count: number;
  isActive: boolean;
  size?: 'md' | 'sm';
}) {
  return (
    <span
      className={uiCx(
        'inline-flex items-center justify-center font-semibold',
        size === 'sm' ? 'min-w-4 px-0.5 text-[9px]' : 'min-w-5 px-1 text-[10px]',
        uiRadius.badge,
        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
      )}
    >
      {count}
    </span>
  );
}

/** Shared pill style for AppTabs and toggle-style filter chips (e.g. Opportunities quick filters). */
export function getAppTabButtonClassName(
  isActive: boolean,
  tone: 'brand' | 'community' = 'brand',
  size: 'md' | 'sm' = 'md',
) {
  const active =
    tone === 'community'
      ? 'border border-[#147D36] bg-[#147D36] text-white'
      : uiColors.accentSolid;
  return uiCx(
    'inline-flex items-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'gap-1 px-2 py-0.5 text-[11px] font-medium' : 'gap-1.5 px-3 py-1.5',
    uiRadius.tab,
    size === 'md' && uiTypography.controlLabel,
    isActive
      ? active
      : uiCx(uiBorders.strong, 'bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400'),
  );
}

export function AppTabs({
  tabs,
  value,
  onChange,
  className,
  tone = 'brand',
  size = 'md',
}: AppTabsProps) {
  return (
    <div className={uiCx('flex flex-wrap', size === 'sm' ? 'gap-1' : 'gap-2', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === value;
        return (
          <button
            type="button"
            key={tab.key}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            className={getAppTabButtonClassName(isActive, tone, size)}
            aria-pressed={isActive}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? (
              <AppTabCountBadge count={tab.count} isActive={isActive} size={size} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
