import type { DocElement, DocumentPage } from '@/types/documentCreator';
import { createImageElement, createTextElement } from '@/types/documentCreator';
import type { FieldworkPhotoObservation } from '@/types/fieldwork';

function slotName(el: DocElement | undefined | null): string {
  const raw = el?.meta?.slot;
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function photoCaption(p: FieldworkPhotoObservation): string {
  const phrase = (p.phrase_text_snapshot || '').trim();
  const notes = (p.extra_notes || '').trim();
  if (phrase && notes) return `${phrase}\n${notes}`;
  return phrase || notes || 'Field photo';
}

function parsePhotoSlotIndex(slot: string): number | null {
  const m = /^photo_(\d+)$/.exec(slot);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

type PhotoSlotRef = {
  pageIndex: number;
  elementIndex: number;
  index: number;
};

export function pageHasFieldReportPhotoSlots(page: DocumentPage | null | undefined): boolean {
  return (page?.elements || []).some((el) => el.type === 'image' && parsePhotoSlotIndex(slotName(el)) != null);
}

/** Count unique photo_N indices on a page (empty or filled). */
export function countPhotoSlotsOnPage(page: DocumentPage | null | undefined): number {
  const idxs = new Set<number>();
  for (const el of page?.elements || []) {
    if (el.type !== 'image') continue;
    const idx = parsePhotoSlotIndex(slotName(el));
    if (idx != null) idxs.add(idx);
  }
  return idxs.size;
}

/** Pages from a document type that carry photo_N slots (skip covers without slots). */
export function extractFieldReportLayoutPages(
  pages: DocumentPage[]
): DocumentPage[] {
  return pages.filter((p) => pageHasFieldReportPhotoSlots(p));
}

function newElementId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isCaptionSlot(el: DocElement): boolean {
  return el.type === 'text' && /^caption_\d+$/i.test(slotName(el));
}

/** Promote visible rich-run styles onto the element (preview inherits element styles once richLines are cleared). */
function withCaptionTypographyPreserved(el: DocElement): DocElement {
  const sampleRun = (el.richLines || [])
    .flat()
    .find(
      (r) =>
        r &&
        typeof r.text === 'string' &&
        r.text.length > 0 &&
        r.kind !== 'signature' &&
        r.kind !== 'date',
    );
  if (!sampleRun) return el;
  return {
    ...el,
    fontWeight:
      sampleRun.bold === true ? 'bold' : sampleRun.bold === false ? 'normal' : el.fontWeight,
    fontStyle:
      sampleRun.italic === true
        ? 'italic'
        : sampleRun.italic === false
          ? 'normal'
          : el.fontStyle,
    fontSize:
      typeof sampleRun.fontSize === 'number' && sampleRun.fontSize > 0
        ? sampleRun.fontSize
        : el.fontSize,
    fontFamily: sampleRun.fontFamily || el.fontFamily,
    color: sampleRun.color || el.color,
  };
}

/** Deep-clone a page with fresh element ids (keeps slot meta). */
export function cloneDocumentPage(page: DocumentPage): DocumentPage {
  return {
    template_id: page.template_id ?? null,
    margins: page.margins ? { ...page.margins } : page.margins,
    elements: (page.elements || []).map((el) => {
      const clearCaption = isCaptionSlot(el);
      const clearPhoto =
        el.type === 'image' && parsePhotoSlotIndex(slotName(el)) != null;
      const base = clearCaption ? withCaptionTypographyPreserved(el) : el;
      return {
        ...base,
        id: newElementId(el.type || 'el'),
        meta: base.meta ? { ...base.meta } : base.meta,
        // Caption slots must drop richLines too — preview prefers richLines over content.
        richLines: clearCaption
          ? undefined
          : base.richLines
            ? base.richLines.map((line) => line.map((r) => ({ ...r })))
            : base.richLines,
        lineListStyles: clearCaption
          ? undefined
          : base.lineListStyles
            ? [...base.lineListStyles]
            : base.lineListStyles,
        lineTextAligns: base.lineTextAligns ? [...base.lineTextAligns] : base.lineTextAligns,
        content: clearPhoto || clearCaption ? '' : base.content,
      };
    }),
  };
}

/** Find empty image slots tagged photo_N. Page-major order (fill one page fully, then next). */
export function listEmptyPhotoSlots(pages: DocumentPage[]): PhotoSlotRef[] {
  const out: PhotoSlotRef[] = [];
  pages.forEach((page, pageIndex) => {
    (page.elements || []).forEach((el, elementIndex) => {
      if (el.type !== 'image') return;
      if (String(el.content || '').trim()) return;
      const idx = parsePhotoSlotIndex(slotName(el));
      if (idx == null) return;
      out.push({ pageIndex, elementIndex, index: idx });
    });
  });
  return out.sort((a, b) => a.pageIndex - b.pageIndex || a.index - b.index);
}

/**
 * Fill photo_N / caption_N slots from Field Report photos.
 * Returns updated pages, how many slots were filled, and leftover photos.
 */
export function fillFieldReportPhotoSlots(
  pages: DocumentPage[],
  photos: FieldworkPhotoObservation[]
): { pages: DocumentPage[]; filledCount: number; overflow: FieldworkPhotoObservation[] } {
  const usable = photos.filter((p) => String(p.file_object_id || '').trim());
  if (!usable.length) {
    return { pages, filledCount: 0, overflow: [] };
  }

  const slots = listEmptyPhotoSlots(pages);
  if (!slots.length) {
    return { pages, filledCount: 0, overflow: usable };
  }

  const nextPages = pages.map((p) => ({
    ...p,
    elements: (p.elements || []).map((el) => ({ ...el, meta: el.meta ? { ...el.meta } : el.meta })),
  }));

  let filledCount = 0;
  let photoCursor = 0;

  for (const slot of slots) {
    if (photoCursor >= usable.length) break;
    const photo = usable[photoCursor];
    photoCursor += 1;
    const page = nextPages[slot.pageIndex];
    if (!page?.elements) continue;
    const img = page.elements[slot.elementIndex];
    if (!img || img.type !== 'image') continue;

    page.elements[slot.elementIndex] = {
      ...img,
      content: String(photo.file_object_id),
      // Field photos look best filling the slot (crop edges) rather than letterboxing.
      imageFit: 'cover',
    };

    const captionSlot = `caption_${slot.index}`;
    const captionIdx = page.elements.findIndex(
      (el) => el.type === 'text' && slotName(el) === captionSlot
    );
    if (captionIdx >= 0) {
      const cap = withCaptionTypographyPreserved(page.elements[captionIdx]);
      page.elements[captionIdx] = {
        ...cap,
        content: photoCaption(photo),
        // Preview renders richLines when present — must clear template placeholder runs.
        richLines: undefined,
        lineListStyles: undefined,
      };
    }
    filledCount += 1;
  }

  return {
    pages: nextPages,
    filledCount,
    overflow: usable.slice(photoCursor),
  };
}

/**
 * Build enough clones of the layout unit to hold all photos, then fill slots.
 * `layoutPages` should be the photo-slot page(s) from a Field Report document type.
 */
export function buildFilledFieldReportPages(
  layoutPages: DocumentPage[],
  photos: FieldworkPhotoObservation[]
): { pages: DocumentPage[]; filledCount: number; overflow: FieldworkPhotoObservation[] } {
  const unit = layoutPages.filter((p) => pageHasFieldReportPhotoSlots(p));
  if (!unit.length) {
    return { pages: [], filledCount: 0, overflow: photos.filter((p) => String(p.file_object_id || '').trim()) };
  }
  const slotsPerUnit = unit.reduce((n, p) => n + countPhotoSlotsOnPage(p), 0);
  if (slotsPerUnit <= 0) {
    return { pages: [], filledCount: 0, overflow: photos.filter((p) => String(p.file_object_id || '').trim()) };
  }
  const usable = photos.filter((p) => String(p.file_object_id || '').trim());
  const copies = Math.max(1, Math.ceil(usable.length / slotsPerUnit));
  const blank: DocumentPage[] = [];
  for (let c = 0; c < copies; c++) {
    for (const page of unit) blank.push(cloneDocumentPage(page));
  }
  return fillFieldReportPhotoSlots(blank, usable);
}

/** Free-form dump used when no slots (or for overflow). Two-column layout on one page. */
export function buildOverflowPhotoElements(
  photos: FieldworkPhotoObservation[],
  idPrefix = 'fw'
): DocElement[] {
  const newElements: DocElement[] = [];
  let y = 8;
  const colW = 42;
  let col = 0;
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const fileId = String(p.file_object_id || '').trim();
    if (!fileId) continue;
    const x = col === 0 ? 8 : 52;
    const imgBase = createImageElement(fileId);
    newElements.push({
      ...imgBase,
      id: `${idPrefix}-${Date.now()}-${i}-img-${Math.random().toString(36).slice(2, 7)}`,
      x_pct: x,
      y_pct: y,
      width_pct: colW,
      height_pct: 26,
      imageFit: 'cover',
    });
    const textBase = createTextElement();
    newElements.push({
      ...textBase,
      id: `${idPrefix}-${Date.now()}-${i}-txt-${Math.random().toString(36).slice(2, 7)}`,
      content: photoCaption(p),
      x_pct: x,
      y_pct: Math.min(92, y + 27),
      width_pct: colW,
      height_pct: 8,
      fontSize: 12,
      fontWeight: 'normal',
      color: '#0f172a',
    });
    col = col === 0 ? 1 : 0;
    if (col === 0) y = Math.min(70, y + 38);
  }
  return newElements;
}
