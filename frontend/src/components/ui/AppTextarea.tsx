import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { uiBorders, uiCx, uiRadius, uiSpacing, uiTypography } from './tokens';

export type AppTextareaProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  textareaClassName?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function AppTextarea({
  label,
  helperText,
  error,
  className,
  textareaClassName,
  id,
  rows = 4,
  ...props
}: AppTextareaProps) {
  return (
    <label className={uiCx('block space-y-1.5', className)} htmlFor={id}>
      {label ? <span className={uiTypography.controlLabel}>{label}</span> : null}
      <textarea
        id={id}
        rows={rows}
        className={uiCx(
          'w-full resize-y bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:cursor-not-allowed disabled:bg-gray-100',
          uiSpacing.controlX,
          uiSpacing.controlY,
          uiRadius.control,
          uiBorders.input,
          textareaClassName,
        )}
        {...props}
      />
      {error ? <span className="block text-xs text-red-600">{error}</span> : helperText ? <span className={uiTypography.helper}>{helperText}</span> : null}
    </label>
  );
}
