export type FileLocationOption = {
  value: string;
  label: string;
};

export type FileLocationFolder = {
  id: string;
  name: string;
  category: string;
  parent_id?: string | null;
};

export function buildFolderOptionsForCategory(
  folders: FileLocationFolder[],
  categoryId: string,
  options?: { excludeIds?: string[] },
): FileLocationOption[] {
  const exclude = new Set(options?.excludeIds ?? []);
  const inCategory = folders
    .filter((f) => f.category === categoryId && !exclude.has(f.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  return [
    { value: '', label: 'Root' },
    ...inCategory.map((f) => ({ value: f.id, label: f.name || 'Folder' })),
  ];
}

export function resolveInitialFolderValue(
  folderId: string | null | undefined,
  rootFolderId?: string | null,
): string {
  if (!folderId) return '';
  if (rootFolderId && folderId === rootFolderId) return '';
  return folderId;
}

function buildPathLabel(
  folderId: string,
  folders: FileLocationFolder[],
): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let currentId: string | null = folderId;
  while (currentId) {
    const folder = byId.get(currentId);
    if (!folder) break;
    parts.unshift(folder.name);
    currentId = folder.parent_id || null;
  }
  return parts.join(' / ');
}

/** Hierarchical folder labels for upload/move (e.g. Drawings / Architectural / Details). */
export function buildFolderPathOptionsForCategory(
  folders: FileLocationFolder[],
  categoryId: string,
  options?: { excludeIds?: string[] },
): FileLocationOption[] {
  const exclude = new Set(options?.excludeIds ?? []);
  const inCategory = folders
    .filter((f) => f.category === categoryId && !exclude.has(f.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const result: FileLocationOption[] = [{ value: '', label: 'Root' }];
  for (const folder of inCategory) {
    const path = buildPathLabel(folder.id, inCategory);
    result.push({ value: folder.id, label: path || folder.name || 'Folder' });
  }
  return result;
}
