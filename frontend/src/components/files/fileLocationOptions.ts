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
