import { useMemo, useState } from 'react';
import { HorizontalBar, PRIORITY_COLORS } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import {
  type EngagementBucket,
  PRIORITY_ORDER,
  formatPriorityLabel,
} from './insightsTypes';

type Mode = 'posts' | 'views' | 'engagement';

const MODES: Array<{ id: Mode; label: string }> = [
  { id: 'posts', label: 'Posts' },
  { id: 'views', label: 'Views' },
  { id: 'engagement', label: 'Engagement' },
];

function bucketValue(b: EngagementBucket, mode: Mode): number {
  if (mode === 'posts') return b.posts;
  if (mode === 'views') return b.views;
  return b.likes + b.comments;
}

export function InsightsEngagementByPriority({
  byPriority,
}: {
  byPriority: Record<string, EngagementBucket>;
}) {
  const [mode, setMode] = useState<Mode>('posts');

  const rows = useMemo(() => {
    return PRIORITY_ORDER.map((p) => {
      const bucket = byPriority[p] ?? { posts: 0, views: 0, likes: 0, comments: 0, read_rate_pct: 0 };
      return { id: p, bucket, value: bucketValue(bucket, mode) };
    });
  }, [byPriority, mode]);

  const max = Math.max(0, ...rows.map((r) => r.value));
  const total = rows.reduce((acc, r) => acc + r.value, 0);

  return (
    <InsightsSection
      title="Engagement by priority"
      subtitle="Where the audience is putting their attention"
      actions={
        <div className="inline-flex items-center bg-gray-100 rounded-full p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={
                m.id === mode
                  ? 'px-3 py-1 rounded-full text-[11px] font-semibold bg-white text-gray-900 shadow-sm'
                  : 'px-3 py-1 rounded-full text-[11px] font-medium text-gray-600 hover:text-gray-900'
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {total === 0 ? (
        <InsightsEmptyState
          title="No published posts in this range"
          hint="Try a wider window or change the metric."
        />
      ) : (
        <ul className="space-y-4 min-w-0">
          {rows.map(({ id, bucket, value }) => {
            const pct = total > 0 ? (value / total) * 100 : 0;
            const color = PRIORITY_COLORS[id] ?? '#94a3b8';
            return (
              <li key={id} className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 justify-between mb-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-[1_1_120px]">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-xs font-medium text-gray-900 truncate">{formatPriorityLabel(id)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums shrink-0">
                    <span className="text-gray-700 font-medium">{value.toLocaleString()}</span>
                    <span className="text-[10px] text-gray-400">{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <HorizontalBar value={value} max={max} color={color} height={8} ariaLabel={`${id} ${value}`} />
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500 leading-snug">
                  <span>{bucket.posts} posts</span>
                  <span className="text-gray-300">·</span>
                  <span>{bucket.views} views</span>
                  <span className="text-gray-300">·</span>
                  <span>{bucket.likes + bucket.comments} engagement</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500">avg read {bucket.read_rate_pct.toFixed(0)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </InsightsSection>
  );
}
