import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';

/** Customer list + tab permissions (mirrors backend `has_customer_tab_permission`). */

export const CUSTOMER_MAIN_READ = 'business:customers:read';
export const CUSTOMER_MAIN_WRITE = 'business:customers:write';

export const METALS_CUSTOMER_MAIN_READ = 'metals:customers:read';
export const METALS_CUSTOMER_MAIN_WRITE = 'metals:customers:write';

export const CUSTOMER_TABS = [
  'overview',
  'general',
  'contacts',
  'files',
  'sites',
  'notes',
  'opportunities',
  'projects',
] as const;

/** Metals CRM tabs (no Hub opportunities/projects). */
export const METALS_CUSTOMER_TABS = [
  'overview',
  'general',
  'contacts',
  'files',
  'sites',
  'notes',
] as const;

export type CustomerTab = (typeof CUSTOMER_TABS)[number];
export type MetalsCustomerTab = (typeof METALS_CUSTOMER_TABS)[number];
export type CustomerPermScope = 'hub' | 'metals';

function scopePrefix(scope: CustomerPermScope): string {
  return scope === 'metals' ? 'metals:customers' : 'business:customers';
}

function mainReadKey(scope: CustomerPermScope): string {
  return scope === 'metals' ? METALS_CUSTOMER_MAIN_READ : CUSTOMER_MAIN_READ;
}

function mainWriteKey(scope: CustomerPermScope): string {
  return scope === 'metals' ? METALS_CUSTOMER_MAIN_WRITE : CUSTOMER_MAIN_WRITE;
}

function tabsForScope(scope: CustomerPermScope): readonly string[] {
  return scope === 'metals' ? METALS_CUSTOMER_TABS : CUSTOMER_TABS;
}

function scopeFromKey(key: string): CustomerPermScope {
  return key.startsWith('metals:customers:') ? 'metals' : 'hub';
}

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
  tab: CustomerTab,
  scope: CustomerPermScope = 'hub',
): boolean {
  if (isAdmin) return true;
  if (scope === 'metals' && !METALS_CUSTOMER_TABS.includes(tab as MetalsCustomerTab)) return false;
  const prefix = scopePrefix(scope);
  const readKey = `${prefix}:${tab}:read`;
  const writeKey = `${prefix}:${tab}:write`;
  if (has(permissions, readKey) || has(permissions, writeKey)) return true;
  // Hub legacy: Notes/History opens with main customers list access.
  // Metals requires the explicit Notes tab permission.
  if (tab === 'notes' && scope === 'hub') {
    return has(permissions, mainReadKey(scope)) || has(permissions, mainWriteKey(scope));
  }
  return false;
}

export function canReadCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab,
  scope: CustomerPermScope = 'hub',
): boolean {
  if (isAdmin) return true;
  if (canViewCustomerTab(isAdmin, permissions, tab, scope)) return true;

  // Metals: main customers:read opens list + hero only; each tab needs its own key.
  if (scope === 'metals') return false;

  const mainR = mainReadKey(scope);
  const mainW = mainWriteKey(scope);
  if (tab === 'general' || tab === 'contacts' || tab === 'notes') {
    if (has(permissions, mainR) || has(permissions, mainW)) return true;
  }
  if (tab === 'files') {
    if (
      has(permissions, 'business:projects:files:read') ||
      has(permissions, 'business:projects:files:write')
    ) {
      return true;
    }
    if (has(permissions, mainR) || has(permissions, mainW)) return true;
  }
  if (tab === 'overview' || tab === 'sites') {
    if (has(permissions, mainR) || has(permissions, mainW)) return true;
    if (hasAnyProjectLineRead(permissions)) return true;
  }
  if (tab === 'opportunities' || tab === 'projects') {
    if (hasAnyProjectLineRead(permissions)) return true;
  }
  return false;
}

/** Create/delete customer records and other list-level actions (`Edit Customers`). */
export function canEditCustomerRecord(
  isAdmin: boolean,
  permissions: Set<string>,
  scope: CustomerPermScope = 'hub',
): boolean {
  if (isAdmin) return true;
  return has(permissions, mainWriteKey(scope));
}

/** Strict tab edit: only the tab's own write permission (no legacy fallbacks). */
export function canEditCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab,
  scope: CustomerPermScope = 'hub',
): boolean {
  if (isAdmin) return true;
  if (scope === 'metals' && !METALS_CUSTOMER_TABS.includes(tab as MetalsCustomerTab)) return false;
  if (has(permissions, `${scopePrefix(scope)}:${tab}:write`)) return true;
  // Hub legacy: Notes write follows main customers write
  if (tab === 'notes' && scope === 'hub' && has(permissions, mainWriteKey(scope))) return true;
  return false;
}

export function canWriteCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab,
  scope: CustomerPermScope = 'hub',
): boolean {
  if (isAdmin) return true;
  if (canEditCustomerTab(isAdmin, permissions, tab, scope)) return true;

  // Metals: tab write is strict (no main customers:write fallback)
  if (scope === 'metals') return false;

  if (tab === 'general' || tab === 'contacts' || tab === 'sites' || tab === 'notes') {
    if (has(permissions, mainWriteKey(scope))) return true;
  }
  if (tab === 'files') {
    if (has(permissions, 'business:projects:files:write')) return true;
    if (has(permissions, mainWriteKey(scope))) return true;
  }
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
  const scope = scopeFromKey(key);
  const prefix = scopePrefix(scope);
  return tabsForScope(scope).some((t) => key === `${prefix}:${t}:read`);
}

export function isCustomerTabWriteKey(key: string): boolean {
  const scope = scopeFromKey(key);
  const prefix = scopePrefix(scope);
  return tabsForScope(scope).some((t) => key === `${prefix}:${t}:write`);
}

export function splitCustomerAreaPermissions(areaPerms: { key: string }[]) {
  const scope: CustomerPermScope = areaPerms.some((p) => p.key.startsWith('metals:customers:'))
    ? 'metals'
    : 'hub';
  const mainR = mainReadKey(scope);
  const mainW = mainWriteKey(scope);
  const mainViewPerm = areaPerms.find((p) => p.key === mainR);
  const mainEditPerm = areaPerms.find((p) => p.key === mainW);
  const subViewPerms = areaPerms.filter(
    (p) => p.key.includes(':read') && p.key !== mainR && isCustomerTabReadKey(p.key),
  );
  const subEditPerms = areaPerms.filter(
    (p) => p.key.includes(':write') && p.key !== mainW && isCustomerTabWriteKey(p.key),
  );
  return { mainViewPerm, mainEditPerm, subViewPerms, subEditPerms, scope };
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
  const { mainViewPerm, mainEditPerm, subViewPerms, scope } = splitCustomerAreaPermissions(areaPerms);
  const prefix = scopePrefix(scope);
  const mainR = mainReadKey(scope);
  const mainW = mainWriteKey(scope);
  const tabs = tabsForScope(scope);
  const rows: CustomerPermissionRow[] = [];

  if (mainViewPerm) {
    rows.push({
      id: mainViewPerm.id,
      label: formatCustomerPermissionLabel(mainViewPerm.label),
      description: mainViewPerm.description,
      readKey: mainR,
      writeKey: mainEditPerm ? mainW : undefined,
    });
  }

  for (const viewPerm of subViewPerms) {
    const tab = tabs.find((t) => viewPerm.key === `${prefix}:${t}:read`);
    const writeKey = tab ? `${prefix}:${tab}:write` : undefined;
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
  const scope = scopeFromKey(readKey);
  const mainR = mainReadKey(scope);

  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    if (readKey === mainR) {
      return applyPermissionUncheckCascade(mainR, next);
    }
    if (readKey.endsWith(':read') && readKey !== mainR) {
      return applyPermissionUncheckCascade(readKey, next);
    }
    return next;
  }

  if (readKey !== mainR && !next[mainR]) {
    next[mainR] = true;
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
