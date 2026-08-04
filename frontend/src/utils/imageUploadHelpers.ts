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

/** Image files already present on a drag-and-drop DataTransfer (local files). */
export function imageFilesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data?.files?.length) return [];
  return Array.from(data.files).filter(isLikelyImageFile);
}

function dataUrlToImageFile(dataUrl: string): File | null {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/i);
  if (!match) return null;
  const mime = match[1];
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([bytes], `pasted-image-${Date.now()}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

async function remoteOrDataUrlToImageFile(src: string): Promise<File | null> {
  if (src.startsWith('data:image/')) return dataUrlToImageFile(src);
  if (!/^https?:\/\//i.test(src)) return null;
  try {
    const res = await fetch(src, { credentials: 'include' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([blob], `dropped-image-${Date.now()}.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

/**
 * Resolve image files from drag-and-drop, including images dragged from web pages
 * (file list, HTML img src, or uri-list).
 */
export async function resolveImageFilesFromDataTransfer(data: DataTransfer | null): Promise<File[]> {
  const direct = imageFilesFromDataTransfer(data);
  if (direct.length) return direct;
  if (!data) return [];

  const html = data.getData('text/html');
  if (html) {
    const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (srcMatch?.[1]) {
      const file = await remoteOrDataUrlToImageFile(srcMatch[1]);
      if (file) return [file];
    }
  }

  const uri = data
    .getData('text/uri-list')
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  if (uri) {
    const file = await remoteOrDataUrlToImageFile(uri);
    if (file) return file ? [file] : [];
  }

  return [];
}

/** Read intrinsic pixel dimensions from a local image File. */
export function readImageFileDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
