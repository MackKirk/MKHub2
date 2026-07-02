export type FolderTreeItem = {
  id: string;
  parent_id?: string | null;
};

type FileWithFolder = {
  folder_id?: string | null;
};

/** Count files in each folder, including files in nested subfolders. */
export function buildFolderFileCounts(
  files: FileWithFolder[],
  folders: FolderTreeItem[],
): Record<string, number> {
  if (folders.length === 0) return {};

  const childrenByParent = new Map<string, string[]>();
  for (const folder of folders) {
    const parentKey = folder.parent_id ?? '';
    const siblings = childrenByParent.get(parentKey);
    if (siblings) siblings.push(folder.id);
    else childrenByParent.set(parentKey, [folder.id]);
  }

  const counts: Record<string, number> = {};
  for (const folder of folders) {
    const subtreeIds = new Set<string>();
    const stack = [folder.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      subtreeIds.add(id);
      for (const childId of childrenByParent.get(id) ?? []) {
        stack.push(childId);
      }
    }
    counts[folder.id] = files.reduce(
      (total, file) => total + (file.folder_id && subtreeIds.has(file.folder_id) ? 1 : 0),
      0,
    );
  }
  return counts;
}
