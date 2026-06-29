import { Donut, type DonutSlice } from './InsightsCharts';
import { InsightsSection } from './InsightsSection';
import type { WorkforceReach } from './insightsTypes';
import { AppCard, uiCx, uiTypography } from '@/components/ui';

function MiniStat({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <AppCard bodyClassName="space-y-1">
      <div className={uiCx(uiTypography.overline, 'break-words leading-tight')}>{label}</div>
      <div className="text-base font-semibold tabular-nums text-gray-900">
        {value}
        {unit ? <span className="ml-0.5 text-xs font-medium text-gray-500">{unit}</span> : null}
      </div>
    </AppCard>
  );
}

export function InsightsWorkforceReach({ reach }: { reach: WorkforceReach }) {
  const slices: DonutSlice[] = [
    {
      id: 'active',
      label: 'Active members',
      value: Math.max(0, reach.active_members),
      color: '#d11616',
    },
    {
      id: 'inactive',
      label: 'Inactive members',
      value: Math.max(0, reach.total_members - reach.active_members),
      color: '#e5e7eb',
    },
  ];
  const activePct = reach.active_percentage;
  return (
    <InsightsSection
      title="Workforce reach"
      subtitle="Share of the active workforce engaging with the community"
    >
      <div className="flex w-full min-w-0 flex-col items-center gap-5 md:flex-row">
        <div className="flex shrink-0 items-center justify-center">
          <Donut
            slices={slices}
            size={170}
            thickness={22}
            centerLabel={`${activePct.toFixed(0)}%`}
            centerSubLabel="active"
            formatValue={(v, pct) => `${v.toLocaleString()} (${pct.toFixed(0)}%)`}
          />
        </div>
        <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <MiniStat label="Active members" value={reach.active_members.toLocaleString()} />
          <MiniStat label="Total members" value={reach.total_members.toLocaleString()} />
          <MiniStat label="Posts / active user" value={reach.posts_per_active_user.toFixed(2)} />
          <MiniStat label="Views / active user" value={reach.views_per_active_user.toFixed(2)} />
          <MiniStat
            label="Engagement / active user"
            value={reach.engagement_per_active_user.toFixed(2)}
            unit="(L+C)"
          />
          <MiniStat label="Inactive members" value={(reach.total_members - reach.active_members).toLocaleString()} />
        </div>
      </div>
    </InsightsSection>
  );
}
