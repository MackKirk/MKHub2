/**
 * Shared ImagePicker fit geometry for preview + export (Document Creator fit modes).
 * Pan is stored as offsets from the centered layout, normalized by frame size,
 * so the same (zoom, panNorm) works at any frame resolution.
 */

export type ImageFitMode = 'cover' | 'contain' | 'background';

export type ImageRotationDeg = 0 | 90 | 180 | 270;

export function normalizeRotation(deg: number): ImageRotationDeg {
  const n = (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
  return n as ImageRotationDeg;
}

/** Bounding-box size of the image after 90°-step rotation. */
export function rotatedBoxSize(
  imageW: number,
  imageH: number,
  rotation: number,
): { w: number; h: number } {
  const r = normalizeRotation(rotation);
  if (r === 90 || r === 270) return { w: imageH, h: imageW };
  return { w: imageW, h: imageH };
}

/** CSS box for an <img> whose layout rect is the rotated bounding box. */
export function cssBoxForRotatedLayout(
  layout: ImageLayout,
  imageW: number,
  imageH: number,
  rotation: number,
): { left: number; top: number; width: number; height: number; transform: string } {
  const box = rotatedBoxSize(imageW, imageH, rotation);
  const scale = box.w ? layout.drawW / box.w : 1;
  const unrotW = imageW * scale;
  const unrotH = imageH * scale;
  const cx = layout.drawX + layout.drawW / 2;
  const cy = layout.drawY + layout.drawH / 2;
  const r = normalizeRotation(rotation);
  return {
    left: cx - unrotW / 2,
    top: cy - unrotH / 2,
    width: unrotW,
    height: unrotH,
    transform: r ? `rotate(${r}deg)` : 'none',
  };
}

/** Draw the source image into `layout` (rotated bounding box), preserving aspect. */
export function drawImageRotatedInRect(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageW: number,
  imageH: number,
  layout: ImageLayout,
  rotation: number,
): void {
  const r = normalizeRotation(rotation);
  const box = rotatedBoxSize(imageW, imageH, r);
  const scale = box.w ? layout.drawW / box.w : 1;
  const unrotW = imageW * scale;
  const unrotH = imageH * scale;
  ctx.save();
  ctx.translate(layout.drawX + layout.drawW / 2, layout.drawY + layout.drawH / 2);
  if (r) ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(image, -unrotW / 2, -unrotH / 2, unrotW, unrotH);
  ctx.restore();
}

export type ImageLayout = {
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
  scale: number;
};

/** Foreground base scale: cover = max, contain/background = min. */
export function baseScale(
  mode: ImageFitMode,
  frameW: number,
  frameH: number,
  imageW: number,
  imageH: number,
): number {
  if (!imageW || !imageH || !frameW || !frameH) return 1;
  const sx = frameW / imageW;
  const sy = frameH / imageH;
  if (mode === 'cover') return Math.max(sx, sy);
  return Math.min(sx, sy);
}

/**
 * Clamp draw position so:
 * - overflowing axis: frame stays covered (crop allowed)
 * - non-overflowing axis: full image stays visible (letterbox only)
 */
export function clampDrawPosition(
  drawX: number,
  drawY: number,
  drawW: number,
  drawH: number,
  frameW: number,
  frameH: number,
): { x: number; y: number } {
  let x = drawX;
  let y = drawY;

  if (drawW >= frameW - 1e-6) {
    x = Math.min(0, Math.max(frameW - drawW, drawX));
  } else {
    x = Math.max(0, Math.min(frameW - drawW, drawX));
  }

  if (drawH >= frameH - 1e-6) {
    y = Math.min(0, Math.max(frameH - drawH, drawY));
  } else {
    y = Math.max(0, Math.min(frameH - drawH, drawY));
  }

  return { x, y };
}

export function layoutImageInFrame(args: {
  frameW: number;
  frameH: number;
  imageW: number;
  imageH: number;
  mode: ImageFitMode;
  zoom: number;
  /** Offset from center as a fraction of frameW */
  panNormX: number;
  /** Offset from center as a fraction of frameH */
  panNormY: number;
}): ImageLayout {
  const { frameW, frameH, imageW, imageH, mode, zoom, panNormX, panNormY } = args;
  const scale = baseScale(mode, frameW, frameH, imageW, imageH) * Math.max(1, zoom);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const centerX = (frameW - drawW) / 2;
  const centerY = (frameH - drawH) / 2;
  const rawX = centerX + panNormX * frameW;
  const rawY = centerY + panNormY * frameH;
  const { x: drawX, y: drawY } = clampDrawPosition(rawX, rawY, drawW, drawH, frameW, frameH);
  return { drawX, drawY, drawW, drawH, scale };
}

/** Convert absolute draw position back to normalized pan (after clamp). */
export function panNormFromDraw(
  drawX: number,
  drawY: number,
  drawW: number,
  drawH: number,
  frameW: number,
  frameH: number,
): { panNormX: number; panNormY: number } {
  const centerX = (frameW - drawW) / 2;
  const centerY = (frameH - drawH) / 2;
  return {
    panNormX: frameW ? (drawX - centerX) / frameW : 0,
    panNormY: frameH ? (drawY - centerY) / frameH : 0,
  };
}

/** Clamp proposed normalized pan for the given frame/zoom/mode. */
export function clampPanNorm(args: {
  frameW: number;
  frameH: number;
  imageW: number;
  imageH: number;
  mode: ImageFitMode;
  zoom: number;
  panNormX: number;
  panNormY: number;
}): { panNormX: number; panNormY: number } {
  const layout = layoutImageInFrame(args);
  return panNormFromDraw(layout.drawX, layout.drawY, layout.drawW, layout.drawH, args.frameW, args.frameH);
}

/** Centered pan (0, 0). */
export function centeredPanNorm(): { panNormX: number; panNormY: number } {
  return { panNormX: 0, panNormY: 0 };
}

/** Cover layout always centered (background layer). Slight overscale avoids blur edge artifacts. */
export function layoutCoverBackground(args: {
  frameW: number;
  frameH: number;
  imageW: number;
  imageH: number;
  overscale?: number;
}): ImageLayout {
  const overscale = args.overscale ?? 1.12;
  const scale = baseScale('cover', args.frameW, args.frameH, args.imageW, args.imageH) * overscale;
  const drawW = args.imageW * scale;
  const drawH = args.imageH * scale;
  return {
    drawX: (args.frameW - drawW) / 2,
    drawY: (args.frameH - drawH) / 2,
    drawW,
    drawH,
    scale,
  };
}

/** Short human-readable aspect hint for the target frame. */
export function describeAspectRatio(width: number, height: number): string {
  if (!width || !height) return '';
  const r = width / height;
  if (r >= 0.9 && r <= 1.1) return 'Nearly square';
  if (r > 1.1) return 'Wide';
  return 'Tall';
}

/**
 * True when source and target aspect ratios differ enough to warrant a soft hint.
 * Does not change fit mode — UI only.
 */
export function aspectMismatchSignificant(
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  /** Relative difference threshold on aspect ratios (default 15%). */
  threshold = 0.15,
): boolean {
  if (!sourceW || !sourceH || !targetW || !targetH) return false;
  const src = sourceW / sourceH;
  const tgt = targetW / targetH;
  const rel = Math.abs(src - tgt) / Math.max(src, tgt);
  return rel >= threshold;
}
