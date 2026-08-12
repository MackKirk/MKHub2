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
