import { describe, expect, it } from 'vitest';
import { jobTypeSelectOptions } from '@/lib/jobTypes';

describe('jobTypeSelectOptions', () => {
  it('uses settings labels when present', () => {
    const opts = jobTypeSelectOptions([
      { label: 'Leak Investigation', value: 'Leak Investigation' },
      { label: 'Custom Type', value: 'Custom Type' },
    ]);
    expect(opts[0]).toEqual({ value: '', label: 'No job type selected' });
    expect(opts.map((o) => o.value)).toEqual(['', 'Leak Investigation', 'Custom Type']);
  });

  it('falls back to hardcoded catalog when settings empty', () => {
    const opts = jobTypeSelectOptions([]);
    expect(opts[0].value).toBe('');
    expect(opts.some((o) => o.label === 'Leak Investigation')).toBe(true);
    expect(opts.some((o) => o.label === 'General Labor')).toBe(true);
  });
});
