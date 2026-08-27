import { describe, expect, it } from 'vitest';
import {
  buildDocumentCreatePayload,
  documentsTabPathForProject,
  standaloneDocumentEditorPath,
  userDocumentBuilderPath,
} from '@/lib/documentCreateScope';

describe('buildDocumentCreatePayload', () => {
  it('omits title for project scope', () => {
    const payload = buildDocumentCreatePayload(
      { kind: 'preset', documentTypeId: 'type-1' },
      { kind: 'project', projectId: 'proj-1' },
    );
    expect(payload.title).toBeUndefined();
    expect(payload.project_id).toBe('proj-1');
    expect(payload.document_type_id).toBe('type-1');
  });

  it('omits title for user scope', () => {
    const payload = buildDocumentCreatePayload(
      { kind: 'blank' },
      { kind: 'user', userId: 'user-1' },
    );
    expect(payload.title).toBeUndefined();
    expect(payload.subject_user_id).toBe('user-1');
  });

  it('omits title for standalone scope', () => {
    const payload = buildDocumentCreatePayload({ kind: 'blank' }, { kind: 'standalone' });
    expect(payload.title).toBeUndefined();
  });
});

describe('document open path helpers', () => {
  it('appends rename query for project documents tab', () => {
    const path = documentsTabPathForProject(
      { id: 'p1', business_line: null, is_bidding: false },
      'doc-1',
      { rename: true },
    );
    expect(path).toContain('doc=doc-1');
    expect(path).toContain('rename=1');
  });

  it('appends rename query for user document builder', () => {
    const path = userDocumentBuilderPath('u1', 'doc-2', { rename: true });
    expect(path).toContain('doc=doc-2');
    expect(path).toContain('rename=1');
  });

  it('appends rename query for standalone document editor', () => {
    const path = standaloneDocumentEditorPath('doc-3', { rename: true });
    expect(path).toBe('/documents/create/doc-3?rename=1');
  });
});
