import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import type { DocumentTypePreset } from '@/components/ChooseDocumentTypeModal';
import type { DocElement, PageMargins } from '@/types/documentCreator';
import { DocumentTypePageLayoutModal } from '@/components/DocumentTypePageLayoutModal';

const A4_ASPECT = 210 / 297;

type Template = { id: string; name: string; background_file_id?: string };

type PageTemplateRow = {
  template_id: string;
  label: string;
  margins?: PageMargins | null;
  elements?: DocElement[];
};

function GrabberIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-5 h-5'} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function PageThumbnailSmall({
  backgroundUrl,
  elements,
}: {
  backgroundUrl: string | null;
  elements: DocElement[];
}) {
  return (
    <div
      className="relative flex-shrink-0 rounded border border-gray-200 overflow-hidden bg-gray-100"
      style={{ width: 52, aspectRatio: `${A4_ASPECT}` }}
    >
      <div className="absolute inset-0 w-full h-full">
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 pointer-events-none" />
        )}
        {(elements ?? []).map((el: DocElement) => {
          const x = (el.x_pct ?? 10) / 100;
          const y = (el.y_pct ?? 20) / 100;
          const w = (el.width_pct ?? 80) / 100;
          const h = (el.height_pct ?? 8) / 100;
          return (
            <div
              key={el.id}
              className="absolute pointer-events-none"
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
              }}
            >
              {el.type === 'text' ? (
                <div className="w-full h-full bg-blue-400/30 border border-blue-500/40 rounded-sm" />
              ) : el.type === 'block' ? (
                <div
                  className="w-full h-full rounded-sm bg-amber-500/20 border border-amber-600/40"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(245,158,11,0.15) 2px, rgba(245,158,11,0.15) 4px)',
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gray-400/40 border border-gray-500/50 rounded-sm" />
              )}
            </div>
          );
        })}
      </div>
    </div>
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

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2m-4-2v-2m0-4v-2m0-4V6a2 2 0 012-2h2" />
    </svg>
  );
}

/** Golden template icon (document with layers / preset) */
function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

export default function DocumentTypesTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [pages, setPages] = useState<PageTemplateRow[]>([{ template_id: '', label: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutModalPageIndex, setLayoutModalPageIndex] = useState<number | null>(null);
  const [draggingPageIdx, setDraggingPageIdx] = useState<number | null>(null);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);
  const [dragInsertPosition, setDragInsertPosition] = useState<'above' | 'below' | null>(null);

  const { data: documentTypes = [] } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
  });
  const editing = editingId ? documentTypes.find((dt) => dt.id === editingId) : null;

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setDescription(editing.description || '');
      setCategory(editing.category || '');
      const pt = editing.page_templates || [];
      setPages(
        pt.length > 0
          ? pt.map((p: { template_id?: string; label?: string; margins?: PageMargins; elements?: DocElement[] }) => ({
              template_id: p.template_id || '',
              label: p.label || '',
              margins: p.margins,
              elements: Array.isArray(p.elements) ? p.elements : [],
            }))
          : [{ template_id: '', label: '' }]
      );
    } else if (!showForm) {
      setName('');
      setDescription('');
      setCategory('');
      setPages([{ template_id: '', label: '' }]);
    }
  }, [editing, showForm]);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const layoutPage = layoutModalPageIndex !== null ? pages[layoutModalPageIndex] : null;

  const addPage = () => {
    setPages((prev) => [...prev, { template_id: '', label: '' }]);
  };

  const removePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
    if (draggingPageIdx === index) setDraggingPageIdx(null);
    if (dragOverPageIdx === index) setDragOverPageIdx(null);
  };

  const handlePageDragStart = (idx: number, e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('[data-grabber]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    setDraggingPageIdx(idx);
  };

  const handlePageDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingPageIdx === null || draggingPageIdx === idx) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setDragOverPageIdx(idx);
    setDragInsertPosition(e.clientY < mid ? 'above' : 'below');
  };

  const handlePageDragLeave = () => {
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
  };

  const handlePageDrop = (idx: number) => {
    if (draggingPageIdx === null) return;
    const fromIdx = draggingPageIdx;
    setDraggingPageIdx(null);
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
    if (fromIdx === idx) return;
    setPages((prev) => {
      const v = [...prev];
      const [moved] = v.splice(fromIdx, 1);
      const toIdx = dragInsertPosition === 'above' ? idx : idx + 1;
      const insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
      v.splice(insertAt, 0, moved);
      return v;
    });
  };

  const handlePageDragEnd = () => {
    setDraggingPageIdx(null);
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
  };

  const updatePage = (index: number, field: 'template_id' | 'label', value: string) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const savePageLayout = (
    index: number,
    margins: PageMargins,
    elements: DocElement[],
    templateId?: string | null
  ) => {
    setPages((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        margins,
        elements,
        ...(templateId !== undefined ? { template_id: templateId ?? '' } : {}),
      };
      return next;
    });
    setLayoutModalPageIndex(null);
  };

  const duplicatePageLayout = (margins: PageMargins, elements: DocElement[]) => {
    const tid = layoutPage?.template_id ?? '';
    const newElements = elements.map((el) => ({
      ...el,
      id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    }));
    setPages((prev) => [...prev, { template_id: tid, label: '', margins, elements: newElements }]);
    setLayoutModalPageIndex(pages.length);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Enter a name for the document template.');
      return;
    }
    const page_templates = pages
      .map((p) => {
        const tid = p.template_id?.trim();
        if (!tid) return null;
        return {
          template_id: tid,
          label: p.label?.trim() || undefined,
          margins: p.margins ?? undefined,
          elements: p.elements ?? [],
        };
      })
      .filter(Boolean) as { template_id: string; label?: string; margins?: PageMargins; elements?: DocElement[] }[];
    if (page_templates.length === 0) {
      toast.error('Add at least one page (select a background template for the first page).');
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await api('PATCH', `/document-creator/document-types/${editingId}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          page_templates,
        });
        toast.success('Document template updated.');
      } else {
        await api('POST', '/document-creator/document-types', {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          page_templates,
        });
        toast.success('Document template created.');
      }
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
      setShowForm(false);
      setEditingId(null);
      setName('');
      setDescription('');
      setCategory('');
      setPages([{ template_id: '', label: '' }]);
    } catch (err: any) {
      toast.error(err?.message || (editingId ? 'Failed to update.' : 'Failed to create document template.'));
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setCategory('');
    setPages([{ template_id: '', label: '' }]);
    setShowForm(true);
  };

  const openEdit = (dt: DocumentTypePreset) => {
    setEditingId(dt.id);
    setShowForm(true);
  };

  const handleDuplicate = async (dt: DocumentTypePreset, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const created = await api<DocumentTypePreset>('POST', `/document-creator/document-types/${dt.id}/duplicate`);
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
      toast.success(`Template duplicated as "${created.name}".`);
      openEdit(created);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to duplicate template.');
    }
  };

  const handleDelete = async (dt: DocumentTypePreset) => {
    const ok = await confirm({
      title: 'Delete document template',
      message: `Delete "${dt.name}"? Documents already created with this template will keep their pages.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    try {
      await api('DELETE', `/document-creator/document-types/${dt.id}`);
      toast.success('Document template deleted.');
      queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete template.');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Document templates are preset layouts: an ordered list of background templates (e.g. cover, back cover, content
        page). When creating a document, users can choose a template to start with that sequence of pages.
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
        >
          Create document template
        </button>
      </div>
      {documentTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No document templates yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Create a preset (e.g. Cover + Back cover + Content) so users can pick it when creating a document.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
          >
            Create document template
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex flex-col">
            <div
              className="grid grid-cols-[1fr_8rem_8rem] gap-2 sm:gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-700"
              aria-hidden
            >
              <div>Template</div>
              <div>Pages</div>
              <div className="text-right">Actions</div>
            </div>
            {documentTypes.map((dt) => (
              <div
                key={dt.id}
                onClick={() => openEdit(dt)}
                className="group grid grid-cols-[1fr_8rem_8rem] gap-2 sm:gap-4 items-center px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <TemplateIcon className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-red transition-colors">
                        {dt.name}
                      </span>
                      {dt.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {dt.category}
                        </span>
                      )}
                    </div>
                    {dt.description && (
                      <div className="text-xs text-gray-500 truncate mt-0.5">{dt.description}</div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  {(dt.page_templates || []).length} page(s)
                </div>
                <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(dt);
                    }}
                    className="p-2 rounded text-gray-500 hover:text-brand-red hover:bg-brand-red/10 border border-transparent hover:border-brand-red/20 transition-colors"
                    title="Edit"
                    aria-label="Edit"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDuplicate(dt, e)}
                    className="p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent transition-colors"
                    title="Duplicate template"
                    aria-label="Duplicate"
                  >
                    <DuplicateIcon />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(dt);
                    }}
                    className="p-2 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                    title="Delete"
                    aria-label="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit document template' : 'New document template'}
              </h3>
            </div>
            <form id="document-type-form" onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="e.g. Proposal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="e.g. Commercial proposal, Contract"
                />
                <p className="text-xs text-gray-500 mt-0.5">
                  Used to group templates when adding pages to a document (e.g. Commercial proposal).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
                  placeholder="e.g. Cover + back cover + content page"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Pages</label>
                  <button
                    type="button"
                    onClick={addPage}
                    className="text-sm text-brand-red hover:underline font-medium"
                  >
                    + Add page
                  </button>
                </div>
                <div className="space-y-0 divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden bg-white">
                  {pages.map((p, idx) => {
                    const template = templates.find((t) => t.id === p.template_id);
                    const backgroundUrl = template?.background_file_id
                      ? `/files/${template.background_file_id}/thumbnail?w=120`
                      : null;
                    return (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => handlePageDragStart(idx, e)}
                        onDragOver={(e) => handlePageDragOver(idx, e)}
                        onDragLeave={handlePageDragLeave}
                        onDrop={() => handlePageDrop(idx)}
                        onDragEnd={handlePageDragEnd}
                        className={`relative flex gap-3 items-center p-3 transition-all ${
                          draggingPageIdx === idx ? 'opacity-50 bg-gray-50' : 'bg-white hover:bg-gray-50/50'
                        } ${dragOverPageIdx === idx && draggingPageIdx !== idx ? 'ring-1 ring-brand-red/30 ring-inset' : ''}`}
                      >
                        {dragOverPageIdx === idx && draggingPageIdx !== idx && (
                          <>
                            {dragInsertPosition === 'above' && (
                              <div className="absolute left-0 right-0 top-0 h-0.5 bg-brand-red z-10" />
                            )}
                            {dragInsertPosition === 'below' && (
                              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-brand-red z-10" />
                            )}
                          </>
                        )}
                        <div
                          data-grabber
                          className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing touch-none"
                          title="Drag to reorder"
                        >
                          <GrabberIcon />
                        </div>
                        <PageThumbnailSmall
                          backgroundUrl={backgroundUrl}
                          elements={p.elements ?? []}
                        />
                        <input
                          type="text"
                          value={p.label}
                          onChange={(e) => updatePage(idx, 'label', e.target.value)}
                          placeholder={template?.name || 'Page name'}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded border border-gray-200 text-sm focus:ring-2 focus:ring-brand-red/20 focus:border-brand-red"
                        />
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setLayoutModalPageIndex(idx)}
                            className="p-2 rounded text-gray-500 hover:text-brand-red hover:bg-brand-red/10 border border-transparent hover:border-brand-red/20 transition-colors"
                            title="Edit layout"
                            aria-label="Edit layout"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePage(idx)}
                            className="p-2 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                            title="Remove page"
                            aria-label="Remove page"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="document-type-form"
                disabled={isSaving}
                className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : editingId ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {layoutModalPageIndex !== null && layoutPage && (
        <DocumentTypePageLayoutModal
          open={true}
          pageIndex={layoutModalPageIndex}
          templateId={layoutPage.template_id || null}
          templates={templates}
          initialMargins={layoutPage.margins}
          initialElements={layoutPage.elements}
          onClose={() => setLayoutModalPageIndex(null)}
          onSave={(margins, elements, templateId) => savePageLayout(layoutModalPageIndex, margins, elements, templateId)}
          onDuplicatePage={duplicatePageLayout}
        />
      )}
    </div>
  );
}
