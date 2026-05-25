import { ArrowLeft } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { uiCx, uiPageHeader } from './tokens';

export type AppPageBackButtonProps = {
  /** Accessible name and native tooltip (e.g. "Back to Business"). */
  label?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>;

/**
 * Back control for list/detail pages — pairs with AppPageHeader `onBack`.
 * Neutral hover surface; not the blue decorative icon tile.
 */
export function AppPageBackButton({
  label = 'Back',
  className,
  ...props
}: AppPageBackButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={uiCx(uiPageHeader.backButton, className)}
      {...props}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
    </button>
  );
}
