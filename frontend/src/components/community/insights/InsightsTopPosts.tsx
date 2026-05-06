import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { withFileAccessTokenIfNeeded } from '@/lib/api';
import { AREA_COLORS, PRIORITY_COLORS, HorizontalBar } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import {
  type TopPost,
  formatAreaLabel,
  formatPriorityLabel,
  getInitials,
} from './insightsTypes';

type SortKey = 'engagement' | 'views' | 'likes' | 'comments' | 'read_rate';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'engagement', label: 'Most engaging' },
  { id: 'views', label: 'Most viewed' },
  { id: 'likes', label: 'Most liked' },
  { id: 'comments', label: 'Most commented' },
  { id: 'read_rate', label: 'Highest read %' },
];

function sortValue(p: TopPost, key: SortKey): number {
  if (key === 'views') return p.views;
  if (key === 'likes') return p.likes;
  if (key === 'comments') return p.comments;
  if (key === 'read_rate') return p.read_rate_pct;
  return p.likes + p.comments;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [url]);
  const src = url ? withFileAccessTokenIfNeeded(url) : '';
  if (!url || imgFailed) {
    return (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-[11px] font-semibold text-gray-700 flex-shrink-0">
        {getInitials(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-200"
      loading="lazy"
      onError={() => setImgFailed(true)}
    />
  );
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-gray-600 tabular-nums"
      title={label}
      aria-label={label}
    >
      <span className="text-gray-400" aria-hidden>
        {icon}
      </span>
      {value}
    </span>
  );
}

const eyeIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    <circle cx={12} cy={12} r={3} strokeWidth={2} />
  </svg>
);
const heartIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
  </svg>
);
const chatIcon = (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 21l1.84-5A8.97 8.97 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

export function InsightsTopPosts({ posts }: { posts: TopPost[] }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>('engagement');

  const sorted = useMemo(
    () => [...posts].sort((a, b) => sortValue(b, sort) - sortValue(a, sort)),
    [posts, sort],
  );

  return (
    <InsightsSection
      title="Top performing posts"
      subtitle="Ranked by the chosen metric across the selected window"
      actions={
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/40"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      }
      bodyClassName="p-0"
    >
      {sorted.length === 0 ? (
        <div className="p-4">
          <InsightsEmptyState
            title="No published posts in this range"
            hint="Posts published in the selected window will rank here."
          />
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sorted.map((p, idx) => {
            const areaColor = AREA_COLORS[p.related_area] ?? '#94a3b8';
            const priorityColor = PRIORITY_COLORS[p.priority] ?? '#64748b';
            return (
              <li key={p.post_id} className="px-4 py-3 hover:bg-gray-50 transition-colors min-w-0">
                <button
                  type="button"
                  onClick={() => navigate(`/community/posts/${p.post_id}/edit`)}
                  className="w-full min-w-0 text-left flex items-start gap-3"
                >
                  <div className="flex flex-col items-center pt-1 flex-shrink-0">
                    <span className="text-[11px] font-bold text-gray-400 tabular-nums">{idx + 1}</span>
                  </div>
                  <Avatar name={p.author_name} url={p.author_avatar_url} />
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 min-w-0 break-words">{p.title}</span>
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: `${areaColor}1f`, color: areaColor }}
                      >
                        {formatAreaLabel(p.related_area)}
                      </span>
                      {p.priority !== 'normal' ? (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: `${priorityColor}1f`, color: priorityColor }}
                        >
                          {formatPriorityLabel(p.priority)}
                        </span>
                      ) : null}
                      {p.requires_read_confirmation ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                          Required-read
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="shrink-0">{p.author_name ?? 'Unknown'}</span>
                      <span className="text-gray-300">·</span>
                      <span className="shrink-0">{formatRelativeDate(p.published_at)}</span>
                      <span className="text-gray-300">·</span>
                      <MiniStat icon={eyeIcon} value={p.views} label="views" />
                      <MiniStat icon={heartIcon} value={p.likes} label="likes" />
                      <MiniStat icon={chatIcon} value={p.comments} label="comments" />
                    </div>
                    <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 min-w-0">
                      <div className="flex-1 min-w-0">
                        <HorizontalBar
                          value={p.read_rate_pct}
                          max={100}
                          color={areaColor}
                          ariaLabel={`Read rate ${p.read_rate_pct}%`}
                        />
                      </div>
                      <span className="text-[11px] text-gray-600 tabular-nums shrink-0 sm:text-right">
                        {p.read_rate_pct.toFixed(0)}% of {p.audience}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </InsightsSection>
  );
}
