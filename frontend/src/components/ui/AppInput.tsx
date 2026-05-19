import type { InputHTMLAttributes, ReactNode } from 'react';
import { uiBorders, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

export type AppInputProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  inputClassName?: string;
  leftIcon?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

export function AppInput({
  label,
  helperText,
  error,
  className,
  inputClassName,
  leftIcon,
  id,
  ...props
}: AppInputProps) {
  return (
    <label className={uiCx('block space-y-1.5', className)} htmlFor={id}>
      {label ? <span className={uiTypography.controlLabel}>{label}</span> : null}
      <span className="relative block">
        {leftIcon ? <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-gray-400">{leftIcon}</span> : null}
        <input
          id={id}
          className={uiCx(
            'w-full bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100',
            uiSpacing.controlX,
            uiSpacing.controlY,
            uiRadius.control,
            uiBorders.input,
            leftIcon ? 'pl-8' : '',
            inputClassName,
          )}
          {...props}
        />
      </span>
      {error ? <span className="block text-xs text-red-600">{error}</span> : helperText ? <span className={uiTypography.helper}>{helperText}</span> : null}
    </label>
  );
}
