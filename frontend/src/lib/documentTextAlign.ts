import type { DocElement } from '@/types/documentCreator';

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Resolve per-line aligns for display/PDF.
 * Drops stale data where plain text had textAlign left but every lineTextAlign
 * was right (UI used to ignore lineTextAligns for non-rich text, so PDF looked wrong).
 */
export function effectiveLineTextAligns(
  el: Pick<DocElement, 'textAlign' | 'lineTextAligns' | 'richLines'>,
): TextAlign[] | undefined {
  const base: TextAlign = el.textAlign ?? 'left';
  const lta = el.lineTextAligns;
  if (!lta?.length) return undefined;

  const normalized = lta.map((a) => (a === 'center' || a === 'right' || a === 'left' ? a : base));
  const hasRich = !!(el.richLines && el.richLines.length > 0);

  if (!hasRich && base === 'left' && normalized.every((a) => a === 'right')) {
    return undefined;
  }
  if (normalized.every((a) => a === base)) {
    return undefined;
  }
  return normalized;
}

export function lineAlignAt(
  el: Pick<DocElement, 'textAlign' | 'lineTextAligns' | 'richLines'>,
  lineIndex: number,
): TextAlign {
  const lines = effectiveLineTextAligns(el);
  return lines?.[lineIndex] ?? el.textAlign ?? 'left';
}

/** Set horizontal align on the whole box and keep lineTextAligns in sync. */
export function applyUniformTextAlign(el: DocElement, align: TextAlign): DocElement {
  return {
    ...el,
    textAlign: align,
    lineTextAligns: el.lineTextAligns?.length
      ? el.lineTextAligns.map(() => align)
      : undefined,
  };
}
