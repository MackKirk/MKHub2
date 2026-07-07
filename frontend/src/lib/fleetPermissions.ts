import { createScopedEntityPermissions } from '@/lib/scopedEntityPermissions';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';

export const FLEET_ACCESS = 'fleet:access';
export const FLEET_DASHBOARD_READ = 'fleet:dashboard:read';
export const FLEET_WO_ASSIGN = 'fleet:work_orders:assign';

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
