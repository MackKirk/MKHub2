import { useRef } from 'react';
import type { DocElement } from '@/types/documentCreator';

type ElementOptionsPopoverProps = {
  element: DocElement;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
};

function typeLabel(el: DocElement): string {
  if (el.type === 'text') return 'Text';
  if (el.type === 'block') return 'Block';
  return el.content ? 'Image' : 'Image area';
}

const AlignLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M4 6h16M4 12h10M4 18h14" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlignCenterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M7 6h10M4 12h16M9 18h6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlignRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M8 6L20 6M4 12L20 12M10 18L20 18" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ElementOptionsPopover({
  element,
  onUpdate,
  onRemove,
  onClose,
  onReplaceImage,
}: ElementOptionsPopoverProps) {
  const id = element.id;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/') || !onReplaceImage) return;
    onReplaceImage(id, file);
  };

  return (
    <div className="absolute right-4 top-14 z-20 w-56 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          {typeLabel(element)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            Delete
          </button>
        </div>
      </div>

      {element.type === 'image' && onReplaceImage && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-gray-50 hover:bg-gray-100"
          >
            {element.content ? 'Replace image' : 'Add image'}
          </button>
        </div>
      )}

      {element.type === 'text' && (
        <div className="space-y-3">
          <div>
            <span className="block text-xs text-gray-600 mb-1.5">Alignment</span>
            <div className="flex gap-1 p-0.5 rounded bg-gray-100">
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, textAlign: 'left' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.textAlign ?? 'left') === 'left' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Align left"
              >
                <AlignLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, textAlign: 'center' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.textAlign ?? 'left') === 'center' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Align center"
              >
                <AlignCenterIcon />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, textAlign: 'right' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.textAlign ?? 'left') === 'right' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Align right"
              >
                <AlignRightIcon />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Style</span>
            <button
              type="button"
              onClick={() =>
                onUpdate(id, (el) => ({
                  ...el,
                  fontWeight: (el.fontWeight ?? 'normal') === 'bold' ? 'normal' : 'bold',
                }))
              }
              className={`px-2.5 py-1.5 rounded text-sm font-bold border ${
                (element.fontWeight ?? 'normal') === 'bold'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdate(id, (el) => ({
                  ...el,
                  fontStyle: (el.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic',
                }))
              }
              className={`px-2.5 py-1.5 rounded text-sm border italic ${
                (element.fontStyle ?? 'normal') === 'italic'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Italic"
            >
              I
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Font size</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={8}
                max={72}
                value={element.fontSize ?? 12}
                onChange={(e) =>
                  onUpdate(id, (el) => ({ ...el, fontSize: Number(e.target.value) }))
                }
                className="flex-1 h-2 rounded accent-brand-red"
              />
              <span className="text-xs text-gray-500 w-6">{element.fontSize ?? 12}</span>
            </div>
          </div>
        </div>
      )}

      {(element.type === 'image' || element.type === 'block') && (
        <p className="text-xs text-gray-500">
          Drag to move, use handles to resize.
        </p>
      )}
    </div>
  );
}
