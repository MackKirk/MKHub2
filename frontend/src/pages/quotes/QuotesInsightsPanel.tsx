import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  AppCard,
  AppEmptyState,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { formatQuoteCurrency } from '@/pages/quotesListUtils';
import {
  formatWinRate,
  QUOTE_LOST_REASON_LABELS,
  QUOTE_OUTCOME_LABELS,
  type QuoteLostReason,
  type QuoteOutcomeStatus,
} from '@/pages/quotesOutcome';
import {
  coolPalette,
  formatCompactCurrency,
  greenPalette,
  warmPalette,
} from '@/pages/home-dashboard/widgets/chartShared';
import LoadingOverlay from '@/components/LoadingOverlay';

export type QuotesInsights = {
  total_count: number;
  by_status: Record<
    QuoteOutcomeStatus,
    { count: number; value: number; label: string }
  >;
  win_rate: number | null;
  value_won: number;
  value_lost: number;
  by_estimator: Array<{
    estimator_id: string | null;
    name: string;
    pending: number;
    successful: number;
    not_successful: number;
    value_won: number;
    value_lost: number;
    win_rate: number | null;
  }>;
  by_lost_reason: Array<{ reason: string; count: number; value: number }>;
  monthly: Array<{
    month: string;
    pending: number;
    successful: number;
    not_successful: number;
    value_won: number;
    value_lost: number;
    win_rate: number | null;
  }>;
};

const OUTCOME_COLORS: Record<QuoteOutcomeStatus, string> = {
  pending: coolPalette[3],
  successful: greenPalette[3],
  not_successful: warmPalette[3],
};

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <div className={uiTypography.helper}>{label}</div>
      <div className="mt-0.5 truncate text-lg font-semibold text-gray-900">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-gray-500">{hint}</div> : null}
    </div>
  );
}

function SimpleDonut({
  slices,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-gray-500">No data</div>;
  }
  const r = 42;
  const cx = 60;
  const cy = 60;
  const stroke = 16;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0">
        {slices.map((slice) => {
          if (slice.value <= 0) return null;
          const len = (slice.value / total) * c;
          const el = (
            <circle
              key={slice.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += len;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-gray-900 text-[14px] font-semibold">
          {total}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-500 text-[9px]">
          quotes
        </text>
      </svg>
      <ul className="min-w-0 space-y-1.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-gray-700">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="font-semibold">{s.value}</span>
            <span className="text-gray-400">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimpleBars({
  rows,
}: {
  rows: Array<{ label: string; value: number; color?: string }>;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) {
    return <div className="flex h-40 items-center justify-center text-sm text-gray-500">No data</div>;
  }
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => (
        <div key={row.label} className="min-w-0">
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-gray-700">{row.label}</span>
            <span className="shrink-0 font-semibold text-gray-900">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(4, (row.value / max) * 100)}%`,
                background: row.color || greenPalette[3],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function WinRateLine({
  months,
}: {
  months: QuotesInsights['monthly'];
}) {
  const points = months.filter((m) => m.win_rate != null);
  if (points.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-gray-500">
        Need more decided outcomes for a trend
      </div>
    );
  }
  const w = 280;
  const h = 120;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const n = points.length;
  const x = (i: number) => pad.l + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => pad.t + plotH - v * plotH;
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.win_rate ?? 0)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
      {[0, 0.5, 1].map((tick) => (
        <g key={tick}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(tick)}
            y2={y(tick)}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
          <text x={pad.l - 4} y={y(tick) + 3} textAnchor="end" className="fill-gray-400 text-[8px]">
            {Math.round(tick * 100)}%
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke={greenPalette[2]} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={p.month} cx={x(i)} cy={y(p.win_rate ?? 0)} r={3} fill={greenPalette[2]} />
      ))}
      {points.map((p, i) => {
        if (i !== 0 && i !== points.length - 1 && points.length > 4) return null;
        const [yy, mm] = p.month.split('-');
        const label = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(mm) - 1] ?? mm} ${yy?.slice(2) ?? ''}`;
        return (
          <text key={`lbl-${p.month}`} x={x(i)} y={h - 6} textAnchor="middle" className="fill-gray-500 text-[8px]">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export function QuotesInsightsPanel({ apiQs }: { apiQs: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['quotes-insights', apiQs],
    queryFn: () => api<QuotesInsights>('GET', `/quotes/insights${apiQs}`),
  });

  if (error) {
    return (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppEmptyState title="Failed to load insights." className="py-8" />
      </AppCard>
    );
  }

  const byStatus = data?.by_status;
  const donutSlices = (['pending', 'successful', 'not_successful'] as QuoteOutcomeStatus[]).map(
    (s) => ({
      label: QUOTE_OUTCOME_LABELS[s],
      value: byStatus?.[s]?.count ?? 0,
      color: OUTCOME_COLORS[s],
    }),
  );

  const estimatorRows =
    data?.by_estimator.map((e) => ({
      label: e.name,
      value: e.successful + e.not_successful + e.pending,
      color: greenPalette[3],
    })) ?? [];

  const lostRows =
    data?.by_lost_reason.map((r) => ({
      label: QUOTE_LOST_REASON_LABELS[r.reason as QuoteLostReason] || r.reason,
      value: r.count,
      color: warmPalette[3],
    })) ?? [];

  return (
    <LoadingOverlay isLoading={isLoading && !data} text="Loading insights...">
      <div className={uiCx(uiSpacing.pageStack)}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Open (pending)" value={String(byStatus?.pending?.count ?? 0)} />
          <KpiCard label="Successful" value={String(byStatus?.successful?.count ?? 0)} />
          <KpiCard label="Not successful" value={String(byStatus?.not_successful?.count ?? 0)} />
          <KpiCard label="Win rate" value={formatWinRate(data?.win_rate)} hint="Of decided quotes" />
          <KpiCard
            label="Value won"
            value={data ? formatCompactCurrency(data.value_won) : '—'}
            hint={data ? formatQuoteCurrency(data.value_won) : undefined}
          />
          <KpiCard
            label="Value lost"
            value={data ? formatCompactCurrency(data.value_lost) : '—'}
            hint={data ? formatQuoteCurrency(data.value_lost) : undefined}
          />
        </div>

        {!isLoading && (data?.total_count ?? 0) === 0 ? (
          <AppCard bodyClassName={uiSpacing.cardPadding}>
            <AppEmptyState
              title="No quotations match these filters."
              className="border-0 bg-transparent py-8 shadow-none"
            />
          </AppCard>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <h3 className={uiTypography.sectionTitle}>Outcome mix</h3>
              <p className={uiCx(uiTypography.helper, 'mb-3')}>Count by outcome status</p>
              <SimpleDonut slices={donutSlices} />
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <h3 className={uiTypography.sectionTitle}>Win rate over time</h3>
              <p className={uiCx(uiTypography.helper, 'mb-3')}>Monthly win rate of decided quotes</p>
              <WinRateLine months={data?.monthly ?? []} />
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <h3 className={uiTypography.sectionTitle}>By estimator</h3>
              <p className={uiCx(uiTypography.helper, 'mb-3')}>Quotations volume</p>
              <SimpleBars rows={estimatorRows} />
            </AppCard>

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <h3 className={uiTypography.sectionTitle}>Lost reasons</h3>
              <p className={uiCx(uiTypography.helper, 'mb-3')}>Not successful breakdown</p>
              <SimpleBars rows={lostRows} />
            </AppCard>
          </div>
        )}
      </div>
    </LoadingOverlay>
  );
}
