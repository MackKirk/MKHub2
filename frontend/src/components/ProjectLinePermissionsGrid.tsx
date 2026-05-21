import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import {
  buildProjectLinePermissionRows,
  getProjectLineRowAccessLevel,
  type ProjectLine,
  type ProjectLinePermissionRow,
} from '@/lib/projectLinePermissions';

type Perm = { id: string; key: string; label: string; description?: string };

const GearIcon = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export function ProjectLinePermissionsGrid({
  line,
  areaPerms,
  permissions,
  canEdit,
  onAccessLevelChange,
  onConfigureProjectFiles,
  onConfigureProjectReports,
}: {
  line: ProjectLine;
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (row: ProjectLinePermissionRow, level: PermissionAccessLevel) => void;
  onConfigureProjectFiles?: () => void;
  onConfigureProjectReports?: () => void;
}) {
  const rows = buildProjectLinePermissionRows(line, areaPerms);
  if (rows.length === 0) return null;

  const title =
    line === 'construction' ? 'Production (Sales)' : 'Repairs & Maintenance';

  const rowKeys = (row: ProjectLinePermissionRow): string[] => {
    if (row.kind === 'pair') return [row.readKey, row.writeKey];
    if (row.kind === 'readOnly') return [row.readKey];
    return [row.writeKey];
  };

  const isImplemented = (row: ProjectLinePermissionRow) =>
    rowKeys(row).every((k) => IMPLEMENTED_PERMISSIONS.has(k));

  const showGear = (row: ProjectLinePermissionRow) => {
    if (!canEdit || row.kind !== 'pair' || !row.configKind) return false;
    const level = getProjectLineRowAccessLevel(permissions, row);
    if (level === 'blocked') return false;
    if (row.configKind === 'project-files-read' || row.configKind === 'project-files-write') {
      return !!onConfigureProjectFiles;
    }
    if (row.configKind === 'project-reports-read' || row.configKind === 'project-reports-write') {
      return !!onConfigureProjectReports;
    }
    return false;
  };

  const onGearClick = (row: ProjectLinePermissionRow) => {
    if (row.kind !== 'pair' || !row.configKind) return;
    if (row.configKind.startsWith('project-files')) onConfigureProjectFiles?.();
    if (row.configKind.startsWith('project-reports')) onConfigureProjectReports?.();
  };

  return (
    <div className="border rounded-lg p-2.5 bg-gray-50">
      <div className="text-xs font-semibold text-gray-700 mb-2">{title}</div>
      <div className="space-y-1">
        {rows.map((row) => {
          const level = getProjectLineRowAccessLevel(permissions, row);
          const options: { value: PermissionAccessLevel; label: string }[] = [
            { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
          ];
          if (row.kind === 'readOnly' || row.kind === 'pair') {
            options.push({ value: 'view', label: PERMISSION_ACCESS_LEVEL_LABELS.view });
          }
          if (row.kind === 'pair') {
            options.push({ value: 'edit', label: PERMISSION_ACCESS_LEVEL_LABELS.edit });
          }
          if (row.kind === 'writeOnly') {
            options.push({ value: 'edit', label: 'Allowed' });
          }

          return (
            <div
              key={row.id}
              className={`flex items-center gap-2 p-1.5 rounded bg-white ${row.indent ? 'ml-3' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                  <span className="truncate">{row.label}</span>
                  {!isImplemented(row) && (
                    <span className="text-[10px] px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded border border-yellow-300 flex-shrink-0">
                      [WIP]
                    </span>
                  )}
                  {showGear(row) && (
                    <button
                      type="button"
                      onClick={() => onGearClick(row)}
                      className="ml-auto w-5 h-5 rounded hover:bg-gray-100 grid place-items-center text-gray-500 hover:text-gray-800"
                      title={
                        row.configKind?.includes('files')
                          ? 'Configure file category access (view / edit per category)'
                          : 'Configure Notes/History category access (view / edit per category)'
                      }
                    >
                      <GearIcon />
                    </button>
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
                  onAccessLevelChange(row, e.target.value as PermissionAccessLevel)
                }
                className="shrink-0 text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-800 focus:ring-1 focus:ring-brand-red focus:border-brand-red disabled:opacity-50 disabled:cursor-not-allowed min-w-[7.5rem]"
                aria-label={`Access for ${row.label}`}
              >
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
