/** Shape fill patterns for ImageEditor rect/circle annotations. */
export type ShapeFillPattern =
  | 'solid'
  | 'hatch-diag'
  | 'hatch-diag-rev'
  | 'hatch-cross'
  | 'hatch-horiz'
  | 'hatch-vert';

export const SHAPE_FILL_PATTERNS: { id: ShapeFillPattern; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'hatch-diag', label: 'Diagonal \\' },
  { id: 'hatch-diag-rev', label: 'Diagonal /' },
  { id: 'hatch-cross', label: 'Crosshatch' },
  { id: 'hatch-horiz', label: 'Horizontal' },
  { id: 'hatch-vert', label: 'Vertical' },
];

export function hexToRgba(hex: string, opacity: number): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.substring(0, 2), 16) || 0;
  const g = parseInt(full.substring(2, 4), 16) || 0;
  const b = parseInt(full.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

export type ShapeFillGeometry =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export type ShapeFillOptions = {
  enabled: boolean;
  color: string;
  opacity: number;
  pattern: ShapeFillPattern;
  /** Scale hatch spacing (1 = display px; use lenScale on export). */
  scale?: number;
};

function buildShapePath(ctx: CanvasRenderingContext2D, geometry: ShapeFillGeometry) {
  ctx.beginPath();
  if (geometry.kind === 'rect') {
    ctx.rect(geometry.x, geometry.y, geometry.w, geometry.h);
  } else {
    const rx = Math.max(1, geometry.rx);
    const ry = Math.max(1, geometry.ry);
    if (Math.abs(rx - ry) < 1e-6) {
      ctx.arc(geometry.cx, geometry.cy, rx, 0, Math.PI * 2);
    } else {
      ctx.ellipse(geometry.cx, geometry.cy, rx, ry, 0, 0, Math.PI * 2);
    }
  }
}

function hatchBounds(geometry: ShapeFillGeometry): { x: number; y: number; w: number; h: number } {
  if (geometry.kind === 'rect') {
    return {
      x: Math.min(geometry.x, geometry.x + geometry.w),
      y: Math.min(geometry.y, geometry.y + geometry.h),
      w: Math.abs(geometry.w),
      h: Math.abs(geometry.h),
    };
  }
  return {
    x: geometry.cx - geometry.rx,
    y: geometry.cy - geometry.ry,
    w: geometry.rx * 2,
    h: geometry.ry * 2,
  };
}

/** Alternating filled / empty bands (50% duty) for chamfer-like stripes. */
function drawStripeBands(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  pattern: ShapeFillPattern,
  period: number,
  fillStyle: string,
) {
  if (bounds.w < 1 || bounds.h < 1) return;
  const { x, y, w, h } = bounds;
  const band = Math.max(2, period / 2);
  const pad = period * 2;

  ctx.save();
  ctx.fillStyle = fillStyle;

  const fillHorizStripes = () => {
    for (let yy = y - pad; yy <= y + h + pad; yy += period) {
      ctx.fillRect(x - pad, yy, w + pad * 2, band);
    }
  };

  const fillVertStripes = () => {
    for (let xx = x - pad; xx <= x + w + pad; xx += period) {
      ctx.fillRect(xx, y - pad, band, h + pad * 2);
    }
  };

  const fillDiagStripes = (reverse: boolean) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const span = Math.hypot(w, h) + pad * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reverse ? Math.PI / 4 : -Math.PI / 4);
    for (let yy = -span; yy <= span; yy += period) {
      ctx.fillRect(-span, yy, span * 2, band);
    }
    ctx.restore();
  };

  if (pattern === 'hatch-horiz') {
    fillHorizStripes();
  } else if (pattern === 'hatch-vert') {
    fillVertStripes();
  } else if (pattern === 'hatch-cross') {
    fillHorizStripes();
    fillVertStripes();
  } else if (pattern === 'hatch-diag') {
    fillDiagStripes(false);
  } else if (pattern === 'hatch-diag-rev') {
    fillDiagStripes(true);
  }

  ctx.restore();
}

/**
 * Fill a rect/ellipse path (already to be built) then caller strokes the outline.
 * Does nothing when fill is disabled.
 */
export function applyShapeFill(
  ctx: CanvasRenderingContext2D,
  geometry: ShapeFillGeometry,
  options: ShapeFillOptions,
) {
  if (!options.enabled) return;

  const opacity = options.opacity ?? 0.4;
  const color = options.color || '#ffffff';
  const pattern = options.pattern || 'solid';
  const scale = options.scale ?? 1;
  const period = Math.max(6, 10 * scale);
  const fillStyle = hexToRgba(color, opacity);

  ctx.save();
  buildShapePath(ctx, geometry);

  if (pattern === 'solid') {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  } else {
    ctx.clip();
    drawStripeBands(ctx, hatchBounds(geometry), pattern, period, fillStyle);
  }
  ctx.restore();
}

/** Resolve circle/ellipse geometry in the same coordinate space as the item (display or image). */
export function circleGeometryFromItem(it: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
}): ShapeFillGeometry {
  if (it.w !== undefined && it.h !== undefined) {
    return {
      kind: 'ellipse',
      cx: it.x + it.w / 2,
      cy: it.y + it.h / 2,
      rx: Math.abs(it.w) / 2,
      ry: Math.abs(it.h) / 2,
    };
  }
  if (it.rx !== undefined && it.ry !== undefined) {
    return {
      kind: 'ellipse',
      cx: it.x,
      cy: it.y,
      rx: Math.max(1, it.rx),
      ry: Math.max(1, it.ry),
    };
  }
  const r = Math.max(1, it.r || 1);
  return { kind: 'ellipse', cx: it.x, cy: it.y, rx: r, ry: r };
}
