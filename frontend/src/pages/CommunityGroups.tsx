import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { CommunityPageHeader } from '@/components/community/CommunityPageHeader';
import { CreateCommunityGroupModal } from '@/components/community/CreateCommunityGroupModal';
import { ManageCommunityGroupModal } from '@/components/community/ManageCommunityGroupModal';
import { CommunityGroupCard } from '@/components/community/CommunityGroupCard';
import { CommunityGroupListRow } from '@/components/community/CommunityGroupListRow';
import { CommunityGroupsGridSkeleton, CommunityGroupsListSkeleton } from '@/components/community/CommunityGroupsGridSkeleton';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';

const VIEW_STORAGE_KEY = 'community-groups-view';

type SortKey = 'recent' | 'name' | 'members';
type ViewMode = 'cards' | 'list';

function parseCreatedAt(iso?: string | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

export default function CommunityGroups() {
  const navigate = useNavigate();

  const [viewMode, setViewModeState] = useState<ViewMode>('cards');
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'list' || stored === 'cards') setViewModeState(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');

  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageGroup, setManageGroup] = useState<CommunityGroupSummary | null>(null);
  const [manageInitialTab, setManageInitialTab] = useState<ManageGroupTab>('details');

  const { data: groupsRaw, isPending: groupsLoading } = useQuery({
    queryKey: ['community-groups'],
    queryFn: () => api<CommunityGroupSummary[]>('GET', '/community/groups').catch(() => []),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<Array<{ id: string; name?: string; profile_photo_file_id?: string }>>('GET', '/employees').catch(() => []),
  });

  const { data: me } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
    staleTime: 60_000,
  });

  const groups: CommunityGroupSummary[] = Array.isArray(groupsRaw) ? groupsRaw : [];
  const employees = Array.isArray(employeesData) ? employeesData : [];

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...groups];
    if (q) {
      rows = rows.filter((g) => {
        const n = String(g.name || '').toLowerCase();
        const d = String(g.description || '').toLowerCase();
        return n.includes(q) || d.includes(q);
      });
    }
    rows.sort((a, b) => {
      if (sortKey === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
      if (sortKey === 'members') return (b.member_count ?? 0) - (a.member_count ?? 0);
      return parseCreatedAt(b.created_at) - parseCreatedAt(a.created_at);
    });
    return rows;
  }, [groups, search, sortKey]);

  function openManage(g: CommunityGroupSummary, tab?: ManageGroupTab) {
    setManageGroup(g);
    setManageInitialTab(tab ?? 'details');
    setManageOpen(true);
  }

  /* Same control chrome as Opportunities (`/opportunities`): bordered pill, list icon first, cards icon second */
  const viewToggle = (
    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
      <button
        type="button"
        onClick={() => setViewMode('list')}
        className={`p-2.5 text-sm font-medium transition-colors duration-150 ${
          viewMode === 'list'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 bg-white'
        }`}
        title="List view"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setViewMode('cards')}
        className={`p-2.5 text-sm font-medium transition-colors duration-150 border-l border-gray-200 ${
          viewMode === 'cards'
            ? 'bg-gray-900 text-white'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 bg-white'
        }`}
        title="Card view"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      </button>
    </div>
  );

  const toolbarSecondary = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:justify-end">
      <select
        value={sortKey}
        onChange={(e) => setSortKey(e.target.value as SortKey)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shrink-0"
        aria-label="Sort groups"
      >
        <option value="recent">Most recent</option>
        <option value="name">Name A–Z</option>
        <option value="members">Most members</option>
      </select>
      {!groupsLoading && (
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full shrink-0">
          {groups.length} {groups.length === 1 ? 'group' : 'groups'}
        </span>
      )}
    </div>
  );

  const createDashedButton = (
    <button
      type="button"
      onClick={() => setCreateOpen(true)}
      className="border-2 border-dashed border-gray-300 rounded-xl p-3 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px] outline-none focus-visible:ring-2 focus-visible:ring-brand-red/30 focus-visible:ring-offset-2"
    >
      <div className="text-4xl text-gray-400 mb-2 leading-none">+</div>
      <div className="font-medium text-sm text-gray-700">Create group</div>
      <div className="text-xs text-gray-500 mt-1 max-w-[16rem]">Target announcements to the right audience.</div>
    </button>
  );

  return (
    <div className="space-y-4">
      <CommunityPageHeader
        title="Groups"
        subtitle="Create and manage audience groups for community announcements."
        onBack={() => navigate('/community')}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 flex-1 min-w-0">
            {viewToggle}
            <label className="block flex-1 min-w-0 sm:max-w-none">
              <span className="sr-only">Search groups</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or description…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
              />
            </label>
          </div>
          {toolbarSecondary}
        </div>
      </div>

      {groupsLoading ? (
        viewMode === 'cards' ? (
          <CommunityGroupsGridSkeleton />
        ) : (
          <CommunityGroupsListSkeleton />
        )
      ) : viewMode === 'cards' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {createDashedButton}
          {filteredSorted.map((g) => (
            <CommunityGroupCard key={g.id} group={g} onOpen={(tab) => openManage(g, tab)} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full border-b-2 border-dashed border-gray-300 p-4 hover:border-brand-red hover:bg-gray-50 transition-all flex items-center justify-center gap-3 min-h-[72px]"
          >
            <span className="text-xl text-gray-400">+</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-800">Create group</div>
              <div className="text-xs text-gray-500">Add an audience segment for announcements</div>
            </div>
          </button>
          {filteredSorted.map((g) => (
            <CommunityGroupListRow key={g.id} group={g} onOpen={(tab) => openManage(g, tab)} />
          ))}
          {filteredSorted.length === 0 && search.trim().length > 0 && groups.length > 0 && (
            <div className="px-6 py-12 text-center text-sm text-gray-500 border-t border-gray-50">
              No groups match your search.{' '}
              <button type="button" className="text-brand-red font-semibold hover:underline" onClick={() => setSearch('')}>
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {!groupsLoading && viewMode === 'cards' && filteredSorted.length === 0 && search.trim().length > 0 && groups.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          No groups match “{search.trim()}”.{' '}
          <button type="button" className="text-brand-red font-semibold hover:underline" onClick={() => setSearch('')}>
            Clear search
          </button>
        </div>
      )}

      <CreateCommunityGroupModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ManageCommunityGroupModal
        open={manageOpen}
        onClose={() => {
          setManageOpen(false);
          setManageGroup(null);
        }}
        group={manageGroup}
        initialTab={manageInitialTab}
        employees={employees}
        currentUserId={me?.id != null ? String(me.id) : null}
      />
    </div>
  );
}
