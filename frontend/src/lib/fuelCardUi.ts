import type { FleetBadgeVariant } from '@/lib/fleetUi';

export function getFuelCardStatusBadgeVariant(status: string): FleetBadgeVariant {
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

export function getFuelCardCustodyBadgeVariant(inCustody: boolean): FleetBadgeVariant {
  return inCustody ? 'warning' : 'success';
}

export function formatFuelCardStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
