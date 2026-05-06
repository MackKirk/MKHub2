import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Inline-SVG chart primitives for the Community Insights page. We deliberately
 * avoid pulling in a chart library (recharts/d3) and instead reuse the SVG
 * pattern already established in BusinessDashboard.tsx: small viewBoxes, hover
 * tooltips rendered through a portal, and ease-out entry animations.
 */

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

/** Cool blues, dark -> light. Keeps the largest slice darker. */
export const coolPalette = [
  '#0b1739',
  '#0f2a5a',
  '#1d4ed8',
  '#2563eb',
  '#0284c7',
  '#0ea5e9',
  '#38bdf8',
  '#7dd3fc',
  '#bae6fd',
];

/** Ordinal palette for the 9 community related_area values (stable ordering). */
export const AREA_COLOR_ORDER = [
  'general',
  'projects',
  'opportunities',
  'repairs_maintenance',
  'safety',
  'fleet',
  'hr',
  'payroll',
  'training',
] as const;

export const AREA_COLORS: Record<string, string> = {
  general: '#64748b',
  projects: '#1d4ed8',
  opportunities: '#0284c7',
  repairs_maintenance: '#0f766e',
  safety: '#d11616',
  fleet: '#7c3aed',
  hr: '#a16207',
  payroll: '#15803d',
  training: '#db2777',
};

export const PRIORITY_COLORS: Record<string, string> = {
  normal: '#64748b',
  important: '#0ea5e9',
  urgent: '#f59e0b',
  critical: '#d11616',
};

// ---------------------------------------------------------------------------
// SVG geometry helpers (donut)
// ---------------------------------------------------------------------------

export function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export function createPieSlice(
  startAngle: number,
  endAngle: number,
  radius: number,
  cx: number,
  cy: number,
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function createDonutSlice(
  startAngle: number,
  endAngle: number,
  outerR: number,
  innerR: number,
  cx: number,
  cy: number,
): string {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const startInner = polarToCartesian(cx, cy, innerR, startAngle);
  const endInner = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

export type SparklinePoint = { date: string; count: number };

export function Sparkline({
  data,
  stroke = '#d11616',
  fill = 'rgba(209, 22, 22, 0.12)',
  height = 32,
  className,
}: {
  data: SparklinePoint[];
  stroke?: string;
  fill?: string;
  height?: number;
  className?: string;
}) {
  const width = 120;
  const points = data || [];
  if (points.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        preserveAspectRatio="none"
        style={{ width: '100%', height }}
      >
        <line x1={0} y1={height - 1} x2={width} y2={height - 1} stroke="#e5e7eb" strokeWidth={1} />
      </svg>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.count));
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - 2 - ((p.count / max) * (height - 4));
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  const areaPath = `${path} L ${(width).toFixed(2)} ${(height - 1).toFixed(2)} L 0 ${(height - 1).toFixed(2)} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
      style={{ width: '100%', height }}
      aria-hidden
    >
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Multi-series area / line chart with hover tooltip
// ---------------------------------------------------------------------------

export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  /** Filled area below the line. Defaults to false (line only). */
  filled?: boolean;
  data: SparklinePoint[];
};

export function AreaLineChart({
  series,
  height = 240,
  yLabel,
  dates: datesProp,
}: {
  series: ChartSeries[];
  height?: number;
  yLabel?: string;
  /** Optional explicit date axis. When omitted, derived from series data. */
  dates?: string[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const allPoints = series.flatMap((s) => s.data);
  const dates = useMemo(() => {
    if (datesProp && datesProp.length > 0) return datesProp;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of allPoints) {
      if (!seen.has(p.date)) {
        seen.add(p.date);
        out.push(p.date);
      }
    }
    return out.sort();
  }, [allPoints, datesProp]);

  const max = Math.max(1, ...allPoints.map((p) => p.count));

  if (dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center text-xs text-gray-500" style={{ height }}>
        <svg className="w-8 h-8 mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13v8m0 0h8m-8 0l8-8m9-9v8m0 0h-8m8 0l-8 8" />
        </svg>
        <div>No activity in this range.</div>
      </div>
    );
  }

  const padding = { top: 16, right: 12, bottom: 28, left: 36 };
  const viewBoxWidth = 800;
  const viewBoxHeight = height;
  const innerW = viewBoxWidth - padding.left - padding.right;
  const innerH = viewBoxHeight - padding.top - padding.bottom;
  const stepX = dates.length > 1 ? innerW / (dates.length - 1) : innerW;

  const yTicks = 4;
  const tickValues: number[] = [];
  for (let i = 0; i <= yTicks; i += 1) {
    tickValues.push(Math.round((max * i) / yTicks));
  }

  const xToPx = (i: number) => padding.left + i * stepX;
  const yToPx = (v: number) => padding.top + innerH - (v / max) * innerH;

  function buildPath(pts: SparklinePoint[], filled: boolean): { line: string; area: string } {
    const byDate = new Map(pts.map((p) => [p.date, p.count]));
    let line = '';
    dates.forEach((d, i) => {
      const v = byDate.get(d) ?? 0;
      const x = xToPx(i);
      const y = yToPx(v);
      line += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
    });
    const baselineY = yToPx(0);
    const lastX = xToPx(dates.length - 1);
    const firstX = xToPx(0);
    const area = filled ? `${line} L ${lastX.toFixed(2)} ${baselineY.toFixed(2)} L ${firstX.toFixed(2)} ${baselineY.toFixed(2)} Z` : '';
    return { line: line.trim(), area };
  }

  const xLabelEvery = Math.max(1, Math.ceil(dates.length / 8));

  function handleMouseMove(ev: React.MouseEvent<SVGSVGElement>) {
    const svg = ev.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = pt.matrixTransform(ctm.inverse());
    const relX = local.x - padding.left;
    const idx = Math.max(0, Math.min(dates.length - 1, Math.round(relX / Math.max(1, stepX))));
    setHoverIdx(idx);
    setTooltipPos({ x: ev.clientX, y: ev.clientY });
  }
  function handleMouseLeave() {
    setHoverIdx(null);
    setTooltipPos(null);
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-hidden" style={{ height }}>
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-full"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {tickValues.map((v, i) => {
          const y = yToPx(v);
          return (
            <g key={`y-${i}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerW} y2={y} stroke="#f3f4f6" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="#9ca3af">
                {v}
              </text>
            </g>
          );
        })}

        {dates.map((d, i) => {
          if (i % xLabelEvery !== 0 && i !== dates.length - 1) return null;
          const x = xToPx(i);
          const y = padding.top + innerH + 14;
          const label = d.slice(5);
          return (
            <text key={`x-${d}`} x={x} y={y} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {label}
            </text>
          );
        })}

        {series.map((s) => {
          const { line, area } = buildPath(s.data, !!s.filled);
          return (
            <g key={s.id}>
              {s.filled ? <path d={area} fill={s.color} fillOpacity={0.12} /> : null}
              <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {hoverIdx !== null ? (
          <g>
            <line
              x1={xToPx(hoverIdx)}
              y1={padding.top}
              x2={xToPx(hoverIdx)}
              y2={padding.top + innerH}
              stroke="#9ca3af"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            {series.map((s) => {
              const v = s.data.find((p) => p.date === dates[hoverIdx])?.count ?? 0;
              return (
                <circle
                  key={`pt-${s.id}`}
                  cx={xToPx(hoverIdx)}
                  cy={yToPx(v)}
                  r={3.5}
                  fill="#fff"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      {yLabel ? (
        <div className="absolute left-1 top-1 text-[10px] uppercase tracking-wide text-gray-400">{yLabel}</div>
      ) : null}

      {hoverIdx !== null && tooltipPos
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none px-2.5 py-2 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap"
              style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
            >
              <div className="font-semibold mb-1">{dates[hoverIdx]}</div>
              <div className="space-y-0.5">
                {series.map((s) => {
                  const v = s.data.find((p) => p.date === dates[hoverIdx])?.count ?? 0;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-gray-300">{s.label}</span>
                      <span className="ml-auto font-medium">{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Donut (with optional center label and hover tooltip)
// ---------------------------------------------------------------------------

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

export function Donut({
  slices,
  size = 160,
  thickness = 28,
  centerLabel,
  centerSubLabel,
  formatValue,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  formatValue?: (value: number, pct: number, slice: DonutSlice) => string;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 30);
    return () => clearTimeout(t);
  }, []);

  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const outerR = size / 2;
  const innerR = outerR - thickness;
  const cx = size / 2;
  const cy = size / 2;

  if (total <= 0) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={cx} cy={cy} r={outerR} fill="#f3f4f6" />
        <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize={11} fill="#9ca3af">
          No data
        </text>
      </svg>
    );
  }

  const nonZeroSlices = slices.filter((s) => s.value > 0);
  let currentAngle = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: size, height: size }}
        onMouseLeave={() => {
          setHoverId(null);
          setTooltipPos(null);
        }}
      >
        {nonZeroSlices.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={outerR} fill={nonZeroSlices[0].color} />
            <circle cx={cx} cy={cy} r={innerR} fill="#fff" />
          </>
        ) : (
          slices.map((slice, idx) => {
            const pct = (slice.value / total) * 100;
            const angle = (pct / 100) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            currentAngle = endAngle;
            if (slice.value <= 0) return null;
            const isHovered = hoverId === slice.id;
            return (
              <path
                key={slice.id}
                d={createDonutSlice(startAngle, endAngle, outerR, innerR, cx, cy)}
                fill={slice.color}
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  transition: `opacity 350ms ease-out ${idx * 40}ms, filter 0.15s ease-out`,
                  opacity: animated ? 1 : 0,
                  filter: isHovered ? 'brightness(1.12)' : undefined,
                  cursor: 'pointer',
                }}
                onMouseEnter={(ev) => {
                  setHoverId(slice.id);
                  setTooltipPos({ x: ev.clientX, y: ev.clientY });
                }}
                onMouseMove={(ev) => setTooltipPos({ x: ev.clientX, y: ev.clientY })}
              />
            );
          })
        )}

        {centerLabel ? (
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={700} fill="#111827">
            {centerLabel}
          </text>
        ) : null}
        {centerSubLabel ? (
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#6b7280">
            {centerSubLabel}
          </text>
        ) : null}
      </svg>

      {hoverId && tooltipPos
        ? (() => {
            const s = slices.find((x) => x.id === hoverId);
            if (!s) return null;
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            const text = formatValue ? formatValue(s.value, pct, s) : `${s.value} (${pct.toFixed(0)}%)`;
            return createPortal(
              <div
                className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
              >
                <div className="font-semibold">{s.label}</div>
                <div className="text-gray-300">{text}</div>
              </div>,
              document.body,
            );
          })()
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar (used for engagement-by-priority)
// ---------------------------------------------------------------------------

export function HorizontalBar({
  value,
  max,
  color,
  height = 8,
  ariaLabel,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
  ariaLabel?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="w-full min-w-0 max-w-full bg-gray-100 rounded-full overflow-hidden"
      style={{ height }}
      aria-label={ariaLabel}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max || 1}
      aria-valuemin={0}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
