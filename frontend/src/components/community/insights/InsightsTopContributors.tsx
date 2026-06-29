import { useEffect, useMemo, useState } from 'react';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import { HorizontalBar } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import { type TopContributor, getInitials } from './insightsTypes';
import { AppSelect } from '@/components/ui';

type SortKey = 'posts' | 'views' | 'engagement';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'posts', label: 'Most posts' },
  { id: 'views', label: 'Most views' },
  { id: 'engagement', label: 'Most engagement' },
];

function sortValue(c: TopContributor, key: SortKey): number {
  if (key === 'views') return c.views_total;
  if (key === 'engagement') return c.engagement_score;
  return c.posts_count;
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [url]);
  const src = url ? withFileAccessTokenIfNeeded(url) : '';
  if (!url || imgFailed) {
    return (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-[11px] font-semibold text-gray-700 flex-shrink-0">
        {getInitials(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-gray-200"
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  );
}

export function InsightsTopContributors({ contributors }: { contributors: TopContributor[] }) {
  const [sort, setSort] = useState<SortKey>('posts');

  const sorted = useMemo(
    () => [...contributors].sort((a, b) => sortValue(b, sort) - sortValue(a, sort)),
    [contributors, sort],
  );

  const max = Math.max(1, ...sorted.map((c) => sortValue(c, sort)));

  return (
    <InsightsSection
      title="Top contributors"
      subtitle="Authors who published in this window, ranked by the chosen metric"
      actions={
        <AppSelect
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          options={SORTS.map((s) => ({ value: s.id, label: s.label }))}
          aria-label="Sort top contributors"
          className="min-w-[10rem]"
        />
      }
      bodyClassName="!p-0"
    >
      {sorted.length === 0 ? (
        <div className="p-4">
          <InsightsEmptyState
            title="No contributors in this range"
            hint="Authors who publish posts in the selected window will appear here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 min-w-0">
          {sorted.map((c, idx) => {
            const value = sortValue(c, sort);
            return (
              <li key={c.user_id} className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="w-5 text-[11px] font-bold text-gray-400 tabular-nums text-right shrink-0 pt-0.5">
                    {idx + 1}
                  </span>
                  <Avatar name={c.user_name} url={c.user_avatar_url} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 break-words">{c.user_name ?? 'Unknown'}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span>{c.posts_count} posts</span>
                      <span className="text-gray-300">·</span>
                      <span>{c.views_total} views</span>
                      <span className="text-gray-300">·</span>
                      <span>{c.engagement_score} engagement</span>
                    </div>
                    <div className="mt-2 min-w-0">
                      <HorizontalBar value={value} max={max} color="#1d4ed8" height={6} />
                    </div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 sm:self-center sm:min-w-[3rem] sm:text-right pl-8 sm:pl-0">
                  {value.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </InsightsSection>
  );
}
