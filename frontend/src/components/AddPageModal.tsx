import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import type { DocumentPage } from '@/types/documentCreator';
import OverlayPortal from '@/components/OverlayPortal';

export type DocumentTypePreset = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  page_templates: { template_id: string; label?: string }[];
  created_at?: string | null;
};

type BackgroundTemplate = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
};

const A4_ASPECT = 210 / 297;

type AddPageModalProps = {
  open: boolean;
  /** Backgrounds (DocumentTemplate) for "From background" tab */
  templates: BackgroundTemplate[];
  onClose: () => void;
  /** Add a single page with this background template id (or null for blank) */
  onAddPage: (templateId: string | null) => void;
  /** Add multiple pages (e.g. from a document type) */
  onAddPages: (pages: DocumentPage[]) => void;
};

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export function AddPageModal({
  open,
  templates,
  onClose,
  onAddPage,
  onAddPages,
}: AddPageModalProps) {
  const [tab, setTab] = useState<'template' | 'background'>('template');

  const { data: documentTypes = [], isLoading: loadingTypes } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
    enabled: open,
  });

  const byCategory = (() => {
    const map = new Map<string, DocumentTypePreset[]>();
    const uncategorized: DocumentTypePreset[] = [];
    for (const dt of documentTypes) {
      const cat = (dt.category || '').trim();
      if (!cat) {
        uncategorized.push(dt);
      } else {
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(dt);
      }
    }
    const categories = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { categories, uncategorized };
  })();

  const handleSelectDocumentType = async (docTypeId: string) => {
    try {
      const pages = await api<DocumentPage[]>('GET', `/document-creator/document-types/${docTypeId}/expand-pages`);
      if (pages && pages.length > 0) {
        onAddPages(pages);
        onClose();
      } else {
        onAddPage(null);
        onClose();
      }
    } catch {
      onAddPage(null);
      onClose();
    }
  };

  const handleSelectBackground = (templateId: string | null) => {
    onAddPage(templateId);
    onClose();
  };

  if (!open) return null;

  return (
    <OverlayPortal><div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add page(s)</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setTab('template')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'template'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <TemplateIcon className="w-4 h-4" />
            From template
          </button>
          <button
            type="button"
            onClick={() => setTab('background')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'background'
                ? 'border-brand-red text-brand-red'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            From background
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {tab === 'template' && (
            <>
              <p className="text-sm text-gray-500 mb-3">
                Add one or more pages from a document template (e.g. Commercial proposal). Templates are grouped by category.
              </p>
              {loadingTypes ? (
                <div className="text-sm text-gray-500 py-8 text-center">Loading templates…</div>
              ) : documentTypes.length === 0 ? (
                <div className="text-sm text-gray-500 py-8 text-center">
                  No document templates yet. Use &quot;From background&quot; to add a single page, or create templates in Document templates.
                </div>
              ) : (
                <div className="space-y-6">
                  {byCategory.categories.map(([categoryName, list]) => (
                    <div key={categoryName}>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {categoryName}
                      </h3>
                      <div className="space-y-1">
                        {list.map((dt) => (
                          <button
                            key={dt.id}
                            type="button"
                            onClick={() => handleSelectDocumentType(dt.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-brand-red hover:bg-brand-red/5 text-left transition-colors"
                          >
                            <span className="font-medium text-gray-900">{dt.name}</span>
                            <span className="text-xs text-gray-500">
                              {(dt.page_templates || []).length} page(s)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {byCategory.uncategorized.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other</h3>
                      <div className="space-y-1">
                        {byCategory.uncategorized.map((dt) => (
                          <button
                            key={dt.id}
                            type="button"
                            onClick={() => handleSelectDocumentType(dt.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-brand-red hover:bg-brand-red/5 text-left transition-colors"
                          >
                            <span className="font-medium text-gray-900">{dt.name}</span>
                            <span className="text-xs text-gray-500">
                              {(dt.page_templates || []).length} page(s)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === 'background' && (
            <>
              <p className="text-sm text-gray-500 mb-3">
                Add one page with a background image. Choose blank for an empty page.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectBackground(null)}
                  className="rounded-xl border-2 border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-center text-left"
                >
                  <div
                    className="w-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm"
                    style={{ aspectRatio: `${A4_ASPECT}` }}
                  >
                    Blank
                  </div>
                  <span className="w-full p-2 text-sm font-medium text-gray-900">Blank (A4)</span>
                </button>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectBackground(t.id)}
                    className="rounded-xl border-2 border-gray-200 hover:border-brand-red hover:bg-brand-red/5 transition-colors overflow-hidden flex flex-col items-center text-left"
                  >
                    <div
                      className="w-full bg-gray-100 relative"
                      style={{ aspectRatio: `${A4_ASPECT}` }}
                    >
                      {t.background_file_id ? (
                        <img
                          src={withFileAccessToken(`/files/${t.background_file_id}/thumbnail?w=200`)}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                          No image
                        </div>
                      )}
                    </div>
                    <span className="w-full p-2 text-sm font-medium text-gray-900 truncate" title={t.name}>
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div></OverlayPortal>
  );
}
