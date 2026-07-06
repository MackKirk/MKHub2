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

/** Field hints for Start / Edit Offboarding modal (`Title\n\nBody`). */
export const OFFBOARDING_START_FIELD_HINTS = {
  employee:
    'Employee\n\nActive team member leaving the company. Employees with an open offboarding case cannot be selected again.',
  termination_type:
    'Termination type\n\nReason category for HR records (resignation, termination, layoff, end of contract, or other).',
  termination_date: 'Termination date\n\nOfficial employment end date recorded in HR.',
  last_working_day: 'Last working day\n\nFinal day the employee is expected to work or remain on site.',
  internal_notes: 'Internal notes\n\nPrivate HR notes for this case — not visible to the employee.',
  access_revocation_timing:
    'Access revocation timing\n\nWhen Hub login should be disabled: immediately, on a schedule, or manually later.',
  scheduled_revocation_date:
    'Revocation date\n\nCompany local date when Hub access will be deactivated. Defaults to the last working day when scheduled.',
  scheduled_revocation_time:
    'Revocation time\n\nCompany local time when Hub access will be deactivated.',
} as const;

export function offboardingStatusLabel(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'in_progress') return 'In Progress';
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

export function terminationTypeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return TERMINATION_TYPES.find((t) => t.value === value)?.label || value;
}

export function accessRevocationLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return ACCESS_REVOCATION_OPTIONS.find((o) => o.value === value)?.label || value;
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

import { parseApiDateForDisplay } from '@/lib/dateUtils';

export function fmtDate(iso: string | null | undefined): string {
  const d = parseApiDateForDisplay(iso);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const OFFBOARDING_CHECKLIST_LABELS: Record<string, string> = {
  termination_date_recorded: 'Termination date recorded',
  hub_access_deactivated: 'Hub access deactivated',
  assets_returned: 'All assigned assets returned or resolved',
  future_shifts_reviewed: 'Future shifts reviewed',
  pending_timesheets_reviewed: 'Pending timesheets reviewed',
  project_responsibilities_reviewed: 'Project responsibilities reviewed',
  final_notes_completed: 'Final notes completed',
};

function checklistItemLabel(key: string): string {
  return OFFBOARDING_CHECKLIST_LABELS[key] || key.replace(/_/g, ' ');
}

function humanizeOffboardingField(field: string): string {
  const map: Record<string, string> = {
    termination_type: 'termination type',
    termination_date: 'termination date',
    last_working_day: 'last working day',
    internal_notes: 'internal notes',
    access_revocation_timing: 'access revocation timing',
    access_revoke_at: 'scheduled revocation',
    access_revoke_at_local: 'scheduled revocation',
  };
  return map[field] || field.replace(/_/g, ' ');
}

export function formatOffboardingActivityMessage(
  action: string,
  details: Record<string, unknown> | undefined,
  actionLabel: string,
): string {
  const d = details || {};
  switch (action) {
    case 'offboarding_created':
      return `Offboarding case created${d.assets_linked != null ? ` (${String(d.assets_linked)} assets linked)` : ''}`;
    case 'offboarding_started':
      return `Offboarding started${d.termination_date ? ` — termination ${String(d.termination_date)}` : ''}${
        d.assets_linked != null ? `, ${String(d.assets_linked)} assets linked` : ''
      }`;
    case 'offboarding_draft_saved':
      return 'Draft saved';
    case 'offboarding_edited': {
      const fields = Object.keys(d).filter((k) => k !== 'user_id');
      if (fields.length > 0) {
        return `Updated: ${fields.map(humanizeOffboardingField).join(', ')}`;
      }
      return 'Case details updated';
    }
    case 'termination_date_updated':
      return d.termination_date
        ? `Termination date set to ${String(d.termination_date)}`
        : 'Termination date updated';
    case 'access_revocation_timing_changed':
      return d.access_revocation_timing
        ? `Access revocation changed to ${accessRevocationLabel(String(d.access_revocation_timing))}`
        : 'Access revocation timing changed';
    case 'hub_access_deactivated':
      return d.reason ? `Hub access deactivated (${String(d.reason)})` : 'Hub access deactivated';
    case 'scheduled_access_revocation_executed':
      return 'Scheduled Hub access revocation executed';
    case 'hub_access_reactivated':
      return 'Hub access reactivated';
    case 'asset_return_status_updated':
      return d.asset_name
        ? `Asset "${String(d.asset_name)}" marked as ${returnStatusLabel(String(d.return_status ?? ''))}`
        : 'Asset return status updated';
    case 'checklist_item_completed':
      return d.item_key
        ? `Checklist completed: ${checklistItemLabel(String(d.item_key))}`
        : 'Checklist item completed';
    case 'checklist_item_reopened':
      return d.item_key
        ? `Checklist reopened: ${checklistItemLabel(String(d.item_key))}`
        : 'Checklist item reopened';
    case 'offboarding_completed':
      return 'Offboarding completed';
    case 'offboarding_cancelled':
      return d.reason ? `Offboarding cancelled — ${String(d.reason)}` : 'Offboarding cancelled';
    case 'termination_date_cleared':
      return 'Termination date cleared from profile';
    case 'notes_added':
      return 'Internal notes added';
    default:
      return actionLabel;
  }
}

export function getOffboardingActivityMeta(action: string): { borderClass: string; badge: string } {
  switch (action) {
    case 'offboarding_created':
    case 'offboarding_started':
      return { borderClass: 'border-brand-red', badge: 'Started' };
    case 'offboarding_draft_saved':
      return { borderClass: 'border-gray-300', badge: 'Draft' };
    case 'offboarding_edited':
    case 'termination_date_updated':
    case 'access_revocation_timing_changed':
    case 'notes_added':
      return { borderClass: 'border-sky-500', badge: 'Updated' };
    case 'hub_access_deactivated':
    case 'scheduled_access_revocation_executed':
      return { borderClass: 'border-rose-500', badge: 'Access revoked' };
    case 'hub_access_reactivated':
      return { borderClass: 'border-emerald-500', badge: 'Access restored' };
    case 'asset_return_status_updated':
      return { borderClass: 'border-indigo-500', badge: 'Asset' };
    case 'checklist_item_completed':
      return { borderClass: 'border-emerald-500', badge: 'Checklist' };
    case 'checklist_item_reopened':
      return { borderClass: 'border-amber-500', badge: 'Checklist' };
    case 'offboarding_completed':
      return { borderClass: 'border-emerald-500', badge: 'Completed' };
    case 'offboarding_cancelled':
    case 'termination_date_cleared':
      return { borderClass: 'border-amber-500', badge: 'Cancelled' };
    default:
      return { borderClass: 'border-gray-300', badge: 'Log' };
  }
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
