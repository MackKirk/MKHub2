/**
 * PDF user space: origin bottom-left, units points (matches backend ReportLab).
 * CSS overlays: origin top-left of each page container.
 */

export type PdfRect = { x: number; y: number; width: number; height: number };

/** Position/size for absolutely-positioned overlay on a page wrapper (px). */
export function pdfRectToOverlayStyle(
  rect: PdfRect,
  pageHeightPt: number,
  scale: number,
): { left: number; top: number; width: number; height: number } {
  const left = rect.x * scale;
  const top = (pageHeightPt - rect.y - rect.height) * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { left, top, width, height };
}

/** Convert overlay box (px, top-left) back to PDF rect (bottom-left). */
export function overlayPxToPdfRect(
  left: number,
  top: number,
  width: number,
  height: number,
  pageHeightPt: number,
  scale: number,
): PdfRect {
  return {
    x: left / scale,
    y: pageHeightPt - top / scale - height / scale,
    width: width / scale,
    height: height / scale,
  };
}
