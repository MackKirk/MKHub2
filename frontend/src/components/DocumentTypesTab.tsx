import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import type { DocumentTypePreset } from '@/components/DocumentTypePicker';
import type { DocElement, PageMargins } from '@/types/documentCreator';
import { docElementRotationDeg, docElementRotateStyle } from '@/utils/documentElementGeometry';
import { DocumentTypePageLayoutModal } from '@/components/DocumentTypePageLayoutModal';
import DocumentAutoFillTokenPicker from '@/components/document-editor/DocumentAutoFillTokenPicker';
import { useDocumentAutoFillTokens } from '@/hooks/useDocumentAutoFillTokens';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const A4_ASPECT = 210 / 297;

type Template = { id: string; name: string; background_file_id?: string };
type SettingsListItem = { id: string; label: string; sort_index?: number };

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
                ...docElementRotateStyle(docElementRotationDeg(el.rotation)),
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
              ) : el.type === 'initials' ? (
                <div className="w-full h-full bg-sky-400/40 border border-sky-500/50 rounded-sm" />
              ) : el.type === 'date' ? (
                <div className="w-full h-full bg-violet-400/40 border border-violet-500/50 rounded-sm" />
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

export default function DocumentTypesTab({ readOnly = false }: { readOnly?: boolean }) {
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
  const [tokensPopoverOpen, setTokensPopoverOpen] = useState(false);
  const tokensButtonRef = useRef<HTMLButtonElement>(null);
  const tokensPopoverRef = useRef<HTMLDivElement>(null);
  const { data: tokenValues } = useDocumentAutoFillTokens(null, tokensPopoverOpen);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);
  const [dragInsertPosition, setDragInsertPosition] = useState<'above' | 'below' | null>(null);
  const draggingPageIdxRef = useRef<number | null>(null);
  const dragInsertPositionRef = useRef<'above' | 'below' | null>(null);

  const { data: documentTypes = [] } = useQuery({
    queryKey: ['document-creator-document-types'],
    queryFn: () => api<DocumentTypePreset[]>('GET', '/document-creator/document-types'),
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Record<string, SettingsListItem[]>>('GET', '/settings'),
  });
  const { data: categoryPerms } = useQuery({
    queryKey: ['document-template-category-perms'],
    queryFn: () =>
      api<{ allowed_category_ids: string[] | null }>(
        'GET',
        '/auth/me/document-template-category-permissions',
      ),
  });
  const categoryOptions = useMemo(() => {
    const items = settings?.document_template_categories || [];
    const allowedIds = categoryPerms?.allowed_category_ids;
    // undefined => perms still loading (show none yet); null => admin (all); array => allow-list
    const filtered =
      categoryPerms === undefined
        ? []
        : allowedIds === null
          ? items
          : items.filter((item) => (allowedIds || []).includes(String(item.id)));
    const sorted = [...filtered].sort(
      (a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0) || a.label.localeCompare(b.label),
    );
    const options = [
      { value: '', label: 'No category' },
      ...sorted.map((item) => ({ value: item.label, label: item.label })),
    ];
    const current = category.trim();
    if (current && !options.some((option) => option.value === current)) {
      options.push({ value: current, label: `${current} (legacy)` });
    }
    return options;
  }, [settings?.document_template_categories, categoryPerms, category]);
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

  useEffect(() => {
    if (!tokensPopoverOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (tokensButtonRef.current?.contains(t)) return;
      if (tokensPopoverRef.current?.contains(t)) return;
      setTokensPopoverOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tokensPopoverOpen]);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const layoutPage = layoutModalPageIndex !== null ? pages[layoutModalPageIndex] : null;

  const addPage = () => {
    setPages((prev) => [...prev, { template_id: '', label: '' }]);
  };

  const duplicatePage = (index: number) => {
    setPages((prev) => {
      const source = prev[index];
      if (!source) return prev;
      const stamp = Date.now();
      const clonedElements: DocElement[] = JSON.parse(JSON.stringify(source.elements ?? []));
      const newElements = clonedElements.map((el, i) => ({
        ...el,
        id: `el-${stamp}-${i}-${Math.random().toString(36).slice(2, 9)}`,
      }));
      const labelBase = source.label?.trim() || '';
      const copy: PageTemplateRow = {
        template_id: source.template_id,
        label: labelBase ? `${labelBase} (copy)` : '',
        margins: source.margins ? { ...source.margins } : undefined,
        elements: newElements,
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const removePage = async (index: number) => {
    const page = pages[index];
    const pageName =
      page?.label?.trim() ||
      templates.find((t) => t.id === page?.template_id)?.name ||
      `Page ${index + 1}`;
    const ok = await confirm({
      title: 'Remove page',
      message: `Remove "${pageName}" from this template? This only affects the template until you save.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
    });
    if (ok !== 'confirm') return;
    setPages((prev) => prev.filter((_, i) => i !== index));
    if (draggingPageIdx === index) setDraggingPageIdx(null);
    if (dragOverPageIdx === index) setDragOverPageIdx(null);
    if (draggingPageIdxRef.current === index) draggingPageIdxRef.current = null;
    if (dragInsertPositionRef.current != null) dragInsertPositionRef.current = null;
  };

  const handlePageGrabberDragStart = (idx: number, e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    draggingPageIdxRef.current = idx;
    dragInsertPositionRef.current = null;
    setDraggingPageIdx(idx);
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
  };

  const handlePageDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const fromIdx = draggingPageIdxRef.current;
    if (fromIdx === null || fromIdx === idx) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const position: 'above' | 'below' = e.clientY < mid ? 'above' : 'below';
    dragInsertPositionRef.current = position;
    setDragOverPageIdx(idx);
    setDragInsertPosition(position);
  };

  const handlePageDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
    dragInsertPositionRef.current = null;
  };

  const handlePageDrop = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = draggingPageIdxRef.current;
    const insertPos = dragInsertPositionRef.current;
    draggingPageIdxRef.current = null;
    dragInsertPositionRef.current = null;
    setDraggingPageIdx(null);
    setDragOverPageIdx(null);
    setDragInsertPosition(null);
    if (fromIdx === null) return;
    setPages((prev) => {
      if (fromIdx < 0 || fromIdx >= prev.length) return prev;
      const v = [...prev];
      const [moved] = v.splice(fromIdx, 1);
      const toIdx = insertPos === 'above' ? idx : idx + 1;
      const insertAt = Math.max(0, Math.min(v.length, fromIdx < toIdx ? toIdx - 1 : toIdx));
      if (insertAt === fromIdx) return prev;
      v.splice(insertAt, 0, moved);
      return v;
    });
  };

  const handlePageDragEnd = () => {
    draggingPageIdxRef.current = null;
    dragInsertPositionRef.current = null;
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

  const savePageLayout = async (
    index: number,
    margins: PageMargins,
    elements: DocElement[],
    templateId?: string | null
  ) => {
    const updatedPages = pages.map((p, i) =>
      i === index
        ? {
            ...p,
            margins,
            elements,
            ...(templateId !== undefined ? { template_id: templateId ?? '' } : {}),
          }
        : p,
    );
    setPages(updatedPages);
    setLayoutModalPageIndex(null);

    // Persist immediately when editing an existing template
    if (editingId) {
      const page_templates = updatedPages
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
      try {
        await api('PATCH', `/document-creator/document-types/${editingId}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          page_templates,
        });
        toast.success('Page layout saved.');
        queryClient.invalidateQueries({ queryKey: ['document-creator-document-types'] });
      } catch (err: any) {
        toast.error(err?.message || 'Failed to save page layout.');
      }
    }
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

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
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
      <div className="flex items-center justify-end gap-2">
        {/* Auto-fill tokens reference */}
        <div className="relative">
          <button
            ref={tokensButtonRef}
            type="button"
            onClick={() => setTokensPopoverOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300/80 bg-white text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35"
            title="Auto-fill tokens reference"
          >
            <span className="font-mono text-base leading-none text-slate-500">{'{ }'}</span>
            Auto-fill tokens
          </button>
          {tokensPopoverOpen && (
            <div ref={tokensPopoverRef} className="absolute right-0 top-full z-50 mt-2">
              <DocumentAutoFillTokenPicker
                tokens={tokenValues?.tokens ?? []}
                forceToken
                onClose={() => setTokensPopoverOpen(false)}
                description="Click a token to copy it. Paste into a text box in the page layout editor. Tokens stay in the template until a document is created with matching data."
                onInsert={(text) => {
                  void navigator.clipboard.writeText(text);
                  toast.success('Copied to clipboard');
                  setTokensPopoverOpen(false);
                }}
              />
            </div>
          )}
        </div>
        {!readOnly ? (
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
        >
          Create document template
        </button>
        ) : null}
      </div>
      {documentTypes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-8 text-center">
          <p className="text-gray-600 mb-3">No document templates yet.</p>
          <p className="text-sm text-gray-500 mb-4">
            Create a preset (e.g. Cover + Back cover + Content) so users can pick it when creating a document.
          </p>
          {!readOnly ? (
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2 rounded bg-brand-red text-white text-sm font-medium hover:bg-brand-red/90"
          >
            Create document template
          </button>
          ) : null}
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
                onClick={() => !readOnly && openEdit(dt)}
                className={`group grid grid-cols-[1fr_8rem_8rem] gap-2 sm:gap-4 items-center px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 ${readOnly ? '' : 'cursor-pointer'} transition-colors`}
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
                  {!readOnly ? (
                  <>
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
                  </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && !readOnly && (
        <AppFormModal
          open={showForm}
          onClose={closeForm}
          title={editingId ? 'Edit document template' : 'New document template'}
          description="Preset page layouts offered when creating a document in Document Builder."
          formWidth="comfortable"
          quickInfo={
            <>
              <p>
                Name the template, choose a category, and arrange pages in order. Each page can use a background layout
                from your background templates.
              </p>
              <p>
                Categories are managed in System Settings. Users pick this template when creating a document to start
                with your page sequence.
              </p>
            </>
          }
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeForm} disabled={isSaving}>
                Cancel
              </AppButton>
              <AppButton
                type="submit"
                form="document-type-form"
                size="sm"
                disabled={isSaving}
                loading={isSaving}
              >
                {editingId ? 'Save' : 'Create'}
              </AppButton>
            </div>
          }
        >
          <form id="document-type-form" onSubmit={handleSubmit} className={uiSpacing.sectionStack}>
            <AppInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Proposal"
              disabled={isSaving}
              required
            />
            <AppSelect
              label="Category"
              options={categoryOptions}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Cover + back cover + content page"
              disabled={isSaving}
            />
            <div>
              <div className={uiCx('mb-2 flex items-center justify-between gap-2')}>
                <span className={uiTypography.controlLabel}>Pages</span>
                <AppButton type="button" variant="ghost" size="sm" onClick={addPage} disabled={isSaving}>
                  + Add page
                </AppButton>
              </div>
              <div
                className={uiCx(
                  uiBorders.subtle,
                  uiRadius.card,
                  'divide-y divide-gray-100 overflow-hidden bg-white',
                )}
              >
                  {pages.map((p, idx) => {
                    const template = templates.find((t) => t.id === p.template_id);
                    const backgroundUrl = template?.background_file_id
                      ? withFileAccessToken(`/files/${template.background_file_id}/thumbnail?w=120`)
                      : null;
                    return (
                      <div
                        key={idx}
                        onDragOver={(e) => handlePageDragOver(idx, e)}
                        onDragLeave={handlePageDragLeave}
                        onDrop={(e) => handlePageDrop(idx, e)}
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
                          draggable
                          onDragStart={(e) => handlePageGrabberDragStart(idx, e)}
                          onDragEnd={handlePageDragEnd}
                          className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-grab active:cursor-grabbing touch-none"
                          title="Drag to reorder"
                          aria-label="Drag to reorder"
                        >
                          <GrabberIcon className="w-5 h-5 pointer-events-none" />
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
                          disabled={isSaving}
                          className={uiCx(
                            'flex-1 min-w-0 bg-white text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-gray-400/35 disabled:cursor-not-allowed disabled:bg-gray-100',
                            uiSpacing.controlX,
                            uiSpacing.controlY,
                            uiRadius.control,
                            uiBorders.input,
                          )}
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
                            onClick={() => duplicatePage(idx)}
                            className="p-2 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 border border-transparent transition-colors"
                            title="Duplicate page"
                            aria-label="Duplicate page"
                          >
                            <DuplicateIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => { void removePage(idx); }}
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
        </AppFormModal>
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
