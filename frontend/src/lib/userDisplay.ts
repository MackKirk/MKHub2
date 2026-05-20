/** Normalized user/employee row for display in pickers and avatars. */
export type UserDisplaySource = {
  id?: string;
  name?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  department?: string | null;
  division?: string | null;
  profile_photo_file_id?: string | null;
  profile?: {
    first_name?: string | null;
    last_name?: string | null;
    preferred_name?: string | null;
    department?: string | null;
    division?: string | null;
    profile_photo_file_id?: string | null;
  } | null;
};

/**
 * Same label rules as `/auth/users/options` (preferred + legal name when both differ).
 */
export function getUserDisplayName(user: UserDisplaySource | null | undefined): string {
  if (!user) return '';
  const first = (user.first_name || user.profile?.first_name || '').trim();
  const last = (user.last_name || user.profile?.last_name || '').trim();
  const legal = [first, last].filter(Boolean).join(' ');
  const preferred = (user.preferred_name || user.profile?.preferred_name || '').trim();

  if (preferred && legal) {
    if (preferred.localeCompare(legal, undefined, { sensitivity: 'base' }) === 0) return preferred;
    return `${preferred} (${legal})`;
  }
  if (preferred) return preferred;
  if (legal) return legal;

  const name = (user.name || '').trim();
  if (name) return name;

  return (user.username || '').trim() || '—';
}

/** Exact list row label — prefers API `name` from `/auth/users/options`. */
export function getUserPickerLabel(user: UserDisplaySource | null | undefined): string {
  if (!user) return '';
  const apiName = (user.name || '').trim();
  if (apiName) return apiName;
  return getUserDisplayName(user);
}

export function getUserInitials(user: UserDisplaySource | null | undefined): string {
  if (!user) return '?';
  const name = getUserDisplayName(user);
  if (name && name !== '—') {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  const username = (user.username || '').trim();
  return username ? username[0].toUpperCase() : '?';
}

export function getUserSubtitle(user: UserDisplaySource | null | undefined): string {
  if (!user) return '';
  const dept = (user.department || user.division || user.profile?.department || user.profile?.division || '').trim();
  if (dept) return dept;
  const username = (user.username || '').trim();
  return username && username !== getUserDisplayName(user) ? username : '';
}

export function getUserPhotoFileId(user: UserDisplaySource | null | undefined): string | null {
  if (!user) return null;
  return user.profile_photo_file_id || user.profile?.profile_photo_file_id || null;
}
