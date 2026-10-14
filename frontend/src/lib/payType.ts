/** Canonical compensation types used by clock-in and hours reminders. */

export const PAY_TYPE_OPTIONS = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'salary', label: 'Salary' },
  { value: 'contract', label: 'Contract' },
] as const;

export type CanonicalPayType = (typeof PAY_TYPE_OPTIONS)[number]['value'];

const HOURLY = new Set(['hourly', 'hour', 'hours']);
const SALARY = new Set(['salary', 'salaried', 'annual', 'yearly', 'year', 'exempt']);
const CONTRACT = new Set(['contract', 'contractor', 'commission']);

/** Map free-text or Bamboo labels onto hourly | salary | contract. */
export function canonicalPayType(raw?: string | null): CanonicalPayType | '' {
  const text = (raw || '').trim().toLowerCase();
  if (!text) return '';
  if (HOURLY.has(text)) return 'hourly';
  if (SALARY.has(text)) return 'salary';
  if (CONTRACT.has(text)) return 'contract';
  if (text.includes('salary') || text.includes('annual') || text.includes('salaried')) return 'salary';
  if (text.includes('contract')) return 'contract';
  if (text.includes('hour')) return 'hourly';
  return '';
}

export function isSalaryPayType(raw?: string | null): boolean {
  return canonicalPayType(raw) === 'salary';
}

/** Salary skips hours unless the register-hours checkbox is on. */
export function shouldRegisterHours(payType?: string | null, needsRegisterHours?: boolean | null): boolean {
  if (!isSalaryPayType(payType)) return true;
  return Boolean(needsRegisterHours);
}

export function payTypeLabel(raw?: string | null): string {
  const canonical = canonicalPayType(raw);
  if (canonical === 'hourly') return 'Hourly';
  if (canonical === 'salary') return 'Salary';
  if (canonical === 'contract') return 'Contract';
  return (raw || '').trim();
}
