/** Employment Type options on the employee profile. Values must match the stored option text. */

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'Full-time', label: 'Full-time' },
  { value: 'Hourly', label: 'Hourly' },
  { value: 'Part-time', label: 'Part-time' },
  { value: 'Salary', label: 'Salary' },
] as const;

const ALIASES: Record<string, (typeof EMPLOYMENT_TYPE_OPTIONS)[number]['value']> = {
  salary: 'Salary',
  salaried: 'Salary',
  hourly: 'Hourly',
  hour: 'Hourly',
  hours: 'Hourly',
  'full-time': 'Full-time',
  'full time': 'Full-time',
  fulltime: 'Full-time',
  'part-time': 'Part-time',
  'part time': 'Part-time',
  parttime: 'Part-time',
};

function aliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ');
}

/** Map free-text or Bamboo labels onto Full-time | Hourly | Part-time | Salary. */
export function canonicalEmploymentType(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (EMPLOYMENT_TYPE_OPTIONS.some((option) => option.value === text)) return text;
  const key = aliasKey(text);
  return ALIASES[key] || ALIASES[key.replace(/ /g, '-')] || '';
}

/** Option value when recognized; otherwise the original text so unknown values are not wiped. */
export function employmentTypeFormValue(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  return canonicalEmploymentType(text) || text;
}

export function employmentTypeLabel(raw?: string | null): string {
  return employmentTypeFormValue(raw);
}
