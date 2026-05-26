import { InsightsKpiCard } from '@/components/insights';
import type { SparklinePoint } from '@/components/insights';
import { formatCurrency } from './customerOverviewUtils';
import type { KpiDeltas, OverviewDisplayMode, OverviewKpiModalKind } from './customerOverviewTypes';

type Kpis = {
  lifetimeRevenue: number;
  closed: { count: number; value: number };
  pipeline: { count: number; value: number };
  inProgress: { count: number; value: number };
  onHold: { count: number; value: number };
  winRatePct: number;
  avgPipelineAge: number;
};

const CELL =
  'h-full min-h-0 min-w-0 flex flex-col';

const CLICKABLE =
  'h-full w-full min-h-0 text-left rounded-xl transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40 flex flex-col items-stretch';

export function CustomerOverviewKpiStrip({
  kpis,
  kpiDeltas,
  displayMode,
  sparklineClosed,
  sparklinePipeline,
  onKpiClick,
}: {
  kpis: Kpis;
  kpiDeltas: KpiDeltas;
  displayMode: OverviewDisplayMode;
  sparklineClosed: SparklinePoint[];
  sparklinePipeline: SparklinePoint[];
  onKpiClick: (kind: OverviewKpiModalKind) => void;
}) {
  const cards = [
    {
      kind: 'closed' as const,
      label: 'Revenue delivered',
      value: displayMode === 'value' ? kpis.closed.value : kpis.closed.count,
      formatter: displayMode === 'value' ? (v: number) => formatCurrency(v) : undefined,
      sparkline: sparklineClosed,
      color: '#0b1739',
      fill: 'rgba(11, 23, 57, 0.12)',
      hint: displayMode === 'value' ? `${kpis.closed.count} finished in period` : formatCurrency(kpis.closed.value),
      deltaPct: kpiDeltas.closed,
      deltaTone: 'auto' as const,
      clickable: true,
    },
    {
      kind: 'pipeline' as const,
      label: 'Pipeline value',
      value: displayMode === 'value' ? kpis.pipeline.value : kpis.pipeline.count,
      formatter: displayMode === 'value' ? (v: number) => formatCurrency(v) : undefined,
      sparkline: sparklinePipeline,
      color: '#15803d',
      fill: 'rgba(21, 128, 61, 0.12)',
      hint: 'Open opportunities (prospecting + sent) — current snapshot',
      deltaPct: kpiDeltas.pipeline,
      deltaTone: 'auto' as const,
      clickable: true,
    },
    {
      kind: null,
      label: 'Win rate',
      value: kpis.winRatePct,
      unit: '%',
      sparkline: undefined,
      color: '#0284c7',
      fill: 'rgba(2, 132, 199, 0.12)',
      hint: 'Projects awarded in period ÷ (awarded + refused opportunities in period)',
      deltaPct: kpiDeltas.winRate,
      deltaTone: 'positive' as const,
      clickable: false,
    },
    {
      kind: 'inProgress' as const,
      label: 'Active WIP',
      value: displayMode === 'value' ? kpis.inProgress.value : kpis.inProgress.count,
      formatter: displayMode === 'value' ? (v: number) => formatCurrency(v) : undefined,
      sparkline: undefined,
      color: '#1d4ed8',
      fill: 'rgba(29, 78, 216, 0.12)',
      hint: `${kpis.inProgress.count} in progress — current snapshot`,
      deltaPct: kpiDeltas.wip,
      deltaTone: 'auto' as const,
      clickable: true,
    },
    {
      kind: null,
      label: 'Avg pipeline age',
      value: kpis.avgPipelineAge,
      unit: 'days',
      sparkline: undefined,
      color: '#a16207',
      fill: 'rgba(161, 98, 7, 0.12)',
      hint: 'Average age of open opportunities (days since created)',
      deltaPct: kpiDeltas.pipelineAge,
      deltaTone: 'negative' as const,
      clickable: false,
    },
  ];

  return (
    <div className="grid gap-4 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
      {cards.map((c) => {
        const showDelta = c.deltaPct !== null;
        const inner = (
          <InsightsKpiCard
            label={c.label}
            value={c.value}
            unit={c.unit}
            formatter={c.formatter}
            deltaPct={c.deltaPct}
            deltaTone={c.deltaTone}
            showDelta={showDelta}
            sparkline={c.sparkline}
            sparklineColor={c.color}
            sparklineFill={c.fill}
            hint={c.hint}
            className="flex-1"
          />
        );
        if (c.clickable && c.kind) {
          return (
            <div key={c.label} className={CELL}>
              <button type="button" className={CLICKABLE} onClick={() => onKpiClick(c.kind)}>
                {inner}
              </button>
            </div>
          );
        }
        return (
          <div key={c.label} className={CELL}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
