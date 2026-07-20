import { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import type { PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import type { ProjectLine } from '@/lib/projectLinePermissions';

/** Admin role bypasses all line-scoped project permission checks. */
export function isAdminRole(roles: readonly unknown[] | null | undefined): boolean {
  return (roles ?? []).some((r) => String(r ?? '').toLowerCase() === 'admin');
}

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

/** Resolve business line for permission checks (API field or URL). */
export function resolveProjectBusinessLine(
  businessLine: string | undefined | null,
  pathname?: string
): string {
  if (businessLine) return businessLine;
  if (pathname && /(^|\/)rm-(projects|opportunities)/.test(pathname)) {
    return BUSINESS_LINE_REPAIRS_MAINTENANCE;
  }
  return BUSINESS_LINE_CONSTRUCTION;
}

/** Safety menu / global routes: any business line (legacy keys included). */
export function hasAnyLineSafetyPermission(
  permissions: Set<string> | Record<string, boolean> | string[],
  action: 'read' | 'write',
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const set =
    permissions instanceof Set
      ? permissions
      : new Set(
          Array.isArray(permissions)
            ? permissions
            : Object.entries(permissions as Record<string, boolean>)
                .filter(([, v]) => v)
                .map(([k]) => k)
        );
  if (action === 'read') {
    return (
      hasProjectFeatureReadPermission(set, BUSINESS_LINE_CONSTRUCTION, 'safety', false) ||
      hasProjectFeatureReadPermission(set, BUSINESS_LINE_REPAIRS_MAINTENANCE, 'safety', false) ||
      hasProjectFeatureWritePermission(set, BUSINESS_LINE_CONSTRUCTION, 'safety', false) ||
      hasProjectFeatureWritePermission(set, BUSINESS_LINE_REPAIRS_MAINTENANCE, 'safety', false) ||
      set.has('business:projects:safety:read') ||
      set.has('business:projects:safety:write')
    );
  }
  return (
    hasProjectFeatureWritePermission(set, BUSINESS_LINE_CONSTRUCTION, 'safety', false) ||
    hasProjectFeatureWritePermission(set, BUSINESS_LINE_REPAIRS_MAINTENANCE, 'safety', false) ||
    set.has('business:projects:safety:write')
  );
}

/** View tab/section: line read or line write (write implies read). */
export function hasProjectFeaturePermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string,
  isAdmin = false,
  pathname?: string
): boolean {
  if (isAdmin) return true;
  return (
    hasProjectFeatureReadPermission(permissions, businessLine, feature, false, pathname) ||
    hasProjectFeatureWritePermission(permissions, businessLine, feature, false, pathname)
  );
}

function hasLegacyProjectFeaturePermission(
  permissions: Set<string> | Record<string, boolean>,
  feature: string,
  action: 'read' | 'write',
): boolean {
  if (feature === 'costs') {
    const keys =
      action === 'read'
        ? [
            'business:projects:costs:read',
            'business:projects:costs:write',
            'business:projects:estimate:read',
            'business:projects:estimate:write',
          ]
        : ['business:projects:costs:write', 'business:projects:estimate:write'];
    return keys.some((k) => hasPerm(permissions, k));
  }
  return hasPerm(permissions, `business:projects:${feature}:${action}`);
}

export function hasProjectFeatureReadPermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string,
  isAdmin = false,
  pathname?: string
): boolean {
  if (isAdmin) return true;
  const line = resolveProjectBusinessLine(businessLine, pathname);
  if (hasPerm(permissions, projectFeaturePermKey(line, feature, 'read'))) return true;
  if (hasPerm(permissions, projectFeaturePermKey(line, feature, 'write'))) return true;
  return hasLegacyProjectFeaturePermission(permissions, feature, 'read');
}

/** Manage Project Members (write-only, line-scoped). */
export function hasProjectMembersWritePermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  isAdmin = false,
  pathname?: string
): boolean {
  if (isAdmin) return true;
  const line = projectLineFromBusinessLine(resolveProjectBusinessLine(businessLine, pathname));
  return hasPerm(permissions, `${PROJECT_LINE_PREFIX[line]}:members:write`);
}

/** Create/edit/upload: line write only (view-only must not pass). */
export function hasProjectFeatureWritePermission(
  permissions: Set<string> | Record<string, boolean>,
  businessLine: string | undefined | null,
  feature: string,
  isAdmin = false,
  pathname?: string
): boolean {
  if (isAdmin) return true;
  const line = resolveProjectBusinessLine(businessLine, pathname);
  if (hasPerm(permissions, projectFeaturePermKey(line, feature, 'write'))) return true;
  return hasLegacyProjectFeaturePermission(permissions, feature, 'write');
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

/** Line-only: never fall back to shared business:projects:*:categories:* (would mix Production and Repairs). */
export function resolveCategoryConfigFromApi(
  cfg: Record<string, unknown>,
  line: ProjectLine
): LineCategoryConfigState {
  const keys = getProjectLineCategoryConfigKeys(line);
  const pick = (k: string): string[] | null => {
    const v = cfg[k];
    return Array.isArray(v) ? (v as string[]) : null;
  };
  return {
    filesRead: pick(keys.filesRead),
    filesWrite: pick(keys.filesWrite),
    reportsRead: pick(keys.reportsRead),
    reportsWrite: pick(keys.reportsWrite),
  };
}

/** Remove shared legacy category keys on save so lines stay independent. */
export function clearLegacyCategoryConfigKeys(payload: Record<string, boolean | string[]>): void {
  applyCategoryListToPayload(payload, LEGACY_CATEGORY_CONFIG_KEYS.filesRead, null);
  applyCategoryListToPayload(payload, LEGACY_CATEGORY_CONFIG_KEYS.filesWrite, null);
  applyCategoryListToPayload(payload, LEGACY_CATEGORY_CONFIG_KEYS.reportsRead, null);
  applyCategoryListToPayload(payload, LEGACY_CATEGORY_CONFIG_KEYS.reportsWrite, null);
}

export function isLineScopedProjectPermissionKey(key: string, line: ProjectLine): boolean {
  return key.startsWith(`${PROJECT_LINE_PREFIX[line]}:`);
}

const LEGACY_PROJECT_SUB_FEATURES = [
  'reports',
  'workload',
  'timesheet',
  'files',
  'documents',
  'proposal',
  'estimate',
  'costs',
  'orders',
  'safety',
] as const;

/** Sub-features removed from the app — hidden in permission UIs (tab no longer exists). */
const HIDDEN_LINE_PROJECT_SUB_FEATURES = ['orders'] as const;

export function isHiddenProjectLinePermissionKey(key: string): boolean {
  return HIDDEN_LINE_PROJECT_SUB_FEATURES.some((feat) => key.includes(`:${feat}:`));
}

/** Clear legacy business:projects:<feature>:* so line-scoped overrides are authoritative. */
export function clearLegacyProjectSubPermissions(perms: Record<string, boolean | string[]>): void {
  for (const feat of LEGACY_PROJECT_SUB_FEATURES) {
    perms[`${LEGACY_PROJECT_PREFIX}:${feat}:read`] = false;
    perms[`${LEGACY_PROJECT_PREFIX}:${feat}:write`] = false;
  }
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
    rest.startsWith('costs:') ||
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

export function cloneLineCategoryConfigState(cfg: LineCategoryConfigState): LineCategoryConfigState {
  return {
    filesRead: cfg.filesRead ? [...cfg.filesRead] : null,
    filesWrite: cfg.filesWrite ? [...cfg.filesWrite] : null,
    reportsRead: cfg.reportsRead ? [...cfg.reportsRead] : null,
    reportsWrite: cfg.reportsWrite ? [...cfg.reportsWrite] : null,
  };
}

export type LineCategoryConfigsByLine = Record<ProjectLine, LineCategoryConfigState>;

export function cloneLineCategoryConfigs(cfg: LineCategoryConfigsByLine): LineCategoryConfigsByLine {
  return {
    construction: cloneLineCategoryConfigState(cfg.construction),
    repairs: cloneLineCategoryConfigState(cfg.repairs),
  };
}

/** Push category allow-lists: null/empty => remove override (all categories allowed). */
function applyCategoryListToPayload(
  payload: Record<string, boolean | string[]>,
  key: string,
  list: string[] | null
): void {
  if (list === null || list.length === 0) {
    payload[key] = [];
    return;
  }
  payload[key] = list;
}

export function applyLineCategoryConfigToPayload(
  payload: Record<string, boolean | string[]>,
  line: ProjectLine,
  cfg: LineCategoryConfigState
): void {
  const keys = getProjectLineCategoryConfigKeys(line);
  applyCategoryListToPayload(payload, keys.filesRead, cfg.filesRead);
  applyCategoryListToPayload(payload, keys.filesWrite, cfg.filesWrite);
  applyCategoryListToPayload(payload, keys.reportsRead, cfg.reportsRead);
  applyCategoryListToPayload(payload, keys.reportsWrite, cfg.reportsWrite);
}

/** Keep folder submenu in sync when Files macro dropdown changes. */
export function syncLineCategoryConfigAfterFilesMacroChange(
  cfg: LineCategoryConfigState,
  filesAccess: PermissionAccessLevel
): LineCategoryConfigState {
  if (filesAccess === 'blocked') {
    return { ...cfg, filesRead: null, filesWrite: null };
  }
  if (filesAccess === 'view') {
    return { ...cfg, filesWrite: [] };
  }
  if (filesAccess === 'edit' && cfg.filesWrite?.length === 0) {
    return { ...cfg, filesWrite: null };
  }
  return cfg;
}

export function syncLineCategoryConfigAfterReportsMacroChange(
  cfg: LineCategoryConfigState,
  reportsAccess: PermissionAccessLevel
): LineCategoryConfigState {
  if (reportsAccess === 'blocked') {
    return { ...cfg, reportsRead: null, reportsWrite: null };
  }
  if (reportsAccess === 'view') {
    return { ...cfg, reportsWrite: [] };
  }
  if (reportsAccess === 'edit' && cfg.reportsWrite?.length === 0) {
    return { ...cfg, reportsWrite: null };
  }
  return cfg;
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
  line: ProjectLine,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  const iter = permissions instanceof Set ? permissions : permissions;
  for (const perm of iter) {
    if (isLineMenuPermissionKey(String(perm), line)) return true;
  }
  return false;
}

function normCategoryList(v: string[] | null | undefined): string[] | null {
  if (v === null || v === undefined) return null;
  if (v.length === 0) return [];
  return Array.from(new Set(v.map(String))).sort();
}

export function configsEqual(a: LineCategoryConfigState, b: LineCategoryConfigState): boolean {
  return (
    JSON.stringify(normCategoryList(a.filesRead)) === JSON.stringify(normCategoryList(b.filesRead)) &&
    JSON.stringify(normCategoryList(a.filesWrite)) === JSON.stringify(normCategoryList(b.filesWrite)) &&
    JSON.stringify(normCategoryList(a.reportsRead)) === JSON.stringify(normCategoryList(b.reportsRead)) &&
    JSON.stringify(normCategoryList(a.reportsWrite)) === JSON.stringify(normCategoryList(b.reportsWrite))
  );
}
