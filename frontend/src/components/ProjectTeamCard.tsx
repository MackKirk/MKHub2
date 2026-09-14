import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { formatDateLocal, formatFriendlyDate, getTodayLocal } from '@/lib/dateUtils';
import { sortByLabel } from '@/lib/sortOptions';
import { formatShiftTimeRange } from '@/features/projects/components/calendar/projectCalendar.utils';
import {
  hasProjectFeatureWritePermission,
  hasProjectLineWritePermission,
  isAdminRole,
} from '@/lib/projectLinePermissionKeys';
import { JOB_TYPES } from '@/constants/jobTypes';
import { useConfirm } from '@/components/ConfirmProvider';
import { CreateShiftModal } from '@/components/DispatchTab';
import EditShiftModal from '@/components/EditShiftModal';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppDatePicker,
  AppHeroEditIcon,
  AppModal,
  AppSectionHeader,
  AppTabCountBadge,
  getAppTabButtonClassName,
  AppUserAvatar,
  AppUserSelect,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
} from '@/components/ui';

const SCHEDULED_SHIFTS_PREVIEW_LIMIT = 7;

type ScheduledShiftRange = 'today' | 'week' | 'month' | 'custom';
type ScheduledShiftFilter = ScheduledShiftRange | null;

type ShiftRangeSegment = {
  key: string;
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
};

function ShiftRangePills({ segments }: { segments: ShiftRangeSegment[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {segments.map((segment) => (
        <button
          key={segment.key}
          type="button"
          onClick={segment.onClick}
          className={getAppTabButtonClassName(segment.active)}
          aria-pressed={segment.active}
        >
          <span>{segment.label}</span>
          {typeof segment.count === 'number' ? (
            <AppTabCountBadge count={segment.count} isActive={segment.active} />
          ) : null}
        </button>
      ))}
    </div>
  );
}

function shiftDateYmd(value: unknown): string {
  const raw = String(value || '').trim();
  return raw.length >= 10 ? raw.slice(0, 10) : raw;
}

function startOfLocalWeekSunday(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function endOfLocalWeekSaturday(now: Date): Date {
  const end = startOfLocalWeekSunday(now);
  end.setDate(end.getDate() + 6);
  return end;
}

function isShiftInPresetRange(shift: any, range: Exclude<ScheduledShiftRange, 'custom'>, now = new Date()): boolean {
  const ymd = shiftDateYmd(shift?.date);
  if (!ymd) return false;
  if (range === 'today') return ymd === getTodayLocal();
  if (range === 'week') {
    return ymd >= formatDateLocal(startOfLocalWeekSunday(now)) && ymd <= formatDateLocal(endOfLocalWeekSaturday(now));
  }
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return ymd.startsWith(monthPrefix);
}

function isShiftInCustomRange(shift: any, from: string, to: string): boolean {
  const ymd = shiftDateYmd(shift?.date);
  if (!ymd) return false;
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

type ProjectTeamCardProps = {
  projectId: string;
  project?: any;
  employees: any[];
  canManageMembers: boolean;
  businessLine?: string | null;
  statusLabel?: string;
  useDesignSystem?: boolean;
  isOpportunity?: boolean;
  className?: string;
};

type ResolvedUser = ReturnType<typeof mapEmployeeToAppUserSelect> | { id: string; name: string };

function ShiftIconButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'danger';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={uiCx(
        'inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors',
        'hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40',
        tone === 'danger' && 'hover:bg-red-50 hover:text-red-600',
      )}
    >
      {children}
    </button>
  );
}

function AccessMemberCell({
  user,
  roleLabel,
  isCreator,
  canRemove,
  removing,
  useDesignSystem,
  onRemove,
}: {
  user: ResolvedUser;
  roleLabel: string;
  isCreator: boolean;
  canRemove: boolean;
  removing?: boolean;
  useDesignSystem: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="group inline-flex items-center gap-1.5 whitespace-nowrap py-0.5 pr-1">
      <AppUserAvatar user={user} size="sm" />
      <span className="text-xs font-medium text-gray-900">{user.name}</span>
      {useDesignSystem ? (
        <AppBadge variant={isCreator ? 'info' : 'neutral'} className="shrink-0 px-1.5 py-0 text-[9px]">
          {roleLabel}
        </AppBadge>
      ) : (
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-500">{roleLabel}</span>
      )}
      {canRemove ? (
        <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <ShiftIconButton label="Remove member" tone="danger" disabled={removing} onClick={() => onRemove?.()}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </ShiftIconButton>
        </span>
      ) : null}
    </div>
  );
}

function ScheduledShiftRow({
  shift,
  worker,
  canEdit,
  deleting,
  onEdit,
  onDelete,
}: {
  shift: any;
  worker: ResolvedUser;
  canEdit: boolean;
  deleting?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const timeRange = formatShiftTimeRange(shift.start_time, shift.end_time);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-[7rem] shrink-0 truncate text-[11px] font-medium leading-tight text-gray-600 sm:w-32">
        {formatFriendlyDate(shift.date)}
      </div>
      <div className="w-[9.5rem] shrink-0 whitespace-nowrap tabular-nums text-[11px] leading-tight text-gray-500 sm:w-40">
        {timeRange || '—'}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <AppUserAvatar user={worker} size="sm" />
        <span className="truncate text-xs font-medium text-gray-900">{worker.name}</span>
      </div>
      {canEdit ? (
        <div className="flex shrink-0 items-center gap-0.5">
          <ShiftIconButton label="Edit shift" onClick={() => onEdit?.()}>
            <AppHeroEditIcon className="h-3.5 w-3.5" />
          </ShiftIconButton>
          <ShiftIconButton label="Delete shift" tone="danger" disabled={deleting} onClick={() => onDelete?.()}>
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
          </ShiftIconButton>
        </div>
      ) : null}
    </div>
  );
}

export default function ProjectTeamCard({
  projectId,
  project,
  employees,
  canManageMembers,
  businessLine,
  statusLabel,
  useDesignSystem = false,
  isOpportunity = false,
  className,
}: ProjectTeamCardProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const location = useLocation();
  const recordLabel = isOpportunity ? 'opportunity' : 'project';

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = isAdminRole(me?.roles);
  const permissions: Set<string> = new Set((me?.permissions || []).map(String));
  const canWriteWorkload = hasProjectFeatureWritePermission(permissions, businessLine, 'workload', isAdmin);
  const canEditOnsiteLeads = hasProjectLineWritePermission(
    permissions,
    businessLine,
    isAdmin,
    location.pathname,
  );
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'finished' || statusLower === 'cancelled' || statusLower === 'canceled';
  }, [statusLabel]);
  const canEditShifts = canWriteWorkload && !isEditingRestricted;

  const { data: shifts = [] } = useQuery({
    queryKey: ['projectShifts', projectId],
    queryFn: () => (projectId ? api<any[]>('GET', `/dispatch/projects/${projectId}/shifts`) : Promise.resolve([])),
    enabled: !!projectId,
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['employeesDirectory', 'all'],
    queryFn: () => api<any[]>('GET', '/employees?limit=5000'),
    staleTime: 300_000,
  });
  const { data: aclMembers = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => (projectId ? api<any[]>('GET', `/projects/${projectId}/members`) : Promise.resolve([])),
    enabled: !!projectId,
  });
  const { data: projectFromApi } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<any>('GET', `/projects/${projectId}`),
    enabled: !!projectId && !project,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings-bundle'],
    queryFn: () => api<Record<string, any[]>>('GET', '/settings'),
    enabled: canEditShifts,
  });

  const resolvedProject = project || projectFromApi;
  const shiftEmployees = (employees?.length ? employees : allUsers) || [];

  const defaultBreakMin = useMemo(() => {
    if (!settings) return 30;
    const timesheetItems = (settings.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    const value = breakItem?.value ? parseInt(breakItem.value, 10) : 30;
    return Number.isNaN(value) ? 30 : value;
  }, [settings]);

  const defaultGeofenceRadius = useMemo(() => {
    if (!settings) return 150;
    const timesheetItems = (settings.timesheet || []) as any[];
    const radiusItem = timesheetItems.find((i: any) => i.label === 'default_geofence_radius_meters');
    const value = radiusItem?.value ? parseInt(radiusItem.value, 10) : 150;
    return Number.isNaN(value) ? 150 : value;
  }, [settings]);

  const jobTypeOptions = useMemo(
    () => [
      { value: '', label: 'No job type selected' },
      ...JOB_TYPES.map((job) => ({ value: job.name, label: job.name })),
    ],
    [],
  );

  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [savingMember, setSavingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [showAllShifts, setShowAllShifts] = useState(false);
  const [showCreateShift, setShowCreateShift] = useState(false);
  const [editShift, setEditShift] = useState<any>(null);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [shiftRange, setShiftRange] = useState<ScheduledShiftFilter>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const scheduledShifts = useMemo(
    () =>
      [...(shifts || [])]
        .filter((s: any) => s?.worker_id)
        .sort(
          (a: any, b: any) =>
            String(a.date || '').localeCompare(String(b.date || '')) ||
            String(a.start_time || '').localeCompare(String(b.start_time || '')),
        ),
    [shifts],
  );

  const shiftDateBounds = useMemo(() => {
    const dates = scheduledShifts.map((shift) => shiftDateYmd(shift.date)).filter(Boolean);
    if (dates.length === 0) {
      const today = getTodayLocal();
      return { from: today, to: today };
    }
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [scheduledShifts]);

  const filteredShifts = useMemo(() => {
    if (!shiftRange) return scheduledShifts;
    if (shiftRange === 'custom') {
      if (!customFrom && !customTo) return scheduledShifts;
      return scheduledShifts.filter((shift) => isShiftInCustomRange(shift, customFrom, customTo));
    }
    return scheduledShifts.filter((shift) => isShiftInPresetRange(shift, shiftRange));
  }, [scheduledShifts, shiftRange, customFrom, customTo]);

  const toggleShiftRange = useCallback(
    (range: ScheduledShiftRange) => {
      setShiftRange((current) => (current === range ? null : range));
      if (range === 'custom') {
        setCustomFrom(shiftDateBounds.from);
        setCustomTo(shiftDateBounds.to);
      }
    },
    [shiftDateBounds.from, shiftDateBounds.to],
  );

  const shiftRangeCounts = useMemo(
    () => ({
      today: scheduledShifts.filter((shift) => isShiftInPresetRange(shift, 'today')).length,
      week: scheduledShifts.filter((shift) => isShiftInPresetRange(shift, 'week')).length,
      month: scheduledShifts.filter((shift) => isShiftInPresetRange(shift, 'month')).length,
      custom:
        customFrom || customTo
          ? scheduledShifts.filter((shift) => isShiftInCustomRange(shift, customFrom, customTo)).length
          : scheduledShifts.length,
    }),
    [scheduledShifts, customFrom, customTo],
  );

  const shiftRangeSegments = useMemo(
    () => [
      {
        key: 'today',
        label: 'Today',
        active: shiftRange === 'today',
        count: shiftRangeCounts.today,
        onClick: () => toggleShiftRange('today'),
      },
      {
        key: 'week',
        label: 'This week',
        active: shiftRange === 'week',
        count: shiftRangeCounts.week,
        onClick: () => toggleShiftRange('week'),
      },
      {
        key: 'month',
        label: 'This month',
        active: shiftRange === 'month',
        count: shiftRangeCounts.month,
        onClick: () => toggleShiftRange('month'),
      },
    ],
    [shiftRange, shiftRangeCounts, toggleShiftRange],
  );

  const modalShiftRangeSegments = useMemo(
    () => [
      ...shiftRangeSegments,
      {
        key: 'custom',
        label: 'Custom',
        active: shiftRange === 'custom',
        count: shiftRangeCounts.custom,
        onClick: () => toggleShiftRange('custom'),
      },
    ],
    [shiftRange, shiftRangeCounts.custom, shiftRangeSegments, toggleShiftRange],
  );

  const shiftRangeLabel =
    shiftRange === 'today'
      ? 'today'
      : shiftRange === 'week'
        ? 'this week'
        : shiftRange === 'month'
          ? 'this month'
          : shiftRange === 'custom'
            ? 'in the selected range'
            : 'on this project schedule';

  const aclMemberUserIds = useMemo(
    () => new Set((aclMembers || []).map((m: any) => String(m.user_id))),
    [aclMembers],
  );

  const userLabel = (u: any) =>
    (u?.name || u?.username || u?.email_personal || u?.email || String(u?.id || '')).toString();

  const availableEmployees = useMemo(
    () =>
      sortByLabel(
        (allUsers || []).filter((u: any) => u?.id && !aclMemberUserIds.has(String(u.id))),
        userLabel,
      ),
    [allUsers, aclMemberUserIds],
  );

  const refreshShifts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['projectShifts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
    queryClient.invalidateQueries({ queryKey: ['timesheet', projectId] });
  }, [queryClient, projectId]);

  const closeAddMemberModal = () => {
    setShowAddMember(false);
    setSelectedUserIds([]);
  };

  const onAddMembers = async () => {
    if (!selectedUserIds.length) return;
    setSavingMember(true);
    try {
      const results = await Promise.allSettled(
        selectedUserIds.map((userId) => api('POST', `/projects/${projectId}/members`, { user_id: userId })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const added = results.length - failed;
      await queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      if (added > 0 && failed === 0) {
        toast.success(added === 1 ? 'Member added' : `${added} members added`);
        closeAddMemberModal();
      } else if (added > 0) {
        toast.success(`${added} added, ${failed} failed`);
        setSelectedUserIds(
          selectedUserIds.filter((_, i) => results[i]?.status === 'rejected'),
        );
      } else {
        const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        toast.error((firstError?.reason as any)?.message || 'Failed to add members');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add members');
    } finally {
      setSavingMember(false);
    }
  };

  const onRemoveMember = async (member: any) => {
    setRemovingMemberId(String(member.user_id));
    try {
      await api('DELETE', `/projects/${projectId}/members/${member.user_id}`);
      await queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      toast.success('Member removed');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const memberUserOptions = useMemo(
    () => availableEmployees.map((e: any) => mapEmployeeToAppUserSelect(e)),
    [availableEmployees],
  );

  const resolveUserById = useCallback(
    (uid: string, fallbackName?: string) => {
      const fromDir =
        employees.find((e: any) => String(e.id) === uid) ||
        allUsers.find((u: any) => String(u.id) === uid);
      if (fromDir) return mapEmployeeToAppUserSelect(fromDir);
      return {
        id: uid,
        name: (fallbackName || 'User') as string,
      };
    },
    [employees, allUsers],
  );

  const resolveMemberUser = useCallback(
    (member: any) =>
      resolveUserById(String(member.user_id), member.name || member.username || 'User'),
    [resolveUserById],
  );

  const onDeleteShift = async (shift: any) => {
    const worker = resolveUserById(String(shift.worker_id));
    const confirmResult = await confirm({
      title: 'Delete Shift',
      message: `Are you sure you want to delete this shift for ${worker.name} on ${formatFriendlyDate(shift.date)}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (confirmResult !== 'confirm') return;
    setDeletingShiftId(String(shift.id));
    try {
      await api('DELETE', `/dispatch/shifts/${shift.id}`);
      toast.success('Shift deleted');
      await refreshShifts();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || 'Failed to delete shift');
    } finally {
      setDeletingShiftId(null);
    }
  };

  const addPeopleControl = canManageMembers ? (
    useDesignSystem ? (
      <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowAddMember(true)}>
        + Access
      </AppButton>
    ) : (
      <button
        type="button"
        onClick={() => setShowAddMember(true)}
        className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50"
      >
        + Access
      </button>
    )
  ) : null;

  const addPeopleModal = (
    <AppModal
      open={showAddMember && canManageMembers}
      onClose={closeAddMemberModal}
      title="Add people"
      description={`Grant access to this ${recordLabel}. You can select more than one person.`}
      size="md"
      bodyClassName="overflow-visible px-5 py-4"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {useDesignSystem ? (
            <>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeAddMemberModal}>
                Cancel
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                disabled={!selectedUserIds.length || savingMember}
                loading={savingMember}
                onClick={onAddMembers}
              >
                {selectedUserIds.length > 1 ? `Add ${selectedUserIds.length}` : 'Add'}
              </AppButton>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={closeAddMemberModal}
                className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onAddMembers}
                disabled={!selectedUserIds.length || savingMember}
                className="rounded bg-brand-red px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {selectedUserIds.length > 1 ? `Add ${selectedUserIds.length}` : 'Add'}
              </button>
            </>
          )}
        </div>
      }
    >
      {useDesignSystem ? (
        <AppUserSelect
          mode="multiple"
          label="People"
          users={memberUserOptions}
          value={selectedUserIds}
          onChange={setSelectedUserIds}
          placeholder="Search and select people…"
          showSelectedChips={false}
          showSelectAll
          fieldHint={`People\n\nGrant these users access to this ${recordLabel} in MK Hub.`}
        />
      ) : (
        <select
          multiple
          value={selectedUserIds}
          onChange={(e) =>
            setSelectedUserIds(Array.from(e.target.selectedOptions).map((opt) => opt.value))
          }
          className="min-h-[10rem] w-full rounded border px-2 py-1.5 text-sm"
        >
          {availableEmployees.map((e: any) => (
            <option key={String(e.id)} value={String(e.id)}>
              {userLabel(e)}
            </option>
          ))}
        </select>
      )}
    </AppModal>
  );

  const accessChips =
    (aclMembers || []).length > 0 ? (
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {(aclMembers || []).map((member: any) => {
          const user = resolveMemberUser(member);
          const roleLabel = member.is_creator ? 'Creator' : member.member_role || 'Member';
          const canRemove = canManageMembers && !member.is_creator;
          const removing = removingMemberId === String(member.user_id);

          return (
            <AccessMemberCell
              key={member.id}
              user={user}
              roleLabel={roleLabel}
              isCreator={!!member.is_creator}
              canRemove={canRemove}
              removing={removing}
              useDesignSystem={useDesignSystem}
              onRemove={() => onRemoveMember(member)}
            />
          );
        })}
      </div>
    ) : useDesignSystem ? (
      <AppEmptyState
        title="No team members yet"
        description={`Add people who need access to this ${recordLabel}.`}
      />
    ) : (
      <div className="text-sm text-gray-500">No team members assigned yet</div>
    );

  const projectAccessHeader = (
    <div className="mb-3 text-sm font-semibold text-gray-900">Project access</div>
  );

  const previewShifts = filteredShifts.slice(0, SCHEDULED_SHIFTS_PREVIEW_LIMIT);
  const hasMoreShifts = filteredShifts.length > SCHEDULED_SHIFTS_PREVIEW_LIMIT;
  const remainingShiftCount = filteredShifts.length - SCHEDULED_SHIFTS_PREVIEW_LIMIT;

  const renderShiftList = (list: any[]) =>
    list.map((shift: any) => {
      const workerId = String(shift.worker_id);
      const rowKey = String(shift.id || `${workerId}-${shift.date}-${shift.start_time}`);
      return (
        <ScheduledShiftRow
          key={rowKey}
          shift={shift}
          worker={resolveUserById(workerId)}
          canEdit={canEditShifts}
          deleting={deletingShiftId === String(shift.id)}
          onEdit={() => setEditShift(shift)}
          onDelete={() => onDeleteShift(shift)}
        />
      );
    });

  const shiftActionButtons = (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      {hasMoreShifts ? (
        useDesignSystem ? (
          <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowAllShifts(true)}>
            View all ({filteredShifts.length})
          </AppButton>
        ) : (
          <button
            type="button"
            onClick={() => setShowAllShifts(true)}
            className="text-xs font-medium text-brand-red hover:underline"
          >
            View all ({filteredShifts.length}) · {remainingShiftCount} more
          </button>
        )
      ) : null}
      {canEditShifts ? (
        useDesignSystem ? (
          <AppButton
            type="button"
            size="sm"
            onClick={() => setShowCreateShift(true)}
            disabled={!resolvedProject}
          >
            Add shift
          </AppButton>
        ) : (
          <button
            type="button"
            onClick={() => setShowCreateShift(true)}
            disabled={!resolvedProject}
            className="rounded bg-brand-red px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            Add shift
          </button>
        )
      ) : null}
    </div>
  );

  const workersSection =
    scheduledShifts.length > 0 || canEditShifts ? (
      <div className="border-t border-gray-100 pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-x-3">
          <div className="text-sm font-semibold text-gray-900">Scheduled workers</div>
          <ShiftRangePills segments={shiftRangeSegments} />
        </div>
        <p className="mb-2 text-xs text-gray-500">
          On the schedule only — not project access unless added above.
        </p>
        {filteredShifts.length > 0 ? (
          <div className="divide-y divide-gray-50">{renderShiftList(previewShifts)}</div>
        ) : (
          <p className="text-xs text-gray-500">
            {scheduledShifts.length > 0 ? `No shifts ${shiftRangeLabel}.` : 'No shifts scheduled yet.'}
          </p>
        )}
        {shiftActionButtons}
      </div>
    ) : null;

  const allShiftsModal = (
    <AppModal
      open={showAllShifts}
      onClose={() => setShowAllShifts(false)}
      title="Scheduled workers"
      description={`${filteredShifts.length} shifts ${shiftRangeLabel}`}
      size="md"
      bodyClassName="overflow-visible px-5 py-3"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEditShifts ? (
            useDesignSystem ? (
              <AppButton
                type="button"
                size="sm"
                onClick={() => {
                  setShowAllShifts(false);
                  setShowCreateShift(true);
                }}
                disabled={!resolvedProject}
              >
                Add shift
              </AppButton>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowAllShifts(false);
                  setShowCreateShift(true);
                }}
                disabled={!resolvedProject}
                className="rounded bg-brand-red px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Add shift
              </button>
            )
          ) : null}
          {useDesignSystem ? (
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowAllShifts(false)}>
              Close
            </AppButton>
          ) : (
            <button
              type="button"
              onClick={() => setShowAllShifts(false)}
              className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Close
            </button>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ShiftRangePills segments={modalShiftRangeSegments} />
        </div>
        {shiftRange === 'custom' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <AppDatePicker
              label="From"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => {
                const next = e.target.value;
                setCustomFrom(next);
                if (customTo && next && customTo < next) setCustomTo(next);
              }}
            />
            <AppDatePicker
              label="To"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => {
                const next = e.target.value;
                setCustomTo(next);
                if (customFrom && next && customFrom > next) setCustomFrom(next);
              }}
            />
          </div>
        ) : null}
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-50">
          {filteredShifts.length > 0 ? (
            renderShiftList(filteredShifts)
          ) : (
            <p className="py-4 text-sm text-gray-500">
              {scheduledShifts.length > 0 ? `No shifts ${shiftRangeLabel}.` : 'No shifts scheduled yet.'}
            </p>
          )}
        </div>
      </div>
    </AppModal>
  );

  const shiftModals = (
    <>
      {showCreateShift && resolvedProject ? (
        <CreateShiftModal
          projectId={projectId}
          project={resolvedProject}
          employees={shiftEmployees}
          defaultBreakMin={defaultBreakMin}
          defaultGeofenceRadius={defaultGeofenceRadius}
          designSystem={useDesignSystem}
          jobTypeOptions={jobTypeOptions}
          canEditOnsiteLeads={canEditOnsiteLeads}
          onClose={() => setShowCreateShift(false)}
          onSave={async () => {
            await refreshShifts();
            setShowCreateShift(false);
          }}
        />
      ) : null}
      {editShift?.id && resolvedProject ? (
        <EditShiftModal
          projectId={projectId}
          project={resolvedProject}
          employees={shiftEmployees}
          shift={editShift}
          canEdit={canEditShifts}
          designSystem={useDesignSystem}
          jobTypeOptions={jobTypeOptions}
          onClose={() => setEditShift(null)}
          onSave={async () => {
            await refreshShifts();
            setEditShift(null);
          }}
        />
      ) : null}
    </>
  );

  if (useDesignSystem) {
    return (
      <>
        <AppCard className={uiCx('flex h-full min-h-0 flex-col', className)}>
          <AppSectionHeader
            title="Project Team"
            description="Project access members can open this project. Scheduled workers appear from shifts only."
            {...appSectionPresetProps('team')}
            action={addPeopleControl}
          />
          <div className={uiCx('mt-3', uiSpacing.sectionStack)}>
            <div>
              {projectAccessHeader}
              {accessChips}
            </div>
            {workersSection}
          </div>
        </AppCard>
        {addPeopleModal}
        {allShiftsModal}
        {shiftModals}
      </>
    );
  }

  return (
    <>
      <div className={uiCx('rounded-xl border bg-white p-4 h-full', className)}>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold">Project Team</h4>
          {addPeopleControl}
        </div>
        <div className={uiSpacing.sectionStack}>
          <div>
            {projectAccessHeader}
            {accessChips}
          </div>
          {workersSection}
        </div>
      </div>
      {addPeopleModal}
      {allShiftsModal}
      {shiftModals}
    </>
  );
}
