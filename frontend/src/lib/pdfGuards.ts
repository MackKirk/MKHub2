/** Only real PDF uploads: .pdf + MIME heuristics */
export function isPdfFileCandidate(f: File): boolean {
  const name = f.name.trim().toLowerCase();
  if (!name.endsWith('.pdf')) return false;
  const ct = (f.type || '').toLowerCase();
  if (ct === 'application/pdf') return true;
  if (ct === '' || ct === 'application/octet-stream') return true;
  return false;
}

export async function fileStartsWithPdfMagic(file: File): Promise<boolean> {
  try {
    const buf = await file.slice(0, 5).arrayBuffer();
    return new TextDecoder().decode(buf).startsWith('%PDF');
  } catch {
    return false;
  }
}
