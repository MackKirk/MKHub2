import type { ReactNode } from 'react';
import { AppPageBackButton } from './AppPageBackButton';
import { uiBorders, uiColors, uiCx, uiLayout, uiRadius, uiSpacing, uiTypography, uiPageHeader } from './tokens';

type AppPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Decorative/context icon inside the blue tile (not navigation). Combine with `onBack` on child pages. */
  icon?: ReactNode;
  /** Overrides the default blue icon tile (e.g. brand logo on standalone flows). */
  iconClassName?: string;
  /** Back arrow before the icon tile (e.g. Business → Opportunities). */
  onBack?: () => void;
  /** `title` / `aria-label` for the back control. Default: "Back". */
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
};

export function AppPageHeader({
  title,
  subtitle,
  icon,
  iconClassName,
  onBack,
  backLabel,
  actions,
  className,
}: AppPageHeaderProps) {
  return (
    <header className={className}>
      <div
        className={uiCx(
          'flex flex-wrap items-center justify-between',
          uiSpacing.headerGap,
          uiRadius.card,
          uiBorders.subtle,
          uiColors.surface,
          uiSpacing.cardPadding,
        )}
      >
        <div className={uiCx('flex min-w-0 items-center', uiSpacing.headerGap)}>
          {onBack ? <AppPageBackButton onClick={onBack} label={backLabel} /> : null}
          {icon ? <div className={iconClassName ?? uiPageHeader.iconTile}>{icon}</div> : null}
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
