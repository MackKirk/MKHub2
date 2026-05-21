import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';

/** Customer list + tab permissions (mirrors backend `has_customer_tab_permission`). */

export const CUSTOMER_MAIN_READ = 'business:customers:read';
export const CUSTOMER_MAIN_WRITE = 'business:customers:write';

export const CUSTOMER_TABS = [
  'overview',
  'general',
  'contacts',
  'files',
  'sites',
  'opportunities',
  'projects',
] as const;

export type CustomerTab = (typeof CUSTOMER_TABS)[number];

function has(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

function hasAnyProjectLineRead(permissions: Set<string>): boolean {
  return (
    has(permissions, 'business:projects:read') ||
    has(permissions, 'business:construction:projects:read') ||
    has(permissions, 'business:rm:projects:read') ||
    has(permissions, 'business:projects:write') ||
    has(permissions, 'business:construction:projects:write') ||
    has(permissions, 'business:rm:projects:write')
  );
}

/** Access to /customers list and create/delete customer records. */
export function canAccessCustomerList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE);
}

/** Open a customer detail page (list permission or any tab). */
export function canAccessCustomerDetail(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  if (canAccessCustomerList(isAdmin, permissions)) return true;
  return CUSTOMER_TABS.some((tab) => canReadCustomerTab(isAdmin, permissions, tab));
}

/** Strict tab visibility: only the tab's own view/write permission (no legacy fallbacks). */
export function canViewCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  const readKey = `business:customers:${tab}:read`;
  const writeKey = `business:customers:${tab}:write`;
  return has(permissions, readKey) || has(permissions, writeKey);
}

export function canReadCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  if (canViewCustomerTab(isAdmin, permissions, tab)) return true;

  if (tab === 'general' || tab === 'contacts') {
    if (has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'files') {
    if (has(permissions, 'business:projects:files:read') || has(permissions, 'business:projects:files:write')) {
      return true;
    }
    if (has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'overview' || tab === 'sites' || tab === 'opportunities' || tab === 'projects') {
    if (hasAnyProjectLineRead(permissions)) return true;
  }
  return false;
}

/** Create/delete customer records and other list-level actions (`Edit Customers`). */
export function canEditCustomerRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, CUSTOMER_MAIN_WRITE);
}

/** Strict tab edit: only the tab's own write permission (no legacy fallbacks). */
export function canEditCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  return has(permissions, `business:customers:${tab}:write`);
}

export function canWriteCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  if (canEditCustomerTab(isAdmin, permissions, tab)) return true;

  if (tab === 'general' || tab === 'contacts' || tab === 'sites') {
    if (has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'files' && has(permissions, 'business:projects:files:write')) return true;
  if (
    (tab === 'opportunities' || tab === 'projects') &&
    (has(permissions, 'business:projects:write') ||
      has(permissions, 'business:construction:projects:write') ||
      has(permissions, 'business:rm:projects:write'))
  ) {
    return true;
  }
  return false;
}

export function isCustomerTabReadKey(key: string): boolean {
  return CUSTOMER_TABS.some((t) => key === `business:customers:${t}:read`);
}

export function isCustomerTabWriteKey(key: string): boolean {
  return CUSTOMER_TABS.some((t) => key === `business:customers:${t}:write`);
}

export function splitCustomerAreaPermissions(areaPerms: { key: string }[]) {
  const mainViewPerm = areaPerms.find((p) => p.key === CUSTOMER_MAIN_READ);
  const mainEditPerm = areaPerms.find((p) => p.key === CUSTOMER_MAIN_WRITE);
  const subViewPerms = areaPerms.filter(
    (p) => p.key.includes(':read') && p.key !== CUSTOMER_MAIN_READ && isCustomerTabReadKey(p.key)
  );
  const subEditPerms = areaPerms.filter(
    (p) => p.key.includes(':write') && p.key !== CUSTOMER_MAIN_WRITE && isCustomerTabWriteKey(p.key)
  );
  return { mainViewPerm, mainEditPerm, subViewPerms, subEditPerms };
}

export type CustomerAccessLevel = PermissionAccessLevel;

export type CustomerPermissionRow = {
  id: string;
  label: string;
  description?: string;
  readKey: string;
  writeKey?: string;
  indent?: boolean;
};

export function formatCustomerPermissionLabel(label: string): string {
  return formatPermissionLabel(label);
}

export function buildCustomerPermissionRows(
  areaPerms: { id: string; key: string; label: string; description?: string }[]
): CustomerPermissionRow[] {
  const { mainViewPerm, mainEditPerm, subViewPerms } = splitCustomerAreaPermissions(areaPerms);
  const rows: CustomerPermissionRow[] = [];

  if (mainViewPerm) {
    rows.push({
      id: mainViewPerm.id,
      label: formatCustomerPermissionLabel(mainViewPerm.label),
      description: mainViewPerm.description,
      readKey: CUSTOMER_MAIN_READ,
      writeKey: mainEditPerm ? CUSTOMER_MAIN_WRITE : undefined,
    });
  }

  for (const viewPerm of subViewPerms) {
    const tab = CUSTOMER_TABS.find((t) => viewPerm.key === `business:customers:${t}:read`);
    const writeKey = tab ? `business:customers:${tab}:write` : undefined;
    const hasWriteDef = writeKey && areaPerms.some((p) => p.key === writeKey);
    rows.push({
      id: viewPerm.id,
      label: formatCustomerPermissionLabel(viewPerm.label),
      description: viewPerm.description,
      readKey: viewPerm.key,
      writeKey: hasWriteDef ? writeKey : undefined,
      indent: true,
    });
  }

  return rows;
}

export function getCustomerAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string
): CustomerAccessLevel {
  return getPermissionAccessLevel(permissions, readKey, writeKey);
}

/** Apply blocked / view only / view+edit for one customer scope (list or tab). */
export function applyCustomerAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: CustomerAccessLevel
): Record<string, boolean> {
  const next = { ...permissions };

  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    if (readKey === CUSTOMER_MAIN_READ) {
      return applyPermissionUncheckCascade(CUSTOMER_MAIN_READ, next);
    }
    if (readKey.endsWith(':read') && readKey !== CUSTOMER_MAIN_READ) {
      return applyPermissionUncheckCascade(readKey, next);
    }
    return next;
  }

  if (readKey !== CUSTOMER_MAIN_READ && !next[CUSTOMER_MAIN_READ]) {
    next[CUSTOMER_MAIN_READ] = true;
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

export function applyCustomerAccessLevelToKeySet(
  selectedKeys: Set<string>,
  customerKeys: string[],
  readKey: string,
  writeKey: string | undefined,
  level: CustomerAccessLevel
): Set<string> {
  const perms: Record<string, boolean> = {};
  customerKeys.forEach((k) => {
    perms[k] = selectedKeys.has(k);
  });
  const next = applyCustomerAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  customerKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  return out;
}
