import { useEffect, useRef, useState } from 'react';
import { Sparkline, type SparklinePoint } from './InsightsCharts';

/**
 * Animates an integer counter using ease-out cubic. Mirrors the CountUp helper
 * from BusinessDashboard.tsx so the visual feel of numeric reveals is consistent.
 */
function useCountUp(end: number, duration = 600, enabled = true): number {
  const [count, setCount] = useState(end);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const prevEndRef = useRef(end);

  useEffect(() => {
    if (!enabled) {
      setCount(end);
      return;
    }
    if (prevEndRef.current === end) {
      setCount(end);
      return;
    }
    prevEndRef.current = end;
    const fromValue = 0;
    const animate = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(fromValue + (end - fromValue) * eased);
      setCount(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };
    startRef.current = null;
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [end, duration, enabled]);

  return count;
}

function CountUpInt({ value, enabled = true }: { value: number; enabled?: boolean }) {
  const v = useCountUp(value, 600, enabled);
  return <>{v.toLocaleString()}</>;
}

export type DeltaTone = 'auto' | 'positive' | 'negative' | 'neutral';

function DeltaChip({ pct, tone = 'auto' }: { pct: number | null; tone?: DeltaTone }) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 max-w-full"
        title="No prior-period value to compare"
      >
        <span className="truncate">N/A vs prev</span>
      </span>
    );
  }

  const sign = pct > 0 ? '+' : pct < 0 ? '' : '';
  const isPositive = tone === 'positive' || (tone === 'auto' && pct > 0);
  const isNegative = tone === 'negative' || (tone === 'auto' && pct < 0);
  const cls = isPositive
    ? 'bg-emerald-50 text-emerald-700'
    : isNegative
      ? 'bg-rose-50 text-rose-700'
      : 'bg-gray-100 text-gray-600';
  const arrow = isPositive ? '↑' : isNegative ? '↓' : '·';
  return (
    <span
      title="Change vs previous period of equal length"
      className={`inline-flex flex-wrap items-center gap-x-1 gap-y-0 max-w-full px-2 py-0.5 rounded-full text-[10px] font-medium leading-tight ${cls}`}
    >
      <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden>
        <span>{arrow}</span>
        <span className="tabular-nums">
          {sign}
          {pct.toFixed(1)}%
        </span>
      </span>
      <span className="text-gray-500 shrink-0">vs prev</span>
    </span>
  );
}

export function InsightsKpiCard({
  label,
  value,
  unit,
  formatter,
  deltaPct,
  deltaTone = 'auto',
  sparkline,
  sparklineColor = '#d11616',
  sparklineFill = 'rgba(209, 22, 22, 0.12)',
  hint,
}: {
  label: string;
  value: number;
  unit?: string;
  formatter?: (v: number) => React.ReactNode;
  deltaPct: number | null;
  deltaTone?: DeltaTone;
  sparkline?: SparklinePoint[];
  sparklineColor?: string;
  sparklineFill?: string;
  hint?: string;
}) {
  const isInteger = Number.isInteger(value);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-2 min-w-0 w-full">
      {/* Stack label + delta so narrow columns never squeeze them side-by-side */}
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 leading-snug break-words">
          {label}
        </div>
        <div className="min-w-0">
          <DeltaChip pct={deltaPct} tone={deltaTone} />
        </div>
      </div>
      <div className="flex items-baseline gap-1 flex-wrap min-w-0">
        <span className="text-2xl font-semibold text-gray-900 tabular-nums tracking-tight min-w-0">
          {formatter ? formatter(value) : isInteger ? <CountUpInt value={value} /> : value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
        {unit ? <span className="text-sm font-medium text-gray-500 shrink-0">{unit}</span> : null}
      </div>
      {sparkline ? (
        <div className="w-full min-w-0 min-h-[32px]">
          <Sparkline data={sparkline} stroke={sparklineColor} fill={sparklineFill} height={32} />
        </div>
      ) : null}
      {hint ? (
        <div className="text-[11px] text-gray-500 leading-snug break-words [overflow-wrap:anywhere]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
