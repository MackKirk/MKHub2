import { api } from '@/lib/api';

/** Upload a PDF for a form template "View PDF" field (misc scope, category form-template-reference). */
export async function uploadFormTemplateReferencePdf(file: File): Promise<string> {
  const type = file.type || 'application/pdf';
  const up = await api<{ key: string; upload_url: string }>('POST', '/files/upload', {
    original_name: file.name,
    content_type: type,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'form-template-reference',
  });
  const put = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status})`);
  }
  const conf = await api<{ id: string }>('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: type,
  });
  return conf.id;
}
