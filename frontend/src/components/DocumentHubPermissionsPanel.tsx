import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildDocumentHubPermissionRows,
  getDocumentHubAccessLevel,
  type DocumentHubAccessLevel,
} from '@/lib/documentHubPermissions';

type Perm = { id: string; key: string; label: string; description?: string };

export function DocumentHubPermissionsPanel({
  areaPerms,
  permissions,
  canEdit,
  onAccessLevelChange,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (
    readKey: string,
    writeKey: string | undefined,
    level: DocumentHubAccessLevel,
  ) => void;
}) {
  const rows = buildDocumentHubPermissionRows(areaPerms);
  if (rows.length === 0) return null;

  return (
    <EntityPermissionsGrid
      title="Documents"
      rows={rows}
      permissions={permissions}
      canEdit={canEdit}
      getAccessLevel={(perms, readKey, writeKey) => getDocumentHubAccessLevel(perms, readKey, writeKey)}
      onAccessLevelChange={onAccessLevelChange}
    />
  );
}
