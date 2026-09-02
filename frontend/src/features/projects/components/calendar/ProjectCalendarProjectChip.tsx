import { AppBadge, AppUserAvatar, uiCx, uiTypography } from '@/components/ui';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import { formatTime12h, personToAvatarUser } from './projectCalendar.utils';

type Props = {
  entry: ProjectCalendarDayEntry;
  compact?: boolean;
  onOpen: () => void;
};

function projectChipColors(projectId: string): { bg: string; text: string; border: string } {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash << 5) - hash + projectId.charCodeAt(i);
    hash &= hash;
  }
  const colors = [
    { bg: 'bg-blue-50', text: 'text-blue-900', border: 'border-blue-200/80' },
    { bg: 'bg-green-50', text: 'text-green-900', border: 'border-green-200/80' },
    { bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-200/80' },
    { bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-200/80' },
    { bg: 'bg-teal-50', text: 'text-teal-900', border: 'border-teal-200/80' },
    { bg: 'bg-indigo-50', text: 'text-indigo-900', border: 'border-indigo-200/80' },
  ];
  return colors[Math.abs(hash) % colors.length];
}

export function ProjectCalendarProjectChip({ entry, compact = false, onOpen }: Props) {
  const colors = projectChipColors(entry.project_id);
  const titleParts = [
    entry.code,
    entry.name,
    entry.client_display_name,
    entry.status_label,
  ].filter(Boolean);

  const leadershipParts: string[] = [];
  if (entry.estimators.length) {
    leadershipParts.push(`Estimator: ${entry.estimators.map((e) => e.name).filter(Boolean).join(', ')}`);
  }
  if (entry.project_admin?.name) {
    leadershipParts.push(`Admin: ${entry.project_admin.name}`);
  }
  if (entry.onsite_leads.length) {
    leadershipParts.push(
      `On-site: ${entry.onsite_leads
        .map((l) => (l.division_label ? `${l.name} (${l.division_label})` : l.name))
        .filter(Boolean)
        .join(', ')}`,
    );
  }

  const workerLines =
    entry.shift_count > 0
      ? entry.workers_visible
        ? entry.shifts
            .filter((s) => s.worker_name)
            .map((s) => {
              const times = [formatTime12h(s.start_time), formatTime12h(s.end_time)].filter(Boolean).join('–');
              return times ? `${s.worker_name} (${times})` : String(s.worker_name);
            })
        : [`${entry.shift_count} worker${entry.shift_count === 1 ? '' : 's'} scheduled`]
      : [];

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={uiCx(
        'w-full rounded-lg border px-2 py-1.5 text-left shadow-sm transition-colors hover:brightness-95',
        colors.bg,
        colors.text,
        colors.border,
        compact ? 'text-[10px]' : 'text-xs',
      )}
      title={[...titleParts, ...leadershipParts, ...workerLines].join(' · ')}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {entry.code ? (
              <span className="font-semibold leading-snug">{entry.code}</span>
            ) : null}
            {entry.appearance === 'shift_only' ? (
              <AppBadge variant="warning" className="!px-1 !py-0 text-[8px] uppercase">
                Outside dates
              </AppBadge>
            ) : null}
          </div>
          <span className={uiCx('block line-clamp-2 font-medium leading-snug', compact && 'line-clamp-1')}>
            {entry.name}
          </span>
          {!compact && entry.client_display_name ? (
            <span className="block line-clamp-1 text-[10px] opacity-80">{entry.client_display_name}</span>
          ) : null}
        </div>
      </div>

      {!compact && (entry.estimators.length || entry.project_admin || entry.onsite_leads.length) ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {entry.estimators.slice(0, 2).map((est) => (
            <span key={est.id} title={`Estimator: ${est.name ?? ''}`} className="inline-flex">
              <AppUserAvatar user={personToAvatarUser(est)} size="sm" />
            </span>
          ))}
          {entry.project_admin ? (
            <span title={`Admin: ${entry.project_admin.name ?? ''}`} className="inline-flex">
              <AppUserAvatar user={personToAvatarUser(entry.project_admin)} size="sm" />
            </span>
          ) : null}
          {entry.onsite_leads.slice(0, 2).map((lead) => (
            <span
              key={lead.id}
              title={`On-site${lead.division_label ? ` (${lead.division_label})` : ''}: ${lead.name ?? ''}`}
              className="inline-flex"
            >
              <AppUserAvatar user={personToAvatarUser(lead)} size="sm" />
            </span>
          ))}
        </div>
      ) : null}

      {!compact && workerLines.length > 0 ? (
        <div className={uiCx('mt-1 space-y-0.5 border-t border-black/5 pt-1', uiTypography.helper)}>
          {workerLines.slice(0, 3).map((line, idx) => (
            <div key={idx} className="line-clamp-1 text-[10px]">
              {line}
            </div>
          ))}
          {workerLines.length > 3 ? (
            <div className="text-[10px] opacity-70">+{workerLines.length - 3} more</div>
          ) : null}
        </div>
      ) : null}

      {compact && entry.shift_count > 0 ? (
        <div className={uiCx('mt-0.5 text-[9px] opacity-80')}>
          {entry.workers_visible
            ? `${entry.shift_count} shift${entry.shift_count === 1 ? '' : 's'}`
            : `${entry.shift_count} scheduled`}
        </div>
      ) : null}
    </button>
  );
}
