import { HorizontalBar, InsightsEmptyState, InsightsSection } from '@/components/insights';
import type { FunnelMetrics, OverviewDisplayMode } from './customerOverviewTypes';
import { FUNNEL_COLORS, formatCurrency } from './customerOverviewUtils';

const STAGES: Array<{ key: keyof FunnelMetrics; label: string; color: string }> = [
  { key: 'prospecting', label: 'Prospecting', color: FUNNEL_COLORS.prospecting },
  { key: 'sent', label: 'Sent to customer', color: FUNNEL_COLORS.sent },
  { key: 'refused', label: 'Refused', color: FUNNEL_COLORS.refused },
  { key: 'converted', label: 'Converted (awarded)', color: FUNNEL_COLORS.converted },
];

export function CustomerOverviewPipelineFunnel({
  funnel,
  displayMode,
}: {
  funnel: FunnelMetrics;
  displayMode: OverviewDisplayMode;
}) {
  const values = STAGES.map((s) => funnel[s.key] as number);
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const hasActivity = total > 0;

  return (
    <InsightsSection title="Pipeline funnel" subtitle="Open pipeline plus sent, refused, and awarded conversions in period">
      {!hasActivity ? (
        <InsightsEmptyState title="No funnel activity" hint="Opportunities will appear as they move through stages." />
      ) : (
        <div className="space-y-3">
          {STAGES.map((stage) => {
            const value = funnel[stage.key] as number;
            const pctKey = `${stage.key}Pct` as keyof FunnelMetrics;
            const pct = funnel[pctKey] as number | null;
            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-600 font-medium">{stage.label}</span>
                  <span className="font-semibold text-gray-900 tabular-nums shrink-0">
                    {displayMode === 'value' ? formatCurrency(value) : value}
                    {pct != null ? <span className="text-gray-500 font-normal ml-1">({pct.toFixed(0)}%)</span> : null}
                  </span>
                </div>
                <HorizontalBar value={value} max={max} color={stage.color} height={10} ariaLabel={stage.label} />
              </div>
            );
          })}
        </div>
      )}
    </InsightsSection>
  );
}
