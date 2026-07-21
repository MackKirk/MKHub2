import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import { getPermissionAccessLevel, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import type { ScopedPermissionRow } from '@/lib/scopedEntityPermissions';

export const TRAINING_ACCESS = 'training:access';
export const TRAINING_DASHBOARD_READ = 'training:dashboard:read';
export const TRAINING_ADMIN_READ = 'training:admin:read';
export const TRAINING_ADMIN_WRITE = 'training:admin:write';
export const TRAINING_MANAGE_LEGACY = 'training:manage';

export type TrainingAccessLevel = PermissionAccessLevel;

type PermDef = { id: string; key: string; label: string; description?: string };

function hasAnyTrainingChild(permissions: Record<string, boolean> | Set<string>): boolean {
  const has = (key: string) =>
    permissions instanceof Set ? permissions.has(key) : !!permissions[key];
  return [TRAINING_DASHBOARD_READ, TRAINING_ADMIN_READ, TRAINING_ADMIN_WRITE].some(has);
}

export function syncTrainingAccess(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  next[TRAINING_ACCESS] = hasAnyTrainingChild(next);
  return next;
}

export function syncTrainingAccessInKeySet(selectedKeys: Set<string>): Set<string> {
  const out = new Set(selectedKeys);
  if (hasAnyTrainingChild(out)) out.add(TRAINING_ACCESS);
  else out.delete(TRAINING_ACCESS);
  return out;
}

export function buildTrainingPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const rows: ScopedPermissionRow[] = [];
  const dashboard = areaPerms.find((p) => p.key === TRAINING_DASHBOARD_READ);
  if (dashboard) {
    rows.push({
      id: dashboard.id,
      label: dashboard.label,
      description: dashboard.description,
      readKey: TRAINING_DASHBOARD_READ,
    });
  }
  const adminRead = areaPerms.find((p) => p.key === TRAINING_ADMIN_READ);
  const adminWrite = areaPerms.find((p) => p.key === TRAINING_ADMIN_WRITE);
  if (adminRead) {
    rows.push({
      id: adminRead.id,
      label: adminRead.label,
      description: adminRead.description,
      readKey: TRAINING_ADMIN_READ,
      writeKey: adminWrite?.key,
    });
  }
  return rows;
}

export function getTrainingAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): TrainingAccessLevel {
  return getPermissionAccessLevel(permissions, readKey, writeKey);
}

export function applyTrainingAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: TrainingAccessLevel,
): Record<string, boolean> {
  let next = { ...permissions };
  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    next = applyPermissionUncheckCascade(readKey, next);
    return syncTrainingAccess(next);
  }
  next[readKey] = true;
  if (writeKey) next[writeKey] = level === 'edit';
  return syncTrainingAccess(next);
}

export function applyTrainingAccessLevelToKeySet(
  selectedKeys: Set<string>,
  readKey: string,
  writeKey: string | undefined,
  level: TrainingAccessLevel,
): Set<string> {
  const record = Object.fromEntries([...selectedKeys].map((key) => [key, true]));
  const next = applyTrainingAccessLevel(record, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  [readKey, writeKey, TRAINING_ACCESS].filter(Boolean).forEach((key) => {
    if (next[key!]) out.add(key!);
    else out.delete(key!);
  });
  return syncTrainingAccessInKeySet(out);
}

export function filterTrainingAreaPermissions(areaPerms: PermDef[]): PermDef[] {
  return areaPerms.filter(
    (p) =>
      p.key === TRAINING_DASHBOARD_READ ||
      p.key === TRAINING_ADMIN_READ ||
      p.key === TRAINING_ADMIN_WRITE,
  );
}
