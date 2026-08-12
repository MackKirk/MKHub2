import type { DocElement } from '@/types/documentCreator';

export const DOCUMENT_CREATOR_CLIPBOARD_KEY = 'mkhub.documentCreator.clipboard';

type ClipboardPayloadV1 = {
  v: 1;
  elements: DocElement[];
};

export function writeDocumentCreatorClipboard(elements: DocElement[]): void {
  const payload: ClipboardPayloadV1 = { v: 1, elements };
  try {
    sessionStorage.setItem(DOCUMENT_CREATOR_CLIPBOARD_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function readDocumentCreatorClipboard(fallback: DocElement[] | null | undefined): DocElement[] {
  try {
    const raw = sessionStorage.getItem(DOCUMENT_CREATOR_CLIPBOARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClipboardPayloadV1;
      if (parsed?.v === 1 && Array.isArray(parsed.elements)) {
        return parsed.elements;
      }
    }
  } catch {
    /* ignore */
  }
  return fallback ?? [];
}
