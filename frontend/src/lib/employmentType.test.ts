import { describe, expect, it } from 'vitest';
import { canonicalEmploymentType, employmentTypeFormValue, employmentTypeLabel } from '@/lib/employmentType';

describe('canonicalEmploymentType', () => {
  it('maps legacy lowercase labels onto the select options', () => {
    expect(canonicalEmploymentType('salary')).toBe('Salary');
    expect(canonicalEmploymentType('hourly')).toBe('Hourly');
    expect(canonicalEmploymentType('full-time')).toBe('Full-time');
    expect(canonicalEmploymentType('Full Time')).toBe('Full-time');
    expect(canonicalEmploymentType('part time')).toBe('Part-time');
  });

  it('keeps an option value that already matches', () => {
    expect(canonicalEmploymentType('Salary')).toBe('Salary');
  });

  it('leaves unknown text unmapped', () => {
    expect(canonicalEmploymentType('contractor')).toBe('');
    expect(canonicalEmploymentType('')).toBe('');
    expect(canonicalEmploymentType(null)).toBe('');
  });
});

describe('employmentTypeFormValue', () => {
  it('selects Salary for the old lowercase string and keeps unknown text', () => {
    expect(employmentTypeFormValue('salary')).toBe('Salary');
    expect(employmentTypeLabel('salary')).toBe('Salary');
    expect(employmentTypeFormValue('contractor')).toBe('contractor');
  });
});
