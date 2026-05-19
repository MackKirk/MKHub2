import type { ReactNode } from 'react';
import { uiCx, uiRadius } from './tokens';

type AppBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const variantClasses: Record<AppBadgeVariant, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

type AppBadgeProps = {
  children: ReactNode;
  variant?: AppBadgeVariant;
  className?: string;
};

export function AppBadge({ children, variant = 'neutral', className }: AppBadgeProps) {
  return (
    <span
      className={uiCx(
        'inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        uiRadius.badge,
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
