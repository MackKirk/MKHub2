import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnnouncementManagerCard } from '@/components/community/AnnouncementManagerCard';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'published' | 'cancelled';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];

function MegaphoneIcon() {
  return (
    <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
      />
    </svg>
  );
}

function AnnouncementListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading announcements">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
          <div className="w-1 shrink-0 bg-gray-200" />
          <div className="flex-1 p-4 pl-3 space-y-3">
            <div className="h-4 bg-gray-100 rounded w-3/4 max-w-md" />
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-gray-100 rounded-md" />
              <div className="h-5 w-14 bg-gray-100 rounded-md" />
            </div>
            <div className="h-3 bg-gray-100 rounded w-full max-w-lg" />
            <div className="h-3 bg-gray-100 rounded w-2/3 max-w-sm" />
            <div className="flex gap-2 pt-2">
              <div className="h-8 w-14 bg-gray-100 rounded-lg" />
              <div className="h-8 w-14 bg-gray-100 rounded-lg" />
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      const st = (p.status || 'published') as string;
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (q && !(String(p.title || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }, [posts, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">My announcements</h2>
            {!isPending && !isError && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                {posts.length} {posts.length === 1 ? 'post' : 'posts'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Status, scheduling, read confirmations, and actions.</p>
        </div>
        <Link
          to="/community/new-post"
          className="inline-flex items-center justify-center rounded-lg bg-brand-red px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors shrink-0"
        >
          New announcement
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 snap-x snap-mandatory" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className={`snap-start shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                statusFilter === value
                  ? 'border-brand-red bg-red-50 text-brand-red ring-1 ring-red-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block shrink-0 sm:max-w-xs w-full sm:w-auto">
          <span className="sr-only">Search by title</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-100 focus:border-brand-red"
          />
        </label>
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50/90 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-red-800">{error instanceof Error ? error.message : 'Could not load your announcements.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {isPending && <AnnouncementListSkeleton />}

      {!isPending && !isError && posts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
          <MegaphoneIcon />
          <p className="mt-4 text-sm font-medium text-gray-900">No announcements yet</p>
          <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">Create an announcement to reach your teams and track confirmations here.</p>
          <Link
            to="/community/new-post"
            className="mt-5 inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50"
          >
            Create your first announcement
          </Link>
        </div>
      )}

      {!isPending && !isError && posts.length > 0 && filtered.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          No announcements match your filters.{' '}
          <button type="button" className="text-brand-red font-medium hover:underline" onClick={() => { setStatusFilter('all'); setSearch(''); }}>
            Clear filters
          </button>
        </div>
      )}

      {!isPending && !isError && filtered.length > 0 && (
        <ul className="space-y-3 list-none p-0 m-0">
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
