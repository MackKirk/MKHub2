export type TimeOffMode = 'vacation' | 'sick';

export type TimeOffBalance = {
  id: string;
  policy_name: string;
  balance_hours: number;
  accrued_hours: number;
  used_hours: number;
  year: number;
  last_synced_at?: string | null;
};

export type TimeOffRequest = {
  id: string;
  policy_name: string;
  start_date: string;
  end_date: string;
  hours: number;
  notes?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requested_at: string;
  reviewed_at?: string | null;
  review_notes?: string | null;
};

export type TimeOffHistoryItem = {
  id: string;
  policy_name: string;
  transaction_date: string;
  description?: string | null;
  used_days?: number | null;
  earned_days?: number | null;
  balance_after: number;
};

export function hoursToDays(hours: number): number {
  return hours / 8;
}

export function daysToHours(days: number): number {
  return days * 8;
}

export function isSickPolicy(name: string): boolean {
  return name.toLowerCase().includes('sick');
}

export function isVacationPolicy(name: string): boolean {
  const value = name.toLowerCase();
  return (
    value.includes('vacation') ||
    value.includes('holiday') ||
    value.includes('time off') ||
    value.includes('day off')
  );
}

export function matchesTimeOffMode(policyName: string, mode: TimeOffMode): boolean {
  return mode === 'sick' ? isSickPolicy(policyName) : isVacationPolicy(policyName);
}

export function resolvePolicyName(balances: TimeOffBalance[], kind: TimeOffMode): string {
  const match = balances.find((row) =>
    kind === 'sick' ? isSickPolicy(row.policy_name) : isVacationPolicy(row.policy_name),
  );
  return match?.policy_name ?? (kind === 'sick' ? 'Sick Leave' : 'Vacation');
}

export function countInclusiveDays(startDate: string, endDate: string): number {
  const start = parseLocalDateOnly(startDate);
  const end = parseLocalDateOnly(endDate);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/** Parse YYYY-MM-DD as a local calendar date (never UTC midnight). */
export function parseLocalDateOnly(dateStr: string): Date {
  const raw = String(dateStr || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(NaN);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

/** Extract YYYY-MM-DD from API date / datetime strings. */
export function toDateOnlyString(dateStr: string | null | undefined): string {
  const raw = String(dateStr || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : raw.slice(0, 10);
}

export function formatShortDate(dateStr: string): string {
  const only = toDateOnlyString(dateStr);
  const m = only.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}

/**
 * Format calendar dates without `Date` / timezone conversion.
 * `new Date('YYYY-MM-DD')` is UTC midnight and shifts a day in Pacific.
 */
export function formatTimeOffDate(dateStr: string): string {
  const only = toDateOnlyString(dateStr);
  const m = only.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr || '');
  return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
}

export function formatTimeOffDateRange(startDate: string, endDate: string): string {
  const start = toDateOnlyString(startDate);
  const end = toDateOnlyString(endDate);
  if (!start) return '';
  if (!end || end === start) return formatTimeOffDate(start);
  return `${formatTimeOffDate(start)} - ${formatTimeOffDate(end)}`;
}

export function isTimeOffEndOnOrAfterToday(endDate: string, from = new Date()): boolean {
  const end = parseLocalDateOnly(endDate);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return end >= today;
}
