import type { FilesLibraryHomeCategory } from './filesLibraryHomeTypes';

export type HomeFileLike = {
  id?: string;
  original_name?: string;
  file_object_id?: string;
  category?: string | null;
  folder_id?: string | null;
  uploaded_at?: string | null;
  is_image?: boolean;
  content_type?: string;
};

export type HomeCategoryLike = {
  id: string;
  name: string;
  icon?: string;
};

export type HomeFolderLike = {
  id: string;
  name: string;
  category: string;
  parent_id?: string | null;
};

export function getLatestUploadedAt(files: HomeFileLike[]): string | null {
  let latest: string | null = null;
  for (const f of files) {
    const at = f.uploaded_at;
    if (!at) continue;
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

export function getRecentFiles<T extends HomeFileLike>(
  files: T[],
  limit: number,
  isReadable?: (categoryId: string) => boolean,
): T[] {
  const filtered = isReadable
    ? files.filter((f) => {
        const cat = f.category || 'uncategorized';
        return isReadable(cat);
      })
    : files;
  return [...filtered]
    .sort((a, b) => {
      const aVal = a.uploaded_at || '';
      const bVal = b.uploaded_at || '';
      if (aVal < bVal) return 1;
      if (aVal > bVal) return -1;
      return 0;
    })
    .slice(0, limit);
}

export function compareCategoriesByActivity(
  a: FilesLibraryHomeCategory,
  b: FilesLibraryHomeCategory,
): number {
  const aAt = a.latestUploadAt || '';
  const bAt = b.latestUploadAt || '';
  if (aAt && bAt) {
    if (aAt > bAt) return -1;
    if (aAt < bAt) return 1;
  }
  if (aAt && !bAt) return -1;
  if (!aAt && bAt) return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

export function partitionCategoriesInUse(categories: FilesLibraryHomeCategory[]): {
  inUse: FilesLibraryHomeCategory[];
  empty: FilesLibraryHomeCategory[];
} {
  const inUse: FilesLibraryHomeCategory[] = [];
  const empty: FilesLibraryHomeCategory[] = [];
  for (const cat of categories) {
    if (cat.fileCount > 0 || cat.folderCount > 0) {
      inUse.push(cat);
    } else {
      empty.push(cat);
    }
  }
  inUse.sort(compareCategoriesByActivity);
  empty.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { inUse, empty };
}

export function buildCategoryHomeRows(
  visibleCategories: HomeCategoryLike[],
  filesByCategory: Record<string, HomeFileLike[]>,
  folders: HomeFolderLike[],
  isWriteCategoryAllowed: (categoryId: string) => boolean,
): FilesLibraryHomeCategory[] {
  return visibleCategories.map((cat) => {
    const categoryFiles = filesByCategory[cat.id] || [];
    const categoryFolders = folders.filter((f) => f.category === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      icon: cat.icon || '📁',
      fileCount: categoryFiles.length,
      folderCount: categoryFolders.length,
      latestUploadAt: getLatestUploadedAt(categoryFiles),
      canWrite: isWriteCategoryAllowed(cat.id),
    };
  });
}

export function buildFolderPathLabel(
  folderId: string,
  folders: HomeFolderLike[],
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

export function buildFolderPathOptions(
  folders: HomeFolderLike[],
  categoryId: string,
): { value: string; label: string }[] {
  const inCategory = folders
    .filter((f) => f.category === categoryId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  const options: { value: string; label: string }[] = [{ value: '', label: 'Root' }];
  for (const folder of inCategory) {
    const path = buildFolderPathLabel(folder.id, inCategory);
    options.push({ value: folder.id, label: path || folder.name });
  }
  return options;
}

/** Folder tree without category field (company files). */
export type TreeFolderLike = {
  id: string;
  name: string;
  parent_id?: string | null;
};

export function buildTreeFolderPathLabel(
  folderId: string,
  folders: TreeFolderLike[],
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

export function buildTreeFolderPathOptions(
  folders: TreeFolderLike[],
  rootFolderId?: string | null,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: '', label: 'Root' }];
  const sorted = [...folders].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
  );
  for (const folder of sorted) {
    if (rootFolderId && folder.id === rootFolderId) continue;
    const path = buildTreeFolderPathLabel(folder.id, sorted);
    options.push({ value: folder.id, label: path || folder.name });
  }
  return options;
}
