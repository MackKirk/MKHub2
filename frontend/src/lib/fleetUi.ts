/** Design-system badge variants for Fleet module status labels. */
export type FleetBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export function getFleetAssetStatusVariant(status: string): FleetBadgeVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'maintenance':
      return 'warning';
    case 'retired':
      return 'danger';
    case 'inactive':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function formatFleetAssetStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getFleetAssignmentBadgeVariant(isAssigned: boolean): FleetBadgeVariant {
  return isAssigned ? 'info' : 'success';
}

export function getInspectionScheduleStatusBadgeVariant(status: string): FleetBadgeVariant {
  switch (status) {
    case 'scheduled':
      return 'info';
    case 'in_progress':
      return 'warning';
    case 'completed':
      return 'success';
    default:
      return 'neutral';
  }
}

export function getInspectionChecklistConditionBadgeVariant(condition: string): FleetBadgeVariant {
  switch (condition) {
    case 'ok':
      return 'success';
    case 'damage':
      return 'danger';
    case 'conditional':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function getInspectionResultBadgeVariant(result: string): FleetBadgeVariant {
  switch ((result || 'pending').toLowerCase()) {
    case 'pending':
      return 'neutral';
    case 'pass':
      return 'success';
    case 'fail':
      return 'danger';
    case 'conditional':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function getWorkOrderStatusBadgeVariant(status: string): FleetBadgeVariant {
  switch (status) {
    case 'open':
      return 'neutral';
    case 'in_progress':
      return 'warning';
    case 'pending_parts':
      return 'warning';
    case 'closed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'not_approved':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function getUrgencyBadgeVariant(urgency: string): FleetBadgeVariant {
  switch (urgency) {
    case 'low':
      return 'info';
    case 'normal':
      return 'neutral';
    case 'high':
      return 'warning';
    case 'urgent':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function getInspectionTypeBadgeVariant(type: string | undefined): FleetBadgeVariant {
  return type === 'body' ? 'info' : 'neutral';
}

/** Maps due/expiry status labels (Overdue, Due Soon, Valid, Expired, OK, No expiry). */
export function getFleetDueStatusBadgeVariant(label: string): FleetBadgeVariant {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'overdue' || normalized === 'expired') return 'danger';
  if (normalized === 'due soon') return 'warning';
  if (normalized === 'valid' || normalized === 'ok') return 'success';
  return 'neutral';
}

/** Activity history entry type badge (Check-out, Return, Change, Log). */
export function getFleetHistoryEntryBadgeVariant(badge: string): FleetBadgeVariant {
  switch (badge) {
    case 'Check-out':
      return 'danger';
    case 'Return':
      return 'info';
    case 'Change':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function inspectionTypeLabel(type: string | undefined): string {
  if (type === 'body') return 'Body / Exterior';
  if (type === 'mechanical') return 'Mechanical';
  return type ? type.replace(/_/g, ' ') : 'Mechanical';
}
