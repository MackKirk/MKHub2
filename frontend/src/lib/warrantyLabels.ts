export const WARRANTY_TYPE_LABELS: Record<string, string> = {
  workmanship: 'Workmanship Warranty',
  manufacturer: 'Manufacturer Warranty',
  material: 'Material Warranty',
  subcontractor: 'Subcontractor Warranty',
  extended: 'Extended Warranty',
  other: 'Other',
};

export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  mack_kirk: 'Mack Kirk',
  manufacturer: 'Manufacturer',
  supplier: 'Supplier',
  subcontractor: 'Subcontractor',
  third_party: 'Third Party',
  other: 'Other',
};

export const WARRANTY_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_documents: 'Pending Documents',
  pending_registration: 'Pending Registration',
  active: 'Active',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  voided: 'Voided',
  cancelled: 'Cancelled',
};

export const OVERALL_STATUS_LABELS: Record<string, string> = {
  no_warranty: 'No Warranty',
  draft: 'Draft',
  partial_coverage: 'Partial Coverage',
  active: 'Active',
  expired: 'Expired',
};

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  under_review: 'Under Review',
  site_visit_required: 'Site Visit Required',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const CLAIM_SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  emergency: 'Emergency',
};

export const MAINTENANCE_FREQUENCY_LABELS: Record<string, string> = {
  every_6_months: 'Every 6 months',
  annually: 'Annually',
  every_2_years: 'Every 2 years',
  custom: 'Custom interval',
};

export const COVERAGE_DECISION_LABELS: Record<string, string> = {
  pending_assessment: 'Pending Assessment',
  covered: 'Covered',
  partially_covered: 'Partially Covered',
  not_covered: 'Not Covered',
  manufacturer_responsibility: 'Manufacturer Responsibility',
  subcontractor_responsibility: 'Subcontractor Responsibility',
  customer_responsibility: 'Customer Responsibility',
};

export const COST_RESPONSIBILITY_LABELS: Record<string, string> = {
  mack_kirk: 'Mack Kirk',
  manufacturer: 'Manufacturer',
  subcontractor: 'Subcontractor',
  customer: 'Customer',
  shared_cost: 'Shared Cost',
  no_cost: 'No Cost',
};

export function warrantyStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'expiring_soon':
      return 'bg-amber-100 text-amber-800';
    case 'expired':
      return 'bg-gray-200 text-gray-700';
    case 'voided':
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    case 'pending_documents':
    case 'pending_registration':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export function claimSeverityBadgeClass(severity: string): string {
  switch (severity) {
    case 'emergency':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}
