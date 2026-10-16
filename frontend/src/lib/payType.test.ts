import { describe, expect, it } from 'vitest';
import { canonicalPayType, isSalaryPayType, payTypeLabel, shouldRegisterHours } from '@/lib/payType';

describe('canonicalPayType', () => {
  it('maps Bamboo and free-text labels onto the selector values', () => {
    expect(canonicalPayType('Salary')).toBe('salary');
    expect(canonicalPayType('Annual')).toBe('salary');
    expect(canonicalPayType('Exempt')).toBe('salary');
    expect(canonicalPayType('Hourly')).toBe('hourly');
    expect(canonicalPayType('Contract')).toBe('contract');
    expect(canonicalPayType('Salary - Exempt')).toBe('salary');
  });

  it('leaves unknown values unmapped so they must be chosen', () => {
    expect(canonicalPayType('')).toBe('');
    expect(canonicalPayType(null)).toBe('');
    expect(canonicalPayType('piece work')).toBe('');
  });
});

describe('isSalaryPayType', () => {
  it('treats salary aliases as salary', () => {
    expect(isSalaryPayType('salaried')).toBe(true);
    expect(isSalaryPayType('Hourly')).toBe(false);
  });
});

describe('shouldRegisterHours', () => {
  it('treats a checked salary employee as hourly for hours', () => {
    expect(shouldRegisterHours('salary', false)).toBe(false);
    expect(shouldRegisterHours('Salary', true)).toBe(true);
    expect(shouldRegisterHours('hourly', false)).toBe(true);
  });
});

describe('payTypeLabel', () => {
  it('shows a standard label and keeps unknown text', () => {
    expect(payTypeLabel('hourly')).toBe('Hourly');
    expect(payTypeLabel('piece work')).toBe('piece work');
  });
});
