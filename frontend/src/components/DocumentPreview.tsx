import { useRef, useState, useCallback, useEffect } from 'react';
import type { DocElement } from '@/types/documentCreator';
import { ElementOptionsPopover } from '@/components/ElementOptionsPopover';

export type TemplateMargins = {
  left_pct?: number;
  right_pct?: number;
  top_pct?: number;
  bottom_pct?: number;
};

type DocumentPreviewProps = {
  backgroundUrl: string | null;
  elements: DocElement[];
  /** Content area: elements cannot be placed outside (blocked margins) */
  margins?: TemplateMargins | null;
  /** When false (e.g. creating document), block elements are invisible and not editable but still block placement */
  blockAreasVisible?: boolean;
  onElementClick?: (elementId: string) => void;
  onCanvasClick?: () => void;
  selectedElementId: string | null;
  onUpdateElement?: (elementId: string, updater: (el: DocElement) => DocElement) => void;
  onRemoveElement?: (elementId: string) => void;
  /** For image elements: replace or set image (upload handled by parent) */
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
};

const A4_ASPECT = 210 / 297;
const MIN_SIZE_PCT = 2;

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

const HANDLES: { position: string; cursor: string; dir: ResizeHandle }[] = [
  { position: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nw-resize', dir: 'nw' },
  { position: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2', cursor: 'n-resize', dir: 'n' },
  { position: 'right-0 top-0 translate-x-1/2 -translate-y-1/2', cursor: 'ne-resize', dir: 'ne' },
  { position: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'e-resize', dir: 'e' },
  { position: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2', cursor: 'se-resize', dir: 'se' },
  { position: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 's-resize', dir: 's' },
  { position: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2', cursor: 'sw-resize', dir: 'sw' },
  { position: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'w-resize', dir: 'w' },
];

function contentBounds(margins: TemplateMargins | null | undefined, w: number, h: number) {
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  return {
    minX: L,
    maxX: Math.max(L, 100 - R - w),
    minY: T,
    maxY: Math.max(T, 100 - B - h),
  };
}

/** Block elements can be placed anywhere on the canvas (e.g. to block a zone). */
function contentBoundsBlock(w: number, h: number) {
  return {
    minX: 0,
    maxX: Math.max(0, 100 - w),
    minY: 0,
    maxY: Math.max(0, 100 - h),
  };
}

function rectsOverlap(
  x1: number,
  y1: number,
  w1: number,
  h1: number,
  x2: number,
  y2: number,
  w2: number,
  h2: number
): boolean {
  return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

function overlapsAnyBlock(
  x_pct: number,
  y_pct: number,
  width_pct: number,
  height_pct: number,
  blocks: DocElement[],
  excludeId?: string
): boolean {
  return blocks.some(
    (b) =>
      b.id !== excludeId &&
      rectsOverlap(x_pct, y_pct, width_pct, height_pct, b.x_pct ?? 0, b.y_pct ?? 0, b.width_pct ?? 10, b.height_pct ?? 10)
  );
}

function applyResize(
  handle: ResizeHandle,
  dx: number,
  dy: number,
  startX: number,
  startY: number,
  startW: number,
  startH: number,
  margins?: TemplateMargins | null
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  const maxW = 100 - L - R;
  const maxH = 100 - T - B;
  let x = startX,
    y = startY,
    w = startW,
    h = startH;
  switch (handle) {
    case 'se':
      w = startW + dx;
      h = startH + dy;
      break;
    case 'sw':
      x = startX + dx;
      w = startW - dx;
      h = startH + dy;
      break;
    case 'ne':
      w = startW + dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'nw':
      x = startX + dx;
      w = startW - dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'e':
      w = startW + dx;
      break;
    case 'w':
      x = startX + dx;
      w = startW - dx;
      break;
    case 's':
      h = startH + dy;
      break;
    case 'n':
      y = startY + dy;
      h = startH - dy;
      break;
  }
  w = Math.max(MIN_SIZE_PCT, Math.min(maxW, w));
  h = Math.max(MIN_SIZE_PCT, Math.min(maxH, h));
  const b = contentBounds(margins, w, h);
  x = Math.max(b.minX, Math.min(b.maxX, x));
  y = Math.max(b.minY, Math.min(b.maxY, y));
  return { x_pct: x, y_pct: y, width_pct: w, height_pct: h };
}

function applyResizeBlock(
  handle: ResizeHandle,
  dx: number,
  dy: number,
  startX: number,
  startY: number,
  startW: number,
  startH: number
): { x_pct: number; y_pct: number; width_pct: number; height_pct: number } {
  const maxW = 100;
  const maxH = 100;
  let x = startX,
    y = startY,
    w = startW,
    h = startH;
  switch (handle) {
    case 'se':
      w = startW + dx;
      h = startH + dy;
      break;
    case 'sw':
      x = startX + dx;
      w = startW - dx;
      h = startH + dy;
      break;
    case 'ne':
      w = startW + dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'nw':
      x = startX + dx;
      w = startW - dx;
      y = startY + dy;
      h = startH - dy;
      break;
    case 'e':
      w = startW + dx;
      break;
    case 'w':
      x = startX + dx;
      w = startW - dx;
      break;
    case 's':
      h = startH + dy;
      break;
    case 'n':
      y = startY + dy;
      h = startH - dy;
      break;
  }
  w = Math.max(MIN_SIZE_PCT, Math.min(maxW, w));
  h = Math.max(MIN_SIZE_PCT, Math.min(maxH, h));
  const b = contentBoundsBlock(w, h);
  x = Math.max(b.minX, Math.min(b.maxX, x));
  y = Math.max(b.minY, Math.min(b.maxY, y));
  return { x_pct: x, y_pct: y, width_pct: w, height_pct: h };
}

export default function DocumentPreview({
  backgroundUrl,
  elements,
  margins,
  blockAreasVisible = true,
  onElementClick,
  onCanvasClick,
  selectedElementId,
  onUpdateElement,
  onRemoveElement,
  onReplaceImage,
}: DocumentPreviewProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    startX_pct: number;
    startY_pct: number;
    width_pct: number;
    height_pct: number;
    hasMoved: boolean;
  } | null>(null);
  const resizeRef = useRef<{
    elementId: string;
    handle: ResizeHandle;
    startX: number;
    startY: number;
    startX_pct: number;
    startY_pct: number;
    startW_pct: number;
    startH_pct: number;
  } | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea') || target.closest('input')) return;
      dragRef.current = {
        elementId: el.id,
        startX: e.clientX,
        startY: e.clientY,
        startX_pct: el.x_pct ?? 10,
        startY_pct: el.y_pct ?? 20,
        width_pct: el.width_pct ?? 80,
        height_pct: el.height_pct ?? 8,
        hasMoved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement, handle: ResizeHandle) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      resizeRef.current = {
        elementId: el.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startX_pct: el.x_pct ?? 10,
        startY_pct: el.y_pct ?? 20,
        startW_pct: el.width_pct ?? 80,
        startH_pct: el.height_pct ?? 8,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current || !onUpdateElement) return;
      const el = elements.find((x) => x.id === drag.elementId);
      const blocks = elements.filter((x) => x.type === 'block');
      const isBlock = el?.type === 'block';
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * 100;
      const dy = ((e.clientY - drag.startY) / rect.height) * 100;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) drag.hasMoved = true;
      const b = isBlock ? contentBoundsBlock(drag.width_pct, drag.height_pct) : contentBounds(margins, drag.width_pct, drag.height_pct);
      const newX_pct = Math.max(b.minX, Math.min(b.maxX, drag.startX_pct + dx));
      const newY_pct = Math.max(b.minY, Math.min(b.maxY, drag.startY_pct + dy));
      if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, drag.width_pct, drag.height_pct, blocks, drag.elementId)) return;
      onUpdateElement(drag.elementId, (el) => ({ ...el, x_pct: newX_pct, y_pct: newY_pct }));
    },
    [onUpdateElement, margins, elements]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag && drag.elementId === el.id && !drag.hasMoved) {
        onElementClick?.(el.id);
      }
    },
    [onElementClick]
  );

  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  }, []);

  useEffect(() => {
    if (!onUpdateElement) return;
    const onDocMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && canvasRef.current) {
        const el = elements.find((x) => x.id === drag.elementId);
        const blocks = elements.filter((x) => x.type === 'block');
        const isBlock = el?.type === 'block';
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - drag.startX) / rect.width) * 100;
        const dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) drag.hasMoved = true;
        const b = isBlock ? contentBoundsBlock(drag.width_pct, drag.height_pct) : contentBounds(margins, drag.width_pct, drag.height_pct);
        const newX_pct = Math.max(b.minX, Math.min(b.maxX, drag.startX_pct + dx));
        const newY_pct = Math.max(b.minY, Math.min(b.maxY, drag.startY_pct + dy));
        if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, drag.width_pct, drag.height_pct, blocks, drag.elementId)) return;
        onUpdateElement(drag.elementId, (el) => ({ ...el, x_pct: newX_pct, y_pct: newY_pct }));
        return;
      }
      const resize = resizeRef.current;
      if (resize && canvasRef.current) {
        const el = elements.find((x) => x.id === resize.elementId);
        const blocks = elements.filter((x) => x.type === 'block');
        const isBlock = el?.type === 'block';
        const rect = canvasRef.current.getBoundingClientRect();
        const dx = ((e.clientX - resize.startX) / rect.width) * 100;
        const dy = ((e.clientY - resize.startY) / rect.height) * 100;
        const next = isBlock
          ? applyResizeBlock(resize.handle, dx, dy, resize.startX_pct, resize.startY_pct, resize.startW_pct, resize.startH_pct)
          : applyResize(resize.handle, dx, dy, resize.startX_pct, resize.startY_pct, resize.startW_pct, resize.startH_pct, margins);
        if (!isBlock && overlapsAnyBlock(next.x_pct, next.y_pct, next.width_pct, next.height_pct, blocks, resize.elementId)) return;
        onUpdateElement(resize.elementId, (el) => ({ ...el, ...next }));
      }
    };
    const onDocUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    document.addEventListener('pointermove', onDocMove);
    document.addEventListener('pointerup', onDocUp);
    document.addEventListener('pointercancel', onDocUp);
    return () => {
      document.removeEventListener('pointermove', onDocMove);
      document.removeEventListener('pointerup', onDocUp);
      document.removeEventListener('pointercancel', onDocUp);
    };
  }, [onUpdateElement, margins, elements]);

  const handleDoubleClick = useCallback((e: React.MouseEvent, el: DocElement) => {
    e.stopPropagation();
    if (el.type === 'text') setEditingElementId(el.id);
  }, []);

  const commitInlineEdit = useCallback(() => {
    setEditingElementId(null);
  }, []);

  const selectedElement = selectedElementId
    ? elements.find((e) => e.id === selectedElementId)
    : null;

  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-xl border bg-white overflow-hidden relative">
      <div className="p-3 border-b border-gray-200 text-gray-600 text-sm font-medium">
        Preview
      </div>
      {selectedElement && onUpdateElement && onRemoveElement && !(selectedElement.type === 'block' && !blockAreasVisible) && (
        <ElementOptionsPopover
          element={selectedElement}
          onUpdate={onUpdateElement}
          onRemove={(id) => {
            onRemoveElement(id);
            onCanvasClick?.();
          }}
          onClose={() => onCanvasClick?.()}
          onReplaceImage={onReplaceImage}
        />
      )}
      <div className="flex-1 min-h-0 flex items-start justify-center p-4 overflow-auto">
        <div
          ref={canvasRef}
          className="bg-white shadow-lg rounded-sm overflow-visible relative select-none flex-shrink-0"
          style={{
            aspectRatio: `${A4_ASPECT}`,
            width: '100%',
            minWidth: 280,
            maxWidth: 1200,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingElementId(null);
              onCanvasClick?.();
            }
          }}
        >
          {backgroundUrl && (
            <img
              src={backgroundUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover pointer-events-none rounded-sm"
            />
          )}
          {!backgroundUrl && (
            <div className="absolute inset-0 bg-gray-100 pointer-events-none rounded-sm" />
          )}
          {margins && (
            <>
              {(margins.left_pct ?? 0) > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-gray-900/10 pointer-events-none rounded-l-sm"
                  style={{ width: `${margins.left_pct}%` }}
                />
              )}
              {(margins.right_pct ?? 0) > 0 && (
                <div
                  className="absolute inset-y-0 right-0 bg-gray-900/10 pointer-events-none rounded-r-sm"
                  style={{ width: `${margins.right_pct}%` }}
                />
              )}
              {(margins.top_pct ?? 0) > 0 && (
                <div
                  className="absolute inset-x-0 top-0 bg-gray-900/10 pointer-events-none rounded-t-sm"
                  style={{ height: `${margins.top_pct}%` }}
                />
              )}
              {(margins.bottom_pct ?? 0) > 0 && (
                <div
                  className="absolute inset-x-0 bottom-0 bg-gray-900/10 pointer-events-none rounded-b-sm"
                  style={{ height: `${margins.bottom_pct}%` }}
                />
              )}
            </>
          )}
          {elements.map((el) => {
            if (el.type === 'block' && !blockAreasVisible) return null;
            const x = (el.x_pct ?? 10) / 100;
            const y = (el.y_pct ?? 20) / 100;
            const w = (el.width_pct ?? 80) / 100;
            const h = (el.height_pct ?? 8) / 100;
            const isSelected = selectedElementId === el.id;
            const isEditing = editingElementId === el.id && el.type === 'text';
            const showHandles = isSelected && !isEditing;
            const isBlock = el.type === 'block';
            const isImagePlaceholder = el.type === 'image' && !el.content;

            return (
              <div
                key={el.id}
                onPointerDown={(e) => handlePointerDown(e, el)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, el)}
                onPointerLeave={(e) => {
                  if (dragRef.current?.elementId === el.id) {
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => handleDoubleClick(e, el)}
                className={`absolute border transition-colors rounded ${
                  isEditing ? 'cursor-text overflow-hidden' : 'cursor-move'
                } ${isSelected ? 'ring-2 ring-brand-red border-brand-red overflow-visible' : 'overflow-hidden border-transparent hover:border-gray-300'}`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
              >
                {el.type === 'text' ? (
                  isEditing ? (
                    <textarea
                      autoFocus
                      className="block w-full h-full text-black resize-none overflow-hidden whitespace-pre-wrap break-words p-1 border-0 rounded bg-white/95 focus:outline-none focus:ring-1 focus:ring-brand-red select-text"
                      style={{
                        fontSize: `${Math.max(8, Math.min(72, el.fontSize ?? 12))}px`,
                        textAlign: el.textAlign ?? 'left',
                        fontWeight: el.fontWeight ?? 'normal',
                        fontStyle: el.fontStyle ?? 'normal',
                      }}
                      value={el.content}
                      onChange={(e) => {
                        onUpdateElement?.(el.id, (prev) => ({ ...prev, content: e.target.value }));
                      }}
                      onBlur={commitInlineEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          commitInlineEdit();
                          (e.target as HTMLTextAreaElement).blur();
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitInlineEdit();
                          (e.target as HTMLTextAreaElement).blur();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="block text-black overflow-hidden whitespace-pre-wrap break-words p-1 min-h-[1em]"
                      style={{
                        fontSize: `${Math.max(8, Math.min(72, el.fontSize ?? 12))}px`,
                        textAlign: el.textAlign ?? 'left',
                        fontWeight: el.fontWeight ?? 'normal',
                        fontStyle: el.fontStyle ?? 'normal',
                      }}
                    >
                      {el.content || 'Clique para editar'}
                    </span>
                  )
                ) : el.type === 'block' ? (
                  <div
                    className="w-full h-full rounded bg-amber-500/25 border-2 border-amber-600/50 border-dashed pointer-events-none flex items-center justify-center"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(245,158,11,0.15) 6px, rgba(245,158,11,0.15) 12px)',
                    }}
                  >
                    <span className="text-xs font-medium text-amber-800/80">Bloqueio</span>
                  </div>
                ) : isImagePlaceholder ? (
                  <div className="w-full h-full rounded border-2 border-dashed border-gray-400 bg-gray-50/80 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-gray-500">Área para imagem</span>
                  </div>
                ) : (
                  el.content && (
                    <img
                      src={`/files/${el.content}/thumbnail?w=400`}
                      alt=""
                      className="w-full h-full object-contain pointer-events-none"
                    />
                  )
                )}
                {showHandles &&
                  HANDLES.map(({ position, cursor, dir }) => (
                    <div
                      key={dir}
                      role="presentation"
                      className={`absolute w-3 h-3 rounded-full bg-white border-2 border-brand-red shadow ${position}`}
                      style={{ cursor }}
                      onPointerDown={(e) => handleResizePointerDown(e, el, dir)}
                      onPointerUp={handleResizePointerUp}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
