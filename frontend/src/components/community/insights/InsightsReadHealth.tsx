import { useNavigate } from 'react-router-dom';
import { HorizontalBar } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import type { ReadHealth } from './insightsTypes';

function MiniStat({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const cls =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 break-words">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>
        {value}
        {unit ? <span className="text-sm font-medium text-gray-500 ml-0.5">{unit}</span> : null}
      </div>
    </div>
  );
}

export function InsightsReadHealth({ health }: { health: ReadHealth }) {
  const navigate = useNavigate();
  const avgRate = health.avg_confirmation_rate_pct;
  const tone: 'success' | 'warning' | 'danger' = avgRate >= 80 ? 'success' : avgRate >= 50 ? 'warning' : 'danger';

  return (
    <InsightsSection
      title="Read confirmation health"
      subtitle="How well required-read posts are reaching their audience"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 min-w-0">
        <MiniStat label="Required posts" value={health.required_posts_count} />
        <MiniStat
          label="Avg confirmation rate"
          value={avgRate.toFixed(1)}
          unit="%"
          tone={health.required_posts_count > 0 ? tone : 'default'}
        />
        <MiniStat
          label="Pending confirmations"
          value={health.total_pending_confirmations.toLocaleString()}
          tone={health.total_pending_confirmations > 0 ? 'warning' : 'success'}
        />
      </div>

      {health.pending_posts.length === 0 ? (
        <InsightsEmptyState
          title={
            health.required_posts_count === 0
              ? 'No required-read posts in this range'
              : 'All required-read posts are fully confirmed'
          }
          hint="Required-read posts with pending confirmations will appear here."
        />
      ) : (
        <ul className="divide-y divide-gray-100 min-w-0">
          {health.pending_posts.map((p) => (
            <li key={p.post_id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">{p.title}</span>
                  <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
                    {p.confirmed}/{p.audience} confirmed
                  </span>
                </div>
                <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <HorizontalBar
                      value={p.confirmation_rate_pct}
                      max={100}
                      color={p.confirmation_rate_pct >= 80 ? '#15803d' : p.confirmation_rate_pct >= 50 ? '#d97706' : '#d11616'}
                      height={6}
                    />
                  </div>
                  <span className="text-[11px] text-gray-600 tabular-nums shrink-0 sm:w-10 sm:text-right">
                    {p.confirmation_rate_pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 tabular-nums">
                  {p.pending} pending
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/community/posts/${p.post_id}/edit`)}
                  className="text-[11px] font-semibold text-brand-red hover:underline whitespace-nowrap"
                >
                  View
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightsSection>
  );
}
