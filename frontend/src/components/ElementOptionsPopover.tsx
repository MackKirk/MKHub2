import { useRef } from 'react';
import type { DocElement } from '@/types/documentCreator';
import { DOCUMENT_EDITOR_FONTS } from '@/types/documentCreator';

type ElementOptionsPopoverProps = {
  element: DocElement;
  onUpdate: (id: string, updater: (el: DocElement) => DocElement) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
  /** When provided, "Add image" / "Replace image" opens the image picker instead of file input. */
  onReplaceImageClick?: (elementId: string) => void;
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

const AlignTopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M6 5h12M6 9h12M6 13h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlignMiddleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M6 7h12M6 11h12M6 15h8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlignBottomIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
    <path d="M6 11h8M6 15h12M6 19h12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Explicit dot positions in viewBox 0 0 12 12 (SVG: x right, y down). Maps object-position value to (cx, cy). */
const POSITION_ICON_COORDS: Record<string, { cx: number; cy: number }> = {
  '0% 0%': { cx: 2, cy: 2 },     // top-left
  '50% 0%': { cx: 6, cy: 2 },    // top
  '100% 0%': { cx: 10, cy: 2 },  // top-right
  '0% 50%': { cx: 2, cy: 6 },    // left
  '50% 50%': { cx: 6, cy: 6 },   // center
  '100% 50%': { cx: 10, cy: 6 }, // right
  '0% 100%': { cx: 2, cy: 10 },  // bottom-left
  '50% 100%': { cx: 6, cy: 10 }, // bottom
  '100% 100%': { cx: 10, cy: 10 }, // bottom-right
};

function PositionIcon({ value }: { value: string }) {
  const normal = value.trim();
  const { cx, cy } = POSITION_ICON_COORDS[normal] ?? { cx: 6, cy: 6 };
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className="block shrink-0"
      preserveAspectRatio="xMinYMin meet"
    >
      <rect x="0.5" y="0.5" width="11" height="11" rx="1" />
      <circle cx={cx} cy={cy} r="1.2" fill="currentColor" />
    </svg>
  );
}

export function ElementOptionsPopover({
  element,
  onUpdate,
  onRemove,
  onClose,
  onReplaceImage,
  onReplaceImageClick,
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

      {element.type === 'image' && (onReplaceImage || onReplaceImageClick) && (
        <div className="space-y-3">
          {!onReplaceImageClick && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          )}
          <button
            type="button"
            onClick={() => onReplaceImageClick ? onReplaceImageClick(id) : fileInputRef.current?.click()}
            className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-gray-50 hover:bg-gray-100"
          >
            {element.content ? 'Replace image' : 'Add image'}
          </button>
          {element.content && (
            <div className="space-y-2">
              <span className="block text-xs text-gray-600 mb-0.5">Edit position</span>
              <div>
                <span className="block text-xs text-gray-500 mb-0.5">Fit</span>
                <div className="flex flex-wrap gap-px w-fit rounded overflow-hidden border border-gray-200 bg-gray-200">
                  {(['contain', 'cover', 'fill', 'none'] as const).map((fit) => (
                    <button
                      key={fit}
                      type="button"
                      onClick={() => onUpdate(id, (el) => ({ ...el, imageFit: fit }))}
                      className={`min-w-[2.25rem] h-7 px-1.5 rounded-none first:rounded-l last:rounded-r text-[10px] capitalize ${(element.imageFit ?? 'contain') === fit ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                      title={fit}
                    >
                      {fit}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs text-gray-500 mb-0.5">Position</span>
                <div className="grid grid-cols-3 gap-px w-fit rounded overflow-hidden border border-gray-200 bg-gray-200">
                  {[
                    { value: '0% 0%', title: 'Top left' },
                    { value: '50% 0%', title: 'Top' },
                    { value: '100% 0%', title: 'Top right' },
                    { value: '0% 50%', title: 'Left' },
                    { value: '50% 50%', title: 'Center' },
                    { value: '100% 50%', title: 'Right' },
                    { value: '0% 100%', title: 'Bottom left' },
                    { value: '50% 100%', title: 'Bottom' },
                    { value: '100% 100%', title: 'Bottom right' },
                  ].map(({ value, title }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onUpdate(id, (el) => ({ ...el, imagePosition: value }))}
                      className={`w-7 h-7 flex items-center justify-center ${(element.imagePosition ?? '50% 50%') === value ? 'bg-white shadow-sm text-gray-900' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                      title={title}
                    >
                      <PositionIcon value={value} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {element.type === 'text' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Font</label>
            <select
              value={element.fontFamily ?? 'Montserrat'}
              onChange={(e) =>
                onUpdate(id, (el) => ({ ...el, fontFamily: e.target.value as 'Montserrat' | 'Open Sans' }))
              }
              className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm focus:ring-2 focus:ring-brand-red/50 focus:border-brand-red"
            >
              {DOCUMENT_EDITOR_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Text color</label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="color"
                value={element.color ?? '#000000'}
                onChange={(e) => onUpdate(id, (el) => ({ ...el, color: e.target.value }))}
                className="w-9 h-9 rounded border border-gray-300 cursor-pointer p-0.5 bg-white"
                title="Text color"
              />
              <input
                type="text"
                value={element.color ?? '#000000'}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (/^#[0-9A-Fa-f]{6}$/.test(v) || v === '') onUpdate(id, (el) => ({ ...el, color: v || '#000000' }));
                }}
                className="flex-1 min-w-0 w-20 px-2 py-1 rounded border border-gray-300 text-xs font-mono"
                placeholder="#000000"
              />
            </div>
          </div>
          <div>
            <span className="block text-xs text-gray-600 mb-1.5">Horizontal</span>
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
          <div>
            <span className="block text-xs text-gray-600 mb-1.5">Vertical</span>
            <div className="flex gap-1 p-0.5 rounded bg-gray-100">
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: 'top' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.verticalAlign ?? 'top') === 'top' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Top"
              >
                <AlignTopIcon />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: 'center' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.verticalAlign ?? 'top') === 'center' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Center"
              >
                <AlignMiddleIcon />
              </button>
              <button
                type="button"
                onClick={() => onUpdate(id, (el) => ({ ...el, verticalAlign: 'bottom' }))}
                className={`flex-1 py-2 rounded flex items-center justify-center ${(element.verticalAlign ?? 'top') === 'bottom' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                title="Bottom"
              >
                <AlignBottomIcon />
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
