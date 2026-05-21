import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import {
  buildCustomerPermissionRows,
  getCustomerAccessLevel,
  type CustomerAccessLevel,
} from '@/lib/customerPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS } from '@/lib/permissionAccessLevel';

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
    level: CustomerAccessLevel
  ) => void;
}) {
  const rows = buildCustomerPermissionRows(areaPerms);
  if (rows.length === 0) return null;

  return (
    <div className="border rounded-lg p-2.5 bg-gray-50">
      <div className="text-xs font-semibold text-gray-700 mb-2">Customers</div>
      <div className="space-y-1">
        {rows.map((row) => {
          const level = getCustomerAccessLevel(permissions, row.readKey, row.writeKey);
          const readImplemented =
            IMPLEMENTED_PERMISSIONS.has(row.readKey) &&
            (!row.writeKey || IMPLEMENTED_PERMISSIONS.has(row.writeKey));
          return (
            <div
              key={row.id}
              className={`flex items-center gap-2 p-1.5 rounded bg-white ${row.indent ? 'ml-3' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                  <span className="truncate">{row.label}</span>
                  {!readImplemented && (
                    <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                      [WIP]
                    </span>
                  )}
                </div>
                {row.description && (
                  <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{row.description}</div>
                )}
              </div>
              <select
                value={level}
                disabled={!canEdit}
                onChange={(e) =>
                  onAccessLevelChange(
                    row.readKey,
                    row.writeKey,
                    e.target.value as CustomerAccessLevel
                  )
                }
                className="shrink-0 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-800 focus:ring-1 focus:ring-brand-red focus:border-brand-red disabled:opacity-50 disabled:cursor-not-allowed min-w-[7.5rem]"
                aria-label={`Access for ${row.label}`}
              >
                <option value="blocked">{PERMISSION_ACCESS_LEVEL_LABELS.blocked}</option>
                <option value="view">{PERMISSION_ACCESS_LEVEL_LABELS.view}</option>
                {row.writeKey && <option value="edit">{PERMISSION_ACCESS_LEVEL_LABELS.edit}</option>}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
