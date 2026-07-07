import { EntityPermissionsGrid } from '@/components/EntityPermissionsGrid';
import { PermissionAccessLevelSelect } from '@/components/PermissionAccessLevelSelect';
import { PermissionToggleLabel } from '@/components/PermissionToggleRow';
import { permissionUi } from '@/components/permissionUi';
import { IMPLEMENTED_PERMISSIONS } from '@/lib/implementedPermissions';
import { PERMISSION_ACCESS_LEVEL_LABELS } from '@/lib/permissionAccessLevel';
import {
  buildHrAttendancePermissionRows,
  buildHrCommunityPermissionRows,
  buildHrOffboardingPermissionRows,
  buildHrTimesheetPermissionRows,
  buildHrUsersPermissionRows,
  getHrAccessLevel,
  getHrWriteOnlyLevel,
  HR_REVIEWS_ADMIN,
  HR_TIMESHEET_APPROVE,
  HR_TIMESHEET_UNRESTRICTED_CLOCK,
  type HrAccessLevel,
} from '@/lib/hrPermissions';
import { AppBadge, uiCx } from '@/components/ui';

type Perm = { id: string; key: string; label: string; description?: string };

function WriteOnlyAllowedRow({
  permKey,
  label,
  description,
  permissions,
  canEdit,
  onChange,
  indent = true,
}: {
  permKey: string;
  label: string;
  description?: string;
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onChange: (level: HrAccessLevel) => void;
  indent?: boolean;
}) {
  const implemented = IMPLEMENTED_PERMISSIONS.has(permKey);
  return (
    <div className={uiCx('flex items-center gap-3 py-2', indent && 'ml-3')}>
      <div className="min-w-0 flex-1">
        <div className={uiCx(permissionUi.rowTitle, 'flex items-center gap-1.5')}>
          <span className="truncate">{label}</span>
          {!implemented ? <AppBadge variant="warning">WIP</AppBadge> : null}
        </div>
        {description ? (
          <div className={uiCx(permissionUi.rowDescription, 'mt-0.5 line-clamp-2')}>{description}</div>
        ) : null}
      </div>
      <PermissionAccessLevelSelect
        value={getHrWriteOnlyLevel(permissions, permKey)}
        disabled={!canEdit}
        options={[
          { value: 'blocked', label: PERMISSION_ACCESS_LEVEL_LABELS.blocked },
          { value: 'edit', label: 'Allowed' },
        ]}
        onChange={onChange}
        aria-label={`Access for ${label}`}
      />
    </div>
  );
}

export function HrPermissionsPanel({
  areaPerms,
  permissions,
  canEdit,
  onAccessLevelChange,
  onWriteOnlyChange,
  accessPerm,
  onAccessToggle,
}: {
  areaPerms: Perm[];
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onAccessLevelChange: (
    readKey: string,
    writeKey: string | undefined,
    level: HrAccessLevel,
  ) => void;
  onWriteOnlyChange: (key: string, level: HrAccessLevel) => void;
  accessPerm?: Perm;
  onAccessToggle?: () => void;
}) {
  const usersPerms = areaPerms.filter((p) => p.key.startsWith('hr:users:'));
  const offboardingPerms = areaPerms.filter((p) => p.key.startsWith('hr:offboarding:'));
  const attendancePerms = areaPerms.filter((p) => p.key.startsWith('hr:attendance:'));
  const communityPerms = areaPerms.filter((p) => p.key.startsWith('hr:community:'));
  const timesheetPerms = areaPerms.filter((p) => p.key.startsWith('hr:timesheet:'));
  const reviewsPerm = areaPerms.find((p) => p.key === HR_REVIEWS_ADMIN);

  const timesheetApprovePerm = areaPerms.find((p) => p.key === HR_TIMESHEET_APPROVE);
  const timesheetClockPerm = areaPerms.find((p) => p.key === HR_TIMESHEET_UNRESTRICTED_CLOCK);

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
        title="Users & profiles"
        rows={buildHrUsersPermissionRows(usersPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getHrAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <EntityPermissionsGrid
        title="Offboarding"
        rows={buildHrOffboardingPermissionRows(offboardingPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getHrAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <EntityPermissionsGrid
        title="Attendance"
        rows={buildHrAttendancePermissionRows(attendancePerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getHrAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <EntityPermissionsGrid
        title="Community"
        rows={buildHrCommunityPermissionRows(communityPerms)}
        permissions={permissions}
        canEdit={canEdit}
        getAccessLevel={getHrAccessLevel}
        onAccessLevelChange={onAccessLevelChange}
      />

      <div>
        <EntityPermissionsGrid
          title="Timesheet"
          rows={buildHrTimesheetPermissionRows(timesheetPerms)}
          permissions={permissions}
          canEdit={canEdit}
          getAccessLevel={getHrAccessLevel}
          onAccessLevelChange={onAccessLevelChange}
        />
        {timesheetApprovePerm ? (
          <WriteOnlyAllowedRow
            permKey={HR_TIMESHEET_APPROVE}
            label={timesheetApprovePerm.label}
            description={timesheetApprovePerm.description}
            permissions={permissions}
            canEdit={canEdit}
            onChange={(level) => onWriteOnlyChange(HR_TIMESHEET_APPROVE, level)}
          />
        ) : null}
        {timesheetClockPerm ? (
          <WriteOnlyAllowedRow
            permKey={HR_TIMESHEET_UNRESTRICTED_CLOCK}
            label={timesheetClockPerm.label}
            description={timesheetClockPerm.description}
            permissions={permissions}
            canEdit={canEdit}
            onChange={(level) => onWriteOnlyChange(HR_TIMESHEET_UNRESTRICTED_CLOCK, level)}
          />
        ) : null}
      </div>

      {reviewsPerm ? (
        <div className="rounded-lg bg-gray-50/80 p-2.5">
          <div className={uiCx(permissionUi.groupTitle, 'mb-2')}>Employee Reviews</div>
          <WriteOnlyAllowedRow
            permKey={HR_REVIEWS_ADMIN}
            label={reviewsPerm.label}
            description={reviewsPerm.description}
            permissions={permissions}
            canEdit={canEdit}
            indent={false}
            onChange={(level) => onWriteOnlyChange(HR_REVIEWS_ADMIN, level)}
          />
        </div>
      ) : null}
    </div>
  );
}
