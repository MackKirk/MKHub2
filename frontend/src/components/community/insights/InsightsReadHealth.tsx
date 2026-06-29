import { useNavigate } from 'react-router-dom';
import { HorizontalBar } from './InsightsCharts';
import { InsightsSection, InsightsEmptyState } from './InsightsSection';
import type { ReadHealth } from './insightsTypes';
import { AppBadge, AppButton, AppCard, uiCx, uiTypography } from '@/components/ui';

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
  const valueCls =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-rose-700'
          : 'text-gray-900';

  return (
    <AppCard bodyClassName="space-y-1">
      <div className={uiTypography.overline}>{label}</div>
      <div className={uiCx('text-xl font-semibold tabular-nums', valueCls)}>
        {value}
        {unit ? <span className="ml-0.5 text-sm font-medium text-gray-500">{unit}</span> : null}
      </div>
    </AppCard>
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
      <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
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
        <ul className="min-w-0 divide-y divide-gray-100">
          {health.pending_posts.map((p) => (
            <li key={p.post_id} className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">{p.title}</span>
                  <span className={uiCx(uiTypography.helper, 'shrink-0 tabular-nums')}>
                    {p.confirmed}/{p.audience} confirmed
                  </span>
                </div>
                <div className="mt-1 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <div className="min-w-0 flex-1">
                    <HorizontalBar
                      value={p.confirmation_rate_pct}
                      max={100}
                      color={p.confirmation_rate_pct >= 80 ? '#15803d' : p.confirmation_rate_pct >= 50 ? '#d97706' : '#d11616'}
                      height={6}
                    />
                  </div>
                  <span className={uiCx(uiTypography.helper, 'shrink-0 tabular-nums sm:w-10 sm:text-right')}>
                    {p.confirmation_rate_pct.toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                <AppBadge variant="warning" className="tabular-nums normal-case tracking-normal">
                  {p.pending} pending
                </AppBadge>
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="whitespace-nowrap text-brand-red"
                  onClick={() => navigate(`/community/posts/${p.post_id}/edit`)}
                >
                  View
                </AppButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </InsightsSection>
  );
}
