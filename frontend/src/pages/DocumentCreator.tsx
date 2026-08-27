import { useState, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import DocumentEditor from '@/components/DocumentEditor';
import {
  CreateDocumentWizardModal,
  type CreateDocumentWizardResult,
} from '@/components/CreateDocumentWizardModal';
import DocumentBuilderHubRow from '@/components/documents/DocumentBuilderHubRow';
import DocumentBuilderHubToolbar from '@/components/documents/DocumentBuilderHubToolbar';
import DocumentPreviewModal from '@/components/documents/DocumentPreviewModal';
import RenameDocumentModal from '@/components/RenameDocumentModal';
import {
  buildDocumentCreatePayload,
  documentsTabPathForProject,
  standaloneDocumentEditorPath,
  userDocumentBuilderPath,
  type ProjectRouteMeta,
} from '@/lib/documentCreateScope';
import {
  canEditDocumentBuilder,
  canViewDocumentBuilder,
} from '@/lib/documentHubPermissions';
import {
  documentEditorPath,
  filterDocuments,
  sortDocuments,
  type DocumentHubSortKey,
  type DocumentHubStatusFilter,
  type DocumentHubSummary,
} from '@/lib/documentHubListUtils';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  AppCard,
  AppEmptyState,
  AppListCreateItem,
  AppPageHeader,
  uiCx,
  uiSpacing,
} from '@/components/ui';

type Template = { id: string; name?: string; background_file_id?: string };

export default function DocumentCreator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [promptRenameOnOpen, setPromptRenameOnOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentHubStatusFilter>('all');
  const [sortKey, setSortKey] = useState<DocumentHubSortKey>('updated');
  const [previewDoc, setPreviewDoc] = useState<DocumentHubSummary | null>(null);
  const [renameDoc, setRenameDoc] = useState<DocumentHubSummary | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const renameFromUrl = searchParams.get('rename');
  useEffect(() => {
    if (!id || renameFromUrl !== '1') return;
    setPromptRenameOnOpen(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('rename');
        return next;
      },
      { replace: true },
    );
  }, [id, renameFromUrl, setSearchParams]);

  const { data: me, isFetched: meFetched } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });
  const isAdmin = isAdminRole(me?.roles);
  const permSet = useMemo(() => new Set((me?.permissions || []).map(String)), [me?.permissions]);
  const canView = canViewDocumentBuilder(isAdmin, permSet);
  const canEdit = canEditDocumentBuilder(isAdmin, permSet);

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['document-creator-documents'],
    queryFn: () => api<DocumentHubSummary[]>('GET', '/document-creator/documents'),
    enabled: meFetched && canView,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
    enabled: meFetched && canView && !id,
  });

  const visibleDocuments = useMemo(() => {
    const filtered = filterDocuments(documents, { search, status: statusFilter });
    return sortDocuments(filtered, sortKey);
  }, [documents, search, statusFilter, sortKey]);

  const prefetchDocument = useCallback(
    (docId: string) => {
      void queryClient.prefetchQuery({
        queryKey: ['document-creator-doc', docId],
        queryFn: () => api<DocumentHubSummary>('GET', `/document-creator/documents/${docId}`),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );

  const handleDeleteDocument = useCallback(
    async (doc: DocumentHubSummary) => {
      if (!canEdit || !(doc.can_edit ?? true)) return;
      const ok = await confirm({
        title: 'Delete document',
        message: `Delete "${doc.title || 'Untitled document'}"? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (ok !== 'confirm') return;
      try {
        await api('DELETE', `/document-creator/documents/${doc.id}`);
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        toast.success('Document deleted.');
        if (id === doc.id) navigate('/documents/create');
      } catch (e: any) {
        toast.error(e?.message || 'Failed to delete document.');
      }
    },
    [canEdit, confirm, queryClient, id, navigate],
  );

  const handleExportPdf = useCallback(async (doc: DocumentHubSummary) => {
    setExportingId(doc.id);
    try {
      const token = getToken();
      const r = await fetch(`/document-creator/documents/${doc.id}/export-pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(r.statusText || 'Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export PDF.');
    } finally {
      setExportingId(null);
    }
  }, []);

  const handleRenameSave = useCallback(
    async (title: string) => {
      if (!renameDoc) return;
      setRenameSaving(true);
      setRenameError(null);
      try {
        await api('PATCH', `/document-creator/documents/${renameDoc.id}`, {
          title,
          expected_updated_at: renameDoc.updated_at ?? renameDoc.created_at ?? null,
        });
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        queryClient.invalidateQueries({ queryKey: ['document-creator-doc', renameDoc.id] });
        toast.success('Document renamed.');
        setRenameDoc(null);
      } catch (e: any) {
        const msg = e?.message || 'Failed to rename document.';
        setRenameError(msg);
        toast.error(msg);
      } finally {
        setRenameSaving(false);
      }
    },
    [renameDoc, queryClient],
  );

  const handleEditDocument = useCallback(
    (doc: DocumentHubSummary) => {
      prefetchDocument(doc.id);
      navigate(documentEditorPath(doc));
    },
    [navigate, prefetchDocument],
  );

  const handleCreateNewDocument = useCallback(
    async (result: CreateDocumentWizardResult) => {
      if (!canEdit) return;
      setIsSaving(true);
      try {
        const payload = buildDocumentCreatePayload(result.selection, result.scope);
        const created = await api<DocumentHubSummary>('POST', '/document-creator/documents', payload);
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        setShowWizard(false);

        if (result.scope.kind === 'project') {
          queryClient.invalidateQueries({
            queryKey: ['document-creator-documents', result.scope.projectId],
          });
          const project = await api<ProjectRouteMeta>('GET', `/projects/${result.scope.projectId}`);
          navigate(documentsTabPathForProject(project, created.id, { rename: true }));
          return;
        }
        if (result.scope.kind === 'user') {
          queryClient.invalidateQueries({
            queryKey: ['document-creator-documents', 'subject', result.scope.userId],
          });
          navigate(userDocumentBuilderPath(result.scope.userId, created.id, { rename: true }));
          return;
        }
        navigate(standaloneDocumentEditorPath(created.id, { rename: true }));
      } catch (e: any) {
        toast.error(e?.message || 'Failed to create document.');
      } finally {
        setIsSaving(false);
      }
    },
    [canEdit, navigate, queryClient],
  );

  if (!meFetched) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader title="Document Builder" icon={<FileText className="h-4 w-4" />} />
        <AppCard>
          <AppEmptyState title="Loading…" description="Checking your permissions." />
        </AppCard>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader title="Document Builder" icon={<FileText className="h-4 w-4" />} />
        <AppCard>
          <AppEmptyState
            title="No access"
            description="You do not have permission to view the Document Builder."
          />
        </AppCard>
      </div>
    );
  }

  if (!id) {
    const docCountLabel =
      documents.length === 1 ? '1 document' : `${documents.length} documents`;

    const createListItem = canEdit ? (
      <AppListCreateItem
        layout="row"
        label={isSaving ? 'Creating…' : 'Create new document'}
        disabled={isSaving}
        onClick={() => setShowWizard(true)}
      />
    ) : null;

    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Document Builder"
          subtitle={`Create, edit and manage your documents · ${docCountLabel}`}
          icon={<FileText className="h-4 w-4" />}
        />

        <div className="min-w-0">
          {documentsLoading ? (
            <AppEmptyState title="Loading documents…" />
          ) : documents.length === 0 && !canEdit ? (
            <AppEmptyState
              title="No documents yet."
              description="No documents to view yet."
            />
          ) : (
            <>
              {documents.length > 0 ? (
                <DocumentBuilderHubToolbar
                  search={search}
                  onSearchChange={setSearch}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                  sortKey={sortKey}
                  onSortKeyChange={setSortKey}
                />
              ) : null}
              <ul className={uiCx(uiSpacing.sectionStack, documents.length > 0 ? 'mt-4' : undefined)}>
                {createListItem ? <li className="list-none">{createListItem}</li> : null}
                {visibleDocuments.map((doc) => (
                  <DocumentBuilderHubRow
                    key={doc.id}
                    doc={doc}
                    templates={templates}
                    canEditHub={canEdit}
                    exporting={exportingId === doc.id}
                    onPrefetch={prefetchDocument}
                    onPreview={setPreviewDoc}
                    onEdit={handleEditDocument}
                    onRename={setRenameDoc}
                    onExport={handleExportPdf}
                    onDelete={handleDeleteDocument}
                  />
                ))}
              </ul>
              {documents.length > 0 && visibleDocuments.length === 0 ? (
                <AppEmptyState
                  className="mt-4"
                  title="No matching documents"
                  description="Try a different search or status filter."
                />
              ) : null}
            </>
          )}
        </div>

        <DocumentPreviewModal
          open={!!previewDoc}
          documentId={previewDoc?.id ?? null}
          documentTitle={previewDoc?.title}
          onClose={() => setPreviewDoc(null)}
        />

        <RenameDocumentModal
          open={!!renameDoc}
          initialTitle={renameDoc?.title || 'Untitled document'}
          saving={renameSaving}
          error={renameError}
          onSave={handleRenameSave}
          onCancel={() => {
            setRenameDoc(null);
            setRenameError(null);
          }}
        />

        {canEdit ? (
          <CreateDocumentWizardModal
            open={showWizard}
            onClose={() => setShowWizard(false)}
            onComplete={(result) => {
              void handleCreateNewDocument(result);
            }}
            creating={isSaving}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DocumentEditor
        documentId={id}
        readOnly={!canEdit}
        enableSendForSignature={canEdit}
        promptRenameOnOpen={promptRenameOnOpen}
      />
    </div>
  );
}
