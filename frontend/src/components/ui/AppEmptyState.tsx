import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { uiBorders, uiColors, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

type AppEmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function AppEmptyState({ title, description, icon, action, className }: AppEmptyStateProps) {
  return (
    <div
      className={uiCx(
        'flex flex-col items-center justify-center text-center',
        uiRadius.card,
        uiBorders.subtle,
        uiColors.surfaceSubtle,
        uiSpacing.cardPadding,
        className,
      )}
    >
      <div className={uiCx('mb-3 flex h-10 w-10 items-center justify-center bg-gray-100 text-gray-500', uiRadius.control)}>
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <h3 className={uiTypography.sectionTitle}>{title}</h3>
      {description ? <p className={uiCx('mt-1 max-w-md', uiTypography.helper)}>{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
