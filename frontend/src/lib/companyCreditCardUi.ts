import type { FleetBadgeVariant } from '@/lib/fleetUi';

export function getCorporateCardStatusBadgeVariant(status: string): FleetBadgeVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'cancelled':
      return 'neutral';
    case 'replaced':
      return 'info';
    case 'lost':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function getCorporateCardCustodyBadgeVariant(inCustody: boolean): FleetBadgeVariant {
  return inCustody ? 'warning' : 'success';
}

export function formatCorporateCardStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
