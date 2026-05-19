import type { ReactNode } from 'react';
import { uiCx, uiRadius, uiTypography } from './tokens';

type AppSectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  iconClassName?: string;
  className?: string;
};

export function AppSectionHeader({
  title,
  description,
  icon,
  action,
  className,
  iconClassName = 'bg-blue-100 text-blue-800',
}: AppSectionHeaderProps) {
  return (
    <div className={uiCx('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className={uiCx('mt-0.5 flex h-8 w-8 items-center justify-center', uiRadius.control, iconClassName)}>{icon}</div>
        ) : null}
        <div className="min-w-0">
          <h2 className={uiTypography.sectionTitle}>{title}</h2>
          {description ? <p className={uiTypography.sectionSubtitle}>{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
