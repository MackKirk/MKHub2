import LoadingSpinner from './LoadingSpinner';

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  children: React.ReactNode;
  className?: string;
  minHeight?: string;
}

export default function LoadingOverlay({ isLoading, text, children, className = '', minHeight = 'min-h-[200px]' }: LoadingOverlayProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  return (
    <div className={`relative ${minHeight} ${className}`}>
      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center rounded-lg">
        <LoadingSpinner size="lg" text={text || 'Loading...'} />
      </div>
      <div className="opacity-20 pointer-events-none">
        {children}
      </div>
    </div>
  );
}

