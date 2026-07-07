import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import { permissionUi } from '@/components/permissionUi';
import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS } from '@/lib/permissionAccessLevel';
import {
  buildFleetAssetsPermissionRows,
  buildFleetDashboardPermissionRows,
  buildFleetInspectionsPermissionRows,
  buildFleetWorkOrdersPermissionRows,
  FLEET_WO_ASSIGN,
  getFleetAccessLevel,
  getFleetWorkOrderAssignLevel,
  type FleetAccessLevel,
} from '@/lib/fleetPermissions';
import { AppBadge, uiCx } from '@/components/ui';

type Perm = { id: string; key: string; label: string; description?: string };

function AssignAllowedRow({
  permissions,
  canEdit,
  onChange,
}: {
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onChange: (level: FleetAccessLevel) => void;
}) {
  const assignPerm = { key: FLEET_WO_ASSIGN, label: 'Assign work orders' };
  const implemented = IMPLEMENTED_PERMISSIONS.has(FLEET_WO_ASSIGN);
  return (
    <div className="ml-3 flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className={uiCx(permissionUi.rowTitle, 'flex items-center gap-1.5')}>
          <span className="truncate">{assignPerm.label}</span>
          {!implemented ? <AppBadge variant="warning">WIP</AppBadge> : null}
        </div>
      </div>
      <PermissionAccessLevelSelect
        value={getFleetWorkOrderAssignLevel(permissions)}
        disabled={!canEdit}
        options={[
          { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
          { value: 'edit', label: 'Allowed' },
        ]}
        onChange={onChange}
        aria-label={`Access for ${assignPerm.label}`}
      />
    </div>
  );
}

export function FleetPermissionsPanel({
  areaPerms,
  permissions,
  canEdit,
  onAccessLevelChange,
  onAssignChange,
  showAccessToggle,
  accessChecked,
  onAccessToggle,
  accessLabel,
  accessDescription,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (
    readKey: string,
    writeKey: string | undefined,
    level: FleetAccessLevel,
  ) => void;
  onAssignChange: (level: FleetAccessLevel) => void;
  showAccessToggle?: boolean;
  accessChecked?: boolean;
  onAccessToggle?: () => void;
  accessLabel?: string;
  accessDescription?: string;
}) {
  const vehiclePerms = areaPerms.filter((p) => p.key.startsWith('fleet:vehicles:'));
  const woPerms = areaPerms.filter((p) => p.key.startsWith('fleet:work_orders:'));
  const inspectionPerms = areaPerms.filter((p) => p.key.startsWith('fleet:inspections:'));
  const dashboardPerms = areaPerms.filter((p) => p.key === 'fleet:dashboard:read');
  const hasAssign = areaPerms.some((p) => p.key === FLEET_WO_ASSIGN);

  return (
    <div className="space-y-4">
      {showAccessToggle && onAccessToggle ? (
        <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
            checked={!!accessChecked}
            disabled={!canEdit}
            onChange={onAccessToggle}
          />
          <span className="min-w-0 flex-1">
            <span className={permissionUi.rowTitle}>{accessLabel ?? 'Access Fleet'}</span>
            {accessDescription ? (
              <p className={uiCx(permissionUi.rowDescription, 'mt-0.5')}>{accessDescription}</p>
            ) : null}
          </span>
        </label>
      ) : null}

      <EntityPermissionsGrid
        title="Dashboard"
        rows={buildFleetDashboardPermissionRows(dashboardPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getFleetAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <EntityPermissionsGrid
        title="Fleet Assets"
        rows={buildFleetAssetsPermissionRows(vehiclePerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getFleetAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <div>
        <EntityPermissionsGrid
          title="Work Orders"
          rows={buildFleetWorkOrdersPermissionRows(woPerms.filter((p) => p.key !== FLEET_WO_ASSIGN))}
          permissions={permissions}
          canEdit={canEdit}
          getAccessLevel={getFleetAccessLevel}
          onAccessLevelChange={onAccessLevelChange}
        />
        {hasAssign ? (
          <AssignAllowedRow permissions={permissions} canEdit={canEdit} onChange={onAssignChange} />
        ) : null}
      </div>

      <EntityPermissionsGrid
        title="Inspections"
        rows={buildFleetInspectionsPermissionRows(inspectionPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getFleetAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />
    </div>
  );
}
