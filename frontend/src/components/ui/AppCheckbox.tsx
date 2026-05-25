import type { ReactNode } from 'react';
import { AppFieldHint } from './AppFieldHint';
import { SelectDropdownCheckbox } from './SelectDropdownCheckbox';
import { uiCx, uiTypography } from './tokens';

export type AppCheckboxProps = {
  label: ReactNode;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  fieldHint?: ReactNode;
  className?: string;
};

/** Form checkbox — same visual as AppMultiSelect / AppUserSelect option rows. */
export function AppCheckbox({ label, checked, onChange, disabled, fieldHint, className }: AppCheckboxProps) {
  const interactive = Boolean(onChange) && !disabled;

  return (
    <label
      className={uiCx(
        'flex items-start gap-2.5',
        interactive ? 'cursor-pointer' : 'cursor-default',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        readOnly={!onChange}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
      />
      <span className="mt-0.5 shrink-0">
        <SelectDropdownCheckbox checked={checked} />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-1">
          <span className={uiTypography.body}>{label}</span>
          {fieldHint ? <AppFieldHint hint={fieldHint} /> : null}
        </span>
      </span>
    </label>
  );
}
