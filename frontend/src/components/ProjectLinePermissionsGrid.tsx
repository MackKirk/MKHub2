import { Settings } from 'lucide-react';
import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import { permissionUi } from '@/components/permissionUi';
import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS, type PermissionAccessLevel } from '@/lib/permissionAccessLevel';
import {
  buildProjectLinePermissionRows,
  getProjectLineRowAccessLevel,
  type ProjectLine,
  type ProjectLinePermissionRow,
} from '@/lib/projectLinePermissions';
import { AppBadge, AppButton, uiCx } from '@/components/ui';

type Perm = { id: string; key: string; label: string; description?: string };

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
  onConfigureProjectFiles?: (line: ProjectLine) => void;
  onConfigureProjectReports?: (line: ProjectLine) => void;
}) {
  const rows = buildProjectLinePermissionRows(line, areaPerms);
  if (rows.length === 0) return null;

  const title = line === 'construction' ? 'Production (Sales)' : 'Repairs & Maintenance';

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
    if (row.configKind?.endsWith('-files')) return !!onConfigureProjectFiles;
    if (row.configKind?.endsWith('-reports')) return !!onConfigureProjectReports;
    return false;
  };

  const onGearClick = (row: ProjectLinePermissionRow) => {
    if (row.kind !== 'pair' || !row.configKind) return;
    if (row.configKind?.endsWith('-files')) onConfigureProjectFiles?.(line);
    if (row.configKind?.endsWith('-reports')) onConfigureProjectReports?.(line);
  };

  return (
    <div className="rounded-lg bg-gray-50/80 p-2.5">
      <div className={uiCx(permissionUi.groupTitle, 'mb-2')}>{title}</div>
      <div className="divide-y divide-gray-200/80">
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
              className={uiCx('flex items-center gap-3 py-2', row.indent && 'ml-3')}
            >
              <div className="min-w-0 flex-1">
                <div className={uiCx(permissionUi.rowTitle, 'flex items-center gap-1.5')}>
                  <span className="truncate">{row.label}</span>
                  {!isImplemented(row) ? <AppBadge variant="warning">WIP</AppBadge> : null}
                  {showGear(row) ? (
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-10 w-10 shrink-0 p-0 text-gray-600 hover:text-gray-900"
                      title={
                        row.kind === 'pair' && row.configKind?.includes('files')
                          ? 'Configure file category access (view / edit per category)'
                          : 'Configure Notes/History category access (view / edit per category)'
                      }
                      onClick={() => onGearClick(row)}
                    >
                      <Settings className="h-6 w-6" aria-hidden strokeWidth={2.25} />
                    </AppButton>
                  ) : null}
                </div>
                {row.description ? (
                  <div className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>{row.description}</div>
                ) : null}
              </div>
              <PermissionAccessLevelSelect
                value={level}
                disabled={!canEdit}
                options={options}
                onChange={(next) => onAccessLevelChange(row, next)}
                aria-label={`Access for ${row.label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
