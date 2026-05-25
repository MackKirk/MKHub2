import { api } from '@/lib/api';

export function formatContactPhone(v: string) {
  const d = String(v || '')
    .replace(/\D+/g, '')
    .slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
}

export async function uploadContactPhoto(clientId: string, contactId: string, blob: Blob) {
  const up: any = await api('POST', '/files/upload', {
    project_id: null,
    client_id: clientId,
    employee_id: null,
    category_id: 'contact-photo',
    original_name: `contact-${contactId}.jpg`,
    content_type: 'image/jpeg',
  });
  await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
    body: blob,
  });
  const conf: any = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: blob.size,
    checksum_sha256: 'na',
    content_type: 'image/jpeg',
  });
  await api(
    'POST',
    `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + contactId)}&original_name=${encodeURIComponent('contact-' + contactId + '.jpg')}`,
  );
}
