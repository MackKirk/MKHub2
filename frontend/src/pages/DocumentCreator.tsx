import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
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

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function DocumentCreator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'creator' | 'templates' | 'types'>('creator');
  const [showChooseTypeModal, setShowChooseTypeModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<{ id: string; name: string }[]>('GET', '/document-creator/templates'),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['document-creator-documents'],
    queryFn: () => api<UserDocument[]>('GET', '/document-creator/documents'),
  });

  const handleDeleteDocument = useCallback(
    async (docId: string, docTitle: string) => {
      const ok = await confirm({
        title: 'Delete document',
        message: `Delete "${docTitle || 'Untitled document'}"? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (ok !== 'confirm') return;
      setDeletingId(docId);
      try {
        await api('DELETE', `/document-creator/documents/${docId}`);
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
        toast.success('Document deleted.');
        if (id === docId) navigate('/documents/create');
      } catch (e: any) {
        toast.error(e?.message || 'Failed to delete document.');
      } finally {
        setDeletingId(null);
      }
    },
    [confirm, queryClient, id, navigate]
  );

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
      <div className="space-y-4">
        {/* Header card - same style as Users */}
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center">
                <DocumentIcon className="w-5 h-5 text-brand-red" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-gray-900">Documents</h5>
                <p className="text-xs text-gray-600 mt-0.5">
                  Create and edit documents{documents.length > 0 ? ` (${documents.length} total)` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowChooseTypeModal(true)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-brand-red text-white font-medium transition-colors hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-sm leading-none">+</span>
                Create new document
              </button>
            </div>
          </div>
        </div>

        {/* Tabs - same style as Users / ProjectDetail */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('creator')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${activeTab === 'creator' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'}`}
          >
            Documents
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${activeTab === 'templates' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'}`}
          >
            Background templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('types')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium ${activeTab === 'types' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'}`}
          >
            Document templates
          </button>
        </div>

        {activeTab === 'templates' ? (
          <DocumentTemplatesTab />
        ) : activeTab === 'types' ? (
          <DocumentTypesTab />
        ) : (
          <>
            {/* Documents list - same structure as Projects list */}
            <div className="rounded-xl border bg-white overflow-hidden">
              {documents.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-gray-500 mb-4">No documents yet.</p>
                  <button
                    type="button"
                    onClick={() => setShowChooseTypeModal(true)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-brand-red text-white font-medium hover:bg-[#aa1212] disabled:opacity-50"
                  >
                    + Create new document
                  </button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <div
                    className="grid grid-cols-[1fr_8rem_6rem] gap-2 sm:gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-700"
                    aria-hidden
                  >
                    <div>Document</div>
                    <div>Updated</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {documents.map((d) => (
                    <div
                      key={d.id}
                      onClick={() => navigate(`/documents/create/${d.id}`)}
                      className="group grid grid-cols-[1fr_8rem_6rem] gap-2 sm:gap-4 items-center px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <DocumentIcon className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-red transition-colors">
                            {d.title || 'Untitled document'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 truncate">
                        {formatDate(d.updated_at)}
                      </div>
                      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/documents/create/${d.id}`);
                          }}
                          className="p-2 rounded text-gray-500 hover:text-brand-red hover:bg-brand-red/10 border border-transparent hover:border-brand-red/20 transition-colors"
                          title="Edit"
                          aria-label="Edit"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(d.id, d.title);
                          }}
                          disabled={deletingId === d.id}
                          className="p-2 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors disabled:opacity-50"
                          title="Delete"
                          aria-label="Delete"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
