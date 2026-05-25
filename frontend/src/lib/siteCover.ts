import { api } from '@/lib/api';

/** Crop frame aspect for site card banners (matches card `object-cover` strip). */
export const SITE_CARD_COVER_CROP = { width: 900, height: 300 } as const;

export async function uploadSiteCover(clientId: string, siteId: string, blob: Blob) {  const up: any = await api('POST', '/files/upload', {
    project_id: null,
    client_id: clientId,
    employee_id: null,
    category_id: 'site-cover-derived',
    original_name: 'site-cover.jpg',    content_type: 'image/jpeg',
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
    `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=site-cover.jpg&site_id=${encodeURIComponent(siteId)}`,
  );
}
