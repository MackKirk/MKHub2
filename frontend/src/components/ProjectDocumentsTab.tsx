import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { DocumentCreatorModal } from '@/components/DocumentCreatorModal';
import { ChooseDocumentTypeModal } from '@/components/ChooseDocumentTypeModal';
import { DocumentPagePreviewThumbnails } from '@/components/DocumentPagePreviewThumbnails';
import type { DocumentPage } from '@/types/documentCreator';

type Template = { id: string; name?: string; background_file_id?: string };

type UserDocument = {
  id: string;
  title: string;
  project_id?: string | null;
  pages?: DocumentPage[] | unknown[];
  created_at?: string;
  updated_at?: string | null;
};

function formatDate(s: string | undefined | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

type ProjectDocumentsTabProps = {
  projectId: string;
  isBidding?: boolean;
  /** If false, user can only view documents (no Create/Delete; Edit button becomes View and opens in read-only). Default true. */
  canEditDocuments?: boolean;
};

export default function ProjectDocumentsTab({ projectId, isBidding, canEditDocuments = true }: ProjectDocumentsTabProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [isCreating, setIsCreating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalDocumentId, setModalDocumentId] = useState<string | null>(null);
  const [showChooseTypeModal, setShowChooseTypeModal] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['document-creator-documents', projectId],
    queryFn: () =>
      api<UserDocument[]>('GET', `/document-creator/documents?project_id=${encodeURIComponent(projectId)}`),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const handleCreateNew = async (documentTypeId: string | null) => {
    setIsCreating(true);
    try {
      const payload: {
        title: string;
        project_id: string;
        document_type_id?: string;
        pages?: { template_id: null; elements: never[] }[];
      } = { title: 'Untitled document', project_id: projectId };
      if (documentTypeId) {
        payload.document_type_id = documentTypeId;
      } else {
        payload.pages = [{ template_id: null, elements: [] }];
      }
      const created = await api<UserDocument>('POST', '/document-creator/documents', payload);
      queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      setModalDocumentId(created.id);
      setShowModal(true);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create document.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportPdf = async (doc: UserDocument) => {
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
  };

  const handleEdit = (doc: UserDocument) => {
    setModalDocumentId(doc.id);
    setShowModal(true);
  };

  const handleDelete = async (doc: UserDocument) => {
    const ok = await confirm({
      title: 'Delete document',
      message: `Delete "${doc.title || 'Untitled document'}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/document-creator/documents/${doc.id}`);
      queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      toast.success('Document deleted.');
      if (modalDocumentId === doc.id) {
        setShowModal(false);
        setModalDocumentId(null);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete document.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalDocumentId(null);
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isBidding ? 'Opportunity' : 'Project'} documents
        </h2>
        {canEditDocuments && (
          <button
            type="button"
            onClick={() => setShowChooseTypeModal(true)}
            disabled={isCreating}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
          >
            Create new document
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Create and edit documents linked to this {isBidding ? 'opportunity' : 'project'}. Edit in the document creator; changes auto-save.
      </p>
      {isLoading ? (
        <div className="text-sm text-gray-500 py-6">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No documents yet.</p>
          {canEditDocuments && (
            <button
              type="button"
              onClick={() => setShowChooseTypeModal(true)}
              disabled={isCreating}
              className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
            >
              Create new document
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300"
            >
              <button
                type="button"
                onClick={() => handleEdit(doc)}
                className="flex items-center gap-3 min-w-0 flex-1 text-left rounded focus:outline-none focus:ring-2 focus:ring-brand-red/40 focus:ring-offset-1"
              >
                <DocumentPagePreviewThumbnails
                  pages={Array.isArray(doc.pages) ? doc.pages : []}
                  templates={templates}
                  maxPages={4}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">{doc.title || 'Untitled document'}</div>
                  <div className="text-xs text-gray-500">Updated {formatDate(doc.updated_at ?? doc.created_at)}</div>
                </div>
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(doc)}
                  className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
                >
                  {canEditDocuments ? 'Edit' : 'View'}
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPdf(doc)}
                  disabled={exportingId === doc.id}
                  className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
                >
                  {exportingId === doc.id ? 'Exporting...' : 'Export PDF'}
                </button>
                {canEditDocuments && (
                  <button
                    type="button"
                    onClick={() => handleDelete(doc)}
                    className="px-3 py-1.5 rounded text-red-600 hover:bg-red-50 text-sm"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ChooseDocumentTypeModal
        open={showChooseTypeModal}
        onClose={() => setShowChooseTypeModal(false)}
        onSelect={(documentTypeId) => {
          setShowChooseTypeModal(false);
          handleCreateNew(documentTypeId);
        }}
      />
      <DocumentCreatorModal
        open={showModal}
        documentId={modalDocumentId}
        projectId={projectId}
        onClose={handleCloseModal}
        onAfterClose={() => {
          queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
          queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
        }}
        readOnly={!canEditDocuments}
      />
    </div>
  );
}
