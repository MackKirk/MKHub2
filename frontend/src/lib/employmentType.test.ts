import { describe, expect, it } from 'vitest';
import { canonicalEmploymentType, employmentTypeFormValue, employmentTypeLabel } from '@/lib/employmentType';

describe('canonicalEmploymentType', () => {
  it('maps schedule and contract labels onto the select options', () => {
    expect(canonicalEmploymentType('full-time')).toBe('Full-time');
    expect(canonicalEmploymentType('Full Time')).toBe('Full-time');
    expect(canonicalEmploymentType('part time')).toBe('Part-time');
    expect(canonicalEmploymentType('contractor')).toBe('Contract');
  });

  it('does not treat salary or hourly as an employment type', () => {
    expect(canonicalEmploymentType('salary')).toBe('');
    expect(canonicalEmploymentType('Hourly')).toBe('');
    expect(employmentTypeFormValue('salary')).toBe('');
    expect(employmentTypeLabel('salary')).toBe('salary');
  });
});
