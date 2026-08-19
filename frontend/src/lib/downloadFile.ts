import { withFileAccessToken } from '@/lib/api';

export type StoredFileDownload = {
  fileObjectId: string;
  filename?: string;
};

function safeDownloadName(name: string | undefined, fallback = 'download'): string {
  const cleaned = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim();
  return cleaned || fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = safeDownloadName(filename);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  return res.blob();
}

/** Force a save dialog. Cross-origin URLs ignore `<a download>` and open in a new tab. */
export async function downloadFromUrl(url: string, filename?: string): Promise<void> {
  const blob = await fetchBlob(url);
  triggerBlobDownload(blob, filename || 'download');
}

/** Same-origin file bytes (`/files/{id}`) so Azure SAS / inline images actually download. */
export async function downloadStoredFile(fileObjectId: string, filename?: string): Promise<void> {
  const id = String(fileObjectId || '').trim();
  if (!id) throw new Error('Download failed');
  const url = withFileAccessToken(`/files/${encodeURIComponent(id)}`);
  await downloadFromUrl(url, filename);
}

export function uniqueZipEntryNames(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((raw) => {
    const base = safeDownloadName(raw, 'file');
    const key = base.toLowerCase();
    const n = used.get(key) || 0;
    used.set(key, n + 1);
    if (n === 0) return base;
    const dot = base.lastIndexOf('.');
    if (dot > 0) return `${base.slice(0, dot)} (${n + 1})${base.slice(dot)}`;
    return `${base} (${n + 1})`;
  });
}

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}

function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC32_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Uncompressed ZIP (STORE). Images are already compressed; no extra library needed. */
export function buildZipStore(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const now = dosDateTime();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;
    const local = concatBytes([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(1 << 11),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    const central = concatBytes([
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(1 << 11),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concatBytes(centrals);
  const eocd = concatBytes([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return concatBytes([...locals, centralDir, eocd]);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index], index);
    }
  };
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/** One file downloads directly; two or more are packed into a ZIP. */
export async function downloadStoredFiles(
  files: StoredFileDownload[],
  zipFilename = 'files.zip',
): Promise<void> {
  const items = files
    .map((file) => ({
      fileObjectId: String(file.fileObjectId || '').trim(),
      filename: file.filename,
    }))
    .filter((file) => file.fileObjectId);
  if (items.length === 0) throw new Error('No files to download');
  if (items.length === 1) {
    await downloadStoredFile(items[0].fileObjectId, items[0].filename);
    return;
  }

  const names = uniqueZipEntryNames(items.map((file) => file.filename || 'file'));
  const packed = await mapPool(items, 4, async (file, index) => {
    const url = withFileAccessToken(`/files/${encodeURIComponent(file.fileObjectId)}`);
    const blob = await fetchBlob(url);
    return { name: names[index], data: new Uint8Array(await blob.arrayBuffer()) };
  });
  const zip = buildZipStore(packed);
  const zipName = zipFilename.toLowerCase().endsWith('.zip') ? zipFilename : `${zipFilename}.zip`;
  triggerBlobDownload(new Blob([zip], { type: 'application/zip' }), zipName);
}
