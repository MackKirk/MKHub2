import { useState } from 'react';
import { AreaLineChart, InsightsEmptyState, InsightsSection } from '@/components/insights';
import type { OverviewDisplayMode } from './customerOverviewTypes';

type Series = {
  id: string;
  label: string;
  color: string;
  fill: string;
  data: { date: string; count: number }[];
};

export function CustomerOverviewTimeline({
  displayMode,
  timelineSeries,
  isLoading,
}: {
  displayMode: OverviewDisplayMode;
  timelineSeries: { dates: string[]; series: Series[] };
  isLoading: boolean;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    closed: true,
    pipeline: true,
    awarded: false,
  });

  const activeSeries = timelineSeries.series.filter((s) => visible[s.id] !== false);
  const hasData = activeSeries.some((s) => s.data.some((p) => p.count > 0));

  return (
    <InsightsSection
      title={displayMode === 'value' ? 'Revenue & pipeline over time' : 'Projects & opportunities over time'}
      subtitle="Toggle series to compare delivery vs pipeline"
    >
      {isLoading ? (
        <div className="h-[240px] bg-gray-50 rounded animate-pulse" />
      ) : !hasData ? (
        <InsightsEmptyState
          title={`No ${displayMode === 'value' ? 'financial' : 'activity'} data in this period`}
          hint="Try a wider date range or add projects and opportunities."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {timelineSeries.series.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setVisible((v) => ({ ...v, [s.id]: !v[s.id] }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  visible[s.id] !== false
                    ? 'border-gray-300 bg-white text-gray-900'
                    : 'border-gray-200 bg-gray-50 text-gray-400 line-through'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
          <AreaLineChart series={activeSeries} height={240} dates={timelineSeries.dates} />
        </>
      )}
    </InsightsSection>
  );
}
