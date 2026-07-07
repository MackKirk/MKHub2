import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const SUPPLIER_MAIN_READ = 'inventory:suppliers:read';
export const SUPPLIER_MAIN_WRITE = 'inventory:suppliers:write';

export const SUPPLIER_TABS = ['overview', 'contacts', 'products'] as const;
export type SupplierTab = (typeof SUPPLIER_TABS)[number];

const supplierScoped = createScopedEntityPermissions('inventory:suppliers', {
  mainRead: SUPPLIER_MAIN_READ,
  mainWrite: SUPPLIER_MAIN_WRITE,
  tabs: SUPPLIER_TABS,
});

export type SupplierAccessLevel = PermissionAccessLevel;
export type SupplierPermissionRow = ReturnType<typeof supplierScoped.buildPermissionRows>[number];

export const buildSupplierPermissionRows = supplierScoped.buildPermissionRows;
export const getSupplierAccessLevel = supplierScoped.getAccessLevel;
export const applySupplierAccessLevel = supplierScoped.applyAccessLevel;
export const applySupplierAccessLevelToKeySet = supplierScoped.applyAccessLevelToKeySet;

function has(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

export function canAccessSupplierList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, SUPPLIER_MAIN_READ) || has(permissions, SUPPLIER_MAIN_WRITE);
}

export function canAccessSupplierDetail(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  if (canAccessSupplierList(isAdmin, permissions)) return true;
  return SUPPLIER_TABS.some((tab) => canViewSupplierTab(isAdmin, permissions, tab));
}

export function canViewSupplierTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: SupplierTab,
): boolean {
  if (isAdmin) return true;
  const readKey = supplierScoped.tabReadKey(tab);
  const writeKey = supplierScoped.tabWriteKey(tab);
  return has(permissions, readKey) || has(permissions, writeKey);
}

export function canReadSupplierTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: SupplierTab,
): boolean {
  if (isAdmin) return true;
  if (canViewSupplierTab(isAdmin, permissions, tab)) return true;

  if (tab === 'overview' || tab === 'contacts') {
    if (has(permissions, SUPPLIER_MAIN_READ) || has(permissions, SUPPLIER_MAIN_WRITE)) return true;
  }
  if (tab === 'products') {
    if (has(permissions, 'inventory:products:read') || has(permissions, 'inventory:products:write')) {
      return true;
    }
  }
  return false;
}

export function canEditSupplierRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, SUPPLIER_MAIN_WRITE);
}

export function canEditSupplierTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: SupplierTab,
): boolean {
  if (isAdmin) return true;
  return has(permissions, supplierScoped.tabWriteKey(tab));
}

export function canWriteSupplierTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: SupplierTab,
): boolean {
  if (isAdmin) return true;
  if (canEditSupplierTab(isAdmin, permissions, tab)) return true;

  if (tab === 'overview' || tab === 'contacts') {
    if (has(permissions, SUPPLIER_MAIN_WRITE)) return true;
  }
  if (tab === 'products') {
    if (has(permissions, 'inventory:products:write')) return true;
  }
  return false;
}
