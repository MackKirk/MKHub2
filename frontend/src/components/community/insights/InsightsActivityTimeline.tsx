import { useMemo, useState } from 'react';
import { AreaLineChart, type ChartSeries } from './InsightsCharts';
import { InsightsSection } from './InsightsSection';
import type { InsightsDaily } from './insightsTypes';

type SeriesId = 'posts' | 'views' | 'engagement' | 'active';

const SERIES_DEFS: Array<{ id: SeriesId; label: string; color: string; filled?: boolean }> = [
  { id: 'views', label: 'Views', color: '#1d4ed8', filled: true },
  { id: 'engagement', label: 'Likes + Comments', color: '#d11616' },
  { id: 'posts', label: 'Posts published', color: '#0f766e' },
  { id: 'active', label: 'Active users', color: '#a16207' },
];

/**
 * Daily timeline of community activity. Lets the user toggle which series are
 * shown so they can isolate trends without crowding the chart.
 */
export function InsightsActivityTimeline({ daily }: { daily: InsightsDaily }) {
  const [enabled, setEnabled] = useState<Record<SeriesId, boolean>>({
    posts: true,
    views: true,
    engagement: true,
    active: false,
  });

  const dates = useMemo(() => daily.posts_published.map((p) => p.date), [daily.posts_published]);

  const series: ChartSeries[] = useMemo(() => {
    const engagementByDate = new Map<string, number>();
    for (const p of daily.likes) engagementByDate.set(p.date, (engagementByDate.get(p.date) ?? 0) + p.count);
    for (const p of daily.comments) engagementByDate.set(p.date, (engagementByDate.get(p.date) ?? 0) + p.count);
    const engagementSeries = Array.from(engagementByDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count }));

    const all: Record<SeriesId, ChartSeries> = {
      posts: { id: 'posts', label: 'Posts published', color: '#0f766e', data: daily.posts_published },
      views: { id: 'views', label: 'Views', color: '#1d4ed8', filled: true, data: daily.views },
      engagement: { id: 'engagement', label: 'Likes + Comments', color: '#d11616', data: engagementSeries },
      active: { id: 'active', label: 'Active users', color: '#a16207', data: daily.active_users },
    };
    return SERIES_DEFS.filter((s) => enabled[s.id]).map((s) => all[s.id]);
  }, [daily, enabled]);

  return (
    <InsightsSection
      title="Activity timeline"
      subtitle="Daily community activity across the selected window"
      actions={
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {SERIES_DEFS.map((s) => {
            const on = enabled[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setEnabled((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                className={
                  on
                    ? 'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-900 text-white transition-colors'
                    : 'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors'
                }
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: on ? s.color : '#d1d5db' }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div className="min-w-0 w-full">
        <AreaLineChart series={series} height={260} dates={dates} />
      </div>
    </InsightsSection>
  );
}
