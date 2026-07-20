import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import {
  buildCorporateCardsPermissionRows,
  buildEquipmentPermissionRows,
  getCompanyAssetsAccessLevel,
  type CompanyAssetsAccessLevel,
} from '@/lib/companyAssetsPermissions';

type Perm = { id: string; key: string; label: string; description?: string };

export function CompanyAssetsPermissionsPanel({
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
    level: CompanyAssetsAccessLevel,
  ) => void;
}) {
  const equipmentPerms = areaPerms.filter((p) => p.key.startsWith('fleet:equipment:'));
  const cardsPerms = areaPerms.filter((p) => p.key.startsWith('company_cards:'));

  return (
    <div className="space-y-4">
      <EntityPermissionsGrid
        title="Equipment"
        rows={buildEquipmentPermissionRows(equipmentPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getCompanyAssetsAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <EntityPermissionsGrid
        title="Corporate Cards"
        rows={buildCorporateCardsPermissionRows(cardsPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getCompanyAssetsAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />
    </div>
  );
}
