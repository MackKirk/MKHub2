import { useState, useEffect, useCallback, useRef } from 'react';
import type { DocElement, PageMargins } from '@/types/documentCreator';
import {
  createTextElement,
  createImageElement,
  createImagePlaceholder,
  createBlockElement,
} from '@/types/documentCreator';
import DocumentPreview, { type TemplateMargins } from '@/components/DocumentPreview';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Template = { id: string; name: string; background_file_id?: string };

type DocumentTypePageLayoutModalProps = {
  open: boolean;
  pageIndex: number;
  templateId: string | null;
  templates: Template[];
  initialMargins?: PageMargins | null;
  initialElements?: DocElement[];
  onClose: () => void;
  onSave: (margins: PageMargins, elements: DocElement[]) => void;
};

const defaultMargins: PageMargins = { left_pct: 0, right_pct: 0, top_pct: 0, bottom_pct: 0 };

export function DocumentTypePageLayoutModal({
  open,
  pageIndex,
  templateId,
  templates,
  initialMargins,
  initialElements,
  onClose,
  onSave,
}: DocumentTypePageLayoutModalProps) {
  const [margins, setMargins] = useState<PageMargins>({ ...defaultMargins });
  const [elements, setElements] = useState<DocElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMargins({ ...defaultMargins, ...initialMargins });
    setElements(
      (initialElements ?? []).map((el) => ({
        ...el,
        id: el.id || `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      }))
    );
    setSelectedElementId(null);
  }, [open, initialMargins, initialElements]);

  const template = templates.find((t) => t.id === templateId);
  const backgroundUrl =
    template?.background_file_id ? `/files/${template.background_file_id}/thumbnail?w=800` : null;
  const effectiveMargins: TemplateMargins = { ...defaultMargins, ...margins };

  const handleAddElement = useCallback((el: DocElement) => {
    setElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  }, []);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    setElements((prev) => prev.map((e) => (e.id === elementId ? updater(e) : e)));
  }, []);

  const handleRemoveElement = useCallback((elementId: string) => {
    setElements((prev) => prev.filter((e) => e.id !== elementId));
    if (selectedElementId === elementId) setSelectedElementId(null);
  }, [selectedElementId]);

  const handleAddImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          category_id: 'document-creator-template',
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
      } catch {
        toast.error('Upload failed.');
      }
    },
    [handleAddElement]
  );

  const handleReplaceImage = useCallback(
    async (elementId: string, file: File) => {
      try {
        const up: any = await api('POST', '/files/upload', {
          original_name: file.name,
          content_type: file.type,
          client_id: null,
          project_id: null,
          employee_id: null,
          category_id: 'document-creator-template',
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
        toast.error('Upload failed.');
      }
    },
    [handleUpdateElement]
  );

  const handleSave = () => {
    onSave(margins, elements);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="flex-1 flex flex-col m-4 rounded-xl shadow-xl bg-white overflow-hidden min-h-0 max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 p-3 border-b border-gray-200 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">
            Page {pageIndex + 1} layout (blocks, text, image areas)
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Margins</span>
            <input
              type="number"
              min={0}
              max={50}
              value={margins.left_pct ?? 0}
              onChange={(e) => setMargins((m) => ({ ...m, left_pct: Number(e.target.value) }))}
              className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
              title="Left %"
            />
            <input
              type="number"
              min={0}
              max={50}
              value={margins.right_pct ?? 0}
              onChange={(e) => setMargins((m) => ({ ...m, right_pct: Number(e.target.value) }))}
              className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
              title="Right %"
            />
            <input
              type="number"
              min={0}
              max={50}
              value={margins.top_pct ?? 0}
              onChange={(e) => setMargins((m) => ({ ...m, top_pct: Number(e.target.value) }))}
              className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
              title="Top %"
            />
            <input
              type="number"
              min={0}
              max={50}
              value={margins.bottom_pct ?? 0}
              onChange={(e) => setMargins((m) => ({ ...m, bottom_pct: Number(e.target.value) }))}
              className="w-10 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
              title="Bottom %"
            />
            <button
              type="button"
              onClick={() => handleAddElement(createTextElement())}
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
              onClick={() => handleAddElement(createImagePlaceholder())}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Image area
            </button>
            <button
              type="button"
              onClick={() => handleAddElement(createBlockElement())}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Block
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAddImage}
            />
            <button type="button" onClick={onClose} className="p-1.5 rounded text-gray-500 hover:bg-gray-100" aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 flex min-h-0">
          <DocumentPreview
            backgroundUrl={backgroundUrl}
            elements={elements}
            margins={effectiveMargins}
            blockAreasVisible={true}
            lockBlockElements={false}
            onElementClick={setSelectedElementId}
            onCanvasClick={() => setSelectedElementId(null)}
            selectedElementId={selectedElementId}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
            onReplaceImage={handleReplaceImage}
          />
        </div>
        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-3 py-1.5 rounded bg-brand-red text-white font-medium">
            Save page layout
          </button>
        </div>
      </div>
    </div>
  );
}
