import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { AnnouncementManagerCard } from '@/components/community/AnnouncementManagerCard';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  AppInput,
  AppQuickFilterRow,
  AppSectionHeader,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'published' | 'cancelled';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

function AnnouncementListSkeleton() {
  return (
    <div className={uiSpacing.sectionStack} aria-busy="true" aria-label="Loading announcements">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="w-1 shrink-0 bg-gray-200" />
          <div className="flex-1 space-y-3 p-4 pl-3">
            <div className="h-4 max-w-md rounded bg-gray-100 w-3/4" />
            <div className="flex gap-2">
              <div className="h-5 w-16 rounded-md bg-gray-100" />
              <div className="h-5 w-14 rounded-md bg-gray-100" />
            </div>
            <div className="h-3 max-w-lg rounded bg-gray-100 w-full" />
            <div className="h-3 max-w-sm rounded bg-gray-100 w-2/3" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 w-14 rounded-lg bg-gray-100" />
              <div className="h-8 w-14 rounded-lg bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  posts: any[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

export function MyAnnouncementsPanel({ posts, isPending, isError, error, refetch }: Props) {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      const st = (p.status || 'published') as string;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (q && !String(p.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, statusFilter, search]);

  const filterSegments = useMemo(
    () =>
      STATUS_FILTERS.map(({ value, label }) => ({
        key: value,
        label,
        active: statusFilter === value,
        onClick: () => setStatusFilter(value),
      })),
    [statusFilter],
  );

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="My announcements"
        description="Status, scheduling, read confirmations, and actions."
        action={
          <div className={uiCx(uiLayout.actionsRow, 'items-center gap-2')}>
            {!isPending && !isError ? (
              <AppBadge variant="neutral">
                {posts.length} {posts.length === 1 ? 'post' : 'posts'}
              </AppBadge>
            ) : null}
            <AppButton type="button" size="sm" onClick={() => navigate('/community/new-post')}>
              New announcement
            </AppButton>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <AppQuickFilterRow segments={filterSegments} label="Status:" className="mt-0 border-0 pt-0" />
        <AppInput
          type="search"
          label="Search by title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title…"
          className="w-full sm:max-w-xs"
        />
      </div>

      {isError && (
        <div
          className={uiCx(
            'flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/90 p-4 sm:flex-row sm:items-center sm:justify-between',
          )}
        >
          <p className={uiCx(uiTypography.helper, 'text-red-800')}>
            {error instanceof Error ? error.message : 'Could not load your announcements.'}
          </p>
          <AppButton type="button" variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </AppButton>
        </div>
      )}

      {isPending && <AnnouncementListSkeleton />}

      {!isPending && !isError && posts.length === 0 && (
        <AppEmptyState
          icon={<Megaphone className="h-12 w-12 text-gray-300" aria-hidden />}
          title="No announcements yet"
          description="Create an announcement to reach your teams and track confirmations here."
          action={
            <AppButton type="button" variant="secondary" size="sm" onClick={() => navigate('/community/new-post')}>
              Create your first announcement
            </AppButton>
          }
        />
      )}

      {!isPending && !isError && posts.length > 0 && filtered.length === 0 && (
        <AppEmptyState
          title="No announcements match your filters"
          description="Try a different status or search term."
          action={
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setSearch('');
              }}
            >
              Clear filters
            </AppButton>
          }
          className="border border-gray-200 bg-gray-50"
        />
      )}

      {!isPending && !isError && filtered.length > 0 && (
        <ul className={uiCx(uiSpacing.sectionStack, 'm-0 list-none p-0')}>
          {filtered.map((post: any) => (
            <li key={post.id}>
              <AnnouncementManagerCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
