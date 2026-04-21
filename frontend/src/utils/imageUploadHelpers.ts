/** Whether a File looks like an image (uploads, drag-drop, paste). */
export function isLikelyImageFile(file: File): boolean {
  const ct = file.type || '';
  if (ct.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
}

/**
 * Image files from clipboard DataTransfer (Ctrl+V / paste).
 * Handles `kind === 'file'` and image/* MIME items.
 */
export function imageFilesFromClipboardData(data: DataTransfer | null): File[] {
  if (!data?.items?.length) return [];
  const out: File[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f && isLikelyImageFile(f)) out.push(f);
    } else if (item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/** All `kind === file` items from clipboard (e.g. pasted PDFs). */
export function filesFromClipboardData(data: DataTransfer | null): File[] {
  if (!data?.items?.length) return [];
  const out: File[] = [];
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}
