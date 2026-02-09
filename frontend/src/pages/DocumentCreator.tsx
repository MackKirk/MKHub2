import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken } from '@/lib/api';
import toast from 'react-hot-toast';
import DocumentPreview from '@/components/DocumentPreview';
import DocumentAreaPanel from '@/components/DocumentAreaPanel';
import DocumentTemplatesTab from '@/components/DocumentTemplatesTab';
import type { DocumentPage, DocElement } from '@/types/documentCreator';

type Template = {
  id: string;
  name: string;
  description?: string;
  background_file_id?: string;
  areas_definition?: any;
};

type UserDocument = {
  id: string;
  title: string;
  document_type_id?: string;
  pages?: DocumentPage[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
};

const defaultPage = (): DocumentPage => ({ template_id: null, elements: [] });

/** Convert legacy areas_content + template areas to elements for backward compat */
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

export default function DocumentCreator() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('New document');
  const [pages, setPages] = useState<DocumentPage[]>([defaultPage()]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'creator' | 'templates'>('creator');

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
    }
  }, [doc, templates]);

  const currentPage = pages[currentPageIndex];
  const currentTemplateId = currentPage?.template_id ?? null;
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);
  const elements = currentPage?.elements ?? [];
  const backgroundFileId = currentTemplate?.background_file_id;
  const backgroundUrl = backgroundFileId ? `/files/${backgroundFileId}/thumbnail?w=800` : null;

  const setCurrentPageTemplate = useCallback((templateId: string | null) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[currentPageIndex]) {
        next[currentPageIndex] = { ...next[currentPageIndex], template_id: templateId };
      }
      return next;
    });
  }, [currentPageIndex]);

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

  const handleAddPage = useCallback(() => {
    setPages((prev) => [...prev, defaultPage()]);
    setCurrentPageIndex(pages.length);
    setSelectedElementId(null);
  }, [pages.length]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload = { title, pages: pages.map((p) => ({ template_id: p.template_id, elements: p.elements ?? [] })) };
      if (id) {
        await api('PATCH', `/document-creator/documents/${id}`, payload);
        toast.success('Document saved.');
        queryClient.invalidateQueries({ queryKey: ['document-creator-doc', id] });
      } else {
        const created = await api<UserDocument>('POST', '/document-creator/documents', payload);
        toast.success('Document created.');
        navigate(`/documents/create/${created.id}`, { replace: true });
        queryClient.invalidateQueries({ queryKey: ['document-creator-doc', created.id] });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  }, [id, title, pages, navigate, queryClient]);

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
    <div className="flex flex-col h-full min-h-[calc(100vh-6rem)] max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Create document</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('creator')}
            className={`px-3 py-1.5 rounded-full text-sm ${activeTab === 'creator' ? 'bg-black text-white' : 'bg-white border'}`}
          >
            Create document
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1.5 rounded-full text-sm ${activeTab === 'templates' ? 'bg-black text-white' : 'bg-white border'}`}
          >
            Background templates
          </button>
        </div>
      </div>
      {activeTab === 'templates' ? (
        <DocumentTemplatesTab />
      ) : (
      <div className="flex-1 flex gap-4 min-h-0">
        <DocumentPreview
          backgroundUrl={backgroundUrl}
          elements={elements}
          onElementClick={setSelectedElementId}
          onCanvasClick={() => setSelectedElementId(null)}
          selectedElementId={selectedElementId}
        />
        <DocumentAreaPanel
          title={title}
          onTitleChange={setTitle}
          pages={pages}
          currentPageIndex={currentPageIndex}
          onPageSelect={setCurrentPageIndex}
          onAddPage={handleAddPage}
          templates={templates}
          currentTemplateId={currentTemplateId}
          onTemplateSelect={setCurrentPageTemplate}
          elements={elements}
          selectedElementId={selectedElementId}
          onSelectElement={setSelectedElementId}
          onUpdateElement={handleUpdateElement}
          onAddElement={handleAddElement}
          onRemoveElement={handleRemoveElement}
          onSave={handleSave}
          onExportPdf={id ? handleExportPdf : undefined}
          documentId={id ?? null}
          isSaving={isSaving}
        />
      </div>
      )}
    </div>
  );
}
