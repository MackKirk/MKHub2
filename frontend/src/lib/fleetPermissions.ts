import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const FLEET_ACCESS = 'fleet:access';
export const FLEET_DASHBOARD_READ = 'fleet:dashboard:read';
export const FLEET_WO_ASSIGN = 'fleet:work_orders:assign';

export const FLEET_ASSETS_MAIN_READ = 'fleet:vehicles:read';
export const FLEET_ASSETS_MAIN_WRITE = 'fleet:vehicles:write';

export const FLEET_ASSET_TABS = [
  'general',
  'inspections',
  'work_orders',
  'compliance',
  'history',
] as const;

export type FleetAssetTab = (typeof FLEET_ASSET_TABS)[number];

function hasPerm(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

/** List fleet assets and open asset records. */
export function canAccessFleetAssetsList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_ASSETS_MAIN_READ) || hasPerm(permissions, FLEET_ASSETS_MAIN_WRITE);
}

/** Create/delete fleet assets (`Edit` on Fleet Assets). */
export function canEditFleetAssetRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_ASSETS_MAIN_WRITE);
}

/** Tab visibility. Strict — requires that tab's own view/write (no main-assets fallback). */
export function canViewFleetAssetTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: FleetAssetTab,
): boolean {
  if (isAdmin) return true;
  const readKey = `fleet:vehicles:${tab}:read`;
  const writeKey = `fleet:vehicles:${tab}:write`;
  return hasPerm(permissions, readKey) || hasPerm(permissions, writeKey);
}

/** Tab edit is strict — requires the tab write key (main assets write is create/delete only). */
export function canEditFleetAssetTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: Exclude<FleetAssetTab, 'history'>,
): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, `fleet:vehicles:${tab}:write`);
}

export const FLEET_WO_MAIN_READ = 'fleet:work_orders:read';
export const FLEET_WO_MAIN_WRITE = 'fleet:work_orders:write';

export const FLEET_WO_TABS = ['general', 'costs', 'files', 'activity'] as const;
export type FleetWorkOrderTab = (typeof FLEET_WO_TABS)[number];

/** List work orders, open detail, calendar. */
export function canAccessFleetWorkOrdersList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_WO_MAIN_READ) || hasPerm(permissions, FLEET_WO_MAIN_WRITE);
}

/** Create work orders (`Edit` on Work Orders). */
export function canEditFleetWorkOrderRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_WO_MAIN_WRITE);
}

/** Tab visibility — strict tab view/write only. */
export function canViewFleetWorkOrderTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: FleetWorkOrderTab,
): boolean {
  if (isAdmin) return true;
  const readKey = `fleet:work_orders:${tab}:read`;
  const writeKey = `fleet:work_orders:${tab}:write`;
  return hasPerm(permissions, readKey) || hasPerm(permissions, writeKey);
}

/** Tab edit — strict write key (activity has no write). */
export function canEditFleetWorkOrderTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: Exclude<FleetWorkOrderTab, 'activity'>,
): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, `fleet:work_orders:${tab}:write`);
}

/** Assign work orders on create (and future reassignment). */
export function canAssignFleetWorkOrder(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_WO_ASSIGN);
}

export const FLEET_INSPECTIONS_MAIN_READ = 'fleet:inspections:read';
export const FLEET_INSPECTIONS_MAIN_WRITE = 'fleet:inspections:write';

export const FLEET_INSPECTION_TABS = ['schedules', 'execution'] as const;
export type FleetInspectionTab = (typeof FLEET_INSPECTION_TABS)[number];

/** List inspections / open schedule records. */
export function canAccessFleetInspectionsList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, FLEET_INSPECTIONS_MAIN_READ) ||
    hasPerm(permissions, FLEET_INSPECTIONS_MAIN_WRITE)
  );
}

/** Main Inspections Edit — create/manage inspection records. */
export function canEditFleetInspectionRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, FLEET_INSPECTIONS_MAIN_WRITE);
}

/** Schedules / Execution visibility — strict tab keys (no main-read fallback). */
export function canViewFleetInspectionTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: FleetInspectionTab,
): boolean {
  if (isAdmin) return true;
  const readKey = `fleet:inspections:${tab}:read`;
  const writeKey = `fleet:inspections:${tab}:write`;
  return hasPerm(permissions, readKey) || hasPerm(permissions, writeKey);
}

/** Schedules / Execution edit — strict tab write. */
export function canEditFleetInspectionTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: FleetInspectionTab,
): boolean {
  if (isAdmin) return true;
  return hasPerm(permissions, `fleet:inspections:${tab}:write`);
}

const fleetAssetsScoped = createScopedEntityPermissions('fleet:vehicles', {
  mainRead: 'fleet:vehicles:read',
  mainWrite: 'fleet:vehicles:write',
  tabs: ['general', 'inspections', 'work_orders', 'compliance', 'history'],
  readOnlyTabs: ['history'],
});

const fleetWorkOrdersScoped = createScopedEntityPermissions('fleet:work_orders', {
  mainRead: 'fleet:work_orders:read',
  mainWrite: 'fleet:work_orders:write',
  tabs: ['general', 'costs', 'files', 'activity'],
  readOnlyTabs: ['activity'],
});

const fleetInspectionsScoped = createScopedEntityPermissions('fleet:inspections', {
  mainRead: 'fleet:inspections:read',
  mainWrite: 'fleet:inspections:write',
  tabs: ['schedules', 'execution'],
});

const fleetDashboardScoped = createScopedEntityPermissions('fleet:dashboard', {
  mainRead: FLEET_DASHBOARD_READ,
  tabs: [],
});

export type FleetAccessLevel = PermissionAccessLevel;

export const buildFleetAssetsPermissionRows = fleetAssetsScoped.buildPermissionRows;
export const getFleetAssetsAccessLevel = fleetAssetsScoped.getAccessLevel;
export const applyFleetAssetsAccessLevel = fleetAssetsScoped.applyAccessLevel;
export const applyFleetAssetsAccessLevelToKeySet = fleetAssetsScoped.applyAccessLevelToKeySet;

export const buildFleetWorkOrdersPermissionRows = fleetWorkOrdersScoped.buildPermissionRows;
export const getFleetWorkOrdersAccessLevel = fleetWorkOrdersScoped.getAccessLevel;
export const applyFleetWorkOrdersAccessLevel = fleetWorkOrdersScoped.applyAccessLevel;
export const applyFleetWorkOrdersAccessLevelToKeySet = fleetWorkOrdersScoped.applyAccessLevelToKeySet;

export const buildFleetInspectionsPermissionRows = fleetInspectionsScoped.buildPermissionRows;
export const getFleetInspectionsAccessLevel = fleetInspectionsScoped.getAccessLevel;
export const applyFleetInspectionsAccessLevel = fleetInspectionsScoped.applyAccessLevel;
export const applyFleetInspectionsAccessLevelToKeySet = fleetInspectionsScoped.applyAccessLevelToKeySet;

export const buildFleetDashboardPermissionRows = fleetDashboardScoped.buildPermissionRows;
export const getFleetDashboardAccessLevel = fleetDashboardScoped.getAccessLevel;
export const applyFleetDashboardAccessLevel = fleetDashboardScoped.applyAccessLevel;
export const applyFleetDashboardAccessLevelToKeySet = fleetDashboardScoped.applyAccessLevelToKeySet;

export function getFleetWorkOrderAssignLevel(permissions: Record<string, boolean>): PermissionAccessLevel {
  return permissions[FLEET_WO_ASSIGN] ? 'edit' : 'blocked';
}

export function applyFleetWorkOrderAssignLevel(
  permissions: Record<string, boolean>,
  level: PermissionAccessLevel,
): Record<string, boolean> {
  return { ...permissions, [FLEET_WO_ASSIGN]: level === 'edit' };
}

export function applyFleetAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: PermissionAccessLevel,
): Record<string, boolean> {
  if (readKey.startsWith('fleet:vehicles:')) {
    return applyFleetAssetsAccessLevel(permissions, readKey, writeKey, level);
  }
  if (readKey.startsWith('fleet:work_orders:') && readKey !== FLEET_WO_ASSIGN) {
    return applyFleetWorkOrdersAccessLevel(permissions, readKey, writeKey, level);
  }
  if (readKey.startsWith('fleet:inspections:')) {
    return applyFleetInspectionsAccessLevel(permissions, readKey, writeKey, level);
  }
  if (readKey.startsWith('fleet:dashboard:')) {
    return applyFleetDashboardAccessLevel(permissions, readKey, writeKey, level);
  }
  return permissions;
}

export function getFleetAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): PermissionAccessLevel {
  if (readKey.startsWith('fleet:vehicles:')) {
    return getFleetAssetsAccessLevel(permissions, readKey, writeKey);
  }
  if (readKey.startsWith('fleet:work_orders:') && readKey !== FLEET_WO_ASSIGN) {
    return getFleetWorkOrdersAccessLevel(permissions, readKey, writeKey);
  }
  if (readKey.startsWith('fleet:inspections:')) {
    return getFleetInspectionsAccessLevel(permissions, readKey, writeKey);
  }
  if (readKey.startsWith('fleet:dashboard:')) {
    return getFleetDashboardAccessLevel(permissions, readKey, writeKey);
  }
  return 'blocked';
}

export function applyFleetAccessLevelToKeySet(
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
  const next = applyFleetAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  scopeKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  if (level !== 'blocked' && readKey.startsWith('fleet:')) {
    out.add(FLEET_ACCESS);
  }
  return out;
}

export function applyFleetAssignToKeySet(
  selectedKeys: Set<string>,
  level: PermissionAccessLevel,
): Set<string> {
  const out = new Set(selectedKeys);
  if (level === 'edit') {
    out.add(FLEET_WO_ASSIGN);
    out.add(FLEET_ACCESS);
    out.add('fleet:work_orders:read');
  } else {
    out.delete(FLEET_WO_ASSIGN);
  }
  return out;
}

export function filterFleetAreaPermissions(areaPerms: { key: string }[]): { key: string }[] {
  return areaPerms.filter(
    (p) =>
      p.key === FLEET_ACCESS ||
      p.key === FLEET_DASHBOARD_READ ||
      p.key.startsWith('fleet:vehicles:') ||
      p.key.startsWith('fleet:work_orders:') ||
      p.key.startsWith('fleet:inspections:'),
  );
}
