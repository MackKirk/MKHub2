import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildProductPermissionRows,
  getProductAccessLevel,
  type ProductAccessLevel,
} from '@/lib/productPermissions';

type Perm = {
  id: string;
  key: string;
  label: string;
  description?: string;
};

export function ProductPermissionsGrid({
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
    level: ProductAccessLevel,
  ) => void;
}) {
  const rows = buildProductPermissionRows(areaPerms);

  return (
    <EntityPermissionsGrid
      title="Products"
      rows={rows}
      permissions={permissions}
      canEdit={canEdit}
      getAccessLevel={getProductAccessLevel}
      onAccessLevelChange={onAccessLevelChange}
    />
  );
}
