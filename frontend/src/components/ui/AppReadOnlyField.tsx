import type { ReactNode } from 'react';
import { uiCx, uiTypography } from './tokens';

const EMPTY_DISPLAY = '\u2014';

export type AppReadOnlyFieldProps = {
  label: ReactNode;
  value?: ReactNode;
  className?: string;
};

function isEmptyValue(value: ReactNode): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return !value.trim();
  return false;
}

/** Read-only label + value pair (Customer / Subcontractor General tab pattern). */
export function AppReadOnlyField({ label, value, className }: AppReadOnlyFieldProps) {
  const display = isEmptyValue(value) ? EMPTY_DISPLAY : value;
  return (
    <div className={uiCx('space-y-1', className)}>
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>{display}</div>
    </div>
  );
}
