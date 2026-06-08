import {
  formatFleetAssetStatus,
  getFleetAssetStatusVariant,
  type FleetBadgeVariant,
} from '@/lib/fleetUi';

/** Same operational statuses as fleet assets. */
export const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
] as const;

/** Legacy DB values before fleet-aligned status migration. */
export function normalizeEquipmentOperationalStatus(status: string): string {
  if (status === 'available' || status === 'checked_out') return 'active';
  return status;
}

export function getEquipmentStatusBadgeVariant(status: string): FleetBadgeVariant {
  return getFleetAssetStatusVariant(normalizeEquipmentOperationalStatus(status));
}

export function formatEquipmentStatus(status: string): string {
  return formatFleetAssetStatus(normalizeEquipmentOperationalStatus(status));
}

export function getEquipmentAssignmentBadgeVariant(isAssigned: boolean): FleetBadgeVariant {
  return isAssigned ? 'info' : 'success';
}
