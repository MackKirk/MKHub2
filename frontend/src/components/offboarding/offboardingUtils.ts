export const OFFBOARDING_STATUSES = ['draft', 'in_progress', 'completed', 'cancelled'] as const;

export const TERMINATION_TYPES = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'termination', label: 'Termination' },
  { value: 'layoff', label: 'Layoff' },
  { value: 'end_of_contract', label: 'End of Contract' },
  { value: 'other', label: 'Other' },
] as const;

export const ACCESS_REVOCATION_OPTIONS = [
  { value: 'immediately', label: 'Immediately' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'manually_later', label: 'Manually Later' },
] as const;

export function offboardingStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'in_progress') return 'In Progress';
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function returnStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_return: 'Pending Return',
    returned: 'Returned',
    damaged: 'Damaged',
    missing: 'Missing',
    not_applicable: 'Not Applicable',
  };
  return map[status] || status;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export type OffboardingDetail = {
  id: string;
  user_id: string;
  status: string;
  termination_type?: string | null;
  termination_date?: string | null;
  last_working_day?: string | null;
  internal_notes?: string | null;
  access_revocation_timing?: string | null;
  access_revoke_at?: string | null;
  access_revoke_at_local?: string | null;
  company_timezone: string;
  hub_access_active: boolean;
  action_required: boolean;
  employee_name: string;
  position?: string | null;
  division?: string | null;
  manager_name?: string | null;
  operational_summary: Record<string, unknown>;
  completion_blockers: string[];
  completion_warnings: string[];
};
