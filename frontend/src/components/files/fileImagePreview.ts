import { api, withFileAccessToken } from '@/lib/api';

export type FileImagePreviewItem = {
  id: string;
  name: string;
  url?: string;
  fileObjectId?: string;
};

export async function fetchFilePreviewUrl(fileId: string): Promise<string> {
  const r = await api<{ preview_url?: string; download_url?: string }>(
    'GET',
    withFileAccessToken(`/files/${encodeURIComponent(fileId)}/preview`),
  );
  const url = String(r.preview_url || r.download_url || '');
  if (!url) throw new Error('Preview not available');
  return url;
}
