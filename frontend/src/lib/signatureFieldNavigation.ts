import { parseCurrencyAmount } from '@/lib/currencyFormat';
import { pdfRectToOverlayStyle, type PdfRect } from '@/lib/pdfCoordinates';

export type SignatureTemplateField = {
  id: string;
  type: string;
  page_index: number;
  rect: PdfRect;
  field_name: string;
  required: boolean;
  assignee?: string;
  employee_info_key?: string;
};

export type PageSize = { width: number; height: number };

const DEFAULT_PAGE_HEIGHT = 792;

export function fieldHasValue(
  f: SignatureTemplateField,
  values: Record<string, string | boolean>,
): boolean {
  if (f.type === 'employee_info') {
    const v = values[f.id];
    return typeof v === 'string' && v.trim().length > 0;
  }
  if (f.type === 'value') {
    const raw = String(values[f.id] ?? '').trim();
    if (!raw) return !f.required;
    return parseCurrencyAmount(raw) !== null;
  }
  if (f.type === 'date') {
    const v = values[f.id];
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
  }
  const v = values[f.id];
  if (f.type === 'checkbox') {
    return v === true;
  }
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

export function fieldOverlayTop(
  field: SignatureTemplateField,
  pageSizes: PageSize[],
  defaultPageHeight = DEFAULT_PAGE_HEIGHT,
): number {
  const pageHeight = pageSizes[field.page_index]?.height ?? defaultPageHeight;
  return pageHeight - field.rect.y - field.rect.height;
}

export function sortFieldsForNavigation(
  fields: SignatureTemplateField[],
  pageSizes: PageSize[] = [],
  defaultPageHeight = DEFAULT_PAGE_HEIGHT,
): SignatureTemplateField[] {
  return [...fields].sort((a, b) => {
    if (a.page_index !== b.page_index) return a.page_index - b.page_index;
    const topA = fieldOverlayTop(a, pageSizes, defaultPageHeight);
    const topB = fieldOverlayTop(b, pageSizes, defaultPageHeight);
    if (topA !== topB) return topA - topB;
    return a.rect.x - b.rect.x;
  });
}

export function getUnfilledFields(
  fields: SignatureTemplateField[],
  values: Record<string, string | boolean>,
  pageSizes: PageSize[] = [],
): SignatureTemplateField[] {
  return sortFieldsForNavigation(fields, pageSizes).filter((f) => !fieldHasValue(f, values));
}

export function getNextUnfilledFieldId(
  fields: SignatureTemplateField[],
  values: Record<string, string | boolean>,
  selectedFieldId: string | null,
  pageSizes: PageSize[] = [],
): string | null {
  const unfilled = getUnfilledFields(fields, values, pageSizes);
  if (unfilled.length === 0) return null;
  if (!selectedFieldId) return unfilled[0].id;
  const idx = unfilled.findIndex((f) => f.id === selectedFieldId);
  if (idx === -1) return unfilled[0].id;
  return unfilled[(idx + 1) % unfilled.length].id;
}

/** Scroll offset (px from top of scroll container) to center a field overlay. */
export function fieldScrollTopPx(
  field: SignatureTemplateField,
  pageSizes: PageSize[],
  scale: number,
  containerClientHeight: number,
  defaultPageHeight = DEFAULT_PAGE_HEIGHT,
): number {
  const pageHeight = pageSizes[field.page_index]?.height ?? defaultPageHeight;
  const overlay = pdfRectToOverlayStyle(field.rect, pageHeight, scale);
  const pageGap = 16;
  const pageOffset = field.page_index * (pageHeight * scale + pageGap);
  const fieldCenter = pageOffset + overlay.top + overlay.height / 2;
  return Math.max(0, fieldCenter - containerClientHeight / 2);
}
