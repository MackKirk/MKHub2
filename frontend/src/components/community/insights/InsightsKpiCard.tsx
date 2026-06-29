import { useEffect, useRef, useState } from 'react';
import { Sparkline, type SparklinePoint } from './InsightsCharts';
import { AppBadge, AppCard, uiCx, uiTypography } from '@/components/ui';

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
      <AppBadge variant="neutral" className="max-w-full normal-case tracking-normal" title="No prior-period value to compare">
        <span className="truncate">N/A vs prev</span>
      </AppBadge>
    );
  }

  const sign = pct > 0 ? '+' : pct < 0 ? '' : '';
  const isPositive = tone === 'positive' || (tone === 'auto' && pct > 0);
  const isNegative = tone === 'negative' || (tone === 'auto' && pct < 0);
  const variant = isPositive ? 'success' : isNegative ? 'danger' : 'neutral';
  const arrow = isPositive ? '↑' : isNegative ? '↓' : '·';

  return (
    <AppBadge
      variant={variant}
      className="max-w-full normal-case tracking-normal"
      title="Change vs previous period of equal length"
    >
      <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0 leading-tight">
        <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
          <span>{arrow}</span>
          <span className="tabular-nums">
            {sign}
            {pct.toFixed(1)}%
          </span>
        </span>
        <span className="font-normal opacity-80">vs prev</span>
      </span>
    </AppBadge>
  );
}

export function InsightsKpiCard({
  label,
  value,
  unit,
  formatter,
  deltaPct,
  deltaTone = 'auto',
  showDelta = true,
  sparkline,
  sparklineColor = '#d11616',
  sparklineFill = 'rgba(209, 22, 22, 0.12)',
  hint,
  className = '',
}: {
  label: string;
  value: number;
  unit?: string;
  formatter?: (v: number) => React.ReactNode;
  deltaPct: number | null;
  deltaTone?: DeltaTone;
  /** When false, hides the vs-previous chip entirely (no placeholder). */
  showDelta?: boolean;
  sparkline?: SparklinePoint[];
  sparklineColor?: string;
  sparklineFill?: string;
  hint?: string;
  className?: string;
}) {
  const isInteger = Number.isInteger(value);
  return (
    <AppCard
      className={uiCx('flex h-full min-h-[148px] min-w-0 w-full flex-col', className)}
      bodyClassName="flex flex-1 flex-col gap-2"
    >
      <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
        <div className={uiCx(uiTypography.overline, 'break-words leading-snug')}>{label}</div>
        {showDelta ? (
          <div className="min-w-0">
            <DeltaChip pct={deltaPct} tone={deltaTone} />
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-baseline gap-1">
        <span className="min-w-0 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
          {formatter
            ? formatter(value)
            : isInteger
              ? <CountUpInt value={value} />
              : value.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        </span>
        {unit ? <span className="shrink-0 text-sm font-medium text-gray-500">{unit}</span> : null}
      </div>
      <div className="flex min-h-[32px] w-full min-w-0 flex-1 items-end">
        {sparkline ? (
          <Sparkline data={sparkline} stroke={sparklineColor} fill={sparklineFill} height={32} className="w-full" />
        ) : null}
      </div>
      {hint ? (
        <div className={uiCx(uiTypography.helper, 'mt-auto shrink-0 break-words leading-snug [overflow-wrap:anywhere]')}>
          {hint}
        </div>
      ) : null}
    </AppCard>
  );
}
