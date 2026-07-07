import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import {
  formatPermissionLabel,
  getPermissionAccessLevel,
  type PermissionAccessLevel,
} from '@/lib/permissionAccessLevel';

export type ScopedPermissionRow = {
  id: string;
  label: string;
  description?: string;
  readKey: string;
  writeKey?: string;
  indent?: boolean;
};

type PermDef = { id: string; key: string; label: string; description?: string };

export type ScopedEntityConfig = {
  mainRead: string;
  mainWrite?: string;
  tabs: readonly string[];
  /** Tabs that only have a read permission (no write row). */
  readOnlyTabs?: readonly string[];
};

function tabReadKey(prefix: string, tab: string): string {
  return `${prefix}:${tab}:read`;
}

function tabWriteKey(prefix: string, tab: string): string {
  return `${prefix}:${tab}:write`;
}

export function createScopedEntityPermissions(prefix: string, config: ScopedEntityConfig) {
  const readOnly = new Set(config.readOnlyTabs ?? []);

  function isTabReadKey(key: string): boolean {
    return config.tabs.some((t) => key === tabReadKey(prefix, t));
  }

  function isTabWriteKey(key: string): boolean {
    return config.tabs.some((t) => !readOnly.has(t) && key === tabWriteKey(prefix, t));
  }

  function splitAreaPermissions(areaPerms: { key: string }[]) {
    const mainViewPerm = areaPerms.find((p) => p.key === config.mainRead);
    const mainEditPerm = config.mainWrite
      ? areaPerms.find((p) => p.key === config.mainWrite)
      : undefined;
    const subViewPerms = areaPerms.filter(
      (p) => p.key.includes(':read') && p.key !== config.mainRead && isTabReadKey(p.key),
    );
    const subEditPerms = areaPerms.filter(
      (p) => p.key.includes(':write') && p.key !== config.mainWrite && isTabWriteKey(p.key),
    );
    return { mainViewPerm, mainEditPerm, subViewPerms, subEditPerms };
  }

  function buildPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {
    const { mainViewPerm, mainEditPerm, subViewPerms } = splitAreaPermissions(areaPerms);
    const rows: ScopedPermissionRow[] = [];

    if (mainViewPerm) {
      rows.push({
        id: mainViewPerm.id,
        label: formatPermissionLabel(mainViewPerm.label),
        description: mainViewPerm.description,
        readKey: config.mainRead,
        writeKey: mainEditPerm && config.mainWrite ? config.mainWrite : undefined,
      });
    }

    for (const viewPerm of subViewPerms) {
      const tab = config.tabs.find((t) => viewPerm.key === tabReadKey(prefix, t));
      const writeKey = tab && !readOnly.has(tab) ? tabWriteKey(prefix, tab) : undefined;
      const hasWriteDef = writeKey && areaPerms.some((p) => p.key === writeKey);
      rows.push({
        id: viewPerm.id,
        label: formatPermissionLabel(viewPerm.label),
        description: viewPerm.description,
        readKey: viewPerm.key,
        writeKey: hasWriteDef ? writeKey : undefined,
        indent: true,
      });
    }

    return rows;
  }

  function getAccessLevel(
    permissions: Record<string, boolean>,
    readKey: string,
    writeKey?: string,
  ): PermissionAccessLevel {
    return getPermissionAccessLevel(permissions, readKey, writeKey);
  }

  function applyAccessLevel(
    permissions: Record<string, boolean>,
    readKey: string,
    writeKey: string | undefined,
    level: PermissionAccessLevel,
  ): Record<string, boolean> {
    const next = { ...permissions };

    if (level === 'blocked') {
      next[readKey] = false;
      if (writeKey) next[writeKey] = false;
      if (readKey === config.mainRead) {
        return applyPermissionUncheckCascade(config.mainRead, next);
      }
      if (readKey.endsWith(':read') && readKey !== config.mainRead) {
        return applyPermissionUncheckCascade(readKey, next);
      }
      return next;
    }

    if (readKey !== config.mainRead && !next[config.mainRead]) {
      next[config.mainRead] = true;
    }

    if (level === 'view') {
      next[readKey] = true;
      if (writeKey) next[writeKey] = false;
      return next;
    }

    next[readKey] = true;
    if (writeKey) next[writeKey] = true;
    return next;
  }

  function applyAccessLevelToKeySet(
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
    const next = applyAccessLevel(perms, readKey, writeKey, level);
    const out = new Set(selectedKeys);
    scopeKeys.forEach((k) => {
      if (next[k]) out.add(k);
      else out.delete(k);
    });
    return out;
  }

  return {
    config,
    prefix,
    isTabReadKey,
    isTabWriteKey,
    tabReadKey: (tab: string) => tabReadKey(prefix, tab),
    tabWriteKey: (tab: string) => tabWriteKey(prefix, tab),
    buildPermissionRows,
    getAccessLevel,
    applyAccessLevel,
    applyAccessLevelToKeySet,
  };
}
