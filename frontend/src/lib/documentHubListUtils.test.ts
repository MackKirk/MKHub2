import { describe, expect, it } from 'vitest';
import {
  documentEditorPath,
  filterDocuments,
  formatRelativeUpdated,
  scopeMetaLabel,
  sortDocuments,
  type DocumentHubSummary,
} from '@/lib/documentHubListUtils';

const base = (overrides: Partial<DocumentHubSummary>): DocumentHubSummary => ({
  id: '1',
  title: 'Alpha',
  page_count: 2,
  signature_status: 'draft',
  updated_at: '2026-08-20T12:00:00Z',
  ...overrides,
});

describe('scopeMetaLabel', () => {
  it('formats standalone scope', () => {
    expect(scopeMetaLabel(base({ scope: 'standalone', page_count: 3 }))).toBe('Standalone · 3 pages');
  });

  it('formats project scope with name', () => {
    expect(
      scopeMetaLabel(base({ scope: 'project', scope_label: 'Cladding', page_count: 4 })),
    ).toBe('Project · Cladding · 4 pages');
  });
});

describe('formatRelativeUpdated', () => {
  it('returns today for same calendar day', () => {
    const now = new Date();
    expect(formatRelativeUpdated(now.toISOString())).toBe('today');
  });
});

describe('filterDocuments', () => {
  const docs = [
    base({ id: '1', title: 'Cladding Contract', signature_status: 'signed' }),
    base({ id: '2', title: 'Offer letter', signature_status: 'draft' }),
  ];

  it('filters by search', () => {
    expect(filterDocuments(docs, { search: 'offer' }).map((d) => d.id)).toEqual(['2']);
  });

  it('filters by status', () => {
    expect(filterDocuments(docs, { status: 'signed' }).map((d) => d.id)).toEqual(['1']);
  });
});

describe('sortDocuments', () => {
  it('sorts by title', () => {
    const docs = [base({ id: 'b', title: 'Beta' }), base({ id: 'a', title: 'Alpha' })];
    expect(sortDocuments(docs, 'title').map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('sorts by updated desc by default key', () => {
    const docs = [
      base({ id: 'old', updated_at: '2026-01-01T00:00:00Z' }),
      base({ id: 'new', updated_at: '2026-08-01T00:00:00Z' }),
    ];
    expect(sortDocuments(docs, 'updated').map((d) => d.id)).toEqual(['new', 'old']);
  });
});

describe('documentEditorPath', () => {
  it('routes standalone docs to hub editor', () => {
    expect(documentEditorPath(base({ scope: 'standalone' }))).toBe('/documents/create/1');
  });

  it('routes project docs to project tab', () => {
    expect(
      documentEditorPath(
        base({
          scope: 'project',
          project_meta: { id: 'p1', business_line: null, is_bidding: false },
        }),
      ),
    ).toBe('/projects/p1?tab=documents&doc=1');
  });
});
