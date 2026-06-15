import type { MouseEvent } from 'react';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx } from './tokens';

export type AppCheckboxControlProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label': string;
  onClick?: (event: MouseEvent<HTMLLabelElement>) => void;
};

/** Icon-only checkbox — same visual as AppCheckbox / AppMultiSelect option rows (lists, tables). */
export function AppCheckboxControl({
  checked,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel,
  onClick,
}: AppCheckboxControlProps) {
  const interactive = Boolean(onChange) && !disabled;

  return (
    <label
      className={uiCx(
        'inline-flex shrink-0 items-center justify-center',
        interactive ? 'cursor-pointer' : 'cursor-default',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      onClick={onClick}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly={!onChange}
        aria-label={ariaLabel}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
      />
      <SelectDropdownCheckbox checked={checked} />
    </label>
  );
}
