import { withFileAccessToken } from '@/lib/api';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';
import { AppBadge, AppButton, uiBorders, uiTypography, uiCx } from '@/components/ui';

type Props = {
  group: CommunityGroupSummary;
  onOpen: (initialTab?: ManageGroupTab) => void;
};

export function CommunityGroupListRow({ group, onOpen }: Props) {
  const members = group.member_count ?? 0;
  const canEdit = !!group.is_owner;

  return (
    <div
      className={uiCx(
        'flex flex-wrap items-center gap-3 bg-white px-4 py-3 transition-colors hover:bg-gray-50/90',
        uiBorders.subtle,
        'border-x-0 border-t-0 border-b last:border-b-0',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {group.photo_file_id ? (
          <img
            src={withFileAccessToken(`/files/${group.photo_file_id}/thumbnail?w=64`)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold text-gray-400">{(group.name || 'G').charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">{group.name}</div>
        {group.description && <div className={uiCx(uiTypography.helper, 'mt-0.5 truncate')}>{group.description}</div>}
      </div>
      <AppBadge variant="neutral" className="hidden shrink-0 sm:inline-flex tabular-nums">
        {members} member{members === 1 ? '' : 's'}
      </AppBadge>
      <div className="ml-auto flex shrink-0 gap-2">
        <AppButton type="button" variant="secondary" size="sm" onClick={() => onOpen(canEdit ? 'details' : undefined)}>
          {canEdit ? 'Manage' : 'View'}
        </AppButton>
        {canEdit && (
          <AppButton type="button" variant="secondary" size="sm" className="text-brand-red" onClick={() => onOpen('members')}>
            Members
          </AppButton>
        )}
      </div>
    </div>
  );
}
