import type { FleetBadgeVariant } from '@/lib/fleetUi';

export function getEquipmentStatusBadgeVariant(status: string): FleetBadgeVariant {
  switch (status) {
    case 'available':
      return 'success';
    case 'checked_out':
      return 'info';
    case 'maintenance':
      return 'warning';
    case 'retired':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function getEquipmentAssignmentBadgeVariant(isAssigned: boolean): FleetBadgeVariant {
  return isAssigned ? 'warning' : 'success';
}

export function formatEquipmentStatus(status: string): string {
  return status.replace(/_/g, ' ');
}
