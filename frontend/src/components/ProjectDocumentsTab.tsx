import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { DocumentCreatorModal } from '@/components/DocumentCreatorModal';
import { ChooseDocumentTypeModal } from '@/components/ChooseDocumentTypeModal';

type UserDocument = {
  id: string;
  title: string;
  project_id?: string | null;
  pages?: unknown[];
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
};

export default function ProjectDocumentsTab({ projectId, isBidding }: ProjectDocumentsTabProps) {
  const queryClient = useQueryClient();
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
        <button
          type="button"
          onClick={() => setShowChooseTypeModal(true)}
          disabled={isCreating}
          className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
        >
          Create new document
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Create and edit documents linked to this {isBidding ? 'opportunity' : 'project'}. Edit in the document creator; changes auto-save.
      </p>
      {isLoading ? (
        <div className="text-sm text-gray-500 py-6">Loading...</div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No documents yet.</p>
          <button
            type="button"
            onClick={() => setShowChooseTypeModal(true)}
            disabled={isCreating}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
          >
            Create new document
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{doc.title || 'Untitled document'}</div>
                <div className="text-xs text-gray-500">Updated {formatDate(doc.updated_at ?? doc.created_at)}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleEdit(doc)}
                  className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleExportPdf(doc)}
                  disabled={exportingId === doc.id}
                  className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700 disabled:opacity-50"
                >
                  {exportingId === doc.id ? 'Exporting...' : 'Export PDF'}
                </button>
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
        onAfterClose={() => queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] })}
      />
    </div>
  );
}
