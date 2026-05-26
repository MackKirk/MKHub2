import { InsightsSection } from '@/components/insights';
import type { AccountSignal } from './customerOverviewTypes';

const SEVERITY_STYLES = {
  info: 'border-l-blue-500 bg-blue-50/50',
  watch: 'border-l-amber-500 bg-amber-50/50',
  critical: 'border-l-red-600 bg-red-50/50',
};

export function CustomerOverviewSignals({ signals }: { signals: AccountSignal[] }) {
  return (
    <InsightsSection title="What matters now" subtitle="Actionable signals for this account">
      <div className="grid gap-3 sm:grid-cols-2">
        {signals.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border border-gray-200 border-l-4 p-3 ${SEVERITY_STYLES[s.severity]}`}
          >
            <div className="text-sm font-semibold text-gray-900">{s.title}</div>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">{s.body}</p>
            {s.ctaLabel && s.onAction ? (
              <button
                type="button"
                onClick={s.onAction}
                className="mt-2 text-xs font-medium text-brand-red hover:underline"
              >
                {s.ctaLabel} →
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </InsightsSection>
  );
}
