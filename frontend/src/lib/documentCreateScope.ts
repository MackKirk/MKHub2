import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import type { DocumentCreationSelection } from '@/components/ChooseDocumentTypeModal';

export type DocumentCreateScopeKind = 'project' | 'user' | 'standalone';

export type DocumentCreateScope =
  | { kind: 'standalone' }
  | { kind: 'project'; projectId: string }
  | { kind: 'user'; userId: string };

export type ProjectRouteMeta = {
  id: string;
  business_line?: string | null;
  is_bidding?: boolean | null;
};

export type DocumentOpenQueryOptions = {
  docId?: string;
  rename?: boolean;
};

/** List/detail URL for a project or opportunity Documents tab, with optional open-doc query. */
export function documentsTabPathForProject(
  project: ProjectRouteMeta,
  docId?: string,
  options?: Pick<DocumentOpenQueryOptions, 'rename'>,
): string {
  const rm = project.business_line === BUSINESS_LINE_REPAIRS_MAINTENANCE;
  const base = project.is_bidding
    ? rm
      ? '/rm-opportunities'
      : '/opportunities'
    : rm
      ? '/rm-projects'
      : '/projects';
  const qs = new URLSearchParams({ tab: 'documents' });
  if (docId) qs.set('doc', docId);
  if (options?.rename) qs.set('rename', '1');
  return `${base}/${project.id}?${qs.toString()}`;
}

export function userDocumentBuilderPath(
  userId: string,
  docId?: string,
  options?: Pick<DocumentOpenQueryOptions, 'rename'>,
): string {
  const qs = new URLSearchParams({ tab: 'document_builder' });
  if (docId) qs.set('doc', docId);
  if (options?.rename) qs.set('rename', '1');
  return `/users/${userId}?${qs.toString()}`;
}

export function standaloneDocumentEditorPath(
  docId: string,
  options?: Pick<DocumentOpenQueryOptions, 'rename'>,
): string {
  const base = `/documents/create/${docId}`;
  if (!options?.rename) return base;
  return `${base}?rename=1`;
}

export function buildDocumentCreatePayload(
  selection: DocumentCreationSelection,
  scope: DocumentCreateScope,
): {
  title?: string;
  project_id?: string;
  subject_user_id?: string;
  document_type_id?: string;
  pages?: { template_id: string | null; elements: never[] }[];
} {
  const payload: {
    title?: string;
    project_id?: string;
    subject_user_id?: string;
    document_type_id?: string;
    pages?: { template_id: string | null; elements: never[] }[];
  } = {};

  if (scope.kind === 'project') payload.project_id = scope.projectId;
  if (scope.kind === 'user') payload.subject_user_id = scope.userId;

  if (selection.kind === 'preset') {
    payload.document_type_id = selection.documentTypeId;
    if (selection.pages?.length) {
      payload.pages = selection.pages.map((p) => ({
        template_id: p.template_id,
        margins: p.margins,
        elements: p.elements ?? [],
      }));
    }
  } else if (selection.kind === 'background') {
    payload.pages = [{ template_id: selection.templateId, elements: [] }];
  } else {
    payload.pages = [{ template_id: null, elements: [] }];
  }
  return payload;
}
