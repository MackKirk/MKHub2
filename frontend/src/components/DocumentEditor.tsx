import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentPagesStrip from '@/components/DocumentPagesStrip';
import { AddPageTemplateModal } from '@/components/AddPageTemplateModal';
import type { DocumentPage, DocElement } from '@/types/documentCreator';
import { createTextElement, createImageElement, createImagePlaceholder } from '@/types/documentCreator';

type Template = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
  areas_definition?: any;
  margins?: { left_pct?: number; right_pct?: number; top_pct?: number; bottom_pct?: number };
  default_elements?: DocElement[];
};

type UserDocument = {
  id: string;
  title: string;
  document_type_id?: string;
  project_id?: string | null;
  pages?: DocumentPage[];
  created_at?: string;
  updated_at?: string | null;
};

const defaultPage = (): DocumentPage => ({ template_id: null, elements: [] });

function legacyToElements(areas_content: Record<string, string> | undefined, areas_def: any[]): DocElement[] {
  if (!areas_content || typeof areas_content !== 'object') return [];
  const areas = Array.isArray(areas_def) ? areas_def : (areas_def?.areas || []);
  return areas.map((a: any, i: number) => ({
    id: `legacy-${i}-${a.id || a.key || i}`,
    type: 'text',
    content: areas_content[a.id || a.key] ?? '',
    x_pct: a.x_pct ?? 10,
    y_pct: a.y_pct ?? 20,
    width_pct: a.width_pct ?? 80,
    height_pct: a.height_pct ?? 8,
    fontSize: a.font_size ?? 12,
  }));
}

type DocumentEditorProps = {
  documentId: string;
  projectId?: string | null;
  /** When set, editor is embedded (e.g. in modal): show Close button and call onClose instead of back link */
  onClose?: () => void;
};

export default function DocumentEditor({ documentId, projectId, onClose }: DocumentEditorProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<{ title: string; pagesStr: string } | null>(null);
  const id = documentId;

  const [title, setTitle] = useState('New document');
  const [pages, setPages] = useState<DocumentPage[]>([defaultPage()]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddPageModal, setShowAddPageModal] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-creator-templates'],
    queryFn: () => api<Template[]>('GET', '/document-creator/templates'),
  });

  const { data: doc } = useQuery({
    queryKey: ['document-creator-doc', id],
    queryFn: () => api<UserDocument>('GET', `/document-creator/documents/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title || 'New document');
    if (Array.isArray(doc.pages) && doc.pages.length > 0) {
      const converted = doc.pages.map((p) => {
        const hasElements = Array.isArray(p.elements) && p.elements.length > 0;
        if (hasElements) {
          return { template_id: p.template_id ?? null, elements: p.elements! };
        }
        const template = templates.find((t) => t.id === p.template_id);
        const areasDef = template?.areas_definition;
        const areas = Array.isArray(areasDef) ? areasDef : areasDef?.areas || [];
        const elements = legacyToElements(p.areas_content, areas);
        return { template_id: p.template_id ?? null, elements: elements.length ? elements : [] };
      });
      setPages(converted);
      lastSavedRef.current = {
        title: doc.title || 'New document',
        pagesStr: JSON.stringify(converted),
      };
    }
  }, [doc, templates]);

  const currentPage = pages[currentPageIndex];
  const currentTemplateId = currentPage?.template_id ?? null;
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);
  const elements = currentPage?.elements ?? [];
  const backgroundFileId = currentTemplate?.background_file_id;
  const backgroundUrl = backgroundFileId ? `/files/${backgroundFileId}/thumbnail?w=800` : null;

  const setCurrentPageTemplate = useCallback((templateId: string | null) => {
    const template = templates.find((t) => t.id === templateId);
    const defaultEls = template?.default_elements;
    setPages((prev) => {
      const next = [...prev];
      if (!next[currentPageIndex]) return next;
      const page = next[currentPageIndex];
      const currentEls = page.elements ?? [];
      const shouldApplyDefaults =
        templateId && defaultEls && defaultEls.length > 0 && currentEls.length === 0;
      const newElements = shouldApplyDefaults
        ? defaultEls.map((el) => ({
            ...el,
            id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          }))
        : currentEls;
      next[currentPageIndex] = {
        ...page,
        template_id: templateId,
        elements: newElements,
      };
      return next;
    });
  }, [currentPageIndex, templates]);

  const setCurrentPageElements = useCallback((updater: (els: DocElement[]) => DocElement[]) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = {
          ...next[currentPageIndex],
          elements: updater(next[currentPageIndex].elements ?? []),
        };
      }
      return next;
    });
  }, [currentPageIndex]);

  const handleAddElement = useCallback((el: DocElement) => {
    setCurrentPageElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  }, [setCurrentPageElements]);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    setCurrentPageElements((prev) =>
      prev.map((e) => (e.id === elementId ? updater(e) : e))
    );
  }, [setCurrentPageElements]);

  const handleRemoveElement = useCallback((elementId: string) => {
    setCurrentPageElements((prev) => prev.filter((e) => e.id !== elementId));
    if (selectedElementId === elementId) setSelectedElementId(null);
  }, [setCurrentPageElements, selectedElementId]);

  const newPageWithTemplate = useCallback(
    (templateId: string | null): DocumentPage => {
      if (!templateId) return { template_id: null, elements: [] };
      const template = templates.find((t) => t.id === templateId);
      const defaultEls = template?.default_elements ?? [];
      return {
        template_id: templateId,
        elements: defaultEls.map((el) => ({
          ...el,
          id: `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        })),
      };
    },
    [templates]
  );

  const handleAddPageWithTemplate = useCallback(
    (templateId: string | null) => {
      setPages((prev) => [...prev, newPageWithTemplate(templateId)]);
      setCurrentPageIndex(pages.length);
      setSelectedElementId(null);
      setShowAddPageModal(false);
    },
    [newPageWithTemplate, pages.length]
  );

  const handleAddText = useCallback(() => {
    handleAddElement(createTextElement());
  }, [handleAddElement]);

  const handleAddImage = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    try {
      const up: any = await api('POST', '/files/upload', {
        original_name: file.name,
        content_type: file.type,
        client_id: null,
        project_id: null,
        employee_id: null,
        category_id: 'document-creator',
      });
      const res = await fetch(up.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
        body: file,
      });
      if (!res.ok) throw new Error('Upload failed');
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size,
        checksum_sha256: 'na',
        content_type: file.type,
      });
      handleAddElement(createImageElement(conf.id));
      toast.success('Image added.');
    } catch (err) {
      toast.error('Failed to upload image.');
    }
  }, [handleAddElement]);

  const handleAddImagePlaceholder = useCallback(() => {
    handleAddElement(createImagePlaceholder());
  }, [handleAddElement]);

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      try {
        const up: any = await api('POST', '/files/upload', {
          original_name: file.name,
          content_type: file.type,
          client_id: null,
          project_id: null,
          employee_id: null,
          category_id: 'document-creator',
        });
        const res = await fetch(up.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' },
          body: file,
        });
        if (!res.ok) throw new Error('Upload failed');
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type,
        });
        handleUpdateElement(elementId, (el) => ({ ...el, content: conf.id }));
        toast.success('Image updated.');
      } catch {
        toast.error('Failed to upload image.');
      }
    },
    [handleUpdateElement]
  );

  const saveDocument = useCallback(async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const payload = { title, pages: pages.map((p) => ({ template_id: p.template_id, elements: p.elements ?? [] })) };
      await api('PATCH', `/document-creator/documents/${id}`, payload);
      lastSavedRef.current = { title, pagesStr: JSON.stringify(pages) };
      queryClient.invalidateQueries({ queryKey: ['document-creator-doc', id] });
      queryClient.invalidateQueries({ queryKey: ['document-creator-documents'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['document-creator-documents', projectId] });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  }, [id, title, pages, projectId, queryClient]);

  useEffect(() => {
    if (!id) return;
    const pagesStr = JSON.stringify(pages);
    if (
      lastSavedRef.current &&
      lastSavedRef.current.title === title &&
      lastSavedRef.current.pagesStr === pagesStr
    )
      return;
    const t = setTimeout(saveDocument, 1500);
    return () => clearTimeout(t);
  }, [id, title, pages, saveDocument]);

  const handleExportPdf = useCallback(async () => {
    if (!id) return;
    try {
      const token = getToken();
      const r = await fetch(`/document-creator/documents/${id}/export-pdf`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(r.statusText || 'Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to export PDF.');
    }
  }, [id, title]);

  return (
    <div className="flex flex-col h-full min-h-0 max-w-full">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
              aria-label="Close"
            >
              ✕ Close
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/documents/create')}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Back to documents"
            >
              ←
            </button>
          )}
          <h2 className="text-xl font-bold text-gray-900 truncate">{onClose ? 'Edit document' : 'Document'}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-48 px-3 py-1.5 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
            placeholder="Document title"
          />
          <select
            value={currentTemplateId ?? ''}
            onChange={(e) => setCurrentPageTemplate(e.target.value || null)}
            className="px-3 py-1.5 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50"
          >
            <option value="">No background</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddText}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
          >
            + Text
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
          >
            + Image
          </button>
          <button
            type="button"
            onClick={handleAddImagePlaceholder}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
          >
            + Image area
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAddImage}
          />
          {isSaving && <span className="text-xs text-gray-500 py-1.5">Saving...</span>}
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
          >
            Export PDF
          </button>
        </div>
      </div>
      <div className="flex-1 flex min-h-0">
        <DocumentPagesStrip
          pages={pages}
          templates={templates}
          currentPageIndex={currentPageIndex}
          onPageSelect={setCurrentPageIndex}
          onAddPage={() => setShowAddPageModal(true)}
        />
        <DocumentPreview
          backgroundUrl={backgroundUrl}
          elements={elements}
          margins={currentTemplate?.margins ?? null}
          blockAreasVisible={false}
          onElementClick={setSelectedElementId}
          onCanvasClick={() => setSelectedElementId(null)}
          selectedElementId={selectedElementId}
          onUpdateElement={handleUpdateElement}
          onRemoveElement={handleRemoveElement}
          onReplaceImage={handleReplaceImage}
        />
      </div>
      <AddPageTemplateModal
        open={showAddPageModal}
        templates={templates}
        onClose={() => setShowAddPageModal(false)}
        onSelect={handleAddPageWithTemplate}
      />
    </div>
  );
}
