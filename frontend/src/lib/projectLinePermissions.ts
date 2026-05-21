import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
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

export type ProjectLinePermissionRow =
  | {
      kind: 'pair';
      id: string;
      label: string;
      description?: string;
      readKey: string;
      writeKey: string;
      indent?: boolean;
      configKind?: 'project-files-read' | 'project-files-write' | 'project-reports-read' | 'project-reports-write';
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

function isSubReadKey(key: string): boolean {
  return (
    key.includes(':read') &&
    key !== 'business:projects:read' &&
    key !== 'business:construction:projects:read' &&
    key !== 'business:construction:projects:read:all' &&
    key !== 'business:rm:projects:read' &&
    key !== 'business:rm:projects:read:all' &&
    SUB_READ_MARKERS.some((m) => key.includes(m))
  );
}

function configKindForKey(key: string): ProjectLinePermissionRow['configKind'] {
  if (key === 'business:projects:files:read') return 'project-files-read';
  if (key === 'business:projects:files:write') return 'project-files-write';
  if (key === 'business:projects:reports:read') return 'project-reports-read';
  if (key === 'business:projects:reports:write') return 'project-reports-write';
  return undefined;
}

export function resolveProjectLineMainReadKey(line: ProjectLine, areaPerms: PermDef[]): string | undefined {
  if (line === 'construction') {
    return (
      findFirst(areaPerms, ['business:construction:projects:read', 'business:projects:read'])?.key
    );
  }
  return findFirst(areaPerms, ['business:rm:projects:read'])?.key;
}

export function buildProjectLinePermissionRows(
  line: ProjectLine,
  areaPerms: PermDef[]
): ProjectLinePermissionRow[] {
  const rows: ProjectLinePermissionRow[] = [];

  if (line === 'construction') {
    // Main construction projects read/write is not shown — it only cascades when blocked;
    // access is controlled via the sub-permissions below.

    const subViews = areaPerms.filter((p) => isSubReadKey(p.key));
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
        configKind: configKindForKey(viewPerm.key) ?? configKindForKey(writeKey),
      });
    }

    const viewAll = findFirst(areaPerms, ['business:construction:projects:read:all']);
    if (viewAll) {
      rows.push({
        kind: 'readOnly',
        id: viewAll.id,
        label: formatPermissionLabel(viewAll.label),
        description: viewAll.description,
        readKey: viewAll.key,
      });
    }

    const members = areaPerms.find((p) => p.key === 'business:projects:members:write');
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

  const mainView = findFirst(areaPerms, ['business:rm:projects:read']);
  const mainEdit = findFirst(areaPerms, ['business:rm:projects:write']);
  if (mainView) {
    rows.push({
      kind: 'pair',
      id: mainView.id,
      label: formatPermissionLabel(mainView.label),
      description: mainView.description,
      readKey: mainView.key,
      writeKey: mainEdit?.key ?? 'business:rm:projects:write',
    });
  }

  const viewAll = findFirst(areaPerms, ['business:rm:projects:read:all']);
  if (viewAll) {
    rows.push({
      kind: 'readOnly',
      id: viewAll.id,
      label: formatPermissionLabel(viewAll.label),
      description: viewAll.description,
      readKey: viewAll.key,
      indent: true,
    });
  }

  return rows;
}

function ensureMainLineRead(
  line: ProjectLine,
  next: Record<string, boolean>,
  mainReadKey: string | undefined
): void {
  if (!mainReadKey) return;
  if (!next[mainReadKey]) next[mainReadKey] = true;
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

  if (row.kind === 'pair') {
    if (level === 'blocked') {
      next[row.readKey] = false;
      next[row.writeKey] = false;
      if (row.readKey === mainReadKey) {
        return applyPermissionUncheckCascade(row.readKey, next);
      }
      if (row.readKey.startsWith('business:projects:') && row.readKey.endsWith(':read')) {
        return applyPermissionUncheckCascade(row.readKey, next);
      }
      return next;
    }
    ensureMainLineRead(line, next, mainReadKey);
    if (level === 'view') {
      next[row.readKey] = true;
      next[row.writeKey] = false;
      return next;
    }
    next[row.readKey] = true;
    next[row.writeKey] = true;
    return next;
  }

  if (row.kind === 'readOnly') {
    if (level === 'blocked') {
      next[row.readKey] = false;
      return next;
    }
    ensureMainLineRead(line, next, mainReadKey);
    next[row.readKey] = true;
    return next;
  }

  if (level === 'blocked') {
    next[row.writeKey] = false;
    return next;
  }
  ensureMainLineRead(line, next, mainReadKey);
  next[row.writeKey] = true;
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
