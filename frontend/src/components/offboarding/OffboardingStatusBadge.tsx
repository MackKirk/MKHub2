import { AppBadge } from '@/components/ui';
import { offboardingStatusLabel } from './offboardingUtils';

export function OffboardingStatusBadge({
  status,
  actionRequired,
}: {
  status: string;
  actionRequired?: boolean;
}) {
  const s = String(status || '').toLowerCase();
  let variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' = 'neutral';
  if (s === 'in_progress') variant = 'info';
  if (s === 'completed') variant = 'success';
  if (s === 'cancelled') variant = 'danger';
  if (s === 'draft') variant = 'warning';

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <AppBadge variant={variant}>{offboardingStatusLabel(status)}</AppBadge>
      {actionRequired && s !== 'completed' && s !== 'cancelled' ? (
        <AppBadge variant="danger">Action Required</AppBadge>
      ) : null}
    </span>
  );
}

export function HubAccessBadge({ active }: { active: boolean }) {
  return (
    <AppBadge variant={active ? 'success' : 'danger'}>
      {active ? 'Active' : 'Inactive'}
    </AppBadge>
  );
}
