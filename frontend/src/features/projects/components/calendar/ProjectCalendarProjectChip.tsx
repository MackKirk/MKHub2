import { AppBadge, AppTooltip, AppUserAvatar, uiCx, uiTypography } from '@/components/ui';
import type { ProjectCalendarDayEntry } from './projectCalendar.types';
import {
  aggregateShiftAck,
  formatTime12h,
  personToAvatarUser,
  statusChipStyle,
} from './projectCalendar.utils';

type Props = {
  entry: ProjectCalendarDayEntry;
  /** `true` = calendar cell; `dense` = single-line (small home widget). */
  compact?: boolean | 'dense';
  onOpen: () => void;
};

function AckCount({
  aggregate,
  size,
}: {
  aggregate: NonNullable<ReturnType<typeof aggregateShiftAck>>;
  size: 'sm' | 'md';
}) {
  const label = `${aggregate.acceptedCount}/${aggregate.total}`;
  return (
    <AppTooltip
      wrap
      followCursor
      content={
        <div className="space-y-0.5 text-left">
          {aggregate.people.map((person, idx) => (
            <div key={`${idx}-${person.name}`}>
              <span className="font-semibold">{person.name}</span>
              <span className="font-normal"> - {person.statusLabel}</span>
            </div>
          ))}
        </div>
      }
      placement="top"
      className="absolute right-0 top-0 z-[1]"
    >
      {/* Padding keeps hover stable on the small fraction text. */}
      <span
        className={uiCx(
          'flex items-start justify-end tabular-nums font-semibold opacity-80',
          size === 'sm' ? 'px-0.5 py-0.5 text-[9px] leading-none' : 'px-1 py-0.5 text-[10px] leading-none',
        )}
        aria-label={`${aggregate.acceptedCount} of ${aggregate.total} accepted`}
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </span>
    </AppTooltip>
  );
}

export function ProjectCalendarProjectChip({ entry, compact = false, onOpen }: Props) {
  const chipStyle = statusChipStyle(entry.status_color, entry.status_label);
  const isDense = compact === 'dense';
  const isCompact = compact === true || isDense;
  const ackAggregate =
    entry.workers_visible && entry.shift_count > 0 ? aggregateShiftAck(entry.shifts) : null;

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

  const denseLabel = entry.code || entry.name;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={uiCx(
        'relative w-full border text-left transition-[filter] hover:brightness-95',
        ackAggregate && (isDense ? 'pr-6' : 'pr-7'),
        isDense
          ? 'rounded px-1 py-0.5 text-[11px] leading-tight shadow-none'
          : uiCx('rounded-lg px-2 py-1.5 text-xs shadow-sm'),
      )}
      style={chipStyle}
      title={[
        entry.primary_division?.label ? `Division: ${entry.primary_division.label}` : null,
        ...titleParts,
        ...leadershipParts,
        ...workerLines,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {ackAggregate ? <AckCount aggregate={ackAggregate} size={isDense ? 'sm' : 'md'} /> : null}
      {isDense ? (
        <div className="flex min-w-0 items-center gap-0.5">
          <span className="min-w-0 flex-1 truncate font-semibold">{denseLabel}</span>
          {entry.appearance === 'shift_only' ? (
            <span className="shrink-0 text-[8px] font-semibold uppercase opacity-70">out</span>
          ) : null}
          {entry.shift_count > 0 ? (
            <span className="shrink-0 tabular-nums opacity-70">{entry.shift_count}</span>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                {entry.code ? (
                  <span className="font-semibold leading-snug">{entry.code}</span>
                ) : null}
                {entry.appearance === 'shift_only' ? (
                  <AppBadge variant="warning" className="!px-1 !py-0 !text-[8px] uppercase">
                    Outside dates
                  </AppBadge>
                ) : null}
              </div>
              <span className={uiCx('block line-clamp-2 font-semibold leading-snug', isCompact && 'line-clamp-1')}>
                {entry.name}
              </span>
              {!isCompact && entry.client_display_name ? (
                <span className="block line-clamp-1 text-xs opacity-80">{entry.client_display_name}</span>
              ) : null}
            </div>
          </div>

          {!isCompact && (entry.estimators.length || entry.project_admin || entry.onsite_leads.length) ? (
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

          {!isCompact && workerLines.length > 0 ? (
            <div className={uiCx('mt-1 space-y-0.5 border-t border-black/5 pt-1', uiTypography.helper)}>
              {workerLines.slice(0, 3).map((line, idx) => (
                <div key={idx} className="line-clamp-1 text-xs">
                  {line}
                </div>
              ))}
              {workerLines.length > 3 ? (
                <div className="text-xs opacity-70">+{workerLines.length - 3} more</div>
              ) : null}
            </div>
          ) : null}

          {isCompact && entry.shift_count > 0 ? (
            <div className={uiCx('mt-0.5 flex items-center gap-1.5 text-[11px] opacity-80')}>
              <span>
                {entry.workers_visible
                  ? `${entry.shift_count} shift${entry.shift_count === 1 ? '' : 's'}`
                  : `${entry.shift_count} scheduled`}
              </span>
            </div>
          ) : null}
        </>
      )}
    </button>
  );
}
