/**
 * Shared chart helpers and palettes matching the Business Dashboard (/business).
 * Used by Home ChartWidget so charts look identical; state and filters are independent.
 */

import { getBusinessLineShortLabel } from '../homeBusinessLine';

export type StatusValueData = {
  final_total_with_gst: number;
  profit: number;
};

export type StatusEntry = number | StatusValueData;

export function getCount(data: StatusEntry): number {
  if (typeof data === 'number') return data;
  return 0;
}

export function getValue(data: StatusEntry): number {
  if (typeof data === 'number') return data;
  return (data as StatusValueData).final_total_with_gst ?? 0;
}

export function getProfit(data: StatusEntry): number {
  if (typeof data === 'object' && data !== null && 'profit' in data) {
    return (data as StatusValueData).profit ?? 0;
  }
  return 0;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Compact $K/$M/$B for donut center only — legends keep full formatCurrency. */
export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (n: number, suffix: string) => {
    const rounded = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(n >= 1 ? 1 : 2);
    return `${sign}$${rounded.replace(/\.0$/, '')}${suffix}`;
  };
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, 'B');
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M');
  if (abs >= 1_000) return fmt(abs / 1_000, 'K');
  return formatCurrency(value);
}

// Palettes from Business Dashboard (darkest -> lightest; largest slice can start darker)
export const greenPalette = ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'];
export const coolPalette = ['#0b1739', '#0f2a5a', '#1d4ed8', '#2563eb', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'];
export const warmPalette = ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa'];
export const purplePalette = ['#581c87', '#6b21a8', '#7e22ce', '#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'];
export const brandPalette = ['#7f1010', '#991212', '#b31414', '#d11616', '#dc2626', '#ef4444', '#f87171', '#fca5a5'];

/** Distinct hues per slice/series — not shades of one color. */
export const mixedPalette = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'];
export const vividPalette = ['#1d4ed8', '#15803d', '#c2410c', '#7e22ce', '#b91c1c', '#0e7490', '#a16207', '#be185d'];
export const pastelPalette = ['#93c5fd', '#86efac', '#fdba74', '#d8b4fe', '#fca5a5', '#67e8f9', '#fde047', '#f9a8d4'];
export const spectrumPalette = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export type ChartPaletteId =
  | 'green'
  | 'cool'
  | 'warm'
  | 'purple'
  | 'brand'
  | 'mixed'
  | 'vivid'
  | 'pastel'
  | 'spectrum';

export type ChartPaletteGroup = 'monochrome' | 'multicolor';

export const CHART_PALETTES: Record<ChartPaletteId, string[]> = {
  green: greenPalette,
  cool: coolPalette,
  warm: warmPalette,
  purple: purplePalette,
  brand: brandPalette,
  mixed: mixedPalette,
  vivid: vividPalette,
  pastel: pastelPalette,
  spectrum: spectrumPalette,
};

export const CHART_PALETTE_OPTIONS: {
  value: ChartPaletteId;
  label: string;
  group: ChartPaletteGroup;
}[] = [
  { value: 'green', label: 'Green', group: 'monochrome' },
  { value: 'cool', label: 'Blue / Cool', group: 'monochrome' },
  { value: 'warm', label: 'Orange / Warm', group: 'monochrome' },
  { value: 'purple', label: 'Purple', group: 'monochrome' },
  { value: 'brand', label: 'Brand Red', group: 'monochrome' },
  { value: 'mixed', label: 'Balanced multi', group: 'multicolor' },
  { value: 'vivid', label: 'Bold multi', group: 'multicolor' },
  { value: 'pastel', label: 'Soft multi', group: 'multicolor' },
  { value: 'spectrum', label: 'Rainbow', group: 'multicolor' },
];

export function isMultiHueChartPalette(paletteId: ChartPaletteId | string | undefined): boolean {
  const opt = CHART_PALETTE_OPTIONS.find((o) => o.value === paletteId);
  return opt?.group === 'multicolor';
}

export function getDefaultChartPalette(isOpportunities: boolean): ChartPaletteId {
  return isOpportunities ? 'green' : 'cool';
}

export function resolveChartPalette(
  paletteId: ChartPaletteId | string | undefined,
  isOpportunities: boolean,
): string[] {
  const fallback = getDefaultChartPalette(isOpportunities);
  const id = (paletteId && paletteId in CHART_PALETTES ? paletteId : fallback) as ChartPaletteId;
  return CHART_PALETTES[id] ?? CHART_PALETTES[fallback];
}

export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function createPieSlice(
  startAngle: number,
  endAngle: number,
  radius: number,
  centerX: number,
  centerY: number
): string {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export type DateFilterType = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

const PERIOD_LABELS: Record<DateFilterType, string> = {
  all: 'All time',
  last_year: 'Last year',
  last_6_months: 'Last 6 months',
  last_3_months: 'Last 3 months',
  last_month: 'Last month',
  custom: 'Custom range',
};

/** Human-readable period + optional custom date range for chart subtitle. */
export function getPeriodDisplay(
  period: DateFilterType,
  customStart: string,
  customEnd: string
): string {
  if (period !== 'custom' || !customStart || !customEnd) return PERIOD_LABELS[period] ?? period;
  try {
    const s = new Date(customStart + 'T00:00:00');
    const e = new Date(customEnd + 'T00:00:00');
    const fmt = (d: Date) => `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    return `${fmt(s)} – ${fmt(e)}`;
  } catch {
    return 'Custom range';
  }
}

const METRIC_LABELS: Record<string, string> = {
  opportunities_by_status: 'Opportunities by status',
  opportunities_by_division: 'Opportunities by division',
  projects_by_status: 'Projects by status',
  projects_by_division: 'Projects by division',
};

export function getChartMetricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}

/** Chart widget title with optional business line suffix when user has multiple lines. */
export function getChartWidgetTitle(metric: string, businessLine?: string, showLineBadge = false): string {
  const base = getChartMetricLabel(metric);
  if (!showLineBadge || !businessLine) return base;
  return `${base} · ${getBusinessLineShortLabel(businessLine)}`;
}

export function calculateDateRange(
  dateFilter: DateFilterType,
  customDateStart: string,
  customDateEnd: string
): { date_from?: string; date_to?: string } {
  if (dateFilter === 'all') return {};
  if (dateFilter === 'custom') {
    return {
      date_from: customDateStart || undefined,
      date_to: customDateEnd || undefined,
    };
  }
  const now = new Date();
  const dateTo = now.toISOString().split('T')[0];
  let dateFrom: string;
  switch (dateFilter) {
    case 'last_year':
      dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      break;
    case 'last_6_months':
      dateFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_3_months':
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_month':
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    default:
      return {};
  }
  return { date_from: dateFrom, date_to: dateTo };
}
