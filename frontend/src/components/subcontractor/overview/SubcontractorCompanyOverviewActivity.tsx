import { Link } from 'react-router-dom';
import { InsightsEmptyState, InsightsSection } from '@/components/insights';
import { formatDecimalHoursAsHMin } from '@/lib/dateUtils';

export type ActivityFeedItem = {
  type: string;
  at: string;
  title: string;
  subtitle?: string | null;
  project_id?: string;
  attendance_id?: string;
  total_hours?: number | null;
  worker_id?: string;
  company_file_id?: string;
  file_object_id?: string;
  by_user_id?: string | null;
  by_username?: string | null;
  audit_id?: string;
  audit_action?: string;
  detail_lines?: string[];
};

const EVENT_ICONS: Record<string, string> = {
  company_created: '🏢',
  worker_added: '👷',
  document_uploaded: '📄',
  document_removed: '🗑',
  clock_in: '⏱',
  clock_out: '✓',
  audit: '✎',
};

function groupByDay(events: ActivityFeedItem[]): Array<{ day: string; events: ActivityFeedItem[] }> {
  const map = new Map<string, ActivityFeedItem[]>();
  for (const e of events) {
    const day = new Date(e.at).toLocaleDateString('en-US', {
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

function eventKey(ev: ActivityFeedItem, idx: number): string {
  return `${ev.type}-${ev.at}-${ev.audit_id ?? ev.attendance_id ?? ev.worker_id ?? ev.company_file_id ?? idx}`;
}

export function SubcontractorCompanyOverviewActivity({
  events,
  loading,
  onViewWorkers,
}: {
  events: ActivityFeedItem[];
  loading?: boolean;
  onViewWorkers?: () => void;
}) {
  const groups = groupByDay(events);

  return (
    <InsightsSection
      title="Recent activity"
      subtitle="Documents, workers, clock events, and profile updates"
    >
      {loading ? (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-4">
          <InsightsEmptyState
            title="No recent activity"
            hint="Upload documents, add workers, or record clock events to see updates here."
          />
          {onViewWorkers ? (
            <button
              type="button"
              onClick={onViewWorkers}
              className="mt-2 text-xs font-medium text-brand-red hover:underline"
            >
              View workers
            </button>
          ) : null}
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto space-y-4 pr-1">
          {groups.map((g) => (
            <div key={g.day}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">{g.day}</div>
              <ul className="space-y-2">
                {g.events.map((ev, idx) => (
                  <li key={eventKey(ev, idx)} className="flex gap-2 text-xs border-b border-gray-50 pb-2 last:border-0">
                    <span className="shrink-0 pt-0.5" aria-hidden>
                      {EVENT_ICONS[ev.type] || '•'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-semibold text-gray-900">{ev.title}</span>
                        <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
                          {new Date(ev.at).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {ev.subtitle ? (
                        <div className="text-[11px] text-gray-600 mt-0.5 break-words">
                          {ev.worker_id && ev.type !== 'worker_added' ? (
                            <>
                              <Link
                                to={`/business/subcontractors/workers/${encodeURIComponent(ev.worker_id)}`}
                                className="font-medium text-gray-800 hover:text-brand-red"
                              >
                                {ev.subtitle.split(' · ')[0]}
                              </Link>
                              {ev.subtitle.includes(' · ') ? (
                                <span> · {ev.subtitle.split(' · ').slice(1).join(' · ')}</span>
                              ) : null}
                            </>
                          ) : ev.worker_id && ev.type === 'worker_added' ? (
                            <Link
                              to={`/business/subcontractors/workers/${encodeURIComponent(ev.worker_id)}`}
                              className="font-medium text-gray-800 hover:text-brand-red"
                            >
                              {ev.subtitle}
                            </Link>
                          ) : ev.project_id ? (
                            <>
                              {ev.subtitle}
                              {' · '}
                              <Link
                                to={`/projects/${encodeURIComponent(ev.project_id)}`}
                                className="font-medium text-brand-red hover:underline"
                              >
                                Project
                              </Link>
                            </>
                          ) : (
                            ev.subtitle
                          )}
                        </div>
                      ) : null}
                      {ev.type === 'clock_out' && ev.total_hours != null ? (
                        <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                          {formatDecimalHoursAsHMin(ev.total_hours)}
                        </div>
                      ) : null}
                      {ev.detail_lines && ev.detail_lines.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-gray-500 border-l-2 border-gray-200 pl-2 max-h-24 overflow-y-auto">
                          {ev.detail_lines.slice(0, 4).map((line, j) => (
                            <li key={j} className="break-words">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {ev.by_username ? (
                        <div className="text-[10px] text-gray-400 mt-1">
                          By <span className="font-medium text-gray-600">{ev.by_username}</span>
                        </div>
                      ) : null}
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
