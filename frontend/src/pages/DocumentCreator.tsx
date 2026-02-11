import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import DocumentTemplatesTab from '@/components/DocumentTemplatesTab';
import DocumentTypesTab from '@/components/DocumentTypesTab';
import DocumentEditor from '@/components/DocumentEditor';
import { ChooseDocumentTypeModal } from '@/components/ChooseDocumentTypeModal';
type UserDocument = {
  id: string;
  title: string;
  document_type_id?: string;
  pages?: unknown[];
  created_at?: string;
  updated_at?: string | null;
};

function formatDate(s: string | undefined): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { dateStyle: 'short' });
  } catch {
    return '—';
  }
}

export default function DocumentCreator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'creator' | 'templates' | 'types'>('creator');
  const [showChooseTypeModal, setShowChooseTypeModal] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<{ id: string; name: string }[]>('GET', '/document-creator/templates'),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['document-creator-documents'],
    queryFn: () => api<UserDocument[]>('GET', '/document-creator/documents'),
  });

  const handleCreateNewDocument = useCallback(
    async (documentTypeId: string | null) => {
      setIsSaving(true);
      try {
        const payload: {
          title: string;
          document_type_id?: string;
          pages?: { template_id: null; elements: never[] }[];
        } = {
          title: 'Untitled document',
        };
        if (documentTypeId) {
          payload.document_type_id = documentTypeId;
        } else {
          payload.pages = [{ template_id: null, elements: [] }];
        }
        const created = await api<UserDocument>('POST', '/document-creator/documents', payload);
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        navigate(`/documents/create/${created.id}`);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to create document.');
      } finally {
        setIsSaving(false);
      }
    },
    [navigate, queryClient]
  );

  if (!id) {
    return (
      <div className="flex flex-col h-full min-h-[calc(100vh-6rem)] max-w-full">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('creator')}
              className={`px-3 py-1.5 rounded-full text-sm ${activeTab === 'creator' ? 'bg-black text-white' : 'bg-white border'}`}
            >
              Documents
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-3 py-1.5 rounded-full text-sm ${activeTab === 'templates' ? 'bg-black text-white' : 'bg-white border'}`}
            >
              Background templates
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('types')}
              className={`px-3 py-1.5 rounded-full text-sm ${activeTab === 'types' ? 'bg-black text-white' : 'bg-white border'}`}
            >
              Document types
            </button>
          </div>
        </div>
        {activeTab === 'templates' ? (
          <DocumentTemplatesTab />
        ) : activeTab === 'types' ? (
          <DocumentTypesTab />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-sm text-gray-600">Create and edit documents. Click a document to open it.</p>
              <button
                type="button"
                onClick={() => setShowChooseTypeModal(true)}
                disabled={isSaving}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
              >
                Create new document
              </button>
            </div>
            {documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
                <p className="text-gray-600 mb-4">No documents yet.</p>
                <button
                  type="button"
                  onClick={() => setShowChooseTypeModal(true)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
                >
                  Create new document
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate(`/documents/create/${d.id}`)}
                    className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-brand-red/50 hover:shadow-md transition-all"
                  >
                    <h3 className="font-medium text-gray-900 truncate">{d.title || 'Untitled document'}</h3>
                    <p className="text-xs text-gray-500 mt-1">Updated {formatDate(d.updated_at)}</p>
                  </button>
                ))}
              </div>
            )}
            <ChooseDocumentTypeModal
              open={showChooseTypeModal}
              onClose={() => setShowChooseTypeModal(false)}
              onSelect={(documentTypeId) => {
                setShowChooseTypeModal(false);
                handleCreateNewDocument(documentTypeId);
              }}
            />
          </>
        )}
      </div>
    );
  }

  return <DocumentEditor documentId={id} />;
}
