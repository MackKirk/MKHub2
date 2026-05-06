import { withFileAccessToken } from '@/lib/api';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';

function badge(text: string) {
  return (
    <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
      {text}
    </span>
  );
}

type Props = {
  group: CommunityGroupSummary;
  onOpen: (initialTab?: ManageGroupTab) => void;
};

export function CommunityGroupCard({ group, onOpen }: Props) {
  const members = group.member_count ?? 0;
  const canEdit = !!group.is_owner;

  return (
    <article className="flex flex-col rounded-xl border border-gray-200/80 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="p-4 flex gap-3 min-h-0">
        <div className="h-14 w-14 shrink-0 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center">
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
          <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2">{group.name}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {badge(`${members} member${members === 1 ? '' : 's'}`)}
          </div>
        </div>
      </div>
      {group.description ? (
        <p className="px-4 text-sm text-gray-600 line-clamp-2 leading-relaxed min-h-[2.5rem]">{group.description}</p>
      ) : (
        <p className="px-4 text-xs text-gray-400 italic">No description</p>
      )}
      <div className="mt-auto p-4 pt-3 border-t border-gray-100 flex gap-2">
        <button
          type="button"
          onClick={() => onOpen(canEdit ? 'details' : undefined)}
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
        >
          {canEdit ? 'Manage' : 'View'}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => onOpen('members')}
            className="rounded-lg border border-brand-red/40 bg-white px-3 py-2 text-sm font-semibold text-brand-red hover:bg-red-50 transition-colors whitespace-nowrap"
          >
            Members
          </button>
        )}
      </div>
    </article>
  );
}
