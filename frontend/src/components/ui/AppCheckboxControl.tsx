import type { MouseEvent, PointerEvent } from 'react';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx } from './tokens';

export type AppCheckboxControlProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label': string;
  /** Prefer onChange. Use onClick only when shift-click or other modifier handling is needed. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement | HTMLLabelElement>) => void;
};

/**
 * Icon-only checkbox — same visual as AppCheckbox / AppMultiSelect option rows (lists, tables).
 * Always uses a <button> (never a focusable hidden input) so toggling does not scroll the page.
 */
export function AppCheckboxControl({
  checked,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
  onClick,
  onPointerDown,
}: AppCheckboxControlProps) {
  const interactive = Boolean(onChange || onClick) && !disabled;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={uiCx(
        'inline-flex shrink-0 items-center justify-center',
        interactive ? 'cursor-pointer' : 'cursor-default',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      onPointerDown={(event) => {
        if (interactive) event.stopPropagation();
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick?.(event);
        onChange?.(!checked);
      }}
    >
      <SelectDropdownCheckbox checked={checked} />
    </button>
  );
}
