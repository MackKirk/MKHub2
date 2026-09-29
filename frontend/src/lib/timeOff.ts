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
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
