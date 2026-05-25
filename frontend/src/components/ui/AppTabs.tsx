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
};

export function AppTabCountBadge({ count, isActive }: { count: number; isActive: boolean }) {
  return (
    <span
      className={uiCx(
        'inline-flex min-w-5 items-center justify-center px-1 text-[10px] font-semibold',
        uiRadius.badge,
        isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600',
      )}
    >
      {count}
    </span>
  );
}

/** Shared pill style for AppTabs and toggle-style filter chips (e.g. Opportunities quick filters). */
export function getAppTabButtonClassName(isActive: boolean) {
  return uiCx(
    'inline-flex items-center gap-1.5 px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    uiRadius.tab,
    uiTypography.controlLabel,
    isActive
      ? uiColors.accentSolid
      : uiCx(uiBorders.strong, 'bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400'),
  );
}

export function AppTabs({ tabs, value, onChange, className }: AppTabsProps) {
  return (
    <div className={uiCx('flex flex-wrap gap-2', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === value;
        return (
          <button
            type="button"
            key={tab.key}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            className={getAppTabButtonClassName(isActive)}
            aria-pressed={isActive}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? <AppTabCountBadge count={tab.count} isActive={isActive} /> : null}
          </button>
        );
      })}
    </div>
  );
}
