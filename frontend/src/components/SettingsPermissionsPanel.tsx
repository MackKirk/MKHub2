import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildSettingsPermissionRows,
  getSettingsAccessLevel,
  type SettingsAccessLevel,
} from '@/lib/settingsPermissions';

type Perm = { id: string; key: string; label: string; description?: string };

export function SettingsPermissionsPanel({
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
    level: SettingsAccessLevel,
  ) => void;
}) {
  const tabRows = buildSettingsPermissionRows(areaPerms).filter(
    (r) =>
      r.readKey === 'settings:lookup_lists:read' || r.readKey === 'settings:files_assets:read',
  );
  const templateRows = buildSettingsPermissionRows(areaPerms).filter(
    (r) =>
      r.readKey !== 'settings:lookup_lists:read' && r.readKey !== 'settings:files_assets:read',
  );

  return (
    <div className="space-y-4">
      <EntityPermissionsGrid
        title="Settings tabs"
        rows={tabRows}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getSettingsAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />
      {templateRows.length > 0 ? (
        <EntityPermissionsGrid
          title="Templates"
          rows={templateRows}
          permissions={permissions}
          canEdit={canEdit}
          getAccessLevel={getSettingsAccessLevel}
          onAccessLevelChange={onAccessLevelChange}
        />
      ) : null}
    </div>
  );
}
