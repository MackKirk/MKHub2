export type ShiftAckStatus = 'pending' | 'viewed' | 'accepted' | 'declined' | 'not_required' | string;

/** Shifts created before confirmation existed are marked not_required and stay quiet. */
export function shiftAckTracked(status?: string | null): boolean {
  return status !== 'not_required';
}

/** Worker still needs to accept or decline (pending or seen but unanswered). */
export function shiftAckNeedsResponse(status?: string | null): boolean {
  if (!shiftAckTracked(status)) return false;
  const s = (status || 'pending').toLowerCase();
  return s === 'pending' || s === 'viewed' || s === '';
}

export function shiftAckMeta(status?: string | null) {
  switch (status) {
    case 'accepted':
      return {
        shortLabel: 'Accepted',
        longLabel: 'Accepted',
        tone: 'text-green-700',
        variant: 'success' as const,
      };
    case 'declined':
      return {
        shortLabel: 'Declined',
        longLabel: 'Declined',
        tone: 'text-red-700',
        variant: 'danger' as const,
      };
    case 'viewed':
      return {
        shortLabel: 'Pending',
        longLabel: 'Pending confirmation',
        tone: 'text-amber-700',
        variant: 'warning' as const,
      };
    default:
      return {
        shortLabel: 'Pending',
        longLabel: 'Pending confirmation',
        tone: 'text-amber-700',
        variant: 'warning' as const,
      };
  }
}

/** Shared React Query key for home/nav pending shift confirmation badge. */
export const SCHEDULE_PENDING_ACK_QUERY_KEY = ['schedule-pending-acks'] as const;

export function shiftResponseActionLabel(action?: string | null): string {
  switch (action) {
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'viewed':
      return 'Seen';
    case 'reset':
      return 'Confirmation reset';
    default:
      return action || 'Update';
  }
}
