import { useRef, useState, useCallback, useEffect, Fragment } from 'react';
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
  /** When true (e.g. editing a document created from a type), block elements are visible but not draggable/resizable/deletable */
  lockBlockElements?: boolean;
  /** When false, do not render the floating ElementOptionsPopover (use external ribbon/toolbar instead). */
  showElementOptionsPopover?: boolean;
  /** Optional: reports current rendered canvas width (px). Useful for export fidelity. */
  onCanvasWidthPxChange?: (widthPx: number) => void;
  /** Optional: called when a user action begins (drag/resize). Useful for undo/redo snapshots. */
  onBeginUserAction?: () => void;
  /** Zoom factor applied to the page canvas (1 = 100%). */
  zoom?: number;
  onElementClick?: (elementId: string, event?: React.PointerEvent) => void;
  onCanvasClick?: () => void;
  /** When array: multi-selection. When empty: none selected. */
  selectedElementIds: string[];
  onUpdateElement?: (elementId: string, updater: (el: DocElement) => DocElement) => void;
  onRemoveElement?: (elementId: string) => void;
  /** For image elements: replace or set image (upload handled by parent) */
  onReplaceImage?: (elementId: string, file: File) => Promise<void>;
};

const A4_ASPECT = 210 / 297;
const MIN_SIZE_PCT = 2;
// Reference width used to keep font sizing stable across window sizes.
// Font sizes are stored in "reference px" and scaled by (canvasWidth / REFERENCE_CANVAS_WIDTH_PX).
const REFERENCE_CANVAS_WIDTH_PX = 910;

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

// --- Snap guides (alignment lines when dragging) ---
const SNAP_THRESHOLD_PCT = 2.5;
/** Only consider alignment to elements in the same "band" (vertical band for vertical lines, horizontal for horizontal). */
const PROXIMITY_BAND_PCT = 18;

function getReferenceLines(
  elements: DocElement[],
  movingIds: string[],
  margins: TemplateMargins | null | undefined,
  movingBbox: { left: number; right: number; top: number; bottom: number }
): { vertical: number[]; horizontal: number[] } {
  const vertical = new Set<number>();
  const horizontal = new Set<number>();
  const { left: mL, right: mR, top: mT, bottom: mB } = movingBbox;
  const L = margins?.left_pct ?? 0;
  const R = margins?.right_pct ?? 0;
  const T = margins?.top_pct ?? 0;
  const B = margins?.bottom_pct ?? 0;
  if (Math.abs(mL - L) <= PROXIMITY_BAND_PCT || Math.abs(mR - (100 - R)) <= PROXIMITY_BAND_PCT) {
    vertical.add(L);
    vertical.add(100 - R);
  }
  if (Math.abs(mT - T) <= PROXIMITY_BAND_PCT || Math.abs(mB - (100 - B)) <= PROXIMITY_BAND_PCT) {
    horizontal.add(T);
    horizontal.add(100 - B);
  }
  elements.forEach((el) => {
    if (movingIds.includes(el.id)) return;
    const x = el.x_pct ?? 10;
    const y = el.y_pct ?? 20;
    const w = el.width_pct ?? 80;
    const h = el.height_pct ?? 8;
    const elRight = x + w;
    const elBottom = y + h;
    const verticalOverlap = elBottom >= mT - PROXIMITY_BAND_PCT && y <= mB + PROXIMITY_BAND_PCT;
    if (verticalOverlap) {
      vertical.add(x);
      vertical.add(x + w / 2);
      vertical.add(elRight);
    }
    const horizontalOverlap = elRight >= mL - PROXIMITY_BAND_PCT && x <= mR + PROXIMITY_BAND_PCT;
    if (horizontalOverlap) {
      horizontal.add(y);
      horizontal.add(y + h / 2);
      horizontal.add(elBottom);
    }
  });
  return {
    vertical: Array.from(vertical),
    horizontal: Array.from(horizontal),
  };
}

function getGroupBbox(
  movingIds: string[],
  startPositions: Record<string, { x_pct: number; y_pct: number }>,
  elements: DocElement[],
  dx: number,
  dy: number
): { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number } {
  let left = 100;
  let right = 0;
  let top = 100;
  let bottom = 0;
  movingIds.forEach((id) => {
    const pos = startPositions[id];
    const el = elements.find((e) => e.id === id);
    if (!pos || !el) return;
    const w = el.width_pct ?? 80;
    const h = el.height_pct ?? 8;
    const x = pos.x_pct + dx;
    const y = pos.y_pct + dy;
    left = Math.min(left, x);
    right = Math.max(right, x + w);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + h);
  });
  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function computeSnap(
  bbox: { left: number; right: number; top: number; bottom: number; centerX: number; centerY: number },
  refV: number[],
  refH: number[],
  dx: number,
  dy: number
): { dx: number; dy: number; guides: { v: number[]; h: number[] } } {
  const guides = { v: [] as number[], h: [] as number[] };
  let outDx = dx;
  let outDy = dy;

  let bestDistV = SNAP_THRESHOLD_PCT + 1;
  for (const V of refV) {
    for (const anchor of [bbox.left, bbox.centerX, bbox.right] as const) {
      const current = anchor + dx;
      const dist = Math.abs(current - V);
      if (dist <= SNAP_THRESHOLD_PCT && dist < bestDistV) {
        bestDistV = dist;
        outDx = V - anchor;
        guides.v = [V];
      }
    }
  }

  let bestDistH = SNAP_THRESHOLD_PCT + 1;
  for (const H of refH) {
    for (const anchor of [bbox.top, bbox.centerY, bbox.bottom] as const) {
      const current = anchor + dy;
      const dist = Math.abs(current - H);
      if (dist <= SNAP_THRESHOLD_PCT && dist < bestDistH) {
        bestDistH = dist;
        outDy = H - anchor;
        guides.h = [H];
      }
    }
  }

  return { dx: outDx, dy: outDy, guides };
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
  lockBlockElements = false,
  showElementOptionsPopover = true,
  onCanvasWidthPxChange,
  onBeginUserAction,
  zoom = 1,
  onElementClick,
  onCanvasClick,
  selectedElementIds,
  onUpdateElement,
  onRemoveElement,
  onReplaceImage,
}: DocumentPreviewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidthPx, setCanvasWidthPx] = useState<number>(REFERENCE_CANVAS_WIDTH_PX);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; startLeft: number; startTop: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  });
  const [spaceDown, setSpaceDown] = useState(false);
  const dragRef = useRef<{
    movingIds: string[];
    startPositions: Record<string, { x_pct: number; y_pct: number }>;
    startX: number;
    startY: number;
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
    hasResized: boolean;
  } | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  /** Guide lines shown during drag when snapping to other elements/margins */
  const [dragGuideLines, setDragGuideLines] = useState<{ v: number[]; h: number[] } | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width || REFERENCE_CANVAS_WIDTH_PX;
      setCanvasWidthPx(w);
      // Report logical (unzoomed) canvas width for export fidelity.
      onCanvasWidthPxChange?.(w / Math.max(0.01, zoom));
    };
    update();
    // Keep it stable across resizes so wrapping/size doesn't change relative to the page.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }
    // Fallback for older browsers/environments without ResizeObserver
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [onCanvasWidthPxChange, zoom]);

  // Spacebar pan (like design tools). We don't intercept when typing.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (t?.isContentEditable ?? false);
      if (isTyping) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (el.locked) return;
      if (el.type === 'block' && lockBlockElements) return;
      const target = e.target as HTMLElement;
      if (target.closest('textarea') || target.closest('input')) return;
      // When element has lockPosition, we don't move it but still capture so we can select on click (movingIds = [])
      const movingIds = el.lockPosition
        ? []
        : selectedElementIds.includes(el.id)
          ? selectedElementIds.filter((id) => {
              const o = elements.find((x) => x.id === id);
              return o && !o.locked && !o.lockPosition;
            })
          : [el.id];
      const startPositions: Record<string, { x_pct: number; y_pct: number }> = {};
      movingIds.forEach((id) => {
        const o = elements.find((x) => x.id === id);
        if (o) startPositions[id] = { x_pct: o.x_pct ?? 10, y_pct: o.y_pct ?? 20 };
      });
      dragRef.current = {
        movingIds,
        startPositions,
        startX: e.clientX,
        startY: e.clientY,
        hasMoved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [selectedElementIds, elements]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, el: DocElement, handle: ResizeHandle) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (el.locked) return;
      if (el.lockPosition) return;
      if (el.type === 'block' && lockBlockElements) return;
      resizeRef.current = {
        elementId: el.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startX_pct: el.x_pct ?? 10,
        startY_pct: el.y_pct ?? 20,
        startW_pct: el.width_pct ?? 80,
        startH_pct: el.height_pct ?? 8,
        hasResized: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [lockBlockElements],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !canvasRef.current || !onUpdateElement) return;
      const rect = canvasRef.current.getBoundingClientRect();
      let dx = ((e.clientX - drag.startX) / rect.width) * 100;
      let dy = ((e.clientY - drag.startY) / rect.height) * 100;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const bbox = getGroupBbox(drag.movingIds, drag.startPositions, elements, dx, dy);
      const { vertical: refV, horizontal: refH } = getReferenceLines(elements, drag.movingIds, margins, bbox);
      const snapped = computeSnap(bbox, refV, refH, dx, dy);
      // Show guide lines when close to alignment, but do not snap (use raw dx, dy)
      const hasGuides = snapped.guides.v.length > 0 || snapped.guides.h.length > 0;
      setDragGuideLines(hasGuides ? snapped.guides : null);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) drag.hasMoved = true;
      const blocks = elements.filter((x) => x.type === 'block');
      drag.movingIds.forEach((elementId) => {
        const el = elements.find((x) => x.id === elementId);
        if (!el) return;
        const pos = drag.startPositions[elementId];
        if (!pos) return;
        const isBlock = el.type === 'block';
        const w = el.width_pct ?? 80;
        const h = el.height_pct ?? 8;
        const b = isBlock ? contentBoundsBlock(w, h) : contentBounds(margins, w, h);
        const newX_pct = Math.max(b.minX, Math.min(b.maxX, pos.x_pct + dx));
        const newY_pct = Math.max(b.minY, Math.min(b.maxY, pos.y_pct + dy));
        if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, w, h, blocks, elementId)) return;
        onUpdateElement(elementId, (prev) => ({ ...prev, x_pct: newX_pct, y_pct: newY_pct }));
      });
    },
    [onUpdateElement, margins, elements]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent, el: DocElement) => {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      const drag = dragRef.current;
      dragRef.current = null;
      setDragGuideLines(null);
      // Select on click: either we were dragging this element and didn't move, or we clicked with lockPosition (movingIds empty)
      if (drag && !drag.hasMoved && (drag.movingIds.includes(el.id) || drag.movingIds.length === 0)) {
        onElementClick?.(el.id, e);
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
        const rect = canvasRef.current.getBoundingClientRect();
        let dx = ((e.clientX - drag.startX) / rect.width) * 100;
        let dy = ((e.clientY - drag.startY) / rect.height) * 100;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const bbox = getGroupBbox(drag.movingIds, drag.startPositions, elements, dx, dy);
        const { vertical: refV, horizontal: refH } = getReferenceLines(elements, drag.movingIds, margins, bbox);
        const snapped = computeSnap(bbox, refV, refH, dx, dy);
        const hasGuides = snapped.guides.v.length > 0 || snapped.guides.h.length > 0;
        setDragGuideLines(hasGuides ? snapped.guides : null);
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          if (!drag.hasMoved) onBeginUserAction?.();
          drag.hasMoved = true;
        }
        const blocks = elements.filter((x) => x.type === 'block');
        drag.movingIds.forEach((elementId) => {
          const el = elements.find((x) => x.id === elementId);
          if (!el) return;
          const pos = drag.startPositions[elementId];
          if (!pos) return;
          const isBlock = el.type === 'block';
          const w = el.width_pct ?? 80;
          const h = el.height_pct ?? 8;
          const b = isBlock ? contentBoundsBlock(w, h) : contentBounds(margins, w, h);
          const newX_pct = Math.max(b.minX, Math.min(b.maxX, pos.x_pct + dx));
          const newY_pct = Math.max(b.minY, Math.min(b.maxY, pos.y_pct + dy));
          if (!isBlock && overlapsAnyBlock(newX_pct, newY_pct, w, h, blocks, elementId)) return;
          onUpdateElement(elementId, (prev) => ({ ...prev, x_pct: newX_pct, y_pct: newY_pct }));
        });
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
        if (!resize.hasResized && (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2)) {
          onBeginUserAction?.();
          resize.hasResized = true;
        }
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
      setDragGuideLines(null);
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
    if (el.locked) return;
    if (el.type === 'text') setEditingElementId(el.id);
  }, []); // lockPosition does not block double-click to edit

  const commitInlineEdit = useCallback(() => {
    setEditingElementId(null);
  }, []);

  const selectedElement = selectedElementIds.length === 1 ? elements.find((e) => e.id === selectedElementIds[0]) : null;

  return (
    <div className="flex-1 flex flex-col min-w-0 rounded-xl border bg-white overflow-hidden relative">
      <div className="p-3 border-b border-gray-200 text-gray-600 text-sm font-medium">
        Preview
      </div>
      {showElementOptionsPopover &&
        selectedElement &&
        onUpdateElement &&
        onRemoveElement &&
        !(selectedElement.type === 'block' && !blockAreasVisible) &&
        !(selectedElement.type === 'block' && lockBlockElements) && (
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
      <div
        ref={scrollRef}
        className={`flex-1 min-h-0 flex items-start justify-center p-4 overflow-auto ${spaceDown ? 'cursor-grab' : ''}`}
        onPointerDown={(e) => {
          if (!spaceDown || e.button !== 0) return;
          const sc = scrollRef.current;
          if (!sc) return;
          panRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: sc.scrollLeft,
            startTop: sc.scrollTop,
          };
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const sc = scrollRef.current;
          if (!sc || !panRef.current.active) return;
          sc.scrollLeft = panRef.current.startLeft - (e.clientX - panRef.current.startX);
          sc.scrollTop = panRef.current.startTop - (e.clientY - panRef.current.startY);
        }}
        onPointerUp={(e) => {
          if (!panRef.current.active) return;
          panRef.current.active = false;
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        }}
        onPointerCancel={() => {
          panRef.current.active = false;
        }}
      >
        <div
          ref={canvasRef}
          className="bg-white shadow-lg rounded-sm overflow-visible relative select-none flex-shrink-0"
          style={{
            aspectRatio: `${A4_ASPECT}`,
            width: `${Math.max(0.25, zoom) * 100}%`,
            minWidth: 280 * zoom,
            maxWidth: 1200 * zoom,
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
            const isSelected = selectedElementIds.includes(el.id);
            const isEditing = editingElementId === el.id && el.type === 'text' && !el.locked;
            const isBlock = el.type === 'block';
            const isLocked = !!el.locked;
            const isPositionLocked = !!el.lockPosition;
            const showHandles = isSelected && !isEditing && !(isBlock && lockBlockElements) && !isLocked && !isPositionLocked && selectedElementIds.length === 1;
            const isImagePlaceholder = el.type === 'image' && !el.content;

            return (
              <Fragment key={el.id}>
              <div
                onPointerDown={(e) => handlePointerDown(e, el)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, el)}
                onPointerLeave={(e) => {
                  if (dragRef.current?.movingIds.includes(el.id)) {
                    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => handleDoubleClick(e, el)}
                className={`absolute border transition-colors rounded ${
                  isEditing ? 'cursor-text overflow-hidden' : isLocked ? 'cursor-default overflow-hidden' : isPositionLocked ? 'cursor-default overflow-hidden' : isBlock && lockBlockElements ? 'cursor-default overflow-hidden' : 'cursor-move'
                } ${isSelected ? 'ring-2 ring-brand-red border-brand-red overflow-visible' : 'overflow-hidden border-transparent hover:border-gray-300'}`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
              >
                {el.type === 'text' ? (
                  (() => {
                    const va = el.verticalAlign ?? 'top';
                    const justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
                    const scale = canvasWidthPx / REFERENCE_CANVAS_WIDTH_PX;
                    const refFontSize = Math.max(8, Math.min(72, el.fontSize ?? 12));
                    const textStyle = {
                      fontSize: `${Math.max(6, refFontSize * scale)}px`,
                      textAlign: el.textAlign ?? 'left',
                      fontWeight: el.fontWeight ?? 'normal',
                      fontStyle: el.fontStyle ?? 'normal',
                      fontFamily: el.fontFamily === 'Open Sans' ? '"Open Sans", sans-serif' : '"Montserrat", sans-serif',
                      color: el.color ?? '#000000',
                    };
                    return (
                      <div className="w-full h-full flex flex-col" style={{ justifyContent }}>
                        {isEditing ? (
                          <textarea
                            autoFocus
                            className="block w-full flex-1 min-h-0 resize-none overflow-hidden whitespace-pre-wrap break-words p-1 border-0 rounded bg-white/95 focus:outline-none focus:ring-1 focus:ring-brand-red select-text"
                            style={textStyle}
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
                            className="block overflow-hidden whitespace-pre-wrap break-words p-1 min-h-[1em]"
                            style={textStyle}
                          >
                            {el.content || 'Clique para editar'}
                          </span>
                        )}
                      </div>
                    );
                  })()
                ) : el.type === 'block' ? (
                  <div
                    className="w-full h-full rounded bg-amber-500/25 border-2 border-amber-600/50 border-dashed pointer-events-none flex items-center justify-center"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(245,158,11,0.15) 6px, rgba(245,158,11,0.15) 12px)',
                    }}
                  >
                    <span className="text-xs font-medium text-amber-800/80">Blocked area</span>
                  </div>
                ) : isImagePlaceholder ? (
                  <div className="w-full h-full rounded border-2 border-dashed border-gray-400 bg-gray-50/80 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-gray-500">Image area</span>
                  </div>
                ) : (
                  el.content && (
                    <img
                      src={`/files/${el.content}/thumbnail?w=400`}
                      alt=""
                      className="w-full h-full pointer-events-none"
                      style={{
                        objectFit: el.imageFit ?? 'contain',
                        objectPosition: el.imagePosition ?? '50% 50%',
                      }}
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
              {isSelected && isPositionLocked && !isBlock && onUpdateElement && (
                <div
                  className="absolute flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-sky-50 border border-sky-200 shadow-sm pointer-events-auto z-10"
                  style={{
                    left: `${x * 100}%`,
                    top: `${(y + h) * 100 + 0.3}%`,
                    width: `${w * 100}%`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-xs text-sky-800 flex-1 min-w-0 truncate">
                    This element has movement blocked.
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateElement(el.id, (prev) => ({ ...prev, lockPosition: false }));
                    }}
                    className="flex-shrink-0 px-2 py-1 rounded text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 border-0"
                  >
                    Unblock
                  </button>
                </div>
              )}
            </Fragment>
            );
          })}
          {/* Snap guide lines (alignment references while dragging) */}
          {dragGuideLines && (
            <div className="absolute inset-0 pointer-events-none rounded-sm" aria-hidden>
              {dragGuideLines.v.map((pct) => (
                <div
                  key={`v-${pct}`}
                  className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 bg-brand-red/80"
                  style={{ left: `${pct}%` }}
                />
              ))}
              {dragGuideLines.h.map((pct) => (
                <div
                  key={`h-${pct}`}
                  className="absolute left-0 right-0 h-0.5 -translate-y-1/2 bg-brand-red/80"
                  style={{ top: `${pct}%` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
