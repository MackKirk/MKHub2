import type { DocumentPage } from '@/types/documentCreator';
import {
  documentsTabPathForProject,
  standaloneDocumentEditorPath,
  userDocumentBuilderPath,
  type ProjectRouteMeta,
} from '@/lib/documentCreateScope';

export type DocumentScope = 'standalone' | 'project' | 'user';

export type SignatureStatus = 'draft' | 'ready' | 'in_progress' | 'signed';

export type DocumentHubSummary = {
  id: string;
  title: string;
  document_type_id?: string | null;
  project_id?: string | null;
  subject_user_id?: string | null;
  page_count?: number;
  pages?: DocumentPage[] | unknown[];
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scope?: DocumentScope;
  scope_label?: string | null;
  project_meta?: ProjectRouteMeta | null;
  signature_status?: SignatureStatus;
  signature_label?: string;
  signature_signed_count?: number | null;
  signature_total_count?: number | null;
  can_edit?: boolean;
};

export type DocumentHubStatusFilter = 'all' | SignatureStatus;

export type DocumentHubSortKey = 'updated' | 'title' | 'status';

const STATUS_SORT_ORDER: Record<SignatureStatus, number> = {
  draft: 0,
  ready: 1,
  in_progress: 2,
  signed: 3,
};

function pageCount(doc: DocumentHubSummary): number {
  if (typeof doc.page_count === 'number') return doc.page_count;
  return Array.isArray(doc.pages) ? doc.pages.length : 0;
}

function pagesLabel(count: number): string {
  return count === 1 ? '1 page' : `${count} pages`;
}

export function scopeMetaLabel(doc: DocumentHubSummary): string {
  const count = pageCount(doc);
  const pages = pagesLabel(count);
  const scope = doc.scope ?? 'standalone';
  if (scope === 'project') {
    const name = (doc.scope_label || '').trim();
    return name ? `Project · ${name} · ${pages}` : `Project · ${pages}`;
  }
  if (scope === 'user') {
    const name = (doc.scope_label || '').trim();
    return name ? `Employee · ${name} · ${pages}` : `Employee · ${pages}`;
  }
  return `Standalone · ${pages}`;
}

export function formatRelativeUpdated(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (startOfTarget.getTime() === startOfToday.getTime()) return 'today';
    if (startOfTarget.getTime() === startOfYesterday.getTime()) return 'yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

export function updatedByLine(doc: DocumentHubSummary): string {
  const when = formatRelativeUpdated(doc.updated_at ?? doc.created_at);
  const name = (doc.created_by_name || '').trim();
  if (when === '—') return '—';
  if (name) return `Updated ${when} · ${name}`;
  return `Updated ${when}`;
}

export function signatureBadgeVariant(
  status: SignatureStatus | undefined,
): 'neutral' | 'info' | 'warning' | 'success' {
  switch (status) {
    case 'signed':
      return 'success';
    case 'in_progress':
      return 'warning';
    case 'ready':
      return 'info';
    default:
      return 'neutral';
  }
}

export function filterDocuments(
  docs: DocumentHubSummary[],
  opts: { search?: string; status?: DocumentHubStatusFilter },
): DocumentHubSummary[] {
  const q = (opts.search || '').trim().toLowerCase();
  const status = opts.status ?? 'all';
  return docs.filter((doc) => {
    if (status !== 'all' && doc.signature_status !== status) return false;
    if (!q) return true;
    const title = (doc.title || '').toLowerCase();
    const scope = scopeMetaLabel(doc).toLowerCase();
    return title.includes(q) || scope.includes(q);
  });
}

export function sortDocuments(docs: DocumentHubSummary[], sortKey: DocumentHubSortKey): DocumentHubSummary[] {
  const copy = [...docs];
  if (sortKey === 'title') {
    copy.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
    return copy;
  }
  if (sortKey === 'status') {
    copy.sort((a, b) => {
      const sa = STATUS_SORT_ORDER[a.signature_status ?? 'draft'];
      const sb = STATUS_SORT_ORDER[b.signature_status ?? 'draft'];
      if (sa !== sb) return sa - sb;
      return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
    });
    return copy;
  }
  copy.sort((a, b) =>
    (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''),
  );
  return copy;
}

export function documentEditorPath(doc: DocumentHubSummary): string {
  if (doc.scope === 'project' && doc.project_meta?.id) {
    return documentsTabPathForProject(doc.project_meta, doc.id);
  }
  if (doc.scope === 'user' && doc.subject_user_id) {
    return userDocumentBuilderPath(doc.subject_user_id, doc.id);
  }
  return standaloneDocumentEditorPath(doc.id);
}