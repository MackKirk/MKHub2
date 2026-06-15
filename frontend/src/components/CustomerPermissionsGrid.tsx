import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import { permissionUi } from '@/components/permissionUi';
import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import {
  buildCustomerPermissionRows,
  getCustomerAccessLevel,
  type CustomerAccessLevel,
} from '@/lib/customerPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS } from '@/lib/permissionAccessLevel';
import { AppBadge, uiCx } from '@/components/ui';

type Perm = {
  id: string;
  key: string;
  label: string;
  description?: string;
};

export function CustomerPermissionsGrid({
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
    level: CustomerAccessLevel,
  ) => void;
}) {
  const rows = buildCustomerPermissionRows(areaPerms);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg bg-gray-50/80 p-2.5">
      <div className={uiCx(permissionUi.groupTitle, 'mb-2')}>Customers</div>
      <div className="divide-y divide-gray-200/80">
        {rows.map((row) => {
          const level = getCustomerAccessLevel(permissions, row.readKey, row.writeKey);
          const readImplemented =
            IMPLEMENTED_PERMISSIONS.has(row.readKey) &&
            (!row.writeKey || IMPLEMENTED_PERMISSIONS.has(row.writeKey));
          return (
            <div key={row.id} className={uiCx('flex items-center gap-3 py-2', row.indent && 'ml-3')}>
              <div className="min-w-0 flex-1">
                <div className={uiCx(permissionUi.rowTitle, 'flex items-center gap-1.5')}>
                  <span className="truncate">{row.label}</span>
                  {!readImplemented ? <AppBadge variant="warning">WIP</AppBadge> : null}
                </div>
                {row.description ? (
                  <div className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>{row.description}</div>
                ) : null}
              </div>
              <PermissionAccessLevelSelect
                value={level}
                disabled={!canEdit}
                options={[
                  { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
                  { value: 'view', label: PERMISSION_ACCESS_LEVEL_LABELS.view },
                  ...(row.writeKey ? [{ value: 'edit' as const, label: PERMISSION_ACCESS_LEVEL_LABELS.edit }] : []),
                ]}
                onChange={(next) => onAccessLevelChange(row.readKey, row.writeKey, next as CustomerAccessLevel)}
                aria-label={`Access for ${row.label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
