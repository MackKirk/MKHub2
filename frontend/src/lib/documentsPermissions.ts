import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const DOCUMENTS_ACCESS = 'documents:access';
export const DOCUMENTS_READ = 'documents:read';
export const DOCUMENTS_WRITE = 'documents:write';
export const DOCUMENTS_DELETE = 'documents:delete';
export const DOCUMENTS_MOVE = 'documents:move';

/** Mutation keys folded into Edit (hidden from permission UI). */
export const DOCUMENTS_EDIT_KEYS = [DOCUMENTS_WRITE, DOCUMENTS_DELETE, DOCUMENTS_MOVE] as const;

export const DOCUMENTS_CHILD_KEYS = [DOCUMENTS_READ, ...DOCUMENTS_EDIT_KEYS] as const;

export type DocumentsAccessLevel = PermissionAccessLevel;

function hasPerm(permissions: Set<string> | Record<string, boolean>, key: string): boolean {
  return permissions instanceof Set ? permissions.has(key) : !!permissions[key];
}

function hasAnyEditCapability(permissions: Record<string, boolean> | Set<string>): boolean {
  return DOCUMENTS_EDIT_KEYS.some((k) => hasPerm(permissions, k));
}

/** True when any Company Files capability is granted. */
export function hasAnyDocumentsChildPermission(
  permissions: Record<string, boolean> | Set<string>,
): boolean {
  return DOCUMENTS_CHILD_KEYS.some((k) => hasPerm(permissions, k));
}

/** Keep delete/move in lockstep with write (Edit = full mutate). */
export function syncDocumentsEditCapabilities(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  if (hasAnyEditCapability(next)) {
    next[DOCUMENTS_READ] = true;
    next[DOCUMENTS_WRITE] = true;
    next[DOCUMENTS_DELETE] = true;
    next[DOCUMENTS_MOVE] = true;
  }
  return next;
}

/** Keep `documents:access` in sync with child grants (implicit area gate). */
export function syncDocumentsAccess(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = syncDocumentsEditCapabilities(permissions);
  next[DOCUMENTS_ACCESS] = hasAnyDocumentsChildPermission(next);
  return next;
}

export function syncDocumentsAccessInKeySet(selectedKeys: Set<string>): Set<string> {
  const record: Record<string, boolean> = {};
  selectedKeys.forEach((k) => {
    record[k] = true;
  });
  const synced = syncDocumentsAccess(record);
  const out = new Set(selectedKeys);
  DOCUMENTS_CHILD_KEYS.forEach((k) => {
    if (synced[k]) out.add(k);
    else out.delete(k);
  });
  if (synced[DOCUMENTS_ACCESS]) out.add(DOCUMENTS_ACCESS);
  else out.delete(DOCUMENTS_ACCESS);
  return out;
}

const documentsScoped = createScopedEntityPermissions('documents', {
  mainRead: DOCUMENTS_READ,
  mainWrite: DOCUMENTS_WRITE,
  tabs: [],
});

export const buildDocumentsPermissionRows = documentsScoped.buildPermissionRows;

export function getDocumentsAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): PermissionAccessLevel {
  if (hasAnyEditCapability(permissions)) return 'edit';
  return documentsScoped.getAccessLevel(permissions, readKey, writeKey);
}

export function applyDocumentsAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: PermissionAccessLevel,
): Record<string, boolean> {
  let next = documentsScoped.applyAccessLevel(permissions, readKey, writeKey, level);
  if (level === 'blocked' || level === 'view') {
    next = { ...next };
    next[DOCUMENTS_WRITE] = false;
    next[DOCUMENTS_DELETE] = false;
    next[DOCUMENTS_MOVE] = false;
    if (level === 'view') next[DOCUMENTS_READ] = true;
  } else if (level === 'edit') {
    next = { ...next };
    next[DOCUMENTS_READ] = true;
    next[DOCUMENTS_WRITE] = true;
    next[DOCUMENTS_DELETE] = true;
    next[DOCUMENTS_MOVE] = true;
  }
  return syncDocumentsAccess(next);
}

export function applyDocumentsAccessLevelToKeySet(
  selectedKeys: Set<string>,
  scopeKeys: string[],
  readKey: string,
  writeKey: string | undefined,
  level: PermissionAccessLevel,
): Set<string> {
  const perms: Record<string, boolean> = {};
  scopeKeys.forEach((k) => {
    perms[k] = selectedKeys.has(k);
  });
  const next = applyDocumentsAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  [...scopeKeys, ...DOCUMENTS_CHILD_KEYS, DOCUMENTS_ACCESS].forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  return syncDocumentsAccessInKeySet(out);
}

/** List/open/download company files. */
export function canViewDocuments(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasAnyDocumentsChildPermission(permissions);
}

/** Upload / create (Edit). */
export function canAddDocuments(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasAnyEditCapability(permissions);
}

/** Delete (Edit). */
export function canDeleteDocuments(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasAnyEditCapability(permissions);
}

/** Move / rename / metadata (Edit). */
export function canMoveEditDocuments(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasAnyEditCapability(permissions);
}

/** Permissions shown in the Company Files grid (View/Edit pair only). */
export function filterDocumentsAreaPermissions<T extends { key: string }>(areaPerms: T[]): T[] {
  return areaPerms.filter((p) => p.key === DOCUMENTS_READ || p.key === DOCUMENTS_WRITE);
}

/** Config keys for per-department allow-lists (stored in permissions_override). */
export const DOCUMENTS_CATEGORIES_READ = 'documents:categories:read';
export const DOCUMENTS_CATEGORIES_WRITE = 'documents:categories:write';

export type CompanyFilesCategoryConfigState = {
  read: string[] | null;
  write: string[] | null;
};

export const EMPTY_COMPANY_FILES_CATEGORY_CONFIG: CompanyFilesCategoryConfigState = {
  read: null,
  write: null,
};

export function resolveCompanyFilesCategoryConfigFromApi(
  cfg: Record<string, unknown>,
): CompanyFilesCategoryConfigState {
  const pick = (k: string): string[] | null => {
    const v = cfg[k];
    return Array.isArray(v) ? (v as string[]) : null;
  };
  return {
    read: pick(DOCUMENTS_CATEGORIES_READ),
    write: pick(DOCUMENTS_CATEGORIES_WRITE),
  };
}

export function cloneCompanyFilesCategoryConfig(
  cfg: CompanyFilesCategoryConfigState,
): CompanyFilesCategoryConfigState {
  return {
    read: cfg.read ? [...cfg.read] : null,
    write: cfg.write ? [...cfg.write] : null,
  };
}

function normCategoryList(v: string[] | null | undefined): string[] | null {
  if (v === null || v === undefined) return null;
  if (v.length === 0) return [];
  return Array.from(new Set(v.map(String))).sort();
}

export function companyFilesCategoryConfigsEqual(
  a: CompanyFilesCategoryConfigState,
  b: CompanyFilesCategoryConfigState,
): boolean {
  return (
    JSON.stringify(normCategoryList(a.read)) === JSON.stringify(normCategoryList(b.read)) &&
    JSON.stringify(normCategoryList(a.write)) === JSON.stringify(normCategoryList(b.write))
  );
}

export function applyCompanyFilesCategoryConfigToPayload(
  payload: Record<string, boolean | string[]>,
  cfg: CompanyFilesCategoryConfigState,
): void {
  if (cfg.read === null || cfg.read.length === 0) {
    payload[DOCUMENTS_CATEGORIES_READ] = [];
  } else {
    payload[DOCUMENTS_CATEGORIES_READ] = cfg.read;
  }
  if (cfg.write === null || cfg.write.length === 0) {
    payload[DOCUMENTS_CATEGORIES_WRITE] = [];
  } else {
    payload[DOCUMENTS_CATEGORIES_WRITE] = cfg.write;
  }
}

/** Keep department submenu in sync when Company Files View/Edit changes. */
export function syncCompanyFilesCategoryConfigAfterMacroChange(
  cfg: CompanyFilesCategoryConfigState,
  access: PermissionAccessLevel,
): CompanyFilesCategoryConfigState {
  if (access === 'blocked') {
    return { read: null, write: null };
  }
  if (access === 'view') {
    return { ...cfg, write: [] };
  }
  if (access === 'edit' && cfg.write?.length === 0) {
    return { ...cfg, write: null };
  }
  return cfg;
}
