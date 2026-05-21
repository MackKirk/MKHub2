import type { AppUserSelectUser } from '@/components/ui';

/** AppBadge variant keys used for customer/client status chips. */
export type ClientStatusBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const SALES_ESTIMATING_DEPT_MATCHERS = ['sales / estimating', 'sales/estimating', 'sales', 'estimating'];

function isSalesOrEstimatingDeptLabel(label: string): boolean {
  const n = label.trim().toLowerCase();
  if (!n) return false;
  return SALES_ESTIMATING_DEPT_MATCHERS.some((m) => n === m || n.includes(m));
}

/** Users/employees with at least Sales or Sales / Estimating in departments. */
export function employeeHasSalesOrEstimatingDepartment(emp: {
  divisions?: { label?: string }[];
  department?: string | null;
  division?: string | null;
}): boolean {
  if (Array.isArray(emp.divisions) && emp.divisions.length > 0) {
    return emp.divisions.some((d) => isSalesOrEstimatingDeptLabel(String(d?.label || '')));
  }
  return isSalesOrEstimatingDeptLabel(String(emp.department || emp.division || ''));
}

export function mapEmployeeToAppUserSelect(emp: Record<string, unknown>): AppUserSelectUser {
  const profile = emp.profile as Record<string, unknown> | undefined;
  return {
    id: String(emp.id ?? ''),
    name: (emp.name as string) || (emp.username as string) || undefined,
    username: (emp.username as string) || undefined,
    first_name: (emp.first_name as string) || (profile?.first_name as string) || undefined,
    last_name: (emp.last_name as string) || (profile?.last_name as string) || undefined,
    preferred_name: (emp.preferred_name as string) || (profile?.preferred_name as string) || undefined,
    department: (emp.department as string) || (emp.division as string) || (profile?.department as string) || undefined,
    profile_photo_file_id:
      (emp.profile_photo_file_id as string) || (profile?.profile_photo_file_id as string) || undefined,
  };
}

/** Map client_status label to design-system AppBadge variant (not settings hex colors). */
export function getClientStatusBadgeVariant(status?: string | null): ClientStatusBadgeVariant {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return 'neutral';

  // Before "active": "inactive" contains the substring "active".
  if (
    s === 'inactive' ||
    s.includes('inactive') ||
    s === 'archived' ||
    s.includes('archived')
  ) {
    return 'danger';
  }
  if (s === 'active' || s.includes('active')) return 'success';
  if (s === 'prospect' || s === 'lead' || s.includes('prospect') || s.includes('lead')) return 'info';
  if (
    s.includes('hold') ||
    s.includes('pending') ||
    s.includes('review') ||
    s.includes('negotiat')
  ) {
    return 'warning';
  }
  if (
    s.includes('suspend') ||
    s.includes('closed') ||
    s.includes('lost') ||
    s.includes('block') ||
    s.includes('do not') ||
    s.includes('refus')
  ) {
    return 'danger';
  }

  return 'neutral';
}
