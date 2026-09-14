export type SageAttendanceState = 'none' | 'queued' | 'sent' | 'paid' | 'error';

export const SAGE_PAID_MESSAGE =
  'These hours were already used in Sage payroll and cannot be changed.';

export function isSagePaid(state?: string | null, locked?: boolean | null): boolean {
  return locked === true || (state || '').toLowerCase() === 'paid';
}

export function sageBadgeMeta(
  state?: string | null,
  recordKind?: string | null,
): { key: SageAttendanceState; label: string; variant: 'info' | 'success' | 'neutral' | 'danger' } | null {
  if (recordKind === 'subcontractor') return null;
  switch ((state || 'none').toLowerCase()) {
    case 'queued':
      return { key: 'queued', label: 'Queued', variant: 'info' };
    case 'sent':
      return { key: 'sent', label: 'In Sage', variant: 'success' };
    case 'paid':
      return { key: 'paid', label: 'Paid', variant: 'neutral' };
    case 'error':
      return { key: 'error', label: 'Sage error', variant: 'danger' };
    default:
      return null;
  }
}
