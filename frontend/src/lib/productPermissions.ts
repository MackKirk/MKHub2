import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const PRODUCT_MAIN_READ = 'inventory:products:read';
export const PRODUCT_MAIN_WRITE = 'inventory:products:write';

export const PRODUCT_TABS = ['details', 'usage', 'related'] as const;
export type ProductTab = (typeof PRODUCT_TABS)[number];

const productScoped = createScopedEntityPermissions('inventory:products', {
  mainRead: PRODUCT_MAIN_READ,
  mainWrite: PRODUCT_MAIN_WRITE,
  tabs: PRODUCT_TABS,
  readOnlyTabs: ['usage'],
});

export type ProductAccessLevel = PermissionAccessLevel;
export type ProductPermissionRow = ReturnType<typeof productScoped.buildPermissionRows>[number];

export const buildProductPermissionRows = productScoped.buildPermissionRows;
export const getProductAccessLevel = productScoped.getAccessLevel;
export const applyProductAccessLevel = productScoped.applyAccessLevel;
export const applyProductAccessLevelToKeySet = productScoped.applyAccessLevelToKeySet;

function has(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

export function canAccessProductList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, PRODUCT_MAIN_READ) || has(permissions, PRODUCT_MAIN_WRITE);
}

export function canAccessProductDetail(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  if (canAccessProductList(isAdmin, permissions)) return true;
  return PRODUCT_TABS.some((tab) => canViewProductTab(isAdmin, permissions, tab));
}

export function canViewProductTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: ProductTab,
): boolean {
  if (isAdmin) return true;
  const readKey = productScoped.tabReadKey(tab);
  const writeKey = productScoped.tabWriteKey(tab);
  return has(permissions, readKey) || has(permissions, writeKey);
}

export function canReadProductTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: ProductTab,
): boolean {
  if (isAdmin) return true;
  if (canViewProductTab(isAdmin, permissions, tab)) return true;

  if (tab === 'details' || tab === 'usage' || tab === 'related') {
    if (has(permissions, PRODUCT_MAIN_READ) || has(permissions, PRODUCT_MAIN_WRITE)) return true;
  }
  return false;
}

export function canEditProductRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, PRODUCT_MAIN_WRITE);
}

export function canEditProductTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: ProductTab,
): boolean {
  if (isAdmin) return true;
  if (tab === 'usage') return false;
  return has(permissions, productScoped.tabWriteKey(tab));
}

export function canWriteProductTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: ProductTab,
): boolean {
  if (isAdmin) return true;
  if (canEditProductTab(isAdmin, permissions, tab)) return true;

  if (tab === 'details' || tab === 'related') {
    if (has(permissions, PRODUCT_MAIN_WRITE)) return true;
  }
  return false;
}
