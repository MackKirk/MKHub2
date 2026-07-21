import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildTrainingPermissionRows,
  getTrainingAccessLevel,
  type TrainingAccessLevel,
} from '@/lib/trainingPermissions';

type Perm = { id: string; key: string; label: string; description?: string };

export function TrainingPermissionsPanel({
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
    level: TrainingAccessLevel,
  ) => void;
}) {
  return (
    <EntityPermissionsGrid
      title="Training & Learning"
      rows={buildTrainingPermissionRows(areaPerms)}
      permissions={permissions}
      canEdit={canEdit}
      getAccessLevel={getTrainingAccessLevel}
      onAccessLevelChange={onAccessLevelChange}
    />
  );
}
