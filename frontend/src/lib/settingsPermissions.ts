import { applyPermissionUncheckCascade } from '@/lib/permissionDependencies';
import { getPermissionAccessLevel, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import type { ScopedPermissionRow } from '@/lib/scopedEntityPermissions';

export const SETTINGS_ACCESS = 'settings:access';

export const SETTINGS_LOOKUP_LISTS_READ = 'settings:lookup_lists:read';
export const SETTINGS_LOOKUP_LISTS_WRITE = 'settings:lookup_lists:write';
export const SETTINGS_FILES_ASSETS_READ = 'settings:files_assets:read';
export const SETTINGS_FILES_ASSETS_WRITE = 'settings:files_assets:write';
export const SETTINGS_PERMISSION_TEMPLATES_READ = 'settings:permission_templates:read';
export const SETTINGS_PERMISSION_TEMPLATES_WRITE = 'settings:permission_templates:write';
export const SETTINGS_TERMS_TEMPLATES_READ = 'settings:terms_templates:read';
export const SETTINGS_TERMS_TEMPLATES_WRITE = 'settings:terms_templates:write';
export const SETTINGS_DOCUMENT_BACKGROUNDS_READ = 'settings:document_backgrounds:read';
export const SETTINGS_DOCUMENT_BACKGROUNDS_WRITE = 'settings:document_backgrounds:write';
export const SETTINGS_DOCUMENT_TEMPLATES_READ = 'settings:document_templates:read';
export const SETTINGS_DOCUMENT_TEMPLATES_WRITE = 'settings:document_templates:write';
export const SETTINGS_AUTO_TASKS_READ = 'settings:auto_tasks:read';
export const SETTINGS_AUTO_TASKS_WRITE = 'settings:auto_tasks:write';

export const SETTINGS_CHILD_READ_KEYS = [
  SETTINGS_LOOKUP_LISTS_READ,
  SETTINGS_FILES_ASSETS_READ,
  SETTINGS_PERMISSION_TEMPLATES_READ,
  SETTINGS_TERMS_TEMPLATES_READ,
  SETTINGS_AUTO_TASKS_READ,
] as const;

export const SETTINGS_CHILD_WRITE_KEYS = [
  SETTINGS_LOOKUP_LISTS_WRITE,
  SETTINGS_FILES_ASSETS_WRITE,
  SETTINGS_PERMISSION_TEMPLATES_WRITE,
  SETTINGS_TERMS_TEMPLATES_WRITE,
  SETTINGS_AUTO_TASKS_WRITE,
] as const;

export const SETTINGS_ALL_CHILD_KEYS = [
  ...SETTINGS_CHILD_READ_KEYS,
  ...SETTINGS_CHILD_WRITE_KEYS,
] as const;

export type SettingsAccessLevel = PermissionAccessLevel;

type PermDef = { id: string; key: string; label: string; description?: string };

function hasPerm(permissions: Set<string> | Record<string, boolean>, key: string): boolean {
  return permissions instanceof Set ? permissions.has(key) : !!permissions[key];
}

export function hasAnySettingsChild(
  permissions: Record<string, boolean> | Set<string>,
): boolean {
  return SETTINGS_ALL_CHILD_KEYS.some((k) => hasPerm(permissions, k));
}

export function hasLegacyFullSettingsAccess(_permissions: Set<string>): boolean {
  return false;
}

export function hasAnySettingsPermission(permissions: Set<string>, isAdmin = false): boolean {
  if (isAdmin) return true;
  return hasAnySettingsChild(permissions);
}

export function syncSettingsAccess(
  permissions: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...permissions };
  next[SETTINGS_ACCESS] = false;
  return next;
}

export function syncSettingsAccessInKeySet(selectedKeys: Set<string>): Set<string> {
  const out = new Set(selectedKeys);
  out.delete(SETTINGS_ACCESS);
  return out;
}



export function buildSettingsPermissionRows(areaPerms: PermDef[]): ScopedPermissionRow[] {

  const rows: ScopedPermissionRow[] = [];

  const byKey = new Map(areaPerms.map((p) => [p.key, p]));



  const lookupRead = byKey.get(SETTINGS_LOOKUP_LISTS_READ);

  const lookupWrite = byKey.get(SETTINGS_LOOKUP_LISTS_WRITE);

  if (lookupRead) {

    rows.push({

      id: lookupRead.id,

      label: lookupRead.label,

      description: lookupRead.description,

      readKey: SETTINGS_LOOKUP_LISTS_READ,

      writeKey: lookupWrite?.key,

    });

  }



  const filesRead = byKey.get(SETTINGS_FILES_ASSETS_READ);

  const filesWrite = byKey.get(SETTINGS_FILES_ASSETS_WRITE);

  if (filesRead) {

    rows.push({

      id: filesRead.id,

      label: filesRead.label,

      description: filesRead.description,

      readKey: SETTINGS_FILES_ASSETS_READ,

      writeKey: filesWrite?.key,

    });

  }



  const autoTasksRead = byKey.get(SETTINGS_AUTO_TASKS_READ);

  const autoTasksWrite = byKey.get(SETTINGS_AUTO_TASKS_WRITE);

  if (autoTasksRead) {

    rows.push({

      id: autoTasksRead.id,

      label: autoTasksRead.label,

      description: autoTasksRead.description,

      readKey: SETTINGS_AUTO_TASKS_READ,

      writeKey: autoTasksWrite?.key,

    });

  }



  const permTplRead = byKey.get(SETTINGS_PERMISSION_TEMPLATES_READ);

  const permTplWrite = byKey.get(SETTINGS_PERMISSION_TEMPLATES_WRITE);

  if (permTplRead) {

    rows.push({

      id: permTplRead.id,

      label: permTplRead.label,

      description: permTplRead.description,

      readKey: SETTINGS_PERMISSION_TEMPLATES_READ,

      writeKey: permTplWrite?.key,

      indent: true,

    });

  }



  const termsRead = byKey.get(SETTINGS_TERMS_TEMPLATES_READ);

  const termsWrite = byKey.get(SETTINGS_TERMS_TEMPLATES_WRITE);

  if (termsRead) {

    rows.push({

      id: termsRead.id,

      label: termsRead.label,

      description: termsRead.description,

      readKey: SETTINGS_TERMS_TEMPLATES_READ,

      writeKey: termsWrite?.key,

      indent: true,

    });

  }



  return rows;

}



export function getSettingsAccessLevel(

  permissions: Record<string, boolean>,

  readKey: string,

  writeKey?: string,

): SettingsAccessLevel {

  return getPermissionAccessLevel(permissions, readKey, writeKey);

}



export function applySettingsAccessLevel(

  permissions: Record<string, boolean>,

  readKey: string,

  writeKey: string | undefined,

  level: SettingsAccessLevel,

): Record<string, boolean> {

  let next = { ...permissions };

  if (level === 'blocked') {

    next[readKey] = false;

    if (writeKey) next[writeKey] = false;

    next = applyPermissionUncheckCascade(readKey, next);

    if (!hasAnySettingsChild(next)) {

      next[SETTINGS_ACCESS] = false;

    }

    return syncSettingsAccess(next);

  }

  next[readKey] = true;

  if (writeKey) next[writeKey] = level === 'edit';

  return syncSettingsAccess(next);

}



export function applySettingsAccessLevelToKeySet(

  selectedKeys: Set<string>,

  readKey: string,

  writeKey: string | undefined,

  level: SettingsAccessLevel,

): Set<string> {

  const record = Object.fromEntries([...selectedKeys].map((key) => [key, true]));

  const next = applySettingsAccessLevel(record, readKey, writeKey, level);

  const out = new Set(selectedKeys);

  [readKey, writeKey].filter(Boolean).forEach((key) => {

    if (next[key!]) out.add(key!);

    else out.delete(key!);

  });

  return syncSettingsAccessInKeySet(out);

}



export function filterSettingsAreaPermissions(areaPerms: PermDef[]): PermDef[] {

  return areaPerms.filter((p) =>

    SETTINGS_CHILD_READ_KEYS.includes(p.key as typeof SETTINGS_CHILD_READ_KEYS[number]) ||

    SETTINGS_CHILD_WRITE_KEYS.includes(p.key as typeof SETTINGS_CHILD_WRITE_KEYS[number]),

  );

}



function canViewGranular(

  permissions: Set<string>,

  isAdmin: boolean,

  readKey: string,

  writeKey: string,

): boolean {

  if (isAdmin) return true;

  if (hasLegacyFullSettingsAccess(permissions)) return true;

  return permissions.has(readKey) || permissions.has(writeKey);

}



function canEditGranular(

  permissions: Set<string>,

  isAdmin: boolean,

  writeKey: string,

): boolean {

  if (isAdmin) return true;

  if (hasLegacyFullSettingsAccess(permissions)) return true;

  return permissions.has(writeKey);

}



export function canViewLookupListsTab(permissions: Set<string>, isAdmin = false): boolean {

  return canViewGranular(

    permissions,

    isAdmin,

    SETTINGS_LOOKUP_LISTS_READ,

    SETTINGS_LOOKUP_LISTS_WRITE,

  );

}



export function canEditLookupListsTab(permissions: Set<string>, isAdmin = false): boolean {

  return canEditGranular(permissions, isAdmin, SETTINGS_LOOKUP_LISTS_WRITE);

}



export function canViewFilesAssetsTab(permissions: Set<string>, isAdmin = false): boolean {

  return canViewGranular(

    permissions,

    isAdmin,

    SETTINGS_FILES_ASSETS_READ,

    SETTINGS_FILES_ASSETS_WRITE,

  );

}



export function canEditFilesAssetsTab(permissions: Set<string>, isAdmin = false): boolean {

  return canEditGranular(permissions, isAdmin, SETTINGS_FILES_ASSETS_WRITE);

}



export function canViewPermissionTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {

  return canViewGranular(

    permissions,

    isAdmin,

    SETTINGS_PERMISSION_TEMPLATES_READ,

    SETTINGS_PERMISSION_TEMPLATES_WRITE,

  );

}



export function canEditPermissionTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {

  return canEditGranular(permissions, isAdmin, SETTINGS_PERMISSION_TEMPLATES_WRITE);

}



export function canViewTermsTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {

  return canViewGranular(

    permissions,

    isAdmin,

    SETTINGS_TERMS_TEMPLATES_READ,

    SETTINGS_TERMS_TEMPLATES_WRITE,

  );

}



export function canEditTermsTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {

  return canEditGranular(permissions, isAdmin, SETTINGS_TERMS_TEMPLATES_WRITE);

}



export function canViewDocumentBackgroundsCard(permissions: Set<string>, isAdmin = false): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, 'document_hub:backgrounds:read') ||
    hasPerm(permissions, 'document_hub:backgrounds:write') ||
    hasPerm(permissions, SETTINGS_DOCUMENT_BACKGROUNDS_READ) ||
    hasPerm(permissions, SETTINGS_DOCUMENT_BACKGROUNDS_WRITE)
  );
}



export function canEditDocumentBackgroundsCard(permissions: Set<string>, isAdmin = false): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, 'document_hub:backgrounds:write') ||
    hasPerm(permissions, SETTINGS_DOCUMENT_BACKGROUNDS_WRITE)
  );
}



export function canViewDocumentTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, 'document_hub:templates:read') ||
    hasPerm(permissions, 'document_hub:templates:write') ||
    hasPerm(permissions, SETTINGS_DOCUMENT_TEMPLATES_READ) ||
    hasPerm(permissions, SETTINGS_DOCUMENT_TEMPLATES_WRITE)
  );
}



export function canEditDocumentTemplatesCard(permissions: Set<string>, isAdmin = false): boolean {
  if (isAdmin) return true;
  return (
    hasPerm(permissions, 'document_hub:templates:write') ||
    hasPerm(permissions, SETTINGS_DOCUMENT_TEMPLATES_WRITE)
  );
}



export function canViewAutoTasksTab(permissions: Set<string>, isAdmin = false): boolean {

  return canViewGranular(

    permissions,

    isAdmin,

    SETTINGS_AUTO_TASKS_READ,

    SETTINGS_AUTO_TASKS_WRITE,

  );

}



export function canEditAutoTasksTab(permissions: Set<string>, isAdmin = false): boolean {

  return canEditGranular(permissions, isAdmin, SETTINGS_AUTO_TASKS_WRITE);

}



export function canViewTemplatesTab(permissions: Set<string>, isAdmin = false): boolean {

  return (

    canViewPermissionTemplatesCard(permissions, isAdmin) ||

    canViewTermsTemplatesCard(permissions, isAdmin)

  );

}


