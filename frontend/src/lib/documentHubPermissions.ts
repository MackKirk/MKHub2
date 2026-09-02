import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';
import type { ScopedPermissionRow } from '@/lib/scopedEntityPermissions';

export const DOCUMENT_HUB_BUILDER_READ = 'document_hub:builder:read';
export const DOCUMENT_HUB_BUILDER_WRITE = 'document_hub:builder:write';
export const DOCUMENT_HUB_SIGNATURE_REQUESTS_READ = 'document_hub:signature_requests:read';
export const DOCUMENT_HUB_SIGNATURE_REQUESTS_WRITE = 'document_hub:signature_requests:write';
export const DOCUMENT_HUB_SIGNATURE_EDITOR_READ = 'document_hub:signature_editor:read';
export const DOCUMENT_HUB_SIGNATURE_EDITOR_WRITE = 'document_hub:signature_editor:write';
export const DOCUMENT_HUB_BACKGROUNDS_READ = 'document_hub:backgrounds:read';
export const DOCUMENT_HUB_BACKGROUNDS_WRITE = 'document_hub:backgrounds:write';
export const DOCUMENT_HUB_TEMPLATES_READ = 'document_hub:templates:read';
export const DOCUMENT_HUB_TEMPLATES_WRITE = 'document_hub:templates:write';
export const DOCUMENT_HUB_TEMPLATES_CATEGORIES_READ = 'document_hub:templates:categories:read';
export const DOCUMENT_HUB_BLOCK_ACCESS = 'documents:signatures:block_access';

export const DOCUMENT_HUB_CHILD_KEYS = [
  DOCUMENT_HUB_BUILDER_READ,
  DOCUMENT_HUB_BUILDER_WRITE,
  DOCUMENT_HUB_SIGNATURE_REQUESTS_READ,
  DOCUMENT_HUB_SIGNATURE_REQUESTS_WRITE,
  DOCUMENT_HUB_SIGNATURE_EDITOR_READ,
  DOCUMENT_HUB_SIGNATURE_EDITOR_WRITE,
  DOCUMENT_HUB_BACKGROUNDS_READ,
  DOCUMENT_HUB_BACKGROUNDS_WRITE,
  DOCUMENT_HUB_TEMPLATES_READ,
  DOCUMENT_HUB_TEMPLATES_WRITE,
  DOCUMENT_HUB_BLOCK_ACCESS,
] as const;

export type DocumentHubAccessLevel = PermissionAccessLevel;

type PermDef = { id: string; key: string; label: string; description?: string };

const HUB_ROWS: Array<{
  readKey: string;
  writeKey?: string;
  indent?: boolean;
}> = [
  { readKey: DOCUMENT_HUB_BUILDER_READ, writeKey: DOCUMENT_HUB_BUILDER_WRITE },
  { readKey: DOCUMENT_HUB_SIGNATURE_REQUESTS_READ, writeKey: DOCUMENT_HUB_SIGNATURE_REQUESTS_WRITE },
  { readKey: DOCUMENT_HUB_BLOCK_ACCESS, indent: true },
  { readKey: DOCUMENT_HUB_SIGNATURE_EDITOR_READ, writeKey: DOCUMENT_HUB_SIGNATURE_EDITOR_WRITE },
  { readKey: DOCUMENT_HUB_BACKGROUNDS_READ, writeKey: DOCUMENT_HUB_BACKGROUNDS_WRITE },
  { readKey: DOCUMENT_HUB_TEMPLATES_READ, writeKey: DOCUMENT_HUB_TEMPLATES_WRITE },
];

function hasPerm(permissions: Set<string> | Record<string, boolean>, key: string): boolean {
  return permissions instanceof Set ? permissions.has(key) : !!permissions[key];
}

export function isDocumentHubPermissionKey(key: string): boolean {
  return key.startsWith('document_hub:') || key === DOCUMENT_HUB_BLOCK_ACCESS;
}

export function filterDocumentHubAreaPermissions<T extends { key: string }>(areaPerms: T[]): T[] {
  return areaPerms.filter((p) => isDocumentHubPermissionKey(p.key));
}

export function buildDocumentHubPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const byKey = new Map(areaPerms.map((p) => [p.key, p]));
  const rows: ScopedPermissionRow[] = [];

  for (const def of HUB_ROWS) {
    const readPerm = byKey.get(def.readKey);
    if (!readPerm) continue;
    const writePerm = def.writeKey ? byKey.get(def.writeKey) : undefined;
    rows.push({
      id: readPerm.id,
      label: readPerm.label,
      description: readPerm.description,
      readKey: def.readKey,
      writeKey: writePerm?.key,
      indent: def.indent,
    });
  }

  return rows;
}

export function getDocumentHubAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): DocumentHubAccessLevel {
  if (readKey === DOCUMENT_HUB_BLOCK_ACCESS) {
    // No write key: grid only offers Blocked / View (Allowed).
    return hasPerm(permissions, DOCUMENT_HUB_BLOCK_ACCESS) ? 'view' : 'blocked';
  }
  return getPermissionAccessLevel(permissions, readKey, writeKey);
}

export function applyDocumentHubAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: DocumentHubAccessLevel,
): Record<string, boolean> {
  const next = { ...permissions };

  if (readKey === DOCUMENT_HUB_BLOCK_ACCESS) {
    next[DOCUMENT_HUB_BLOCK_ACCESS] = level === 'edit' || level === 'view';
    return next;
  }

  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    return applyPermissionUncheckCascade(readKey, next);
  }

  if (level === 'view') {
    next[readKey] = true;
    if (writeKey) next[writeKey] = false;
    return next;
  }

  next[readKey] = true;
  if (writeKey) next[writeKey] = true;
  return next;
}

export function applyDocumentHubAccessLevelToKeySet(
  selectedKeys: Set<string>,
  scopeKeys: string[],
  readKey: string,
  writeKey: string | undefined,
  level: DocumentHubAccessLevel,
): Set<string> {
  const perms: Record<string, boolean> = {};
  scopeKeys.forEach((k) => {
    perms[k] = selectedKeys.has(k);
  });
  const next = applyDocumentHubAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  scopeKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  return out;
}

/** Nav / page helpers — hub keys only (Company Files documents:* does not open this hub). */
export function canViewDocumentBuilder(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, DOCUMENT_HUB_BUILDER_READ) || hasPerm(permissions, DOCUMENT_HUB_BUILDER_WRITE);
}

export function canEditDocumentBuilder(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, DOCUMENT_HUB_BUILDER_WRITE);
}

export function canViewSignatureRequests(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_REQUESTS_READ) ||
    hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_REQUESTS_WRITE) ||
    hasPerm(permissions, 'documents:signatures:manage') ||
    hasPerm(permissions, 'hr:onboarding:read') ||
    hasPerm(permissions, 'hr:onboarding:write')
  );
}

export function canManageSignatureRequests(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_REQUESTS_WRITE) ||
    hasPerm(permissions, 'documents:signatures:manage')
  );
}

export function canViewSignatureEditor(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_EDITOR_READ) ||
    hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_EDITOR_WRITE)
  );
}

export function canEditSignatureEditor(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, DOCUMENT_HUB_SIGNATURE_EDITOR_WRITE);
}

/** True when the Documents hub category should appear in nav (any sub-item). */
export function canViewDocumentHubNav(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    canViewDocumentBuilder(false, permissions) ||
    canViewSignatureRequests(false, permissions) ||
    canViewSignatureEditor(false, permissions) ||
    canViewDocumentHubTemplates(false, permissions)
  );
}

export function canViewDocumentHubTemplates(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, DOCUMENT_HUB_BACKGROUNDS_READ) ||
    hasPerm(permissions, DOCUMENT_HUB_BACKGROUNDS_WRITE) ||
    hasPerm(permissions, DOCUMENT_HUB_TEMPLATES_READ) ||
    hasPerm(permissions, DOCUMENT_HUB_TEMPLATES_WRITE) ||
    hasPerm(permissions, 'settings:document_backgrounds:read') ||
    hasPerm(permissions, 'settings:document_backgrounds:write') ||
    hasPerm(permissions, 'settings:document_templates:read') ||
    hasPerm(permissions, 'settings:document_templates:write')
  );
}

/** Config key for per-category template picker allow-list (SettingItem ids). Deny-by-default. */
export type DocumentTemplateCategoryConfigState = {
  read: string[];
};

export const EMPTY_DOCUMENT_TEMPLATE_CATEGORY_CONFIG: DocumentTemplateCategoryConfigState = {
  read: [],
};

export function resolveDocumentTemplateCategoryConfigFromApi(
  cfg: Record<string, unknown>,
): DocumentTemplateCategoryConfigState {
  const v = cfg[DOCUMENT_HUB_TEMPLATES_CATEGORIES_READ];
  return {
    read: Array.isArray(v) ? (v as string[]) : [],
  };
}

export function cloneDocumentTemplateCategoryConfig(
  cfg: DocumentTemplateCategoryConfigState,
): DocumentTemplateCategoryConfigState {
  return { read: [...cfg.read] };
}

function normCategoryIdList(v: string[] | undefined): string[] {
  return Array.from(new Set((v || []).map(String))).sort();
}

export function documentTemplateCategoryConfigsEqual(
  a: DocumentTemplateCategoryConfigState,
  b: DocumentTemplateCategoryConfigState,
): boolean {
  return JSON.stringify(normCategoryIdList(a.read)) === JSON.stringify(normCategoryIdList(b.read));
}

export function applyDocumentTemplateCategoryConfigToPayload(
  payload: Record<string, boolean | string[]>,
  cfg: DocumentTemplateCategoryConfigState,
): void {
  payload[DOCUMENT_HUB_TEMPLATES_CATEGORIES_READ] = [...cfg.read];
}

/** Clear category allow-list when Document Builder is blocked. */
export function syncDocumentTemplateCategoryConfigAfterBuilderChange(
  cfg: DocumentTemplateCategoryConfigState,
  access: DocumentHubAccessLevel,
): DocumentTemplateCategoryConfigState {
  if (access === 'blocked') {
    return { read: [] };
  }
  return cfg;
}
