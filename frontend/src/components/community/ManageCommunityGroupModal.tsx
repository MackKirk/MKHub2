import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ImagePicker from '@/components/ImagePicker';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import type { CommunityGroupDetail, CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';
import { COMMUNITY_GROUP_DESCRIPTION_MAX_LEN } from '@/components/community/communityGroupTypes';
import { communityGroupFieldHints, manageCommunityGroupQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCheckboxControl,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppTabs,
  AppTextarea,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type EmployeeRow = { id: string; name?: string; profile_photo_file_id?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  group: CommunityGroupSummary | null;
  initialTab?: ManageGroupTab;
  employees: EmployeeRow[];
  currentUserId?: string | null;
};

const MANAGE_TABS = [
  { key: 'details', label: 'Details' },
  { key: 'members', label: 'Members' },
  { key: 'danger', label: 'Danger zone' },
];

async function uploadGroupAvatarBlob(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append('file', blob, 'group-avatar.png');
  fd.append('original_name', 'group-avatar.png');
  fd.append('content_type', blob.type || 'image/png');
  fd.append('project_id', '');
  fd.append('client_id', '');
  fd.append('employee_id', '');
  fd.append('category_id', 'community-group-avatar');
  const conf = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
  if (!conf?.id) throw new Error('Invalid upload response');
  return conf.id;
}

export function ManageCommunityGroupModal({
  open,
  onClose,
  group,
  initialTab = 'details',
  employees,
  currentUserId,
}: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState<ManageGroupTab>(initialTab);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhotoFileId, setEditPhotoFileId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberQ, setDebouncedMemberQ] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberQ(memberSearch.trim().toLowerCase()), 280);
    return () => clearTimeout(t);
  }, [memberSearch]);

  useEffect(() => {
    if (!open || !group) return;
    setTab(initialTab ?? 'details');
    setMemberSearch('');
    setEditName(group.name || '');
    setEditDescription(group.description ?? '');
    setEditPhotoFileId(group.photo_file_id ?? null);
  }, [open, group?.id, initialTab, group]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['community-group', group?.id],
    queryFn: () => api<CommunityGroupDetail>('GET', `/community/groups/${group!.id}`),
    enabled: open && !!group?.id && group?.is_owner,
  });

  useEffect(() => {
    if (!detail?.member_ids) return;
    setSelectedMembers(detail.member_ids.map(String));
  }, [detail?.member_ids]);

  const filteredEmployees = useMemo(() => {
    const q = debouncedMemberQ;
    const rows = !q
      ? [...employees]
      : employees.filter((e) => {
          const hay =
            `${String(e.name || '')} ${String((e as EmployeeRow & { username?: string }).username || '')}`.toLowerCase();
          return hay.includes(q);
        });
    const sortKey = (e: EmployeeRow & { username?: string }) =>
      String(e.name || e.username || '').trim().toLocaleLowerCase();
    rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base' }));
    return rows;
  }, [employees, debouncedMemberQ]);

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllFiltered = () => {
    const ids = filteredEmployees.map((e) => String(e.id));
    if (ids.every((id) => selectedMembers.includes(id))) {
      setSelectedMembers((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedMembers((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const saveDetailsMutation = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error('No group');
      await api('PUT', `/community/groups/${group.id}`, {
        name: editName.trim(),
        description: editDescription.trim() ? editDescription.trim() : null,
        photo_file_id: editPhotoFileId,
      });
    },
    onSuccess: () => {
      toast.success('Group updated');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['community-group', group?.id] });
      onClose();
    },
    onError: (err: unknown) => {
      const detailErr = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detailErr === 'string' ? detailErr : 'Failed to save');
    },
  });

  const saveMembersMutation = useMutation({
    mutationFn: async (memberIds: string[]) => {
      if (!group) throw new Error('No group');
      await api('PUT', `/community/groups/${group.id}/members`, { member_ids: memberIds });
    },
    onSuccess: () => {
      toast.success('Members updated');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.invalidateQueries({ queryKey: ['community-group', group?.id] });
      onClose();
    },
    onError: (err: unknown) => {
      const detailErr = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detailErr === 'string' ? detailErr : 'Failed to update members');
    },
  });

  const handleAvatarConfirm = async (blob: Blob) => {
    try {
      const id = await uploadGroupAvatarBlob(blob);
      setEditPhotoFileId(id);
      toast.success('Image ready — save Details to apply');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setShowPicker(false);
    }
  };

  const saveMemberPayload = (): string[] => {
    const ids = [...selectedMembers];
    if (group?.is_owner && currentUserId && !ids.includes(currentUserId)) ids.push(currentUserId);
    return ids;
  };

  const handleDeleteGroup = async () => {
    if (!group) return;
    const r = await confirm({
      title: 'Delete group',
      message: `Delete “${group.name}”? Member links are removed. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (r !== 'confirm') return;
    try {
      await api('DELETE', `/community/groups/${group.id}`);
      toast.success('Group deleted');
      queryClient.invalidateQueries({ queryKey: ['community-groups'] });
      queryClient.removeQueries({ queryKey: ['community-group', group.id] });
      onClose();
    } catch (err: unknown) {
      const detailErr = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detailErr === 'string' ? detailErr : 'Failed to delete');
    }
  };

  const isPending = saveDetailsMutation.isPending || saveMembersMutation.isPending;
  const isOwner = !!group?.is_owner;

  const readOnlySubtitle = !isOwner
    ? 'You can view this group. Only the creator can edit settings or members.'
    : 'Update details and members.';

  const quickInfoTab = !isOwner ? 'view' : tab;

  const footer =
    !isOwner || tab === 'danger' ? (
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
          Close
        </AppButton>
      </div>
    ) : tab === 'details' ? (
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </AppButton>
        <AppButton
          type="button"
          variant="primary"
          size="sm"
          loading={saveDetailsMutation.isPending}
          disabled={!editName.trim()}
          onClick={() => saveDetailsMutation.mutate()}
        >
          {saveDetailsMutation.isPending ? 'Saving…' : 'Save changes'}
        </AppButton>
      </div>
    ) : (
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
          Cancel
        </AppButton>
        <AppButton
          type="button"
          variant="primary"
          size="sm"
          loading={saveMembersMutation.isPending}
          disabled={detailLoading}
          onClick={() => saveMembersMutation.mutate(saveMemberPayload())}
        >
          {saveMembersMutation.isPending ? 'Saving…' : 'Save members'}
        </AppButton>
      </div>
    );

  const allFilteredSelected =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedMembers.includes(String(e.id)));

  const body = !group ? null : !isOwner ? (
    <div className={uiSpacing.sectionStack}>
      <p className={uiTypography.helper}>
        <span className="font-semibold tabular-nums text-gray-900">{group.member_count ?? 0}</span> members
      </p>
      {group.description ? (
        <p className="text-sm leading-relaxed text-gray-800">{group.description}</p>
      ) : (
        <p className={uiCx(uiTypography.helper, 'italic')}>No description.</p>
      )}
    </div>
  ) : tab === 'details' ? (
    <div className={uiSpacing.sectionStack}>
      <AppInput
        id="mg-name"
        label="Name *"
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        fieldHint={communityGroupFieldHints.name}
      />
      <AppTextarea
        id="mg-desc"
        label="Description"
        value={editDescription}
        onChange={(e) => setEditDescription(e.target.value.slice(0, COMMUNITY_GROUP_DESCRIPTION_MAX_LEN))}
        rows={4}
        maxLength={COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
        helperText={`${editDescription.length} / ${COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}`}
        fieldHint={communityGroupFieldHints.description}
      />
      <div>
        <AppControlLabelRow
          label="Photo"
          fieldHint={<AppFieldHint hint={communityGroupFieldHints.photo} />}
        />
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {editPhotoFileId ? (
              <img
                src={withFileAccessToken(`/files/${editPhotoFileId}/thumbnail?w=80`)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className={uiTypography.helper}>No photo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowPicker(true)}>
              Choose image
            </AppButton>
            {editPhotoFileId && (
              <AppButton type="button" variant="ghost" size="sm" onClick={() => setEditPhotoFileId(null)}>
                Remove photo
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : tab === 'members' ? (
    <div className={uiSpacing.sectionStack}>
      {detailLoading && <p className={uiTypography.helper}>Loading members…</p>}
      <AppInput
        type="search"
        label="Search employees"
        value={memberSearch}
        onChange={(e) => setMemberSearch(e.target.value)}
        placeholder="Search employees…"
        aria-label="Search employees"
        fieldHint={communityGroupFieldHints.memberSearch}
      />
      <AppControlLabelRow
        label="Members"
        fieldHint={<AppFieldHint hint={communityGroupFieldHints.members} />}
      />
      <div className={uiCx(uiLayout.actionsRow, 'justify-between text-xs')}>
        <AppButton type="button" variant="ghost" size="sm" onClick={selectAllFiltered}>
          {allFilteredSelected ? 'Clear filtered selection' : 'Select all in filter'}
        </AppButton>
        <span className={uiTypography.helper}>{selectedMembers.length} selected</span>
      </div>
      <div className={uiCx(uiRadius.control, uiBorders.subtle, 'max-h-[min(42vh,22rem)] divide-y divide-gray-100 overflow-y-auto')}>
        {filteredEmployees.length === 0 ? (
          <div className={uiCx(uiSpacing.cardPadding, 'text-center text-sm text-gray-500')}>No employees match.</div>
        ) : (
          filteredEmployees.map((employee) => {
            const id = String(employee.id);
            const checked = selectedMembers.includes(id);
            return (
              <label
                key={id}
                className="group flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50/80"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {employee.profile_photo_file_id ? (
                    <img
                      src={withFileAccessToken(`/files/${employee.profile_photo_file_id}/thumbnail?w=40`)}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-600">
                      {(employee.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="truncate text-sm font-medium text-gray-900">{employee.name}</span>
                </div>
                <AppCheckboxControl
                  checked={checked}
                  onChange={() => toggleMember(id)}
                  aria-label={`Select ${employee.name || 'employee'}`}
                />
              </label>
            );
          })
        )}
      </div>
    </div>
  ) : (
    <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, uiSpacing.cardPadding, uiSpacing.sectionStack, 'border-red-200 bg-red-50/50')}>
      <AppControlLabelRow
        label="Delete this group"
        fieldHint={<AppFieldHint hint={communityGroupFieldHints.deleteGroup} />}
      />
      <p className="text-xs leading-relaxed text-red-800">
        Removes the group and member assignments. Announcements already sent are unaffected.
      </p>
      <AppButton type="button" variant="danger" size="sm" onClick={() => void handleDeleteGroup()}>
        Delete group
      </AppButton>
    </div>
  );

  return (
    <>
      <AppFormModal
        open={open && !!group}
        onClose={() => {
          if (isPending) return;
          onClose();
        }}
        formWidth="comfortable"
        title={group?.name ?? 'Group'}
        description={readOnlySubtitle}
        quickInfo={manageCommunityGroupQuickInfo(quickInfoTab)}
        headerExtra={
          isOwner ? (
            <AppTabs tabs={MANAGE_TABS} value={tab} onChange={(key) => setTab(key as ManageGroupTab)} />
          ) : undefined
        }
        footer={footer}
      >
        {body}
      </AppFormModal>
      <ImagePicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onConfirm={handleAvatarConfirm}
        targetWidth={256}
        targetHeight={256}
        allowEdit={true}
      />
    </>
  );
}
