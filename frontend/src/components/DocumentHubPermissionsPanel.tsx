import { Settings } from 'lucide-react';
import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import { permissionUi } from '@/components/permissionUi';
import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS } from '@/lib/permissionAccessLevel';
import {
  buildDocumentHubPermissionRows,
  DOCUMENT_HUB_TEMPLATES_READ,
  getDocumentHubAccessLevel,
  type DocumentHubAccessLevel,
} from '@/lib/documentHubPermissions';
import { AppBadge, AppButton, uiCx } from '@/components/ui';

type Perm = { id: string; key: string; label: string; description?: string };

export function DocumentHubPermissionsPanel({
  areaPerms,
  permissions,
  canEdit,
  onAccessLevelChange,
  onConfigureTemplateCategories,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (
    readKey: string,
    writeKey: string | undefined,
    level: DocumentHubAccessLevel,
  ) => void;
  onConfigureTemplateCategories?: () => void;
}) {
  const rows = buildDocumentHubPermissionRows(areaPerms);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg bg-gray-50/80 p-2.5">
      <div className={uiCx(permissionUi.groupTitle, 'mb-2')}>Documents</div>
      <div className="divide-y divide-gray-200/80">
        {rows.map((row) => {
          const level = getDocumentHubAccessLevel(permissions, row.readKey, row.writeKey);
          const readImplemented =
            IMPLEMENTED_PERMISSIONS.has(row.readKey) &&
            (!row.writeKey || IMPLEMENTED_PERMISSIONS.has(row.writeKey));
          const showGear =
            canEdit &&
            row.readKey === DOCUMENT_HUB_TEMPLATES_READ &&
            !!onConfigureTemplateCategories;
          return (
            <div key={row.id} className={uiCx('flex items-center gap-3 py-2', row.indent && 'ml-3')}>
              <div className="min-w-0 flex-1">
                <div className={uiCx(permissionUi.rowTitle, 'flex items-center gap-1.5')}>
                  <span className="truncate">{row.label}</span>
                  {!readImplemented ? <AppBadge variant="warning">WIP</AppBadge> : null}
                  {showGear ? (
                    <AppButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-10 w-10 shrink-0 p-0 text-gray-600 hover:text-gray-900"
                      title="Configure document template category access"
                      onClick={onConfigureTemplateCategories}
                    >
                      <Settings className="h-6 w-6" aria-hidden strokeWidth={2.25} />
                    </AppButton>
                  ) : null}
                </div>
                {row.description ? (
                  <div className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>
                    {row.description}
                  </div>
                ) : null}
              </div>
              <PermissionAccessLevelSelect
                value={level}
                disabled={!canEdit}
                options={[
                  { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
                  { value: 'view', label: PERMISSION_ACCESS_LEVEL_LABELS.view },
                  ...(row.writeKey
                    ? [{ value: 'edit' as const, label: PERMISSION_ACCESS_LEVEL_LABELS.edit }]
                    : []),
                ]}
                onChange={(next) => onAccessLevelChange(row.readKey, row.writeKey, next)}
                aria-label={`Access for ${row.label}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
