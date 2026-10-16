import { api } from '@/lib/api';

function ensureNamedMediaFile(file: File): File {
  const type = (file.type || '').trim() || 'image/png';
  let name = (file.name || '').trim();
  const needsName = !name || name === 'blob' || name === 'image' || !/\.[a-z0-9]+$/i.test(name);
  if (!needsName && file.type) return file;

  const extFromType = (() => {
    if (type === 'image/png') return 'png';
    if (type === 'image/jpeg' || type === 'image/jpg') return 'jpg';
    if (type === 'image/webp') return 'webp';
    if (type === 'image/gif') return 'gif';
    if (type === 'video/webm') return 'webm';
    if (type === 'video/mp4') return 'mp4';
    return 'png';
  })();

  if (needsName) {
    name = `tutorial-media-${Date.now()}.${extFromType}`;
  }
  return new File([file], name, { type });
}

/** Upload media for a tutorial section slot (admin only on the server). */
export async function uploadTutorialMediaFile(file: File): Promise<string> {
  const prepared = ensureNamedMediaFile(file);
  const fd = new FormData();
  fd.append('file', prepared);
  fd.append('original_name', prepared.name);
  fd.append('content_type', prepared.type || 'application/octet-stream');
  fd.append('category_id', 'tutorial-media');
  // Omit project/client/employee so misc scope + tutorial-media admin check applies.
  const conf = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
  if (!conf?.id) throw new Error('Upload did not return a file id');
  return conf.id;
}
