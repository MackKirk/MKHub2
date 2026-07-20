import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const COMPANY_ASSETS_ACCESS = 'company_assets:access';
export const EQUIPMENT_MAIN_READ = 'fleet:equipment:read';
export const EQUIPMENT_MAIN_WRITE = 'fleet:equipment:write';
export const CORPORATE_CARDS_READ = 'company_cards:read';
export const CORPORATE_CARDS_WRITE = 'company_cards:write';

export const EQUIPMENT_TABS = ['general', 'work_orders', 'history'] as const;
export type EquipmentTab = (typeof EQUIPMENT_TABS)[number];

function hasPerm(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

/** List equipment and open equipment records. */
export function canAccessEquipmentList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, EQUIPMENT_MAIN_READ) || hasPerm(permissions, EQUIPMENT_MAIN_WRITE);
}

/** Create/delete equipment (`Edit` on Equipment). */
export function canEditEquipmentRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, EQUIPMENT_MAIN_WRITE);
}

/** Tab visibility — strict tab view/write only. */
export function canViewEquipmentTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: EquipmentTab,
): boolean {
  if (isAdmin) return true;
  const readKey = `fleet:equipment:${tab}:read`;
  const writeKey = `fleet:equipment:${tab}:write`;
  return hasPerm(permissions, readKey) || hasPerm(permissions, writeKey);
}

/** Tab edit — strict write key (history has no write). */
export function canEditEquipmentTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: Exclude<EquipmentTab, 'history'>,
): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, `fleet:equipment:${tab}:write`);
}

/** List corporate cards and open card records. */
export function canAccessCorporateCardsList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, CORPORATE_CARDS_READ) || hasPerm(permissions, CORPORATE_CARDS_WRITE);
}

/** Create/edit/assign corporate cards (`Edit` on Corporate Cards). */
export function canEditCorporateCards(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, CORPORATE_CARDS_WRITE);
}

const equipmentScoped = createScopedEntityPermissions('fleet:equipment', {
  mainRead: EQUIPMENT_MAIN_READ,
  mainWrite: EQUIPMENT_MAIN_WRITE,
  tabs: ['general', 'work_orders', 'history'],
  readOnlyTabs: ['history'],
});

const corporateCardsScoped = createScopedEntityPermissions('company_cards', {
  mainRead: CORPORATE_CARDS_READ,
  mainWrite: CORPORATE_CARDS_WRITE,
  tabs: [],
});

export type CompanyAssetsAccessLevel = PermissionAccessLevel;

export const buildEquipmentPermissionRows = equipmentScoped.buildPermissionRows;
export const getEquipmentAccessLevel = equipmentScoped.getAccessLevel;
export const applyEquipmentAccessLevel = equipmentScoped.applyAccessLevel;
export const applyEquipmentAccessLevelToKeySet = equipmentScoped.applyAccessLevelToKeySet;

export const buildCorporateCardsPermissionRows = corporateCardsScoped.buildPermissionRows;
export const getCorporateCardsAccessLevel = corporateCardsScoped.getAccessLevel;
export const applyCorporateCardsAccessLevel = corporateCardsScoped.applyAccessLevel;
export const applyCorporateCardsAccessLevelToKeySet = corporateCardsScoped.applyAccessLevelToKeySet;

export function applyCompanyAssetsAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: PermissionAccessLevel,
): Record<string, boolean> {
  if (readKey.startsWith('fleet:equipment:')) {
    return applyEquipmentAccessLevel(permissions, readKey, writeKey, level);
  }
  if (readKey.startsWith('company_cards:')) {
    return applyCorporateCardsAccessLevel(permissions, readKey, writeKey, level);
  }
  return permissions;
}

export function getCompanyAssetsAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): PermissionAccessLevel {
  if (readKey.startsWith('fleet:equipment:')) {
    return getEquipmentAccessLevel(permissions, readKey, writeKey);
  }
  if (readKey.startsWith('company_cards:')) {
    return getCorporateCardsAccessLevel(permissions, readKey, writeKey);
  }
  return 'blocked';
}

export function applyCompanyAssetsAccessLevelToKeySet(
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
  const next = applyCompanyAssetsAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  scopeKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  return syncCompanyAssetsAccessInKeySet(out);
}

/** True when any Equipment or Corporate Cards permission is granted. */
export function hasAnyCompanyAssetsChildPermission(
  permissions: Record<string, boolean> | Set<string>,
): boolean {
  const has = (key: string) =>
    permissions instanceof Set ? permissions.has(key) : !!permissions[key];
  if (permissions instanceof Set) {
    for (const k of permissions) {
      if (k.startsWith('fleet:equipment:') || k.startsWith('company_cards:')) return true;
    }
    return false;
  }
  return Object.keys(permissions).some(
    (k) => (k.startsWith('fleet:equipment:') || k.startsWith('company_cards:')) && has(k),
  );
}

/** Keep `company_assets:access` in sync with child Equipment/Cards grants (implicit area gate). */
export function syncCompanyAssetsAccess(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  next[COMPANY_ASSETS_ACCESS] = hasAnyCompanyAssetsChildPermission(next);
  return next;
}

export function syncCompanyAssetsAccessInKeySet(selectedKeys: Set<string>): Set<string> {
  const out = new Set(selectedKeys);
  if (hasAnyCompanyAssetsChildPermission(out)) out.add(COMPANY_ASSETS_ACCESS);
  else out.delete(COMPANY_ASSETS_ACCESS);
  return out;
}

export function filterCompanyAssetsAreaPermissions(areaPerms: { key: string }[]): { key: string }[] {
  return areaPerms.filter(
    (p) => p.key.startsWith('fleet:equipment:') || p.key.startsWith('company_cards:'),
  );
}
