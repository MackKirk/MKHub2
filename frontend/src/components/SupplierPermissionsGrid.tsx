import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildSupplierPermissionRows,
  getSupplierAccessLevel,
  type SupplierAccessLevel,
} from '@/lib/supplierPermissions';

type Perm = {
  id: string;
  key: string;
  label: string;
  description?: string;
};

export function SupplierPermissionsGrid({
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
    level: SupplierAccessLevel,
  ) => void;
}) {
  const rows = buildSupplierPermissionRows(areaPerms);

  return (
    <EntityPermissionsGrid
      title="Suppliers"
      rows={rows}
      permissions={permissions}
      canEdit={canEdit}
      getAccessLevel={getSupplierAccessLevel}
      onAccessLevelChange={onAccessLevelChange}
    />
  );
}
