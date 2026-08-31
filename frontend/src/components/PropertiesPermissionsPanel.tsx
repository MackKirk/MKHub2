import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildPropertiesPermissionRows,
  getPropertiesAccessLevel,
  type PropertiesAccessLevel,
} from '@/lib/propertiesPermissions';

type Perm = { id: string; key: string; label: string; description?: string };

export function PropertiesPermissionsPanel({
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
    level: PropertiesAccessLevel,
  ) => void;
}) {
  return (
    <EntityPermissionsGrid
      title="Properties"
      rows={buildPropertiesPermissionRows(areaPerms)}
      permissions={permissions}
      canEdit={canEdit}
      getAccessLevel={getPropertiesAccessLevel}
      onAccessLevelChange={onAccessLevelChange}
    />
  );
}
