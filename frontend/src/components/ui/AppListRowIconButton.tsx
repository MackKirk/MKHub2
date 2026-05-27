import type { MouseEvent, ReactNode } from 'react';
import { AppTooltip } from './AppTooltip';
import { uiCx, uiListRowIconButton } from './tokens';

/** Color emoji glyphs — same presentation as Opportunities list tab icons / design-system showcase. */
export const APP_LIST_ROW_ACTION_GLYPH = {
  edit: '\u{1F4DD}',
  delete: '\u{1F5D1}',
} as const;

export type AppListRowIconButtonPreset = keyof typeof APP_LIST_ROW_ACTION_GLYPH;

type AppListRowIconButtonProps = {
  /** Accessible name; also shown in hover tooltip. */
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Built-in emoji for common row actions. */
  preset?: AppListRowIconButtonPreset;
  /** Custom emoji or node (overrides `preset`). */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

/** Row action control — emoji in gray square, matching `/dev/design-system` sortable list. */
export function AppListRowIconButton({
  label,
  onClick,
  preset,
  icon,
  disabled,
  loading,
  className,
}: AppListRowIconButtonProps) {
  const glyph = icon ?? (preset ? APP_LIST_ROW_ACTION_GLYPH[preset] : null);

  return (
    <AppTooltip content={label} placement="top" disabled={disabled || loading}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={label}
        className={uiCx(uiListRowIconButton.base, className)}
      >
        <span className="leading-none" aria-hidden>
          {loading ? '…' : glyph}
        </span>
      </button>
    </AppTooltip>
  );
}
