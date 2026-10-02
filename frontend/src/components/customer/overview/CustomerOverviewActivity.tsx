import { Link } from 'react-router-dom';
import { InsightsEmptyState, InsightsSection } from '@/components/insights';
import type { ActivityEvent } from './customerOverviewTypes';
import { formatDateForDisplay } from './customerOverviewUtils';

const EVENT_ICONS: Record<string, string> = {
  project_created: '📁',
  project_finished: '✓',
  project_awarded: '🏆',
  opportunity_created: '💼',
  opportunity_sent: '📤',
  opportunity_refused: '✕',
};

function groupByDay(events: ActivityEvent[]): Array<{ day: string; events: ActivityEvent[] }> {
  const map = new Map<string, ActivityEvent[]>();
  for (const e of events) {
    const day = new Date(e.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries()).map(([day, evs]) => ({ day, events: evs }));
}

export function CustomerOverviewActivity({
  events,
  onCreateOpportunity,
}: {
  events: ActivityEvent[];
  onCreateOpportunity?: () => void;
}) {
  const groups = groupByDay(events);

  return (
    <InsightsSection title="Recent activity" subtitle="Latest project and opportunity events">
      {events.length === 0 ? (
        <div className="text-center py-4">
          <InsightsEmptyState
            title="No recent activity"
            hint="Create an opportunity or project to see updates here."
          />
          {onCreateOpportunity ? (
            <button
              type="button"
              onClick={onCreateOpportunity}
              className="mt-2 text-sm font-semibold text-brand-red hover:underline"
            >
              Create opportunity
            </button>
          ) : null}
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto space-y-4 pr-1">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">{g.day}</div>
              <ul className="space-y-2">
                {g.events.map((e, idx) => (
                  <li key={`${e.id}-${idx}`} className="flex gap-2 text-sm">
                    <span className="shrink-0" aria-hidden>
                      {EVENT_ICONS[e.type] || '•'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/projects/${encodeURIComponent(e.id)}`}
                        className="font-semibold text-gray-800 hover:text-brand-red"
                      >
                        {e.label}
                      </Link>
                      <div className="text-xs text-gray-600">{formatDateForDisplay(e.date)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </InsightsSection>
  );
}
