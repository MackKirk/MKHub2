import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppListRowIconButton,
  AppSectionHeader,
  AppUserAvatar,
  AppUserSelect,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ProjectTeamCardProps = {
  projectId: string;
  employees: any[];
  canManageMembers: boolean;
  useDesignSystem?: boolean;
  isOpportunity?: boolean;
  className?: string;
};

function TeamPersonRow({
  user,
  subtitle,
  action,
}: {
  user: ReturnType<typeof mapEmployeeToAppUserSelect>;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
      <AppUserAvatar user={user} size="sm" />
      <div className="min-w-0 flex-1">
        <div className={uiCx(uiTypography.body, 'truncate font-medium text-gray-900')}>{user.name}</div>
        {subtitle ? <div className="mt-1">{subtitle}</div> : null}
      </div>
      {action}
    </div>
  );
}

export default function ProjectTeamCard({
  projectId,
  employees,
  canManageMembers,
  useDesignSystem = false,
  isOpportunity = false,
  className,
}: ProjectTeamCardProps) {
  const queryClient = useQueryClient();
  const recordLabel = isOpportunity ? 'opportunity' : 'project';

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

  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const workerIds = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((shift: any) => {
      if (shift.worker_id) ids.add(String(shift.worker_id));
    });
    return Array.from(ids);
  }, [shifts]);

  const teamMembers = useMemo(
    () => workerIds.map((wid) => employees.find((e: any) => String(e.id) === String(wid))).filter(Boolean),
    [workerIds, employees],
  );

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

  const onAddMember = async () => {
    if (!selectedUserId) return;
    setSavingMember(true);
    try {
      await api('POST', `/projects/${projectId}/members`, { user_id: selectedUserId });
      setSelectedUserId('');
      setShowAddMember(false);
      await queryClient.invalidateQueries({ queryKey: ['projectMembers', projectId] });
      toast.success('Member added');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add member');
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

  const resolveMemberUser = useCallback(
    (member: any) => {
      const uid = String(member.user_id);
      const fromDir =
        employees.find((e: any) => String(e.id) === uid) ||
        allUsers.find((u: any) => String(u.id) === uid);
      if (fromDir) return mapEmployeeToAppUserSelect(fromDir);
      return {
        id: uid,
        name: (member.name || member.username || 'User') as string,
        username: member.username,
      };
    },
    [employees, allUsers],
  );

  const addPeopleControl = canManageMembers ? (
    useDesignSystem ? (
      <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowAddMember((v) => !v)}>
        {showAddMember ? 'Cancel' : 'Add people'}
      </AppButton>
    ) : (
      <button
        onClick={() => setShowAddMember((v) => !v)}
        className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50"
      >
        Add people
      </button>
    )
  ) : null;

  const addMemberForm = showAddMember && canManageMembers && (
    <div className={uiCx('grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end')}>
      {useDesignSystem ? (
        <>
          <AppUserSelect
            mode="single"
            label="Team member"
            users={memberUserOptions}
            value={selectedUserId}
            onChange={setSelectedUserId}
            placeholder="Search user…"
            fieldHint={`Team member\n\nGrant this user access to this ${recordLabel} in MK Hub.`}
          />
          <AppButton
            type="button"
            size="sm"
            variant="secondary"
            className="sm:mb-0.5"
            disabled={!selectedUserId || savingMember}
            loading={savingMember}
            onClick={onAddMember}
          >
            Add
          </AppButton>
        </>
      ) : (
        <>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 rounded border px-2 py-1.5 text-sm"
          >
            <option value="">Select user...</option>
            {availableEmployees.map((e: any) => (
              <option key={String(e.id)} value={String(e.id)}>
                {userLabel(e)}
              </option>
            ))}
          </select>
          <button
            onClick={onAddMember}
            disabled={!selectedUserId || savingMember}
            className="rounded bg-brand-red px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Add
          </button>
        </>
      )}
    </div>
  );

  const accessList =
    (aclMembers || []).length > 0 ? (
      <div className={uiCx(uiBorders.subtle, uiRadius.control, uiColors.surface, 'divide-y overflow-hidden')}>
        {(aclMembers || []).map((member: any) => (
          <TeamPersonRow
            key={member.id}
            user={resolveMemberUser(member)}
            subtitle={
              useDesignSystem ? (
                <AppBadge variant={member.is_creator ? 'info' : 'neutral'}>
                  {member.is_creator ? 'Creator' : member.member_role || 'Member'}
                </AppBadge>
              ) : (
                <div className="text-[11px] text-gray-500">
                  {member.is_creator ? 'Creator' : member.member_role || 'Member'}
                </div>
              )
            }
            action={
              canManageMembers && !member.is_creator ? (
                useDesignSystem ? (
                  <AppListRowIconButton
                    preset="delete"
                    label="Remove member"
                    loading={removingMemberId === String(member.user_id)}
                    disabled={removingMemberId === String(member.user_id)}
                    onClick={() => onRemoveMember(member)}
                  />
                ) : (
                  <button
                    onClick={() => onRemoveMember(member)}
                    disabled={removingMemberId === String(member.user_id)}
                    className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )
              ) : null
            }
          />
        ))}
      </div>
    ) : useDesignSystem ? (
      <AppEmptyState
        title="No team members yet"
        description={`Add people who need access to this ${recordLabel}.`}
        action={
          canManageMembers ? (
            <AppButton type="button" size="sm" variant="secondary" onClick={() => setShowAddMember(true)}>
              Add people
            </AppButton>
          ) : undefined
        }
      />
    ) : (
      <div className="text-sm text-gray-500">No team members assigned yet</div>
    );

  const workersSection =
    teamMembers.length > 0 ? (
      <div className="border-t border-gray-100 pt-4">
        <div className="mb-3 text-sm font-semibold text-gray-900">Scheduled workers</div>
        {useDesignSystem ? (
          <div className={uiCx(uiBorders.subtle, uiRadius.control, uiColors.surface, 'divide-y overflow-hidden')}>
            {teamMembers.map((member: any) => (
              <TeamPersonRow key={member.id} user={mapEmployeeToAppUserSelect(member)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {teamMembers.map((member: any) => (
              <span key={member.id} className="rounded-full border bg-white px-2 py-1 text-xs">
                {member.name || member.username}
              </span>
            ))}
          </div>
        )}
      </div>
    ) : null;

  if (useDesignSystem) {
    return (
      <AppCard className={uiCx('flex h-full min-h-0 flex-col', className)}>
        <AppSectionHeader
          title="Project Team"
          description="Members with project access and workers scheduled on shifts."
          {...appSectionPresetProps('team')}
          action={addPeopleControl}
        />
        <div className={uiCx('mt-3', uiSpacing.sectionStack)}>
          {addMemberForm}
          <div>
            <div className="mb-3 text-sm font-semibold text-gray-900">Project access</div>
            {accessList}
          </div>
          {workersSection}
        </div>
      </AppCard>
    );
  }

  return (
    <div className={uiCx('rounded-xl border bg-white p-4 h-full', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-semibold">Project Team</h4>
        {addPeopleControl}
      </div>
      <div className={uiSpacing.sectionStack}>
        {addMemberForm}
        <div>
          <div className="mb-2 text-sm font-semibold text-gray-900">Project access</div>
          {(aclMembers || []).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {(aclMembers || []).map((member: any) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded border p-2 transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                    {(member.name || member.username || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {member.name || member.username}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {member.is_creator ? 'Creator' : member.member_role || 'Member'}
                    </div>
                  </div>
                  {canManageMembers && !member.is_creator ? (
                    <button
                      onClick={() => onRemoveMember(member)}
                      disabled={removingMemberId === String(member.user_id)}
                      className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            accessList
          )}
        </div>
        {workersSection}
      </div>
    </div>
  );
}
