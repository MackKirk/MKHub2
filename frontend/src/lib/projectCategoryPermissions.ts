import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export type ProjectCategoryAllowLists = {
  read: string[] | null;
  write: string[] | null;
};

/** null lists => all categories allowed (default / no override). */
export function isProjectCategoryAllowAll(lists: ProjectCategoryAllowLists): boolean {
  return lists.read === null && lists.write === null;
}

export function getProjectCategoryAccessLevel(
  categoryId: string,
  readCategories: string[] | null,
  writeCategories: string[] | null
): PermissionAccessLevel {
  const inRead = readCategories === null || readCategories.includes(categoryId);
  const inWrite = writeCategories === null || writeCategories.includes(categoryId);
  if (!inRead) return 'blocked';
  if (!inWrite) return 'view';
  return 'edit';
}

function materializeLists(
  readCategories: string[] | null,
  writeCategories: string[] | null,
  allCategoryIds: string[],
  macroCanEdit: boolean
): { read: string[]; write: string[] } {
  const read =
    readCategories === null ? [...allCategoryIds] : [...readCategories];
  const write =
    writeCategories === null
      ? macroCanEdit
        ? [...allCategoryIds]
        : []
      : [...writeCategories];
  return { read, write };
}

export function buildProjectCategoryLevels(
  readCategories: string[] | null,
  writeCategories: string[] | null,
  allCategoryIds: string[]
): Record<string, PermissionAccessLevel> {
  const levels: Record<string, PermissionAccessLevel> = {};
  for (const id of allCategoryIds) {
    levels[id] = getProjectCategoryAccessLevel(id, readCategories, writeCategories);
  }
  return levels;
}

export function applyProjectCategoryAccessLevel(
  categoryId: string,
  level: PermissionAccessLevel,
  readCategories: string[] | null,
  writeCategories: string[] | null,
  allCategoryIds: string[],
  macroCanEdit: boolean
): ProjectCategoryAllowLists {
  const { read, write } = materializeLists(
    readCategories,
    writeCategories,
    allCategoryIds,
    macroCanEdit
  );
  const readSet = new Set(read);
  const writeSet = new Set(write);

  if (level === 'blocked') {
    readSet.delete(categoryId);
    writeSet.delete(categoryId);
  } else if (level === 'view') {
    readSet.add(categoryId);
    writeSet.delete(categoryId);
  } else {
    readSet.add(categoryId);
    if (macroCanEdit) writeSet.add(categoryId);
    else writeSet.delete(categoryId);
  }

  return compactProjectCategoryAllowLists(
    Array.from(readSet),
    Array.from(writeSet),
    allCategoryIds,
    macroCanEdit
  );
}

export function compactProjectCategoryAllowLists(
  read: string[],
  write: string[],
  allCategoryIds: string[],
  macroCanEdit: boolean
): ProjectCategoryAllowLists {
  const allRead = allCategoryIds.length > 0 && allCategoryIds.every((id) => read.includes(id));
  const allWrite =
    macroCanEdit && allCategoryIds.length > 0 && allCategoryIds.every((id) => write.includes(id));

  if (allRead && allWrite) {
    return { read: null, write: null };
  }

  const readOut = allRead ? null : read;
  let writeOut: string[] | null;
  if (!macroCanEdit) {
    writeOut = null;
  } else if (allWrite) {
    writeOut = null;
  } else {
    writeOut = write;
  }

  return { read: readOut, write: writeOut };
}

export function setAllProjectCategoriesAllowAll(): ProjectCategoryAllowLists {
  return { read: null, write: null };
}

export function setAllProjectCategoriesToLevel(
  level: PermissionAccessLevel,
  allCategoryIds: string[],
  macroCanEdit: boolean
): ProjectCategoryAllowLists {
  if (level === 'blocked') {
    return { read: [], write: [] };
  }
  if (level === 'view') {
    return compactProjectCategoryAllowLists(allCategoryIds, [], allCategoryIds, macroCanEdit);
  }
  return { read: null, write: null };
}
