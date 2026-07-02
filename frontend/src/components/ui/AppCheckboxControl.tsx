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

/** Icon-only checkbox — same visual as AppCheckbox / AppMultiSelect option rows (lists, tables). */
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

  const boxClassName = uiCx(
    'inline-flex shrink-0 items-center justify-center',
    interactive ? 'cursor-pointer' : 'cursor-default',
    disabled && 'cursor-not-allowed opacity-50',
    className,
  );

  const stopDrag = (event: { stopPropagation: () => void }) => {
    if (interactive) event.stopPropagation();
  };

  // Button avoids hidden-input focus scroll (breaks draggable table rows).
  if (onClick && !onChange) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        className={boxClassName}
        onPointerDown={(event) => {
          stopDrag(event);
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          onClick(event);
        }}
      >
        <SelectDropdownCheckbox checked={checked} />
      </button>
    );
  }

  return (
    <label
      className={boxClassName}
      onPointerDown={(event) => {
        stopDrag(event);
        onPointerDown?.(event);
      }}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly={!onChange}
        tabIndex={-1}
        aria-label={ariaLabel}
        onFocus={(event) => event.currentTarget.blur()}
        onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
        onClick={(event) => event.stopPropagation()}
      />
      <SelectDropdownCheckbox checked={checked} />
    </label>
  );
}
