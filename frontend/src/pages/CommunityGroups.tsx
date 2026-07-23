import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Search, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { CreateCommunityGroupModal } from '@/components/community/CreateCommunityGroupModal';
import { ManageCommunityGroupModal } from '@/components/community/ManageCommunityGroupModal';
import { CommunityGroupCard } from '@/components/community/CommunityGroupCard';
import { CommunityGroupListRow } from '@/components/community/CommunityGroupListRow';
import { CommunityGroupsGridSkeleton, CommunityGroupsListSkeleton } from '@/components/community/CommunityGroupsGridSkeleton';
import type { CommunityGroupSummary, ManageGroupTab } from '@/components/community/communityGroupTypes';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';
import { useNavigateBack } from '@/hooks/useNavigateBack';

const VIEW_STORAGE_KEY = 'community-groups-view';

type SortKey = 'recent' | 'name' | 'members';
type ViewMode = 'cards' | 'list';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'members', label: 'Most members' },
];

function parseCreatedAt(iso?: string | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

export default function CommunityGroups() {
  const navigate = useNavigate();
  const navigateBackToCommunity = useNavigateBack('/community');

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

  const noSearchMatches = !groupsLoading && filteredSorted.length === 0 && search.trim().length > 0 && groups.length > 0;

  function openManage(g: CommunityGroupSummary, tab?: ManageGroupTab) {
    setManageGroup(g);
    setManageInitialTab(tab ?? 'details');
    setManageOpen(true);
  }

  const clearSearchAction = (
    <AppButton type="button" variant="ghost" size="sm" onClick={() => setSearch('')}>
      Clear search
    </AppButton>
  );

  return (
    <div className={uiCx(uiSpacing.pageStack, 'bg-gray-50')}>
      <AppPageHeader
        title="Groups"
        subtitle="Create and manage audience groups for community announcements."
        onBack={navigateBackToCommunity}
        backLabel="Back"
        icon={<UsersRound className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
          <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
            <AppButton
              type="button"
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !px-2.5"
              onClick={() => setViewMode('list')}
              title="List view"
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </AppButton>
            <AppButton
              type="button"
              variant={viewMode === 'cards' ? 'primary' : 'secondary'}
              size="sm"
              className="!rounded-none !border-l-0 !px-2.5"
              onClick={() => setViewMode('cards')}
              title="Card view"
              aria-label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </AppButton>
          </div>
          <div className="min-w-0 flex-1">
            <AppInput
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or description…"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search groups"
            />
          </div>
          <AppSelect
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            options={SORT_OPTIONS}
            aria-label="Sort groups"
            className="shrink-0"
          />
          {!groupsLoading && (
            <AppBadge variant="neutral" className="shrink-0 self-center">
              {groups.length} {groups.length === 1 ? 'group' : 'groups'}
            </AppBadge>
          )}
        </div>
      </AppCard>

      {groupsLoading ? (
        viewMode === 'cards' ? (
          <CommunityGroupsGridSkeleton />
        ) : (
          <CommunityGroupsListSkeleton />
        )
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AppListCreateItem
            label="Create group"
            layout="card"
            className="min-h-[200px]"
            onClick={() => setCreateOpen(true)}
          />
          {filteredSorted.map((g) => (
            <CommunityGroupCard key={g.id} group={g} onOpen={(tab) => openManage(g, tab)} />
          ))}
        </div>
      ) : (
        <AppCard bodyClassName="!p-0">
          <AppListCreateItem
            label="Create group"
            layout="row"
            className="min-h-[72px] w-full rounded-none border-0 border-b-2"
            onClick={() => setCreateOpen(true)}
          />
          {filteredSorted.map((g) => (
            <CommunityGroupListRow key={g.id} group={g} onOpen={(tab) => openManage(g, tab)} />
          ))}
        </AppCard>
      )}

      {noSearchMatches && (
        <AppEmptyState
          title="No groups match your search"
          description={search.trim() ? `No results for “${search.trim()}”.` : undefined}
          action={clearSearchAction}
        />
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
