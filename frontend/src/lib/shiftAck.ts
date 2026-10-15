export type ShiftAckStatus = 'pending' | 'viewed' | 'accepted' | 'declined' | 'not_required' | string;

/** Shifts created before confirmation existed are marked not_required and stay quiet. */
export function shiftAckTracked(status?: string | null): boolean {
  return status !== 'not_required';
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
        shortLabel: 'Seen',
        longLabel: 'Seen, no answer yet',
        tone: 'text-blue-700',
        variant: 'info' as const,
      };
    default:
      return {
        shortLabel: 'Confirm',
        longLabel: 'Not seen yet',
        tone: 'text-amber-700',
        variant: 'warning' as const,
      };
  }
}

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
