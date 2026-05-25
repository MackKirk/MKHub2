import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import type { ProjectLine } from '@/lib/projectLinePermissions';

export function projectLineFromBusinessLine(businessLine?: string | null): ProjectLine {
  return businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? 'repairs' : 'construction';
}

export function projectFeaturePermKey(
  businessLine: string | undefined | null,
  feature: string,
  action: 'read' | 'write'
): string {
  const line = projectLineFromBusinessLine(businessLine);
  return `${PROJECT_LINE_PREFIX[line]}:${feature}:${action}`;
}

function hasPerm(permissions: Set<string> | Record<string, boolean>, key: string): boolean {
  return permissions instanceof Set
    ? permissions.has(key)
    : !!(permissions as Record<string, boolean>)[key];
}

/** View tab/section: line read or line write (write implies read). */
export function hasProjectFeaturePermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string
): boolean {
  return (
    hasProjectFeatureReadPermission(permissions, businessLine, feature) ||
    hasProjectFeatureWritePermission(permissions, businessLine, feature)
  );
}

export function hasProjectFeatureReadPermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string
): boolean {
  return hasPerm(permissions, projectFeaturePermKey(businessLine, feature, 'read'));
}

/** Create/edit/upload: line write only (view-only must not pass). */
export function hasProjectFeatureWritePermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string
): boolean {
  return hasPerm(permissions, projectFeaturePermKey(businessLine, feature, 'write'));
}

/** Legacy shared project permissions (hidden in UI; backend fallback). */
export const LEGACY_PROJECT_PREFIX = 'business:projects';

export const PROJECT_LINE_PREFIX: Record<ProjectLine, string> = {
  construction: 'business:construction:projects',
  repairs: 'business:rm:projects',
};

export type ProjectLineCategoryConfigKeys = {
  filesRead: string;
  filesWrite: string;
  reportsRead: string;
  reportsWrite: string;
};

export function getProjectLineCategoryConfigKeys(line: ProjectLine): ProjectLineCategoryConfigKeys {
  const p = PROJECT_LINE_PREFIX[line];
  return {
    filesRead: `${p}:files:categories:read`,
    filesWrite: `${p}:files:categories:write`,
    reportsRead: `${p}:reports:categories:read`,
    reportsWrite: `${p}:reports:categories:write`,
  };
}

/** Legacy category config keys (backward compatibility). */
export const LEGACY_CATEGORY_CONFIG_KEYS: ProjectLineCategoryConfigKeys = {
  filesRead: 'business:projects:files:categories:read',
  filesWrite: 'business:projects:files:categories:write',
  reportsRead: 'business:projects:reports:categories:read',
  reportsWrite: 'business:projects:reports:categories:write',
};

export function resolveCategoryConfigFromApi(
  cfg: Record<string, unknown>,
  line: ProjectLine
): {
  filesRead: string[] | null;
  filesWrite: string[] | null;
  reportsRead: string[] | null;
  reportsWrite: string[] | null;
} {
  const keys = getProjectLineCategoryConfigKeys(line);
  const legacy = LEGACY_CATEGORY_CONFIG_KEYS;
  const pick = (k: string, legacyK: string): string[] | null => {
    if (Array.isArray(cfg[k])) return cfg[k] as string[];
    if (Array.isArray(cfg[legacyK])) return cfg[legacyK] as string[];
    return null;
  };
  return {
    filesRead: pick(keys.filesRead, legacy.filesRead),
    filesWrite: pick(keys.filesWrite, legacy.filesWrite),
    reportsRead: pick(keys.reportsRead, legacy.reportsRead),
    reportsWrite: pick(keys.reportsWrite, legacy.reportsWrite),
  };
}

export function isLineScopedProjectPermissionKey(key: string, line: ProjectLine): boolean {
  return key.startsWith(`${PROJECT_LINE_PREFIX[line]}:`);
}

export function isLegacySharedProjectPermissionKey(key: string): boolean {
  // Alias used by permission bucketing helpers
  if (!key.startsWith(`${LEGACY_PROJECT_PREFIX}:`)) return false;
  if (key.startsWith('business:construction:')) return false;
  if (key.startsWith('business:rm:')) return false;
  const rest = key.slice(`${LEGACY_PROJECT_PREFIX}:`.length);
  return (
    rest === 'read' ||
    rest === 'write' ||
    rest.startsWith('reports:') ||
    rest.startsWith('workload:') ||
    rest.startsWith('timesheet:') ||
    rest.startsWith('files:') ||
    rest.startsWith('documents:') ||
    rest.startsWith('proposal:') ||
    rest.startsWith('estimate:') ||
    rest.startsWith('orders:') ||
    rest.startsWith('safety:') ||
    rest === 'members:write'
  );
}

export function lineMacroFilesWriteKey(line: ProjectLine): string {
  return `${PROJECT_LINE_PREFIX[line]}:files:write`;
}

export function lineMacroReportsWriteKey(line: ProjectLine): string {
  return `${PROJECT_LINE_PREFIX[line]}:reports:write`;
}

export type LineCategoryConfigState = {
  filesRead: string[] | null;
  filesWrite: string[] | null;
  reportsRead: string[] | null;
  reportsWrite: string[] | null;
};

export const EMPTY_LINE_CATEGORY_CONFIG: LineCategoryConfigState = {
  filesRead: null,
  filesWrite: null,
  reportsRead: null,
  reportsWrite: null,
};

export function applyLineCategoryConfigToPayload(
  payload: Record<string, boolean | string[]>,
  line: ProjectLine,
  cfg: LineCategoryConfigState
): void {
  const keys = getProjectLineCategoryConfigKeys(line);
  payload[keys.filesRead] = cfg.filesRead ?? [];
  payload[keys.filesWrite] = cfg.filesWrite ?? [];
  payload[keys.reportsRead] = cfg.reportsRead ?? [];
  payload[keys.reportsWrite] = cfg.reportsWrite ?? [];
}

/** Keys that grant sidebar access for a business line (not category config blobs). */
export function isLineMenuPermissionKey(key: string, line: ProjectLine): boolean {
  const prefix = `${PROJECT_LINE_PREFIX[line]}:`;
  if (!key.startsWith(prefix)) return false;
  if (key.includes(':categories:')) return false;
  // Hidden macro keys should not keep the sidebar section visible by themselves.
  if (key === `${PROJECT_LINE_PREFIX[line]}:read`) return false;
  if (key === `${PROJECT_LINE_PREFIX[line]}:write`) return false;
  return true;
}

/** Whether the user should see this business line in the sidebar (any line-scoped grant). */
export function canAccessProjectLineMenu(
  permissions: Set<string> | string[],
  line: ProjectLine
): boolean {
  const iter = permissions instanceof Set ? permissions : permissions;
  for (const perm of iter) {
    if (isLineMenuPermissionKey(String(perm), line)) return true;
  }
  return false;
}

export function configsEqual(a: LineCategoryConfigState, b: LineCategoryConfigState): boolean {
  const norm = (v: string[] | null) => (v === null ? null : Array.from(new Set(v.map(String))).sort());
  return (
    JSON.stringify(norm(a.filesRead)) === JSON.stringify(norm(b.filesRead)) &&
    JSON.stringify(norm(a.filesWrite)) === JSON.stringify(norm(b.filesWrite)) &&
    JSON.stringify(norm(a.reportsRead)) === JSON.stringify(norm(b.reportsRead)) &&
    JSON.stringify(norm(a.reportsWrite)) === JSON.stringify(norm(b.reportsWrite))
  );
}
