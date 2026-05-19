import type { ReactNode } from 'react';
import { uiBorders, uiColors, uiCx, uiLayout, uiRadius, uiSpacing, uiTypography } from './tokens';

type AppPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function AppPageHeader({ title, subtitle, icon, actions, className }: AppPageHeaderProps) {
  return (
    <header className={className}>
      <div className={uiCx('flex flex-wrap items-center justify-between gap-3', uiRadius.card, uiBorders.subtle, uiColors.surface, uiSpacing.cardPadding)}>
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className={uiCx('flex h-8 w-8 shrink-0 items-center justify-center bg-blue-100 text-blue-800', uiRadius.control)}>
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className={uiTypography.pageTitle}>{title}</h1>
            {subtitle ? <p className={uiTypography.pageSubtitle}>{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>{actions}</div> : null}
      </div>
    </header>
  );
}

