import { describe, expect, it } from 'vitest';
import {
  daysOverdueLabel,
  formatDueDate,
  getCardVariant,
  sortActionRequired,
  type SignatureInboxItem,
} from './signatureInboxUtils';

const baseItem: SignatureInboxItem = {
  id: '1',
  source: 'document_builder',
  title: 'Test',
  status: 'action_required',
};

describe('signatureInboxUtils', () => {
  it('getCardVariant returns overdue for access blockers', () => {
    expect(getCardVariant({ ...baseItem, is_access_blocker: true })).toBe('overdue');
    expect(getCardVariant({ ...baseItem, is_overdue: true })).toBe('overdue');
  });

  it('getCardVariant returns your_turn for normal action required', () => {
    expect(getCardVariant(baseItem)).toBe('your_turn');
  });

  it('sortActionRequired puts blockers first', () => {
    const normal = { ...baseItem, id: 'a' };
    const overdue = { ...baseItem, id: 'b', is_overdue: true };
    const blocker = { ...baseItem, id: 'c', is_access_blocker: true };
    const sorted = sortActionRequired([normal, overdue, blocker]);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('formatDueDate returns short date', () => {
    expect(formatDueDate('2026-08-25T12:00:00Z')).toMatch(/Aug/);
  });

  it('daysOverdueLabel returns day count for past deadlines', () => {
    const past = new Date();
    past.setDate(past.getDate() - 2);
    expect(daysOverdueLabel(past.toISOString())).toBe('2 days overdue');
  });
});
