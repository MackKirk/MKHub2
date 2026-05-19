import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { uiCx, uiRadius, uiTypography } from './tokens';

type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type AppButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<AppButtonVariant, string> = {
  primary:
    'border border-brand-red bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white hover:from-brand-red hover:to-brand-red focus-visible:ring-brand-red/40',
  secondary:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-gray-300',
  ghost: 'border border-transparent bg-transparent text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-300',
  danger: 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-300',
};

const sizeClasses: Record<AppButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-xs',
  lg: 'h-10 px-5 text-sm',
};

export type AppButtonProps = {
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function AppButton({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: AppButtonProps) {
  const iconLeft = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={uiCx(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        uiRadius.control,
        uiTypography.controlLabel,
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {iconLeft ? <span className="shrink-0">{iconLeft}</span> : null}
      {children}
      {!loading && rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
}
