import { useState, useEffect, useCallback, useRef } from 'react';
import type { DocElement } from '@/types/documentCreator';
import { createTextElement, createImageElement, createImagePlaceholder, createBlockElement } from '@/types/documentCreator';
import DocumentPreview, { type TemplateMargins } from '@/components/DocumentPreview';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Template = {
  id: string;
  name: string;
  background_file_id?: string;
  margins?: TemplateMargins | null;
  default_elements?: DocElement[] | null;
};

type TemplateLayoutModalProps = {
  template: Template | null;
  onClose: () => void;
  onSave: (templateId: string, data: { margins: TemplateMargins; default_elements: DocElement[] }) => Promise<void>;
};

export function TemplateLayoutModal({ template, onClose, onSave }: TemplateLayoutModalProps) {
  const [margins, setMargins] = useState<TemplateMargins>({
    left_pct: 0,
    right_pct: 0,
    top_pct: 0,
    bottom_pct: 0,
  });
  const [elements, setElements] = useState<DocElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!template) return;
    setMargins({
      left_pct: template.margins?.left_pct ?? 0,
      right_pct: template.margins?.right_pct ?? 0,
      top_pct: template.margins?.top_pct ?? 0,
      bottom_pct: template.margins?.bottom_pct ?? 0,
    });
    setElements(
      (template.default_elements ?? []).map((el) => ({
        ...el,
        id: el.id || `def-${Math.random().toString(36).slice(2, 9)}`,
      }))
    );
    setSelectedElementId(null);
  }, [template]);

  const handleUpdateElement = useCallback((elementId: string, updater: (e: DocElement) => DocElement) => {
    setElements((prev) => prev.map((e) => (e.id === elementId ? updater(e) : e)));
  }, []);

  const handleRemoveElement = useCallback((elementId: string) => {
    setElements((prev) => prev.filter((e) => e.id !== elementId));
    if (selectedElementId === elementId) setSelectedElementId(null);
  }, [selectedElementId]);

  const handleAddText = useCallback(() => {
    const el = createTextElement();
    setElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  }, []);

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
      const el = createImageElement(conf.id);
      setElements((prev) => [...prev, el]);
      setSelectedElementId(el.id);
      toast.success('Imagem adicionada.');
    } catch {
      toast.error('Falha no upload.');
    }
  }, []);

  const handleAddImagePlaceholder = useCallback(() => {
    const el = createImagePlaceholder();
    setElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  }, []);

  const handleAddBlock = useCallback(() => {
    const el = createBlockElement();
    setElements((prev) => [...prev, el]);
    setSelectedElementId(el.id);
  }, []);

  const handleReplaceImage = useCallback(async (elementId: string, file: File) => {
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
      setElements((prev) => prev.map((e) => (e.id === elementId ? { ...e, content: conf.id } : e)));
      toast.success('Imagem substituída.');
    } catch {
      toast.error('Falha no upload.');
    }
  }, []);

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    try {
      await onSave(template.id, {
        margins: { ...margins },
        default_elements: elements.map(({ id, ...rest }) => rest),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!template) return null;

  const backgroundUrl = template.background_file_id
    ? `/files/${template.background_file_id}/thumbnail?w=800`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={onClose}>
      <div
        className="flex-1 flex flex-col m-4 rounded-xl shadow-xl bg-white overflow-hidden min-h-0 max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 p-3 border-b border-gray-200 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">Editar layout: {template.name}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium uppercase">Margens (área de bloqueio)</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={50}
                value={margins.left_pct ?? 0}
                onChange={(e) => setMargins((m) => ({ ...m, left_pct: Number(e.target.value) }))}
                className="w-12 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
                title="Esquerda %"
              />
              <input
                type="number"
                min={0}
                max={50}
                value={margins.right_pct ?? 0}
                onChange={(e) => setMargins((m) => ({ ...m, right_pct: Number(e.target.value) }))}
                className="w-12 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
                title="Direita %"
              />
              <input
                type="number"
                min={0}
                max={50}
                value={margins.top_pct ?? 0}
                onChange={(e) => setMargins((m) => ({ ...m, top_pct: Number(e.target.value) }))}
                className="w-12 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
                title="Topo %"
              />
              <input
                type="number"
                min={0}
                max={50}
                value={margins.bottom_pct ?? 0}
                onChange={(e) => setMargins((m) => ({ ...m, bottom_pct: Number(e.target.value) }))}
                className="w-12 px-1.5 py-1 rounded border border-gray-300 text-xs text-center"
                title="Base %"
              />
            </div>
            <button
              type="button"
              onClick={handleAddText}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Texto
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Imagem
            </button>
            <button
              type="button"
              onClick={handleAddImagePlaceholder}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Área para imagem
            </button>
            <button
              type="button"
              onClick={handleAddBlock}
              className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-sm text-gray-700"
            >
              + Bloqueio
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAddImage}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <DocumentPreview
            backgroundUrl={backgroundUrl}
            elements={elements}
            margins={margins}
            onElementClick={setSelectedElementId}
            onCanvasClick={() => setSelectedElementId(null)}
            selectedElementId={selectedElementId}
            onUpdateElement={handleUpdateElement}
            onRemoveElement={handleRemoveElement}
            onReplaceImage={handleReplaceImage}
          />
        </div>

        <div className="p-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-brand-red text-white font-medium disabled:opacity-50"
          >
            {saving ? 'A guardar...' : 'Guardar layout'}
          </button>
        </div>
      </div>
    </div>
  );
}
