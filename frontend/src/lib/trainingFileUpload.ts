import { api } from '@/lib/api';

/** Upload a file for training course content (same flow as course builder). */
export async function uploadTrainingContentFile(file: File): Promise<string> {
  const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: file.type || 'application/octet-stream',
    client_id: null,
    project_id: null,
    employee_id: null,
    category_id: 'training-course-content',
  });
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  if (!up.upload_url.includes('upload-via-backend')) {
    headers['x-ms-blob-type'] = 'BlockBlob';
  }
  const putRes = await fetch(up.upload_url, { method: 'PUT', body: file, headers });
  if (!putRes.ok) throw new Error('Upload failed');
  const conf: { id: string } = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: file.type || 'application/octet-stream',
  });
  return conf.id;
}

/** Full-page certificate backgrounds for Settings → certificate library. */
export async function uploadCertificateBackgroundFile(file: File): Promise<string> {
  const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: file.type || 'application/octet-stream',
    client_id: null,
    project_id: null,
    employee_id: null,
    category_id: 'certificate-backgrounds',
  });
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  if (!up.upload_url.includes('upload-via-backend')) {
    headers['x-ms-blob-type'] = 'BlockBlob';
  }
  const putRes = await fetch(up.upload_url, { method: 'PUT', body: file, headers });
  if (!putRes.ok) throw new Error('Upload failed');
  const conf: { id: string } = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: file.type || 'application/octet-stream',
  });
  return conf.id;
}

/** Large brand logos for Settings → organization library (same misc upload scope as training). */
export async function uploadOrganizationLogoFile(file: File): Promise<string> {
  const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: file.type || 'application/octet-stream',
    client_id: null,
    project_id: null,
    employee_id: null,
    category_id: 'organization-logos',
  });
  const headers: Record<string, string> = { 'Content-Type': file.type || 'application/octet-stream' };
  if (!up.upload_url.includes('upload-via-backend')) {
    headers['x-ms-blob-type'] = 'BlockBlob';
  }
  const putRes = await fetch(up.upload_url, { method: 'PUT', body: file, headers });
  if (!putRes.ok) throw new Error('Upload failed');
  const conf: { id: string } = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: file.type || 'application/octet-stream',
  });
  return conf.id;
}
