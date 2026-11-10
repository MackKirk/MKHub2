import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  label: ReactNode;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  name?: string;
  value?: string;
  disabled?: boolean;
  className?: string;
};

/** Hub-style checkbox (same visual as AppCheckbox / SelectDropdownCheckbox). */
export default function MkCheckbox({
  label,
  checked,
  onChange,
  name,
  value,
  disabled,
  className = '',
}: Props) {
  const interactive = Boolean(onChange) && !disabled;

  return (
    <label
      className={`flex items-start gap-2.5 text-sm ${
        interactive ? 'cursor-pointer' : 'cursor-default'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        readOnly={!onChange}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
      />
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? 'border-metals-accent bg-metals-accent'
            : 'border-gray-300 bg-white'
        }`}
        aria-hidden
      >
        {checked ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
    </label>
  );
}
