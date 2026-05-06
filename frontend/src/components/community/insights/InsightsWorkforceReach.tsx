import { Donut, type DonutSlice } from './InsightsCharts';
import { InsightsSection } from './InsightsSection';
import type { WorkforceReach } from './insightsTypes';

function MiniStat({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 break-words leading-tight">{label}</div>
      <div className="mt-1 text-base font-semibold text-gray-900 tabular-nums">
        {value}
        {unit ? <span className="text-xs font-medium text-gray-500 ml-0.5">{unit}</span> : null}
      </div>
    </div>
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
      <div className="flex flex-col md:flex-row items-center gap-5 min-w-0 w-full">
        <div className="flex-shrink-0 flex items-center justify-center">
          <Donut
            slices={slices}
            size={170}
            thickness={22}
            centerLabel={`${activePct.toFixed(0)}%`}
            centerSubLabel="active"
            formatValue={(v, pct) => `${v.toLocaleString()} (${pct.toFixed(0)}%)`}
          />
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
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
