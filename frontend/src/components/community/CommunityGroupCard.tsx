import { withFileAccessToken } from '@/lib/api';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';
import { AppBadge, AppButton, AppCard, uiLayout, uiTypography, uiCx } from '@/components/ui';

type Props = {
  group: CommunityGroupSummary;
  onOpen: (initialTab?: ManageGroupTab) => void;
};

export function CommunityGroupCard({ group, onOpen }: Props) {
  const members = group.member_count ?? 0;
  const canEdit = !!group.is_owner;

  return (
    <AppCard
      className="flex h-full flex-col transition-shadow hover:shadow-md"
      bodyClassName="flex flex-1 flex-col gap-3 !pb-3"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
          <AppButton type="button" variant="secondary" size="sm" className="flex-1" onClick={() => onOpen(canEdit ? 'details' : undefined)}>
            {canEdit ? 'Manage' : 'View'}
          </AppButton>
          {canEdit && (
            <AppButton type="button" variant="secondary" size="sm" className="text-brand-red" onClick={() => onOpen('members')}>
              Members
            </AppButton>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
          {group.photo_file_id ? (
            <img
              src={withFileAccessToken(`/files/${group.photo_file_id}/thumbnail?w=80`)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-lg font-bold text-gray-400">{(group.name || 'G').charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-gray-900">{group.name}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <AppBadge variant="neutral">
              {members} member{members === 1 ? '' : 's'}
            </AppBadge>
          </div>
        </div>
      </div>
      {group.description ? (
        <p className="line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-gray-600">{group.description}</p>
      ) : (
        <p className={uiCx(uiTypography.helper, 'italic')}>No description</p>
      )}
    </AppCard>
  );
}
