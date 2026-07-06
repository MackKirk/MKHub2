export const MKHUB_FILE_IDS_MIME = 'application/x-mkhub-file-ids';
export const MKHUB_FILE_ID_MIME = 'application/x-mkhub-file-id';

export type FileDropTargetKind = 'folder' | 'category' | 'root';

export type FileDropTarget = {
  kind: FileDropTargetKind;
  id: string;
  label: string;
};

export function setDraggedFileIds(dataTransfer: DataTransfer, ids: string[]): void {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return;
  dataTransfer.setData(MKHUB_FILE_IDS_MIME, JSON.stringify(unique));
  dataTransfer.setData(MKHUB_FILE_ID_MIME, unique[0]);
  dataTransfer.effectAllowed = 'move';
}

export function getDraggedFileIds(dataTransfer: DataTransfer, fallbackId?: string | null): string[] {
  const raw = dataTransfer.getData(MKHUB_FILE_IDS_MIME);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map(String).filter(Boolean))];
      }
    } catch {
      /* ignore */
    }
  }
  const single = dataTransfer.getData(MKHUB_FILE_ID_MIME) || fallbackId;
  return single ? [String(single)] : [];
}

export function dropTargetClass(isActive: boolean, kind: FileDropTargetKind): string {
  if (!isActive) return '';
  switch (kind) {
    case 'folder':
      return 'ring-2 ring-brand-red bg-amber-50';
    case 'category':
      return 'bg-blue-100 border-l-4 border-l-brand-red';
    case 'root':
      return 'border-2 border-dashed border-brand-red bg-amber-50/40';
    default:
      return '';
  }
}

export function isInternalFileDrag(dataTransfer: DataTransfer): boolean {
  return (
    dataTransfer.types.includes(MKHUB_FILE_IDS_MIME) ||
    dataTransfer.types.includes(MKHUB_FILE_ID_MIME)
  );
}

/** OS file import — not an in-app move (gallery image drags still set MKHUB mime types). */
export function isExternalFileDrop(dataTransfer: DataTransfer): boolean {
  return !isInternalFileDrag(dataTransfer) && (dataTransfer.files?.length ?? 0) > 0;
}
