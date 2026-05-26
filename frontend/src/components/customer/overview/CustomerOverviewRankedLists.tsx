import { Link } from 'react-router-dom';
import { HorizontalBar, InsightsEmptyState, InsightsSection } from '@/components/insights';
import type { RankedAtRiskProject, RankedOpportunity, OverviewDisplayMode } from './customerOverviewTypes';
import { formatCurrency } from './customerOverviewUtils';

export function CustomerOverviewTopOpportunities({
  topOpportunities,
  displayMode,
}: {
  topOpportunities: RankedOpportunity[];
  displayMode: OverviewDisplayMode;
}) {
  const maxOpp = Math.max(...topOpportunities.map((o) => o.value), 1);

  return (
    <InsightsSection title="Top opportunities" subtitle="Open pipeline ranked by value">
      {topOpportunities.length === 0 ? (
        <InsightsEmptyState title="No open opportunities" hint="Create an opportunity to build pipeline." />
      ) : (
        <ul className="space-y-3">
          {topOpportunities.map((o, i) => (
            <li key={o.id} className="flex gap-3 items-start">
              <span className="text-xs font-bold text-gray-400 w-4 pt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0 space-y-1">
                <Link
                  to={`/projects/${encodeURIComponent(o.id)}`}
                  className="text-sm font-medium text-brand-red hover:underline block truncate"
                >
                  {o.name}
                  {o.code ? <span className="text-gray-500 font-normal"> ({o.code})</span> : null}
                </Link>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                  <span>{o.status}</span>
                  <span>·</span>
                  <span>{o.ageDays}d open</span>
                  {displayMode === 'value' && o.value > 0 ? (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-gray-700">{formatCurrency(o.value)}</span>
                    </>
                  ) : null}
                </div>
                {displayMode === 'value' && o.value > 0 ? (
                  <HorizontalBar value={o.value} max={maxOpp} color="#15803d" height={6} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightsSection>
  );
}

export function CustomerOverviewAtRiskProjects({
  atRiskProjects,
  displayMode,
}: {
  atRiskProjects: RankedAtRiskProject[];
  displayMode: OverviewDisplayMode;
}) {
  const maxRisk = Math.max(...atRiskProjects.map((p) => p.value), 1);

  return (
    <InsightsSection title="Projects needing attention" subtitle="On hold or past expected completion">
      {atRiskProjects.length === 0 ? (
        <InsightsEmptyState title="No at-risk projects" hint="Delivery is on track for this period." />
      ) : (
        <ul className="space-y-3">
          {atRiskProjects.map((p, i) => (
            <li key={p.id} className="flex gap-3 items-start">
              <span className="text-xs font-bold text-gray-400 w-4 pt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0 space-y-1">
                <Link
                  to={`/projects/${encodeURIComponent(p.id)}`}
                  className="text-sm font-medium text-brand-red hover:underline block truncate"
                >
                  {p.name}
                </Link>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                  <span>{p.status}</span>
                  <span>·</span>
                  <span className="text-amber-700 font-medium">{p.reason}</span>
                </div>
                {displayMode === 'value' && p.value > 0 ? (
                  <HorizontalBar value={p.value} max={maxRisk} color="#f59e0b" height={6} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightsSection>
  );
}
