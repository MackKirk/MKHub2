/** Drag-and-drop helpers for importing folder trees from the OS (Chromium webkit APIs + webkitRelativePath fallback). */

export async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);
  return entries;
}

export function getWebkitRelativePath(file: File): string {
  const w = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  const s = w && w.length > 0 ? w : file.name;
  return s.replace(/\\/g, '/');
}

/** True if the drag payload includes a filesystem directory (Chromium / Edge). */
export function dataTransferMayContainDirectory(dt: DataTransfer | null): boolean {
  if (!dt?.items?.length) return false;
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i] as DataTransferItem & {
      webkitGetAsEntry?: () => FileSystemEntry | null;
    };
    if (typeof item.webkitGetAsEntry !== 'function') continue;
    const entry = item.webkitGetAsEntry();
    if (entry?.isDirectory) return true;
  }
  return false;
}

/** True when the drop likely carries a folder structure (nested paths or directory entries). */
export function dropLooksLikeFolderTree(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  if (dataTransferMayContainDirectory(dt)) return true;
  const files = Array.from(dt.files || []);
  return files.some((f) => getWebkitRelativePath(f).includes('/'));
}
