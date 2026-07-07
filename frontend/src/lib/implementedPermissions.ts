import {
  isHiddenProjectLinePermissionKey,
  isLegacySharedProjectPermissionKey,
} from '@/lib/projectLinePermissionKeys';

const LINE_PROJECT_SUB_FEATURES = [
  'reports',
  'workload',
  'timesheet',
  'files',
  'documents',
  'proposal',
  'safety',
] as const;

const LINE_PROJECT_PREFIXES = ['business:construction:projects', 'business:rm:projects'] as const;

const LINE_PROJECT_SUB_KEYS = LINE_PROJECT_PREFIXES.flatMap((prefix) => [
  ...LINE_PROJECT_SUB_FEATURES.flatMap((feat) => [
    `${prefix}:${feat}:read`,
    `${prefix}:${feat}:write`,
  ]),
  `${prefix}:members:write`,
]);

/** Permissions that are enforced in the app (not [WIP] in the UI). */
export const IMPLEMENTED_PERMISSIONS = new Set([
  'users:read',
  'users:write',
  'timesheet:read',
  'timesheet:write',
  'timesheet:approve',
  'timesheet:unrestricted_clock',
  'clients:read',
  'clients:write',
  'inventory:read',
  'inventory:write',
  'reviews:read',
  'reviews:admin',
  'hr:access',
  'hr:users:read',
  'hr:users:write',
  'hr:users:view:general',
  'hr:users:view:job:compensation',
  'hr:users:edit:general',
  'hr:users:view:timesheet',
  'hr:users:edit:timesheet',
  'hr:users:view:permissions',
  'hr:users:view:activity',
  'hr:users:edit:permissions',
  'hr:attendance:read',
  'hr:attendance:write',
  'hr:community:read',
  'hr:community:write',
  'hr:reviews:admin',
  'hr:timesheet:read',
  'hr:timesheet:write',
  'hr:timesheet:approve',
  'hr:timesheet:unrestricted_clock',
  'hr:offboarding:read',
  'hr:offboarding:write',
  'settings:access',
  'documents:access',
  'documents:read',
  'documents:write',
  'documents:delete',
  'documents:move',
  'fleet:access',
  'fleet:dashboard:read',
  'fleet:vehicles:read',
  'fleet:vehicles:write',
  'fleet:vehicles:general:read',
  'fleet:vehicles:general:write',
  'fleet:vehicles:inspections:read',
  'fleet:vehicles:inspections:write',
  'fleet:vehicles:work_orders:read',
  'fleet:vehicles:work_orders:write',
  'fleet:vehicles:compliance:read',
  'fleet:vehicles:compliance:write',
  'fleet:vehicles:history:read',
  'fleet:work_orders:read',
  'fleet:work_orders:write',
  'fleet:work_orders:general:read',
  'fleet:work_orders:general:write',
  'fleet:work_orders:costs:read',
  'fleet:work_orders:costs:write',
  'fleet:work_orders:files:read',
  'fleet:work_orders:files:write',
  'fleet:work_orders:activity:read',
  'fleet:work_orders:assign',
  'fleet:inspections:read',
  'fleet:inspections:write',
  'fleet:inspections:schedules:read',
  'fleet:inspections:schedules:write',
  'fleet:inspections:execution:read',
  'fleet:inspections:execution:write',
  'company_assets:access',
  'fleet:equipment:read',
  'fleet:equipment:write',
  'fleet:equipment:general:read',
  'fleet:equipment:general:write',
  'fleet:equipment:work_orders:read',
  'fleet:equipment:work_orders:write',
  'fleet:equipment:history:read',
  'company_cards:read',
  'company_cards:write',
  'inventory:suppliers:read',
  'inventory:suppliers:write',
  'inventory:suppliers:overview:read',
  'inventory:suppliers:overview:write',
  'inventory:suppliers:contacts:read',
  'inventory:suppliers:contacts:write',
  'inventory:suppliers:products:read',
  'inventory:suppliers:products:write',
  'inventory:products:read',
  'inventory:products:write',
  'inventory:products:details:read',
  'inventory:products:details:write',
  'inventory:products:usage:read',
  'inventory:products:related:read',
  'inventory:products:related:write',
  'business:customers:read',
  'business:customers:write',
  'business:customers:overview:read',
  'business:customers:general:read',
  'business:customers:general:write',
  'business:customers:contacts:read',
  'business:customers:contacts:write',
  'business:customers:files:read',
  'business:customers:files:write',
  'business:customers:sites:read',
  'business:customers:sites:write',
  'business:customers:opportunities:read',
  'business:customers:opportunities:write',
  'business:customers:projects:read',
  'business:customers:projects:write',
  'business:projects:read',
  'business:projects:write',
  'business:construction:projects:read',
  'business:construction:projects:write',
  'business:construction:projects:read:all',
  'business:rm:projects:read',
  'business:rm:projects:write',
  'business:rm:projects:read:all',
  'business:projects:members:write',
  'business:projects:reports:read',
  'business:projects:reports:write',
  'business:projects:workload:read',
  'business:projects:workload:write',
  'business:projects:timesheet:read',
  'business:projects:timesheet:write',
  'business:projects:files:read',
  'business:projects:files:write',
  'business:projects:documents:read',
  'business:projects:documents:write',
  'business:projects:proposal:read',
  'business:projects:proposal:write',
  'business:projects:safety:read',
  'business:projects:safety:write',
  'sales:access',
  'sales:quotations:read',
  'sales:quotations:write',
  ...LINE_PROJECT_SUB_KEYS,
]);

/** Permissions hidden from permission UIs (retired tabs, unused area gates). */
export function isHiddenPermissionKey(key: string): boolean {
  if (key === 'inventory:access') return true;
  if (isHiddenProjectLinePermissionKey(key)) return true;
  if (key === 'fleet:read' || key === 'fleet:write' || key === 'fleet:manage') return true;
  if (key === 'equipment:read' || key === 'equipment:write' || key === 'equipment:manage') return true;
  if (key === 'work_orders:read' || key === 'work_orders:write' || key === 'work_orders:assign') return true;
  if (key === 'inspections:read' || key === 'inspections:write') return true;
  if (key === 'users:read' || key === 'users:write') return true;
  if (
    key === 'timesheet:read' ||
    key === 'timesheet:write' ||
    key === 'timesheet:approve' ||
    key === 'timesheet:unrestricted_clock'
  ) {
    return true;
  }
  if (key === 'reviews:read' || key === 'reviews:admin') return true;
  return false;
}

/** Legacy/shared project permissions (hidden in line UIs; backend fallback). */
export function isLegacyProjectPermissionKey(key: string): boolean {
  return isLegacySharedProjectPermissionKey(key);
}

/** Construction line permissions (Production (Sales) in sidebar). */
export function isConstructionProjectPermissionKey(key: string): boolean {
  return key.startsWith('business:construction:');
}

/** Repairs & Maintenance line permissions. */
export function isRepairsProjectPermissionKey(key: string): boolean {
  return key.startsWith('business:rm:');
}

/** Backward-compatible union helper for project-related business permissions. */
export function isBusinessProjectPermissionKey(key: string): boolean {
  return (
    isLegacyProjectPermissionKey(key) ||
    isConstructionProjectPermissionKey(key) ||
    isRepairsProjectPermissionKey(key)
  );
}
