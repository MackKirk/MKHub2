import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';
import type { ScopedPermissionRow } from '@/lib/scopedEntityPermissions';

export const PROPERTIES_ACCESS = 'properties:access';
export const PROPERTIES_DASHBOARD_READ = 'properties:dashboard:read';
export const PROPERTIES_COMPANY_READ = 'properties:company:read';
export const PROPERTIES_COMPANY_WRITE = 'properties:company:write';
export const PROPERTIES_FAMILY_READ = 'properties:family:read';
export const PROPERTIES_FAMILY_WRITE = 'properties:family:write';
export const PROPERTIES_DOCUMENTS_READ = 'properties:documents:read';
export const PROPERTIES_DOCUMENTS_WRITE = 'properties:documents:write';
export const PROPERTIES_PERMITS_READ = 'properties:permits:read';
export const PROPERTIES_PERMITS_WRITE = 'properties:permits:write';

export const PROPERTIES_CHILD_KEYS = [
  PROPERTIES_DASHBOARD_READ,
  PROPERTIES_COMPANY_READ,
  PROPERTIES_COMPANY_WRITE,
  PROPERTIES_FAMILY_READ,
  PROPERTIES_FAMILY_WRITE,
  PROPERTIES_DOCUMENTS_READ,
  PROPERTIES_DOCUMENTS_WRITE,
  PROPERTIES_PERMITS_READ,
  PROPERTIES_PERMITS_WRITE,
] as const;

export type PropertiesAccessLevel = PermissionAccessLevel;

type PermDef = { id: string; key: string; label: string; description?: string };

function hasPerm(permissions: Record<string, boolean> | Set<string>, key: string): boolean {
  return permissions instanceof Set ? permissions.has(key) : !!permissions[key];
}

export function isPropertiesAreaChildKey(key: string): boolean {
  return key.startsWith('properties:') && key !== PROPERTIES_ACCESS;
}

export function hasAnyPropertiesChildPermission(
  permissions: Record<string, boolean> | Set<string>,
): boolean {
  return PROPERTIES_CHILD_KEYS.some((k) => hasPerm(permissions, k));
}

/** Keep `properties:access` in sync with child grants (implicit area gate). */
export function syncPropertiesAccess(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  next[PROPERTIES_ACCESS] = hasAnyPropertiesChildPermission(next);
  return next;
}

export function syncPropertiesAccessInKeySet(selectedKeys: Set<string>): Set<string> {
  const out = new Set(selectedKeys);
  if (hasAnyPropertiesChildPermission(out)) out.add(PROPERTIES_ACCESS);
  else out.delete(PROPERTIES_ACCESS);
  return out;
}

export function filterPropertiesAreaPermissions(areaPerms: PermDef[]): PermDef[] {
  return areaPerms.filter((p) => isPropertiesAreaChildKey(p.key));
}

const PROPERTY_PAIRS: Array<{ read: string; write?: string }> = [
  { read: PROPERTIES_DASHBOARD_READ },
  { read: PROPERTIES_COMPANY_READ, write: PROPERTIES_COMPANY_WRITE },
  { read: PROPERTIES_FAMILY_READ, write: PROPERTIES_FAMILY_WRITE },
  { read: PROPERTIES_DOCUMENTS_READ, write: PROPERTIES_DOCUMENTS_WRITE },
  { read: PROPERTIES_PERMITS_READ, write: PROPERTIES_PERMITS_WRITE },
];

export function buildPropertiesPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const rows: ScopedPermissionRow[] = [];
  for (const pair of PROPERTY_PAIRS) {
    const readPerm = areaPerms.find((p) => p.key === pair.read);
    if (!readPerm) continue;
    const writePerm = pair.write ? areaPerms.find((p) => p.key === pair.write) : undefined;
    rows.push({
      id: readPerm.id,
      label: formatPermissionLabel(readPerm.label),
      description: readPerm.description,
      readKey: pair.read,
      writeKey: writePerm?.key,
    });
  }
  return rows;
}

export function getPropertiesAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): PropertiesAccessLevel {
  return getPermissionAccessLevel(permissions, readKey, writeKey);
}

export function applyPropertiesAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: PropertiesAccessLevel,
): Record<string, boolean> {
  let next = { ...permissions };
  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    next = applyPermissionUncheckCascade(readKey, next);
    return syncPropertiesAccess(next);
  }
  next[readKey] = true;
  if (writeKey) next[writeKey] = level === 'edit';
  return syncPropertiesAccess(next);
}

export function applyPropertiesAccessLevelToKeySet(
  selectedKeys: Set<string>,
  _allKeys: string[],
  readKey: string,
  writeKey: string | undefined,
  level: PropertiesAccessLevel,
): Set<string> {
  const record = Object.fromEntries([...selectedKeys].map((key) => [key, true]));
  const next = applyPropertiesAccessLevel(record, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  [readKey, writeKey, PROPERTIES_ACCESS].filter(Boolean).forEach((key) => {
    if (next[key!]) out.add(key!);
    else out.delete(key!);
  });
  return syncPropertiesAccessInKeySet(out);
}

export function hasPropertiesAccess(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_ACCESS);
}

export function canReadCompanyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes(PROPERTIES_COMPANY_READ) || permissions.includes(PROPERTIES_COMPANY_WRITE)
  );
}

export function canWriteCompanyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_COMPANY_WRITE);
}

export function canReadFamilyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes(PROPERTIES_FAMILY_READ) || permissions.includes(PROPERTIES_FAMILY_WRITE)
  );
}

export function canWriteFamilyProperties(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_FAMILY_WRITE);
}

export function canReadPropertyDocuments(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes(PROPERTIES_DOCUMENTS_READ) ||
    permissions.includes(PROPERTIES_DOCUMENTS_WRITE)
  );
}

export function canWritePropertyDocuments(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_DOCUMENTS_WRITE);
}

export function canReadPropertyPermits(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return (
    permissions.includes(PROPERTIES_PERMITS_READ) || permissions.includes(PROPERTIES_PERMITS_WRITE)
  );
}

export function canWritePropertyPermits(permissions: string[] = [], roles: string[] = []): boolean {
  if (roles.includes('admin')) return true;
  return permissions.includes(PROPERTIES_PERMITS_WRITE);
}

export function canEditProperty(
  visibility: string,
  permissions: string[] = [],
  roles: string[] = [],
): boolean {
  if (visibility === 'family') return canWriteFamilyProperties(permissions, roles);
  return canWriteCompanyProperties(permissions, roles);
}

export type PropertyTab =
  | 'overview'
  | 'leases'
  | 'insurance'
  | 'tax'
  | 'permits'
  | 'people'
  | 'maintenance'
  | 'documents';

export const PROPERTY_TABS: PropertyTab[] = [
  'overview',
  'leases',
  'insurance',
  'tax',
  'permits',
  'people',
  'maintenance',
  'documents',
];
