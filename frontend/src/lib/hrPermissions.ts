import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';
import type { ScopedPermissionRow } from '@/lib/scopedEntityPermissions';

export const HR_ACCESS = 'hr:access';

export const HR_USERS_READ = 'hr:users:read';
export const HR_USERS_WRITE = 'hr:users:write';
export const HR_USERS_VIEW_GENERAL = 'hr:users:view:general';
export const HR_USERS_EDIT_GENERAL = 'hr:users:edit:general';
export const HR_USERS_VIEW_JOB_COMP = 'hr:users:view:job:compensation';
export const HR_USERS_VIEW_TIMESHEET = 'hr:users:view:timesheet';
export const HR_USERS_EDIT_TIMESHEET = 'hr:users:edit:timesheet';
export const HR_USERS_VIEW_PERMISSIONS = 'hr:users:view:permissions';
export const HR_USERS_EDIT_PERMISSIONS = 'hr:users:edit:permissions';
export const HR_USERS_VIEW_ACTIVITY = 'hr:users:view:activity';

export const HR_OFFBOARDING_READ = 'hr:offboarding:read';
export const HR_OFFBOARDING_WRITE = 'hr:offboarding:write';
export const HR_ATTENDANCE_READ = 'hr:attendance:read';
export const HR_ATTENDANCE_WRITE = 'hr:attendance:write';
export const HR_COMMUNITY_READ = 'hr:community:read';
export const HR_COMMUNITY_WRITE = 'hr:community:write';
export const HR_REVIEWS_ADMIN = 'hr:reviews:admin';
export const HR_TIMESHEET_READ = 'hr:timesheet:read';
export const HR_TIMESHEET_WRITE = 'hr:timesheet:write';
export const HR_TIMESHEET_APPROVE = 'hr:timesheet:approve';
export const HR_TIMESHEET_UNRESTRICTED_CLOCK = 'hr:timesheet:unrestricted_clock';

export type HrAccessLevel = PermissionAccessLevel;

type PermDef = { id: string; key: string; label: string; description?: string };

function findPerm(areaPerms: PermDef[], key: string): PermDef | undefined {
  return areaPerms.find((p) => p.key === key);
}

function readWriteRow(
  areaPerms: PermDef[],
  readKey: string,
  writeKey: string | undefined,
  opts?: { indent?: boolean },
): ScopedPermissionRow | null {
  const readPerm = findPerm(areaPerms, readKey);
  if (!readPerm) return null;
  const writePerm = writeKey ? findPerm(areaPerms, writeKey) : undefined;
  return {
    id: readPerm.id,
    label: formatPermissionLabel(readPerm.label),
    description: readPerm.description,
    readKey,
    writeKey: writePerm ? writeKey : undefined,
    indent: opts?.indent,
  };
}

export function buildHrUsersPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const rows: ScopedPermissionRow[] = [];
  const list = readWriteRow(areaPerms, HR_USERS_READ, HR_USERS_WRITE);
  if (list) rows.push(list);

  const general = readWriteRow(areaPerms, HR_USERS_VIEW_GENERAL, HR_USERS_EDIT_GENERAL);
  if (general) rows.push(general);

  const jobComp = readWriteRow(areaPerms, HR_USERS_VIEW_JOB_COMP, undefined, { indent: true });
  if (jobComp) rows.push(jobComp);

  const timesheet = readWriteRow(areaPerms, HR_USERS_VIEW_TIMESHEET, HR_USERS_EDIT_TIMESHEET);
  if (timesheet) rows.push(timesheet);

  const permissions = readWriteRow(areaPerms, HR_USERS_VIEW_PERMISSIONS, HR_USERS_EDIT_PERMISSIONS);
  if (permissions) rows.push(permissions);

  const activity = readWriteRow(areaPerms, HR_USERS_VIEW_ACTIVITY, undefined);
  if (activity) rows.push(activity);

  return rows;
}

export function buildHrOffboardingPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const row = readWriteRow(areaPerms, HR_OFFBOARDING_READ, HR_OFFBOARDING_WRITE);
  return row ? [row] : [];
}

export function buildHrAttendancePermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const row = readWriteRow(areaPerms, HR_ATTENDANCE_READ, HR_ATTENDANCE_WRITE);
  return row ? [row] : [];
}

export function buildHrCommunityPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const row = readWriteRow(areaPerms, HR_COMMUNITY_READ, HR_COMMUNITY_WRITE);
  return row ? [row] : [];
}

export function buildHrTimesheetPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
  const row = readWriteRow(areaPerms, HR_TIMESHEET_READ, HR_TIMESHEET_WRITE);
  return row ? [row] : [];
}

export function getHrAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey?: string,
): HrAccessLevel {
  return getPermissionAccessLevel(permissions, readKey, writeKey);
}

export function getHrWriteOnlyLevel(
  permissions: Record<string, boolean>,
  key: string,
): HrAccessLevel {
  return permissions[key] ? 'edit' : 'blocked';
}

function ensureHrAccess(next: Record<string, boolean>): Record<string, boolean> {
  if (Object.keys(next).some((k) => k.startsWith('hr:') && k !== HR_ACCESS && next[k])) {
    next[HR_ACCESS] = true;
  }
  return next;
}

function ensureUsersListForTab(next: Record<string, boolean>, readKey: string): Record<string, boolean> {
  if (readKey.startsWith('hr:users:') && readKey !== HR_USERS_READ && readKey !== HR_USERS_WRITE) {
    next[HR_USERS_READ] = true;
  }
  return next;
}

function ensureGeneralForJobComp(next: Record<string, boolean>, readKey: string, level: HrAccessLevel): Record<string, boolean> {
  if (readKey === HR_USERS_VIEW_JOB_COMP && level !== 'blocked') {
    next[HR_USERS_VIEW_GENERAL] = true;
    next[HR_USERS_READ] = true;
  }
  return next;
}

export function applyHrAccessLevel(
  permissions: Record<string, boolean>,
  readKey: string,
  writeKey: string | undefined,
  level: HrAccessLevel,
): Record<string, boolean> {
  const next = { ...permissions };

  if (level === 'blocked') {
    next[readKey] = false;
    if (writeKey) next[writeKey] = false;
    if (readKey === HR_USERS_READ) {
      return applyPermissionUncheckCascade(HR_USERS_READ, next);
    }
    if (readKey.endsWith(':read') || readKey.includes(':view:')) {
      return applyPermissionUncheckCascade(readKey, next);
    }
    return next;
  }

  ensureUsersListForTab(next, readKey);
  ensureGeneralForJobComp(next, readKey, level);

  if (level === 'view') {
    next[readKey] = true;
    if (writeKey) next[writeKey] = false;
    return ensureHrAccess(next);
  }

  next[readKey] = true;
  if (writeKey) next[writeKey] = true;
  return ensureHrAccess(next);
}

export function applyHrWriteOnlyLevel(
  permissions: Record<string, boolean>,
  key: string,
  level: HrAccessLevel,
): Record<string, boolean> {
  const next = { ...permissions, [key]: level === 'edit' };
  if (key === HR_TIMESHEET_APPROVE && level === 'edit') {
    next[HR_TIMESHEET_READ] = true;
  }
  return ensureHrAccess(next);
}

export function applyHrAccessLevelToKeySet(
  selectedKeys: Set<string>,
  scopeKeys: string[],
  readKey: string,
  writeKey: string | undefined,
  level: HrAccessLevel,
): Set<string> {
  const perms: Record<string, boolean> = {};
  scopeKeys.forEach((k) => {
    perms[k] = selectedKeys.has(k);
  });
  const next = applyHrAccessLevel(perms, readKey, writeKey, level);
  const out = new Set(selectedKeys);
  scopeKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  if (next[HR_ACCESS]) out.add(HR_ACCESS);
  if (next[HR_USERS_READ]) out.add(HR_USERS_READ);
  return out;
}

export function applyHrWriteOnlyToKeySet(
  selectedKeys: Set<string>,
  key: string,
  level: HrAccessLevel,
): Set<string> {
  const next = applyHrWriteOnlyLevel(
    Object.fromEntries([...selectedKeys].map((k) => [k, true])),
    key,
    level,
  );
  const out = new Set(selectedKeys);
  if (next[key]) out.add(key);
  else out.delete(key);
  if (next[HR_ACCESS]) out.add(HR_ACCESS);
  if (next[HR_TIMESHEET_READ]) out.add(HR_TIMESHEET_READ);
  return out;
}

export function filterHrAreaPermissions(areaPerms: { key: string }[]): { key: string }[] {
  return areaPerms.filter((p) => p.key === HR_ACCESS || p.key.startsWith('hr:'));
}
