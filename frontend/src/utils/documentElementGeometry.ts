/** Reference canvas width used for stable px ↔ % conversion (independent of zoom). */
export const DOCUMENT_REF_WIDTH_PX = 910;
export const DOCUMENT_A4_HEIGHT_RATIO = 297 / 210;
export const DOCUMENT_REF_HEIGHT_PX = DOCUMENT_REF_WIDTH_PX * DOCUMENT_A4_HEIGHT_RATIO;

export const DOCUMENT_MIN_SIZE_PCT = 2;

export type PageMarginsPct = {
  left_pct?: number;
  right_pct?: number;
  top_pct?: number;
  bottom_pct?: number;
};

export type ElementGeometryPct = {
  x_pct: number;
  y_pct: number;
  width_pct: number;
  height_pct: number;
};

export type ElementGeometryPx = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function pctToPxX(x_pct: number): number {
  return (x_pct / 100) * DOCUMENT_REF_WIDTH_PX;
}

export function pctToPxY(y_pct: number): number {
  return (y_pct / 100) * DOCUMENT_REF_HEIGHT_PX;
}

export function pctToPxW(width_pct: number): number {
  return (width_pct / 100) * DOCUMENT_REF_WIDTH_PX;
}

export function pctToPxH(height_pct: number): number {
  return (height_pct / 100) * DOCUMENT_REF_HEIGHT_PX;
}

export function pxToPctX(x: number): number {
  return (x / DOCUMENT_REF_WIDTH_PX) * 100;
}

export function pxToPctY(y: number): number {
  return (y / DOCUMENT_REF_HEIGHT_PX) * 100;
}

export function pxToPctW(width: number): number {
  return (width / DOCUMENT_REF_WIDTH_PX) * 100;
}

export function pxToPctH(height: number): number {
  return (height / DOCUMENT_REF_HEIGHT_PX) * 100;
}

export function geometryPctToPx(g: ElementGeometryPct): ElementGeometryPx {
  return {
    x: pctToPxX(g.x_pct),
    y: pctToPxY(g.y_pct),
    width: pctToPxW(g.width_pct),
    height: pctToPxH(g.height_pct),
  };
}

function contentBounds(
  margins: PageMarginsPct | null | undefined,
  w: number,
  h: number,
  isBlock: boolean,
) {
  if (isBlock) {
    return {
      minX: 0,
      maxX: Math.max(0, 100 - w),
      minY: 0,
      maxY: Math.max(0, 100 - h),
    };
  }
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

/** Clamp geometry in % after editing px fields. */
export function clampGeometryPct(
  next: ElementGeometryPct,
  opts: { margins?: PageMarginsPct | null; isBlock?: boolean },
): ElementGeometryPct {
  const isBlock = !!opts.isBlock;
  const L = opts.margins?.left_pct ?? 0;
  const R = opts.margins?.right_pct ?? 0;
  const T = opts.margins?.top_pct ?? 0;
  const B = opts.margins?.bottom_pct ?? 0;
  const maxW = isBlock ? 100 : 100 - L - R;
  const maxH = isBlock ? 100 : 100 - T - B;
  const width_pct = Math.max(DOCUMENT_MIN_SIZE_PCT, Math.min(maxW, next.width_pct));
  const height_pct = Math.max(DOCUMENT_MIN_SIZE_PCT, Math.min(maxH, next.height_pct));
  const b = contentBounds(opts.margins, width_pct, height_pct, isBlock);
  return {
    width_pct,
    height_pct,
    x_pct: Math.max(b.minX, Math.min(b.maxX, next.x_pct)),
    y_pct: Math.max(b.minY, Math.min(b.maxY, next.y_pct)),
  };
}

export function docElementRotationDeg(rotation: number | null | undefined): number {
  return typeof rotation === 'number' && Number.isFinite(rotation) ? rotation : 0;
}

export function docElementRotateStyle(rotationDeg: number): {
  transform?: string;
  transformOrigin?: string;
} {
  if (!rotationDeg) return {};
  return { transform: `rotate(${rotationDeg}deg)`, transformOrigin: 'center center' };
}

export function rotatePointerDeltaToLocal(
  dxPx: number,
  dyPx: number,
  rotationDeg: number,
): { dx: number; dy: number } {
  if (!rotationDeg) return { dx: dxPx, dy: dyPx };
  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dxPx * cos - dyPx * sin, dy: dxPx * sin + dyPx * cos };
}

const RESIZE_HANDLE_ORDER = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const RESIZE_HANDLE_CURSORS = [
  'nw-resize',
  'n-resize',
  'ne-resize',
  'e-resize',
  'se-resize',
  's-resize',
  'sw-resize',
  'w-resize',
] as const;

/** Custom rotate cursor (user icon, black, compact). Hotspot at center. */
export const ROTATE_CURSOR = 'url("/ui/assets/icons/rotate-cursor.png?v=5") 12 12, crosshair';

export function resizeCursorForDocRotation(dir: string, rotationDeg: number): string {
  const idx = RESIZE_HANDLE_ORDER.indexOf(dir as (typeof RESIZE_HANDLE_ORDER)[number]);
  if (idx < 0) return 'default';
  const steps = Math.round(((((rotationDeg % 360) + 360) % 360) / 45)) % 8;
  return RESIZE_HANDLE_CURSORS[(idx + steps) % 8];
}

type BoxPct = { x: number; y: number; w: number; h: number };

function oppositeHandleAnchorPct(box: BoxPct, handle: string): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  switch (handle) {
    case 'e':
      return { x: box.x, y: cy };
    case 'w':
      return { x: box.x + box.w, y: cy };
    case 'n':
      return { x: cx, y: box.y + box.h };
    case 's':
      return { x: cx, y: box.y };
    case 'ne':
      return { x: box.x, y: box.y + box.h };
    case 'nw':
      return { x: box.x + box.w, y: box.y + box.h };
    case 'se':
      return { x: box.x, y: box.y };
    case 'sw':
      return { x: box.x + box.w, y: box.y };
    default:
      return { x: cx, y: cy };
  }
}

function rotatePxAround(x: number, y: number, cx: number, cy: number, deg: number): { x: number; y: number } {
  if (!deg) return { x, y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Keep the opposite handle fixed in screen space when resizing a rotated box. */
export function shiftToKeepHandleAnchorPct(
  oldBox: BoxPct,
  newBox: BoxPct,
  handle: string,
  rotationDeg: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  if (!rotationDeg || !canvasW || !canvasH) return { x: 0, y: 0 };
  const oldA = oppositeHandleAnchorPct(oldBox, handle);
  const newA = oppositeHandleAnchorPct(newBox, handle);
  const oldC = {
    cx: ((oldBox.x + oldBox.w / 2) / 100) * canvasW,
    cy: ((oldBox.y + oldBox.h / 2) / 100) * canvasH,
  };
  const newC = {
    cx: ((newBox.x + newBox.w / 2) / 100) * canvasW,
    cy: ((newBox.y + newBox.h / 2) / 100) * canvasH,
  };
  const oldW = rotatePxAround((oldA.x / 100) * canvasW, (oldA.y / 100) * canvasH, oldC.cx, oldC.cy, rotationDeg);
  const newW = rotatePxAround((newA.x / 100) * canvasW, (newA.y / 100) * canvasH, newC.cx, newC.cy, rotationDeg);
  return {
    x: ((oldW.x - newW.x) / canvasW) * 100,
    y: ((oldW.y - newW.y) / canvasH) * 100,
  };
}
