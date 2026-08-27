import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_AUTO_FILL_TOKENS,
  filterAutoFillTokensForScope,
  type DocumentAutoFillTokenValue,
} from '@/lib/documentAutoFillTokens';

const all: DocumentAutoFillTokenValue[] = DOCUMENT_AUTO_FILL_TOKENS.map((t) => ({
  ...t,
  value: '',
}));

describe('filterAutoFillTokensForScope', () => {
  it('hides employee tokens for project documents', () => {
    const out = filterAutoFillTokensForScope(all, { projectId: 'p1', subjectUserId: null });
    expect(out.every((t) => t.group === 'project')).toBe(true);
    expect(out.some((t) => t.token === '<Employee Name>')).toBe(false);
    expect(out.some((t) => t.token === '<Project Name>')).toBe(true);
  });

  it('hides project tokens for user documents', () => {
    const out = filterAutoFillTokensForScope(all, { projectId: null, subjectUserId: 'u1' });
    expect(out.every((t) => t.group === 'employee')).toBe(true);
    expect(out.some((t) => t.token === '<Project Name>')).toBe(false);
    expect(out.some((t) => t.token === '<Employee Name>')).toBe(true);
  });

  it('keeps both groups for standalone / template', () => {
    const out = filterAutoFillTokensForScope(all, { projectId: null, subjectUserId: null });
    expect(out).toHaveLength(all.length);
  });
});
