import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { uiBorders, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

export type AppSelectOption = {
  value: string;
  label: string;
};

export type AppSelectProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  options: AppSelectOption[];
  placeholder?: string;
  selectClassName?: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

export function AppSelect({
  label,
  helperText,
  error,
  className,
  selectClassName,
  options,
  placeholder,
  id,
  ...props
}: AppSelectProps) {
  return (
    <label className={uiCx('block space-y-1.5', className)} htmlFor={id}>
      {label ? <span className={uiTypography.controlLabel}>{label}</span> : null}
      <span className="relative block">
        <select
          id={id}
          className={uiCx(
            'w-full appearance-none bg-white text-xs text-gray-900 outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100',
            uiSpacing.controlX,
            uiSpacing.controlY,
            'pr-8',
            uiRadius.control,
            uiBorders.input,
            selectClassName,
          )}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      </span>
      {error ? <span className="block text-xs text-red-600">{error}</span> : helperText ? <span className={uiTypography.helper}>{helperText}</span> : null}
    </label>
  );
}
