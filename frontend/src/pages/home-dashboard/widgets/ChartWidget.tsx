import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { api } from '@/lib/api';
import {
  getValue,
  getCount,
  getProfit,
  formatCurrency,
  greenPalette,
  coolPalette,
  CHART_PALETTES,
  createPieSlice,
  polarToCartesian,
  calculateDateRange,
  getPeriodDisplay,
  type StatusValueData,
  type DateFilterType,
  type ChartPaletteId,
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
    palette?: ChartPaletteId;
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

  const isOpportunities = metric === 'opportunities_by_status' || metric === 'opportunities_by_division';
  const defaultPalette = isOpportunities ? 'green' : 'cool';
  const paletteId = (config?.palette ?? defaultPalette) as ChartPaletteId;
  const colors = CHART_PALETTES[paletteId] ?? greenPalette;
  const firstColor = colors[0];
  const lastColor = colors[Math.min(4, colors.length - 1)];
  const barGradientStyle = { background: `linear-gradient(to right, ${firstColor}, ${lastColor})` };
  const lineStroke = firstColor;

  const sorted = rawEntries;
  const totalValue = sorted.reduce((s, e) => s + e.value, 0);
  const totalForPct = totalValue;
  const maxVal = Math.max(...sorted.map((e) => e.value), 1);

  const [hoveredPieSlice, setHoveredPieSlice] = useState<ChartEntry | null>(null);
  const [pieTooltipPos, setPieTooltipPos] = useState({ x: 0, y: 0 });
  const [hoveredLinePoint, setHoveredLinePoint] = useState<{
    seriesLabel: string;
    month: string;
    value: number;
  } | null>(null);
  const [lineTooltipPos, setLineTooltipPos] = useState({ x: 0, y: 0 });
  const { ready } = useAnimationReady();
  const [barsMounted, setBarsMounted] = useState(false);
  const [pieSlicesMounted, setPieSlicesMounted] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setBarsMounted(true), 80);
    return () => clearTimeout(id);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => setPieSlicesMounted(true), 80);
    return () => clearTimeout(id);
  }, [ready]);

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

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-0 h-full">
        <Subtitle />
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-red-500">Failed to load</div></div>;
  if (sorted.length === 0) return <div className="flex flex-col min-h-0 h-full"><Subtitle /><div className="text-sm text-gray-500">No data</div></div>;

  if (chartType === 'line') {
    // X-axis = months, Y-axis = value, one line per status/division (from timeseries API)
    if (timeseries.isLoading) {
      return (
        <div className="flex flex-col min-h-0 h-full">
          <Subtitle />
          <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
            <div className="min-h-[120px]" />
          </LoadingOverlay>
        </div>
      );
    }
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
          style={{ transition: 'opacity 0.2s ease-out' }}
        />
      );
    });
    const areaPathFirst =
      series.length > 0
        ? (() => {
            const s = series[0];
            const pts = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`);
            const lastI = s.values.length - 1;
            const bottomY = pad.top + plotH;
            return `${pts.join(' ')} L ${x(lastI)} ${bottomY} L ${x(0)} ${bottomY} Z`;
          })()
        : null;

    const monthLabelsForTooltip = months.map((m) => {
      const [yy, mm] = m.split('-');
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mm, 10) - 1]} ${yy?.slice(2) ?? ''}`;
    });
    const handleLinePointEnter = (s: { label: string; values: number[] }, idx: number, ev: React.MouseEvent) => {
      setHoveredLinePoint({
        seriesLabel: s.label,
        month: monthLabelsForTooltip[idx] ?? months[idx] ?? '',
        value: s.values[idx] ?? 0,
      });
      setLineTooltipPos({ x: ev.clientX, y: ev.clientY });
    };
    const handleLinePointMove = (ev: React.MouseEvent) => {
      if (hoveredLinePoint) setLineTooltipPos({ x: ev.clientX, y: ev.clientY });
    };
    const handleLinePointLeave = () => setHoveredLinePoint(null);

    const monthLabels = monthLabelsForTooltip;
    // Show at most 8 month labels to avoid overlap when there are many months
    const maxLabels = 8;
    const labelStep = n > maxLabels ? Math.max(1, Math.floor(n / maxLabels)) : 1;
    const labelsToShow = new Set(
      n <= maxLabels
        ? Array.from({ length: n }, (_, i) => i)
        : Array.from({ length: maxLabels }, (_, j) => Math.min(j * labelStep, n - 1))
    );

    // Totals per series for legend (quantity/value + percentage)
    const seriesTotals = series.map((s) => s.values.reduce((a, v) => a + v, 0));
    const lineChartTotal = seriesTotals.reduce((a, v) => a + v, 0);

    const pointRadius = 3;
    const lineChartPoints = series.flatMap((s, seriesIdx) =>
      s.values.map((v, i) => ({ series: s, seriesIdx, i, x: x(i), y: y(v), value: v }))
    );

    return (
      <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full relative">
        <Subtitle />
        <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-full min-h-[80px]"
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleLinePointMove}
            onMouseLeave={handleLinePointLeave}
          >
            <defs>
              <linearGradient id="lineAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors[0]} stopOpacity={0.25} />
                <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            {areaPathFirst && (
              <path d={areaPathFirst} fill="url(#lineAreaGradient)" style={{ transition: 'opacity 0.3s ease-out' }} />
            )}
            {paths}
            {lineChartPoints.map((pt, k) => {
              const isHovered = hoveredLinePoint?.seriesLabel === pt.series.label && hoveredLinePoint?.month === monthLabels[pt.i];
              return (
                <g key={k}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={pointRadius}
                    fill={colors[pt.seriesIdx % colors.length]}
                    stroke="white"
                    strokeWidth={isHovered ? 1.5 : 1}
                    style={{ cursor: 'pointer', opacity: isHovered ? 1 : 0.85, transition: 'opacity 0.15s ease-out, stroke-width 0.15s ease-out' }}
                    pointerEvents="none"
                  />
                  {/* Invisible larger hit area for easier hover (must be on top) */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={8}
                    fill="black"
                    fillOpacity={0}
                    pointerEvents="all"
                    onMouseEnter={(ev) => handleLinePointEnter(pt.series, pt.i, ev)}
                    onMouseLeave={handleLinePointLeave}
                    onMouseMove={handleLinePointMove}
                  />
                </g>
              );
            })}
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
          {hoveredLinePoint &&
            createPortal(
              <div
                className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                style={{ left: lineTooltipPos.x + 10, top: lineTooltipPos.y + 10 }}
              >
                <div className="font-semibold">{hoveredLinePoint.seriesLabel}</div>
                <div className="text-gray-300">{hoveredLinePoint.month}</div>
                <div className="text-gray-300">
                  {mode === 'value' ? formatCurrency(hoveredLinePoint.value) : hoveredLinePoint.value}
                </div>
              </div>,
              document.body
            )}
        </div>
        <ul className="flex flex-col gap-1 shrink-0 text-[10px] overflow-y-auto py-0.5 border-l border-gray-200 pl-3 min-w-0 max-w-[45%]">
          {series.map((s, i) => {
            const total = seriesTotals[i] ?? 0;
            const pct = lineChartTotal > 0 ? (total / lineChartTotal) * 100 : 0;
            const displayValue = mode === 'value' ? formatCurrency(total) : total;
            return (
              <li key={s.label} className="flex items-center gap-1.5 shrink-0">
                <span
                  className="w-2.5 h-0.5 rounded shrink-0"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-gray-600 truncate min-w-0">{s.label}</span>
                <span className="text-gray-900 font-semibold tabular-nums shrink-0">
                  {displayValue} ({pct.toFixed(0)}%)
                </span>
              </li>
            );
          })}
        </ul>
        </div>
      </FadeInOnMount>
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
    const explodeOffset = 5;

    const handleSliceMouseEnter = (e: ChartEntry, ev: React.MouseEvent) => {
      setHoveredPieSlice(e);
      setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
    };
    const handleSliceMouseMove = (ev: React.MouseEvent) => {
      if (hoveredPieSlice) setPieTooltipPos({ x: ev.clientX, y: ev.clientY });
    };
    const handleSliceMouseLeave = () => setHoveredPieSlice(null);

    return (
      <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full relative">
        <Subtitle />
        <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
        <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full max-w-full max-h-full min-h-[80px]"
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={handleSliceMouseLeave}
          >
            {slicesForChart.map((e, i) => {
              const angle = (e.value / total) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + angle;
              currentAngle = endAngle;
              const midAngle = (startAngle + endAngle) / 2;
              const isHovered = hoveredPieSlice?.label === e.label;
              const { x: ox, y: oy } = polarToCartesian(centerX, centerY, explodeOffset, midAngle);
              const tx = isHovered ? ox - centerX : 0;
              const ty = isHovered ? oy - centerY : 0;
              const pct = total > 0 ? (e.value / total) * 100 : 0;
              return (
                <g
                  key={e.label}
                  transform={`translate(${tx}, ${ty})`}
                  style={{
                    cursor: 'pointer',
                    opacity: pieSlicesMounted ? 1 : 0,
                    transition: `transform 0.15s ease-out, opacity 400ms ease-out ${pieSlicesMounted ? i * 80 + 'ms' : '0ms'}`,
                  }}
                  onMouseEnter={(ev) => handleSliceMouseEnter(e, ev)}
                  onMouseMove={handleSliceMouseMove}
                  onMouseLeave={handleSliceMouseLeave}
                >
                  <path
                    d={createPieSlice(startAngle, endAngle, radius, centerX, centerY)}
                    fill={colors[i % colors.length]}
                    style={{
                      filter: isHovered ? 'brightness(1.12)' : undefined,
                      transition: 'filter 0.2s ease-out',
                    }}
                  />
                </g>
              );
            })}
            {isDonut && <circle cx={centerX} cy={centerY} r={rInner} fill="white" />}
          </svg>
          {hoveredPieSlice &&
            createPortal(
              <div
                className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                style={{ left: pieTooltipPos.x + 10, top: pieTooltipPos.y + 10 }}
              >
                <div className="font-semibold">{hoveredPieSlice.label}</div>
                <div className="text-gray-300">
                  {mode === 'value' ? formatCurrency(hoveredPieSlice.value) : hoveredPieSlice.value} ({total > 0 ? ((hoveredPieSlice.value / total) * 100).toFixed(0) : 0}%)
                </div>
                {mode === 'value' && hoveredPieSlice.profit != null && hoveredPieSlice.value > 0 && (
                  <div className="text-gray-400 text-[10px]">Profit: {formatCurrency(hoveredPieSlice.profit)}</div>
                )}
              </div>,
              document.body
            )}
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
      </FadeInOnMount>
    );
  }

  // Bar chart (same layout and colors as Business Dashboard) — responsive to card size, bars animate on mount
  const displayEntries = sorted.slice(0, 10);
  return (
    <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full">
      <Subtitle />
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {displayEntries.map((e) => {
          const barPercentage = (e.value / maxVal) * 100;
          const percentage = totalForPct > 0 ? (e.value / totalForPct) * 100 : 0;
          const profitMargin =
            mode === 'value' && e.profit != null && e.value > 0 ? (e.profit / e.value) * 100 : 0;
          const barWidthPct = barsMounted ? barPercentage : 0;

          if (mode === 'value') {
            return (
              <div key={e.label} className="space-y-1 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-500 truncate w-20 sm:w-28 shrink-0">{e.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative overflow-hidden">
                    <div
                      className="rounded-full h-3 transition-all duration-300 ease-out absolute inset-y-0 left-0"
                      style={{ width: `${barWidthPct}%`, ...barGradientStyle }}
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
              <div className="flex-1 bg-gray-100 rounded-full h-3 min-w-0 relative overflow-hidden">
                <div
                  className="rounded-full h-3 transition-all duration-300 ease-out absolute inset-y-0 left-0"
                  style={{ width: `${barWidthPct}%`, ...barGradientStyle }}
                />
              </div>
              <span className="text-xs font-bold text-gray-900 whitespace-nowrap shrink-0 tabular-nums">
                {e.value} ({percentage.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </FadeInOnMount>
  );
}
