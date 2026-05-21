export type PermissionAccessLevel = 'blocked' | 'view' | 'edit';

export const PERMISSION_ACCESS_LEVEL_LABELS: Record<PermissionAccessLevel, string> = {
  blocked: 'Blocked',
  view: 'View only',
  edit: 'View / Edit',
};

/** Strip legacy "View " / "Edit " prefixes; access level is shown in the dropdown. */
export function formatPermissionLabel(label: string): string {
  const trimmed = label.replace(/^View\s+/i, '').replace(/^Edit\s+/i, '').trim();
  return trimmed || label;
}

export function getPermissionAccessLevel(
  permissions: Record<string, boolean>,
  readKey?: string,
  writeKey?: string
): PermissionAccessLevel {
  if (writeKey && permissions[writeKey]) return 'edit';
  if (readKey && permissions[readKey]) return 'view';
  return 'blocked';
}
