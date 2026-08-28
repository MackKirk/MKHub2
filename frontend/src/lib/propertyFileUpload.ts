import { api } from '@/lib/api';

export async function uploadPropertyFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('original_name', file.name);
  formData.append('content_type', file.type || 'application/octet-stream');
  const conf = await api<{ id: string }>('POST', '/files/upload-proxy', formData);
  if (!conf?.id) throw new Error('Upload failed');
  return conf.id;
}
