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

/** Find empty image slots tagged photo_N, sorted by N. */
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
  return out.sort((a, b) => a.index - b.index || a.pageIndex - b.pageIndex);
}

/**
 * Fill Quotation photo_N / caption_N slots from Field Report photos.
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
      imageFit: img.imageFit || 'contain',
    };

    const captionSlot = `caption_${slot.index}`;
    const captionIdx = page.elements.findIndex(
      (el) => el.type === 'text' && slotName(el) === captionSlot
    );
    if (captionIdx >= 0) {
      const cap = page.elements[captionIdx];
      page.elements[captionIdx] = {
        ...cap,
        content: photoCaption(photo),
        fontWeight: cap.fontWeight || 'normal',
        fontSize: cap.fontSize || 10,
        color: cap.color || '#0f172a',
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
      imageFit: 'contain',
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
      fontSize: 10,
      fontWeight: 'normal',
      color: '#0f172a',
    });
    col = col === 0 ? 1 : 0;
    if (col === 0) y = Math.min(70, y + 38);
  }
  return newElements;
}
