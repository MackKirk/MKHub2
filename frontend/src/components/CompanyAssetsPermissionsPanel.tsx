import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import { PermissionToggleLabel } from '@/components/PermissionToggleRow';
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
  accessPerm,
  onAccessToggle,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (
    readKey: string,
    writeKey: string | undefined,
    level: CompanyAssetsAccessLevel,
  ) => void;
  accessPerm?: Perm;
  onAccessToggle?: () => void;
}) {
  const equipmentPerms = areaPerms.filter((p) => p.key.startsWith('fleet:equipment:'));
  const cardsPerms = areaPerms.filter((p) => p.key.startsWith('company_cards:'));

  return (
    <div className="space-y-4">
      {accessPerm && onAccessToggle ? (
        <PermissionToggleLabel
          label={accessPerm.label}
          description={accessPerm.description}
          checked={!!permissions[accessPerm.key]}
          disabled={!canEdit}
          onToggle={onAccessToggle}
        />
      ) : null}

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
