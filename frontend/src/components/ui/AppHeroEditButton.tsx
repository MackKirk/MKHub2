import type { ButtonHTMLAttributes } from 'react';
import { uiCx } from './tokens';

/** Pencil-in-square glyph used on opportunity/project hero inline edits. */
const HERO_EDIT_ICON_PATH =
  'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';

export function AppHeroEditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={HERO_EDIT_ICON_PATH} />
    </svg>
  );
}

type AppHeroEditButtonSize = 'field' | 'title';

const sizeClasses: Record<AppHeroEditButtonSize, { button: string; icon: string }> = {
  /** Next to field labels or inline values (e.g. Status, Site, clock times). */
  field: { button: 'p-0.5', icon: 'w-3 h-3' },
  /** Next to headings (e.g. project/opportunity name). */
  title: { button: '', icon: 'w-3.5 h-3.5' },
};

export type AppHeroEditButtonProps = {
  size?: AppHeroEditButtonSize;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Inline edit control matching opportunity/project hero pencil buttons. */
export function AppHeroEditButton({ size = 'field', className, type = 'button', ...props }: AppHeroEditButtonProps) {
  const s = sizeClasses[size];
  return (
    <button
      type={type}
      className={uiCx('text-gray-400 hover:text-brand-red transition-colors', s.button, className)}
      {...props}
    >
      <AppHeroEditIcon className={s.icon} />
    </button>
  );
}
