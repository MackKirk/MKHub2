import type { ReactNode } from 'react';
import { uiBorders, uiColors, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

type AppCardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function AppCard({ title, subtitle, actions, footer, children, className, bodyClassName }: AppCardProps) {
  const hasHeader = Boolean(title || subtitle || actions);
  return (
    <section className={uiCx(uiRadius.card, uiBorders.subtle, uiColors.surface, className)}>
      {hasHeader ? (
        <header className={uiCx('flex items-start justify-between gap-3 border-b border-gray-100', uiSpacing.cardPadding)}>
          <div className="min-w-0 space-y-1">
            {title ? <h3 className={uiTypography.sectionTitle}>{title}</h3> : null}
            {subtitle ? <p className={uiTypography.sectionSubtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </header>
      ) : null}
      <div className={uiCx(uiSpacing.cardPadding, bodyClassName)}>{children}</div>
      {footer ? <footer className={uiCx('border-t border-gray-100', uiSpacing.cardPadding)}>{footer}</footer> : null}
    </section>
  );
}
