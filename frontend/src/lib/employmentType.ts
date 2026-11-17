/** Employment Type is the working relationship. Pay type is hourly or salary. */

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'Full-time', label: 'Full-time' },
  { value: 'Part-time', label: 'Part-time' },
  { value: 'Contract', label: 'Contract' },
] as const;

const ALIASES: Record<string, (typeof EMPLOYMENT_TYPE_OPTIONS)[number]['value']> = {
  'full-time': 'Full-time',
  'full time': 'Full-time',
  fulltime: 'Full-time',
  'part-time': 'Part-time',
  'part time': 'Part-time',
  parttime: 'Part-time',
  contract: 'Contract',
  contractor: 'Contract',
};

function aliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ');
}

/** Map free-text labels onto Full-time | Part-time | Contract. Salary and Hourly are pay types. */
export function canonicalEmploymentType(raw?: string | null): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (EMPLOYMENT_TYPE_OPTIONS.some((option) => option.value === text)) return text;
  const key = aliasKey(text);
  return ALIASES[key] || ALIASES[key.replace(/ /g, '-')] || '';
}

/** Option value when recognized. Pay labels such as Salary are left blank so the select is not stuck. */
export function employmentTypeFormValue(raw?: string | null): string {
  return canonicalEmploymentType(raw);
}

export function employmentTypeLabel(raw?: string | null): string {
  return canonicalEmploymentType(raw) || String(raw || '').trim();
}
