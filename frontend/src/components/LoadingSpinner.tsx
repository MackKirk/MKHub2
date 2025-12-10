interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
  variant?: 'logo' | 'spinner';
}

export default function LoadingSpinner({ size = 'md', className = '', text, variant = 'logo' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  if (variant === 'spinner') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
        <div className={`${sizeClasses[size]} border-4 border-gray-200 border-t-brand-red rounded-full animate-spin`}></div>
        {text && (
          <div className="text-sm text-gray-600 font-medium">{text}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className="relative">
        <div className={`${sizeClasses[size]} flex items-center justify-center`}>
          <img
            src="/ui/assets/login/logo-light.svg"
            alt="Loading"
            className={`${sizeClasses[size]} animate-spin`}
            style={{ animationDuration: '2s', animationTimingFunction: 'linear' }}
          />
        </div>
      </div>
      {text && (
        <div className="text-sm text-gray-600 font-medium animate-pulse">{text}</div>
      )}
    </div>
  );
}

