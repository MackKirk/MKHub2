import { AppEmptyState } from '@/components/ui';

type NoAccessStateProps = {
  description?: string;
  className?: string;
};

export default function NoAccessState({
  description = 'You do not have permission to view this page.',
  className,
}: NoAccessStateProps) {
  return (
    <AppEmptyState
      title="No access"
      description={description}
      className={className}
    />
  );
}
