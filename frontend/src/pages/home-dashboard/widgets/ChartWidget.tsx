import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  getValue,
  getCount,
  getProfit,
  formatCurrency,
  greenPalette,
  coolPalette,
  createPieSlice,
  calculateDateRange,
  getPeriodDisplay,
  type StatusValueData,
  type DateFilterType,
} from './chartShared';

type DashboardStats = {
  opportunities_by_status?: Record<string, number | StatusValueData>;
  projects_by_status?: Record<string, number | StatusValueData>;
};

type DivisionStatsRow = {
  id: string;
  label: string;
  opportunities_count: number;
  projects_count: number;
  opportunities_value: number;
  projects_value: number;
  opportunities_profit?: number;
  projects_profit?: number;
};

/** Unified entry for both status and division charts (same colors and layout as /business). */
type ChartEntry = { label: string; value: number; profit?: number };

type ChartMetric =
  | 'opportunities_by_status'
  | 'projects_by_status'
  | 'opportunities_by_division'
  | 'projects_by_division';

type ChartWidgetProps = {
  config?: {
    chartType?: 'bar' | 'pie' | 'donut' | 'line';
    metric?: ChartMetric;
    period?: DateFilterType;
    customStart?: string;
    customEnd?: string;
    division_id?: string;
    mode?: 'quantity' | 'value';
  };
};

function useChartData(
  metric: ChartMetric,
  mode: 'quantity' | 'value',
  divisionId: string | undefined,
  date_from: string | undefined,
  date_to: string | undefined
): { entries: ChartEntry[]; isLoading: boolean; error: unknown } {
  const isByDivision =
    metric === 'opportunities_by_division' || metric === 'projects_by_division';

  const dashboardQuery = useQuery<DashboardStats>({
    queryKey: ['home-chart-dashboard', metric, divisionId, mode, date_from, date_to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (divisionId) params.set('division_id', divisionId);
      if (date_from) params.set('date_from', date_from);
      if (date_to) params.set('date_to', date_to);
      params.set('mode', mode);
      return api('GET', `/projects/business/dashboard?${params.toString()}`);
    },
    staleTime: 60_000,
    enabled: !isByDivision,
  });

  const divisionsQuery = useQuery<DivisionStatsRow[]>({
    queryKey: ['home-chart-divisions', metric, divisionId, mode, date_from, date_to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (divisionId) params.set('division_id', divisionId);
      if (date_from) params.set('date_from', date_from);
      if (date_to) params.set('date_to', date_to);
      params.set('mode', mode);
      const url = `/projects/business/divisions-stats${params.toString() ? '?' + params.toString() : ''}`;
      return api('GET', url);
    },
    staleTime: 60_000,
    enabled: isByDivision,
  });

  if (isByDivision) {
    if (divisionsQuery.isLoading) return { entries: [], isLoading: true, error: null };
    if (divisionsQuery.error) return { entries: [], isLoading: false, error: divisionsQuery.error };
    const rows = Array.isArray(divisionsQuery.data) ? divisionsQuery.data : [];
    const isOpp = metric === 'opportunities_by_division';
    const entries: ChartEntry[] = rows
      .map((d) => ({
        label: d.label,
        value: mode === 'value' ? (isOpp ? d.opportunities_value : d.projects_value) : isOpp ? d.opportunities_count : d.projects_count,
        profit: mode === 'value' ? (isOpp ? d.opportunities_profit : d.projects_profit) : undefined,
      }))
      .filter((e) => e.value > 0);
    entries.sort((a, b) => b.value - a.value);
    return { entries, isLoading: false, error: null };
  }

  if (dashboardQuery.isLoading) return { entries: [], isLoading: true, error: null };
  if (dashboardQuery.error) return { entries: [], isLoading: false, error: dashboardQuery.error };
  const raw =
    metric === 'opportunities_by_status'
      ? dashboardQuery.data?.opportunities_by_status
      : dashboardQuery.data?.projects_by_status;
  const statusEntries = raw
    ? Object.entries(raw).filter(([, d]) => (mode === 'value' ? getValue(d) > 0 : getCount(d) > 0))
    : [];
  const sorted =
    mode === 'value'
      ? [...statusEntries].sort(([, a], [, b]) => getValue(b) - getValue(a))
      : [...statusEntries].sort(([, a], [, b]) => getCount(b) - getCount(a));
  const entries: ChartEntry[] = sorted.map(([label, d]) => ({
    label,
    value: mode === 'value' ? getValue(d) : getCount(d),
    profit: mode === 'value' ? getProfit(d) : undefined,
  }));
  return { entries, isLoading: false, error: null };
}

type TimeseriesResponse = { months: string[]; series: { label: string; values: number[] }[] };

function useChartTimeseries(
  metric: ChartMetric,
  mode: 'quantity' | 'value',
  divisionId: string | undefined,
  date_from: string | undefined,
  date_to: string | undefined,
  enabled: boolean
): { data: TimeseriesResponse | null; isLoading: boolean; error: unknown } {
  const query = useQuery<TimeseriesResponse>({
    queryKey: ['home-chart-timeseries', metric, mode, divisionId, date_from, date_to],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('metric', metric);
      params.set('mode', mode);
      if (divisionId) params.set('division_id', divisionId);
      if (date_from) params.set('date_from', date_from);
      if (date_to) params.set('date_to', date_to);
      return api('GET', `/projects/business/dashboard-timeseries?${params.toString()}`);
    },
    staleTime: 60_000,
    enabled,
  });
  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function ChartWidget({ config }: ChartWidgetProps) {
  const metric = (config?.metric ?? 'opportunities_by_status') as ChartMetric;
  const rawChartType = config?.chartType ?? 'bar';
  const chartType = rawChartType === 'donut' ? 'pie' : rawChartType;
  const isDonut = rawChartType === 'donut';
  const mode = config?.mode ?? 'quantity';
  const divisionId = config?.division_id;
  const period = (config?.period as DateFilterType) ?? 'all';
  const { date_from, date_to } = calculateDateRange(period, config?.customStart ?? '', config?.customEnd ?? '');

  const isLineChart = rawChartType === 'line';
  const timeseries = useChartTimeseries(metric, mode, divisionId, date_from, date_to, isLineChart);
  const { entries: rawEntries, isLoading, error } = useChartData(
    metric,
    mode,
    divisionId,
    date_from,
    date_to
  );

  const isOpportunities =
    metric === 'opportunities_by_status' || metric === 'opportunities_by_division';
  const colors = isOpportunities ? greenPalette : coolPalette;
  const barGradient = isOpportunities
    ? 'from-[#14532d] to-[#22c55e]'
    : 'from-[#0b1739] to-[#1d4ed8]';
  const lineStroke = isOpportunities ? '#14532d' : '#1d4ed8';

  const sorted = rawEntries;
  const totalValue = sorted.reduce((s, e) => s + e.value, 0);
  const totalForPct = totalValue;
  const maxVal = Math.max(...sorted.map((e) => e.value), 1);

  const periodDisplay = getPeriodDisplay(
    period,
    config?.customStart ?? '',
    config?.customEnd ?? ''
  );
  const modeLabel = mode === 'value' ? 'Value' : 'Count';
  const chartSubtitle = `${periodDisplay} · ${modeLabel}`;

  const Subtitle = () => (
    <p className="text-[10px] text-gray-500 shrink-0 mb-1" aria-hidden>{chartSubtitle}</p>
  );

  if (isLoading) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-gray-400">Loading…</div></div>;
  if (error) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-red-500">Failed to load</div></div>;
  if (sorted.length === 0) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-gray-500">No data</div></div>;

  if (chartType === 'line') {
    // X-axis = months, Y-axis = value, one line per status/division (from timeseries API)
    if (timeseries.isLoading) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-gray-400">Loading…</div></div>;
    if (timeseries.error) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-red-500">Failed to load</div></div>;
    const ts = timeseries.data;
    if (!ts || !ts.months.length || !ts.series.length) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-gray-500">No data</div></div>;

    const months = ts.months;
    const series = ts.series.filter((s) => s.values.some((v) => v > 0));
    if (!series.length) return <div className="text-sm text-gray-500">No data</div>;

    const allVals = series.flatMap((s) => s.values);
    const maxY = Math.max(...allVals, 1);
    const pad = { left: 20, right: 20, top: 6, bottom: 18 };
    const w = 260;
    const h = 90;
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const n = months.length;
    const x = (i: number) => pad.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
    const y = (v: number) => pad.top + plotH - (v / maxY) * plotH;

    const paths = series.map((s, idx) => {
      const pts = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`);
      return (
        <path
          key={s.label}
          d={pts.join(' ')}
          fill="none"
          stroke={colors[idx % colors.length]}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });

    const monthLabels = months.map((m) => {
      const [yy, mm] = m.split('-');
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mm, 10) - 1]} ${yy?.slice(2) ?? ''}`;
    });
    // Show at most 8 month labels to avoid overlap when there are many months
    const maxLabels = 8;
    const labelStep = n > maxLabels ? Math.max(1, Math.floor(n / maxLabels)) : 1;
    const labelsToShow = new Set(
      n <= maxLabels
        ? Array.from({ length: n }, (_, i) => i)
        : Array.from({ length: maxLabels }, (_, j) => Math.min(j * labelStep, n - 1))
    );

    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <Subtitle />
        <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-full min-h-[80px]"
            preserveAspectRatio="xMidYMid meet"
          >
            {paths}
            <g className="fill-gray-500" style={{ fontFamily: 'sans-serif', fontSize: 7 }}>
              {months.map((_, i) =>
                labelsToShow.has(i) ? (
                  <text key={i} x={x(i)} y={h - 4} textAnchor="middle">
                    {monthLabels[i]}
                  </text>
                ) : null
              )}
            </g>
          </svg>
        </div>
        <ul className="flex flex-col gap-1 shrink-0 text-[10px] overflow-y-auto py-0.5 border-l border-gray-200 pl-3 min-w-0 max-w-[45%]">
          {series.map((s, i) => (
            <li key={s.label} className="flex items-center gap-1.5 shrink-0">
              <span
                className="w-2.5 h-0.5 rounded shrink-0"
                style={{ backgroundColor: colors[i % colors.length] }}
              />
              <span className="text-gray-600 truncate">{s.label}</span>
            </li>
          ))}
        </ul>
        </div>
      </div>
    );
  }

  if (chartType === 'pie') {
    const total = totalValue;
    const slicesForChart = sorted.filter((e) => e.value > 0);
    let currentAngle = 0;
    const radius = 40;
    const rInner = isDonut ? 24 : 0;
    const centerX = 50;
    const centerY = 50;

    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <Subtitle />
        <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full max-w-full max-h-full min-h-[80px]"
            preserveAspectRatio="xMidYMid meet"
          >
            {slicesForChart.map((e, i) => {
              const angle = (e.value / total) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + angle;
              currentAngle = endAngle;
              return (
                <path
                  key={e.label}
                  d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                  fill={colors[i % colors.length]}
                />
              );
            })}
            {isDonut && <circle cx={centerX} cy={centerY} r={rInner} fill="white" />}
          </svg>
        </div>
        <div className="space-y-1 text-xs shrink-0 overflow-y-auto py-0.5 border-l border-gray-200 pl-3 min-w-0 max-w-[45%]">
          {sorted.slice(0, 10).map((e, i) => {
            const pct = totalForPct > 0 ? (e.value / totalForPct) * 100 : 0;
            const dotColor = colors[i % colors.length];
            return (
              <div key={e.label} className={mode === 'value' && e.profit != null ? 'space-y-0.5' : ''}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                  <span className="text-gray-700 truncate flex-1 min-w-0">{e.label}</span>
                  <span className="text-gray-900 font-semibold tabular-nums text-right shrink-0">
                    {mode === 'value' ? formatCurrency(e.value) : e.value} ({pct.toFixed(0)}%)
                  </span>
                </div>
                {mode === 'value' && e.profit != null && e.value > 0 && (
                  <div className="flex items-center gap-2 pl-4">
                    <span className="flex-1 min-w-0" />
                    <span className="text-gray-600 text-[11px] tabular-nums">
                      Profit: {formatCurrency(e.profit)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    );
  }

  // Bar chart (same layout and colors as Business Dashboard) — responsive to card size
  const displayEntries = sorted.slice(0, 10);
  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      <Subtitle />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {displayEntries.map((e) => {
          const barPercentage = (e.value / maxVal) * 100;
          const percentage = totalForPct > 0 ? (e.value / totalForPct) * 100 : 0;
          const profitMargin =
            mode === 'value' && e.profit != null && e.value > 0 ? (e.profit / e.value) * 100 : 0;

          if (mode === 'value') {
            return (
              <div key={e.label} className="space-y-1 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-500 truncate w-20 sm:w-28 shrink-0">{e.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                    <div
                      className={`bg-gradient-to-r ${barGradient} rounded-full h-3 transition-all duration-300 absolute inset-0`}
                      style={{ width: `${barPercentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap shrink-0 tabular-nums">
                    {formatCurrency(e.value)} ({percentage.toFixed(0)}%)
                  </span>
                </div>
                {(e.profit != null || profitMargin > 0) && (
                  <div className="flex items-center gap-2 pl-[5.5rem] sm:pl-28">
                    <span className="flex-1 min-w-0" />
                    <span className="text-xs text-gray-600 whitespace-nowrap tabular-nums shrink-0">
                      Profit: {formatCurrency(e.profit ?? 0)} ({profitMargin.toFixed(0)}%)
                    </span>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={e.label} className="flex items-center gap-2 min-w-0 shrink-0">
              <span className="text-xs text-gray-500 truncate w-20 sm:w-28 shrink-0">{e.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative">
                <div
                  className={`bg-gradient-to-r ${barGradient} rounded-full h-3 transition-all duration-300`}
                  style={{ width: `${barPercentage}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-900 whitespace-nowrap shrink-0 tabular-nums">
                {e.value} ({percentage.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
