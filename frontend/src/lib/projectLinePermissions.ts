import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  PROJECT_LINE_PREFIX,
  clearLegacyProjectSubPermissions,
  type ProjectLineCategoryConfigKeys,
} from '@/lib/projectLinePermissionKeys';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';

export type ProjectLine = 'construction' | 'repairs';

type PermDef = { id: string; key: string; label: string; description?: string };

const SUB_READ_MARKERS = [
  ':reports:',
  ':workload:',
  ':timesheet:',
  ':files:',
  ':documents:',
  ':proposal:',
  ':estimate:',
  ':orders:',
  ':safety:',
] as const;

export type ProjectLineConfigKind =
  | 'construction-files'
  | 'construction-reports'
  | 'repairs-files'
  | 'repairs-reports';

export type ProjectLinePermissionRow =
  | {
      kind: 'pair';
      id: string;
      label: string;
      description?: string;
      readKey: string;
      writeKey: string;
      indent?: boolean;
      configKind?: ProjectLineConfigKind;
    }
  | {
      kind: 'readOnly';
      id: string;
      label: string;
      description?: string;
      readKey: string;
      indent?: boolean;
    }
  | {
      kind: 'writeOnly';
      id: string;
      label: string;
      description?: string;
      writeKey: string;
      indent?: boolean;
    };

function findFirst(areaPerms: PermDef[], keys: string[]): PermDef | undefined {
  for (const k of keys) {
    const p = areaPerms.find((x) => x.key === k);
    if (p) return p;
  }
  return undefined;
}

function linePrefix(line: ProjectLine): string {
  return PROJECT_LINE_PREFIX[line];
}

function isLineSubReadKey(key: string, line: ProjectLine): boolean {
  const prefix = linePrefix(line);
  return (
    key.startsWith(`${prefix}:`) &&
    key.includes(':read') &&
    key !== `${prefix}:read` &&
    key !== `${prefix}:read:all` &&
    SUB_READ_MARKERS.some((m) => key.includes(m))
  );
}

function configKindForKey(key: string, line: ProjectLine): ProjectLineConfigKind | undefined {
  const prefix = linePrefix(line);
  if (key === `${prefix}:files:read` || key === `${prefix}:files:write`) {
    return line === 'construction' ? 'construction-files' : 'repairs-files';
  }
  if (key === `${prefix}:reports:read` || key === `${prefix}:reports:write`) {
    return line === 'construction' ? 'construction-reports' : 'repairs-reports';
  }
  return undefined;
}

export function resolveProjectLineMainReadKey(line: ProjectLine, areaPerms: PermDef[]): string | undefined {
  if (line === 'construction') {
    return findFirst(areaPerms, ['business:construction:projects:read'])?.key;
  }
  return findFirst(areaPerms, ['business:rm:projects:read'])?.key;
}

export function buildProjectLinePermissionRows(
  line: ProjectLine,
  areaPerms: PermDef[]
): ProjectLinePermissionRow[] {
  const rows: ProjectLinePermissionRow[] = [];
  const prefix = linePrefix(line);

  const subViews = areaPerms.filter((p) => isLineSubReadKey(p.key, line));
  for (const viewPerm of subViews) {
    const writeKey = viewPerm.key.replace(':read', ':write');
    if (!areaPerms.some((p) => p.key === writeKey)) continue;
    rows.push({
      kind: 'pair',
      id: viewPerm.id,
      label: formatPermissionLabel(viewPerm.label),
      description: viewPerm.description,
      readKey: viewPerm.key,
      writeKey,
      configKind: configKindForKey(viewPerm.key, line) ?? configKindForKey(writeKey, line),
    });
  }

  const viewAll = findFirst(areaPerms, [`${prefix}:read:all`]);
  if (viewAll) {
    rows.push({
      kind: 'readOnly',
      id: viewAll.id,
      label: formatPermissionLabel(viewAll.label),
      description: viewAll.description,
      readKey: viewAll.key,
    });
  }

  const members = areaPerms.find((p) => p.key === `${prefix}:members:write`);
  if (members) {
    rows.push({
      kind: 'writeOnly',
      id: members.id,
      label: formatPermissionLabel(members.label),
      description: members.description,
      writeKey: members.key,
    });
  }

  return rows;
}

function ensureMainLineRead(
  line: ProjectLine,
  next: Record<string, boolean>,
  mainReadKey: string | undefined
): void {
  const readKey =
    mainReadKey ?? (line === 'construction' ? 'business:construction:projects:read' : 'business:rm:projects:read');
  if (!next[readKey]) next[readKey] = true;
}

export function applyProjectLineAccessLevel(
  line: ProjectLine,
  areaPerms: PermDef[],
  permissions: Record<string, boolean>,
  row: ProjectLinePermissionRow,
  level: PermissionAccessLevel
): Record<string, boolean> {
  const mainReadKey = resolveProjectLineMainReadKey(line, areaPerms);
  const next = { ...permissions };
  const prefix = linePrefix(line);

  if (row.kind === 'pair') {
    if (level === 'blocked') {
      next[row.readKey] = false;
      next[row.writeKey] = false;
      if (row.readKey === mainReadKey) {
        return applyPermissionUncheckCascade(row.readKey, next);
      }
      if (row.readKey.startsWith(`${prefix}:`) && row.readKey.endsWith(':read')) {
        return applyPermissionUncheckCascade(row.readKey, next);
      }
      return next;
    }
    ensureMainLineRead(line, next, mainReadKey);
    if (level === 'view') {
      next[row.readKey] = true;
      next[row.writeKey] = false;
      clearLegacyProjectSubPermissions(next);
      return next;
    }
    next[row.readKey] = true;
    next[row.writeKey] = true;
    clearLegacyProjectSubPermissions(next);
    return next;
  }

  if (row.kind === 'readOnly') {
    if (level === 'blocked') {
      next[row.readKey] = false;
      clearLegacyProjectSubPermissions(next);
      return next;
    }
    ensureMainLineRead(line, next, mainReadKey);
    next[row.readKey] = true;
    clearLegacyProjectSubPermissions(next);
    return next;
  }

  if (level === 'blocked') {
    next[row.writeKey] = false;
    clearLegacyProjectSubPermissions(next);
    return next;
  }
  ensureMainLineRead(line, next, mainReadKey);
  next[row.writeKey] = true;
  clearLegacyProjectSubPermissions(next);
  return next;
}

export function getProjectLineRowAccessLevel(
  permissions: Record<string, boolean>,
  row: ProjectLinePermissionRow
): PermissionAccessLevel {
  if (row.kind === 'pair') {
    return getPermissionAccessLevel(permissions, row.readKey, row.writeKey);
  }
  if (row.kind === 'readOnly') {
    return getPermissionAccessLevel(permissions, row.readKey);
  }
  return getPermissionAccessLevel(permissions, undefined, row.writeKey);
}

export function applyProjectLineAccessLevelToKeySet(
  selectedKeys: Set<string>,
  scopeKeys: string[],
  line: ProjectLine,
  areaPerms: PermDef[],
  row: ProjectLinePermissionRow,
  level: PermissionAccessLevel
): Set<string> {
  const perms: Record<string, boolean> = {};
  scopeKeys.forEach((k) => {
    perms[k] = selectedKeys.has(k);
  });
  const next = applyProjectLineAccessLevel(line, areaPerms, perms, row, level);
  const out = new Set(selectedKeys);
  scopeKeys.forEach((k) => {
    if (next[k]) out.add(k);
    else out.delete(k);
  });
  return out;
}

export type { ProjectLineCategoryConfigKeys };
