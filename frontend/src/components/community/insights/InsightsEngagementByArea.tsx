import { useMemo, useState } from 'react';
import { Donut, AREA_COLORS, AREA_COLOR_ORDER, type DonutSlice } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import { type EngagementBucket, formatAreaLabel } from './insightsTypes';

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

export function InsightsEngagementByArea({
  byArea,
}: {
  byArea: Record<string, EngagementBucket>;
}) {
  const [mode, setMode] = useState<Mode>('views');

  const sortedAreas = useMemo(() => {
    const entries = Object.entries(byArea);
    const ordered: Array<[string, EngagementBucket]> = [];
    for (const key of AREA_COLOR_ORDER) {
      const found = entries.find(([k]) => k === key);
      if (found) ordered.push(found);
    }
    for (const e of entries) {
      if (!ordered.find(([k]) => k === e[0])) ordered.push(e);
    }
    return ordered.sort(([, a], [, b]) => bucketValue(b, mode) - bucketValue(a, mode));
  }, [byArea, mode]);

  const slices: DonutSlice[] = useMemo(
    () =>
      sortedAreas
        .map(([area, bucket]) => ({
          id: area,
          label: formatAreaLabel(area),
          value: bucketValue(bucket, mode),
          color: AREA_COLORS[area] ?? '#94a3b8',
        }))
        .filter((s) => s.value > 0),
    [sortedAreas, mode],
  );

  const total = slices.reduce((acc, s) => acc + s.value, 0);

  return (
    <InsightsSection
      title="Engagement by area"
      subtitle="How traffic and interactions are distributed across topics"
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
          title="No data for this view"
          hint="Try widening the date range or switching the metric."
        />
      ) : (
        <div className="flex flex-col lg:flex-row items-stretch gap-6 min-w-0 w-full">
          <div className="flex-shrink-0 flex items-center justify-center mx-auto lg:mx-0">
            <Donut
              slices={slices}
              size={180}
              thickness={32}
              centerLabel={total.toLocaleString()}
              centerSubLabel={mode}
              formatValue={(v, pct) => `${v.toLocaleString()} (${pct.toFixed(0)}%)`}
            />
          </div>
          <ul className="flex-1 min-w-0 w-full divide-y divide-gray-100">
            {sortedAreas.map(([area, bucket]) => {
              const value = bucketValue(bucket, mode);
              const pct = total > 0 ? (value / total) * 100 : 0;
              const color = AREA_COLORS[area] ?? '#94a3b8';
              const breakdownTitle = `${bucket.posts} posts · ${bucket.views} views · ${bucket.likes} likes · ${bucket.comments} comments`;
              return (
                <li key={area} className="py-3 min-w-0">
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-1"
                      style={{ background: color }}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-gray-900 [overflow-wrap:anywhere]">
                          {formatAreaLabel(area)}
                        </span>
                        <span className="text-xs font-semibold text-gray-900 tabular-nums shrink-0">
                          {value.toLocaleString()}{' '}
                          <span className="font-normal text-gray-500">({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <p
                        className="text-[11px] text-gray-500 tabular-nums leading-snug [overflow-wrap:anywhere]"
                        title={breakdownTitle}
                      >
                        {bucket.posts}p · {bucket.views}v · {bucket.likes}l · {bucket.comments}c
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </InsightsSection>
  );
}
