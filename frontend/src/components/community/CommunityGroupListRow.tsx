import { withFileAccessToken } from '@/lib/api';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';

type Props = {
  group: CommunityGroupSummary;
  onOpen: (initialTab?: ManageGroupTab) => void;
};

export function CommunityGroupListRow({ group, onOpen }: Props) {
  const members = group.member_count ?? 0;
  const canEdit = !!group.is_owner;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50/90 transition-colors border-b border-gray-100 last:border-b-0">
      <div className="h-10 w-10 shrink-0 rounded-lg bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
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
        <div className="font-semibold text-gray-900 text-sm truncate">{group.name}</div>
        {group.description && <div className="text-xs text-gray-500 truncate mt-0.5">{group.description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-gray-600 tabular-nums">
        <span className="hidden sm:inline font-medium">
          {members} member{members === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex gap-2 shrink-0 ml-auto">
        <button
          type="button"
          onClick={() => onOpen(canEdit ? 'details' : undefined)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
        >
          {canEdit ? 'Manage' : 'View'}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpen('members')}
            className="rounded-lg border border-brand-red/35 bg-white px-3 py-1.5 text-xs font-semibold text-brand-red hover:bg-red-50"
          >
            Members
          </button>
        )}
      </div>
    </div>
  );
}
