import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { splitCustomerAreaPermissions } from '@/lib/customerPermissions';

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
  canEnable,
  onToggle,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  canEnable: (permKey: string) => boolean;
  onToggle: (permKey: string) => void;
}) {
  const { mainViewPerm, mainEditPerm, subViewPerms, subEditPerms } =
    splitCustomerAreaPermissions(areaPerms);
  if (!mainViewPerm && !mainEditPerm && subViewPerms.length === 0 && subEditPerms.length === 0) {
    return null;
  }

  const row = (perm: Perm, indent = false, forceEnable = false) => {
    const canEnableRow = canEdit && (forceEnable || canEnable(perm.key));
    return (
      <label
        key={perm.id}
        className={`flex items-start gap-1.5 p-1.5 rounded bg-white ${canEnableRow ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'} ${indent ? 'ml-4' : ''}`}
      >
        <input
          type="checkbox"
          checked={permissions[perm.key] || false}
          onChange={() => canEnableRow && onToggle(perm.key)}
          disabled={!canEnableRow}
          className="mt-0.5 w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
            <span className="truncate">{perm.label}</span>
            {!IMPLEMENTED_PERMISSIONS.has(perm.key) && (
              <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                [WIP]
              </span>
            )}
          </div>
          {perm.description && (
            <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{perm.description}</div>
          )}
        </div>
      </label>
    );
  };

  return (
    <div className="border rounded-lg p-2.5 bg-gray-50">
      <div className="text-xs font-semibold text-gray-700 mb-2">Customers</div>
      <div className="grid md:grid-cols-2 gap-2.5">
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">View</div>
          {mainViewPerm && row(mainViewPerm)}
          {subViewPerms.map((p) => row(p, true))}
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Edit</div>
          {mainEditPerm && row(mainEditPerm, false, true)}
          {subEditPerms.map((p) => row(p, true))}
        </div>
      </div>
    </div>
  );
}
