import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import OverlayPortal from '@/components/OverlayPortal';
import ImagePicker from '@/components/ImagePicker';
import {
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyModalOverlayBackdrop,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import type { CommunityGroupDetail, CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';
import { COMMUNITY_GROUP_DESCRIPTION_MAX_LEN } from '@/components/community/communityGroupTypes';

type EmployeeRow = { id: string; name?: string; profile_photo_file_id?: string };

const TAB_CLASS = (active: boolean) =>
  `px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
    active
      ? 'border-brand-red text-brand-red bg-white'
      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50/80'
  }`;

type Props = {
  open: boolean;
  onClose: () => void;
  group: CommunityGroupSummary | null;
  initialTab?: ManageGroupTab;
  employees: EmployeeRow[];
  currentUserId?: string | null;
};

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

  const footer =
    tab === 'details' ? (
      <>
        <button
          type="button"
          className={SAFETY_MODAL_BTN_CANCEL}
          onClick={onClose}
          disabled={saveDetailsMutation.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={SAFETY_MODAL_BTN_PRIMARY}
          disabled={!editName.trim() || saveDetailsMutation.isPending}
          onClick={() => saveDetailsMutation.mutate()}
        >
          {saveDetailsMutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </>
    ) : tab === 'members' ? (
      <>
        <button
          type="button"
          className={SAFETY_MODAL_BTN_CANCEL}
          onClick={onClose}
          disabled={saveMembersMutation.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className={SAFETY_MODAL_BTN_PRIMARY}
          disabled={saveMembersMutation.isPending || detailLoading}
          onClick={() => saveMembersMutation.mutate(saveMemberPayload())}
        >
          {saveMembersMutation.isPending ? 'Saving…' : 'Save members'}
        </button>
      </>
    ) : (
      <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={onClose}>
        Close
      </button>
    );

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

  if (!open || !group) return null;

  const isOwner = !!group.is_owner;

  const readOnlySubtitle = !isOwner
    ? 'You can view this group. Only the creator can edit settings or members.'
    : 'Update details and members.';

  const body = !isOwner ? (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3 text-sm shadow-sm">
      <p className="text-gray-600">
        <span className="font-semibold text-gray-900 tabular-nums">{group.member_count ?? 0}</span> members
      </p>
      {group.description ? (
        <p className="text-gray-800 leading-relaxed">{group.description}</p>
      ) : (
        <p className="text-gray-500 italic">No description.</p>
      )}
    </div>
  ) : (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col min-h-[280px] max-h-[calc(85vh-10rem)] shadow-sm">
      <div className="flex overflow-x-auto overflow-y-hidden border-b border-gray-200 bg-gray-50/90 shrink-0">
        <button type="button" className={TAB_CLASS(tab === 'details')} onClick={() => setTab('details')}>
          Details
        </button>
        <button type="button" className={TAB_CLASS(tab === 'members')} onClick={() => setTab('members')}>
          Members
        </button>
        <button type="button" className={TAB_CLASS(tab === 'danger')} onClick={() => setTab('danger')}>
          Danger zone
        </button>
      </div>
      <div className="p-4 overflow-y-auto flex-1 min-h-0">
        {tab === 'details' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="mg-name" className={SAFETY_MODAL_FIELD_LABEL}>
                Name<span className="text-red-500 normal-case ml-0.5">*</span>
              </label>
              <input
                id="mg-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red"
              />
            </div>
            <div>
              <label htmlFor="mg-desc" className={SAFETY_MODAL_FIELD_LABEL}>
                Description
              </label>
              <textarea
                id="mg-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value.slice(0, COMMUNITY_GROUP_DESCRIPTION_MAX_LEN))}
                rows={4}
                maxLength={COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red resize-y"
              />
              <div className="mt-1 text-[10px] text-gray-400 tabular-nums">
                {editDescription.length} / {COMMUNITY_GROUP_DESCRIPTION_MAX_LEN}
              </div>
            </div>
            <div>
              <span className={SAFETY_MODAL_FIELD_LABEL}>Photo</span>
              <div className="mt-2 flex items-center gap-4 flex-wrap">
                <div className="h-20 w-20 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                  {editPhotoFileId ? (
                    <img
                      src={withFileAccessToken(`/files/${editPhotoFileId}/thumbnail?w=80`)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-gray-400">No photo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                    onClick={() => setShowPicker(true)}
                  >
                    Choose image
                  </button>
                  {editPhotoFileId && (
                    <button
                      type="button"
                      className="text-xs font-medium text-gray-500 hover:text-gray-800"
                      onClick={() => setEditPhotoFileId(null)}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'members' && (
          <div className="space-y-3">
            {detailLoading && <p className="text-xs text-gray-500">Loading members…</p>}
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search employees…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red"
            />
            <div className="flex items-center justify-between text-xs">
              <button type="button" className="font-semibold text-brand-red hover:underline" onClick={selectAllFiltered}>
                {filteredEmployees.length > 0 &&
                filteredEmployees.every((e) => selectedMembers.includes(String(e.id)))
                  ? 'Clear filtered selection'
                  : 'Select all in filter'}
              </button>
              <span className="text-gray-500">{selectedMembers.length} selected</span>
            </div>
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[min(42vh,22rem)] overflow-y-auto">
              {filteredEmployees.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">No employees match.</div>
              ) : (
                filteredEmployees.map((employee) => {
                  const id = String(employee.id);
                  const checked = selectedMembers.includes(id);
                  const inputId = `manage-group-member-${id}`;
                  return (
                    <label
                      key={id}
                      htmlFor={inputId}
                      className="group flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-gray-50/80 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {employee.profile_photo_file_id ? (
                          <img
                            src={withFileAccessToken(`/files/${employee.profile_photo_file_id}/thumbnail?w=40`)}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 shrink-0">
                            {(employee.name || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-900 truncate">{employee.name}</span>
                      </div>
                      <input
                        id={inputId}
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        onChange={() => toggleMember(id)}
                      />
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 shadow-sm transition-all duration-200 ease-out outline-none ring-offset-2 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-red/40 group-hover:border-gray-400 ${
                          checked ? 'border-brand-red bg-brand-red shadow-md' : 'border-gray-300 bg-white'
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          className={`h-3 w-3 text-white transition duration-200 ease-out ${
                            checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                          }`}
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === 'danger' && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-red-900">Delete this group</h4>
            <p className="text-xs text-red-800 leading-relaxed">
              Removes the group and member assignments. Announcements already sent are unaffected.
            </p>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              onClick={() => void handleDeleteGroup()}
            >
              Delete group
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const effectiveFooter =
    !isOwner ? (
      <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={onClose}>
        Close
      </button>
    ) : tab === 'danger' ? (
      <button type="button" className={SAFETY_MODAL_BTN_CANCEL} onClick={onClose}>
        Close
      </button>
    ) : (
      footer
    );

  return (
    <>
      <OverlayPortal>
        <SafetyModalOverlayBackdrop
          onBackdropClick={
            !(saveDetailsMutation.isPending || saveMembersMutation.isPending) ? onClose : undefined
          }
        >
          <SafetyFormModalLayout
            widthClass="w-full max-w-xl"
            titleId="manage-community-group-title"
            title={group.name}
            subtitle={readOnlySubtitle}
            onClose={onClose}
            footer={effectiveFooter}
            innerCard={false}
            bodyClassName="overflow-y-auto flex-1 p-4 min-h-0"
          >
            {body}
          </SafetyFormModalLayout>
        </SafetyModalOverlayBackdrop>
      </OverlayPortal>
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
