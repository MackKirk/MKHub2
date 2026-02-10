import { useRef } from 'react';
import toast from 'react-hot-toast';
import type { DocElement, DocumentPage } from '@/types/documentCreator';
import { createTextElement, createImageElement } from '@/types/documentCreator';
import { api } from '@/lib/api';

type Template = { id: string; name: string; description?: string; background_file_id?: string };

type DocumentAreaPanelProps = {
  title: string;
  onTitleChange: (title: string) => void;
  pages: DocumentPage[];
  currentPageIndex: number;
  onPageSelect: (index: number) => void;
  onAddPage: () => void;
  templates: Template[];
  currentTemplateId: string | null;
  onTemplateSelect: (templateId: string | null) => void;
  elements: DocElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, updater: (e: DocElement) => DocElement) => void;
  onAddElement: (el: DocElement) => void;
  onRemoveElement: (id: string) => void;
  onSave?: () => void;
  onExportPdf?: () => void;
  documentId: string | null;
  isSaving?: boolean;
};

export default function DocumentAreaPanel({
  title,
  onTitleChange,
  pages,
  currentPageIndex,
  onPageSelect,
  onAddPage,
  templates,
  currentTemplateId,
  onTemplateSelect,
  elements,
  selectedElementId,
  onSelectElement,
  onUpdateElement,
  onAddElement,
  onRemoveElement,
  onSave,
  onExportPdf,
  documentId,
  isSaving,
}: DocumentAreaPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedElement = selectedElementId ? elements.find((e) => e.id === selectedElementId) : null;

  const handleAddText = () => {
    onAddElement(createTextElement());
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      onAddElement(createImageElement(conf.id));
      toast.success('Image added.');
    } catch (err) {
      toast.error('Failed to upload image.');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 max-w-sm rounded-xl border bg-white overflow-hidden">
      <div className="p-3 border-b border-gray-200 text-gray-600 text-sm font-medium">
        Document
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Document title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
            placeholder="e.g. Monthly Report"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Pages</span>
            <button
              type="button"
              onClick={onAddPage}
              className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition-colors"
            >
              + Add page
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPageSelect(i)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  currentPageIndex === i
                    ? 'bg-black text-white'
                    : 'bg-white border text-gray-700 hover:bg-gray-50'
                }`}
              >
                {i === 0 ? 'Cover' : `Page ${i + 1}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-2">Page background</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onTemplateSelect(null)}
              className={`px-3 py-2 rounded text-sm border transition-colors ${
                !currentTemplateId
                  ? 'border-brand-red bg-brand-red/10 text-brand-red font-medium'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              None
            </button>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTemplateSelect(t.id)}
                className={`px-3 py-2 rounded text-sm border transition-colors ${
                  currentTemplateId === t.id
                    ? 'border-brand-red bg-brand-red/10 text-brand-red font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Elements</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddText}
                className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition-colors"
              >
                + Text
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 transition-colors"
              >
                + Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAddImage}
              />
            </div>
          </div>
          {elements.length === 0 && (
            <p className="text-gray-500 text-sm">Add elements, then select on the slide to resize and edit.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-2 rounded bg-brand-red text-white font-medium disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : documentId ? 'Save' : 'Create document'}
            </button>
          )}
          {onExportPdf && documentId && (
            <button
              type="button"
              onClick={onExportPdf}
              className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 font-medium transition-colors"
            >
              Export PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
