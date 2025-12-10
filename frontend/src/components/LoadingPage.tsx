import LoadingSpinner from './LoadingSpinner';

interface LoadingPageProps {
  text?: string;
  className?: string;
}

/**
 * Full-page loading component for initial page loads
 * Use this when the entire page content depends on data loading
 */
export default function LoadingPage({ text = 'Loading...', className = '' }: LoadingPageProps) {
  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${className}`}>
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

