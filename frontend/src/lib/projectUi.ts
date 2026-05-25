import { getClientStatusBadgeVariant, type ClientStatusBadgeVariant } from '@/lib/clientUi';

export type ProjectStatusBadgeVariant = ClientStatusBadgeVariant;

/** Map project/opportunity status_label to AppBadge variant (not settings hex colors). */
export function getProjectStatusBadgeVariant(status?: string | null): ProjectStatusBadgeVariant {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return 'neutral';

  if (s === 'prospecting' || s === 'estimating') return 'info';
  if (s === 'sent to customer') return 'warning';
  if (s === 'refused' || s === 'lost' || s === 'cancelled' || s === 'canceled') return 'danger';
  if (s === 'in progress' || s === 'active' || s === 'ongoing') return 'success';
  if (
    s === 'won' ||
    s === 'awarded' ||
    s === 'approved' ||
    s === 'completed' ||
    s === 'complete' ||
    s === 'closed won'
  ) {
    return 'success';
  }
  if (s === 'on hold' || s.includes('hold') || s === 'pending') return 'warning';

  return getClientStatusBadgeVariant(status);
}
