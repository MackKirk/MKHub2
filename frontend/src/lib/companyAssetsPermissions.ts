import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const COMPANY_ASSETS_ACCESS = 'company_assets:access';
export const EQUIPMENT_MAIN_READ = 'fleet:equipment:read';
export const EQUIPMENT_MAIN_WRITE = 'fleet:equipment:write';
export const CORPORATE_CARDS_READ = 'company_cards:read';
export const CORPORATE_CARDS_WRITE = 'company_cards:write';

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
  if (level !== 'blocked') {
    out.add(COMPANY_ASSETS_ACCESS);
  }
  return out;
}

export function filterCompanyAssetsAreaPermissions(areaPerms: { key: string }[]): { key: string }[] {
  return areaPerms.filter(
    (p) =>
      p.key === COMPANY_ASSETS_ACCESS ||
      p.key.startsWith('fleet:equipment:') ||
      p.key.startsWith('company_cards:'),
  );
}
