import { CalendarOff, Clock, MapPin, User, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AppBadge,
  AppButton,
  AppModal,
  AppSectionHeader,
  AppTooltip,
  AppUserAvatar,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import { shiftAckMeta, shiftAckTracked } from '@/lib/shiftAck';
import type {
  ProjectCalendarDayEntry,
  ProjectCalendarOnsiteLead,
  ProjectCalendarPerson,
  ProjectCalendarShift,
} from './projectCalendar.types';
import {
  divisionSwatchColor,
  formatShiftTimeRange,
  personToAvatarUser,
} from './projectCalendar.utils';

type CalendarShiftGroup =
  | { kind: 'solo'; shift: ProjectCalendarShift }
  | { kind: 'crew'; crewGroupId: string; shifts: ProjectCalendarShift[] };

function groupProjectCalendarShifts(shifts: ProjectCalendarShift[]): CalendarShiftGroup[] {
  const list = Array.isArray(shifts) ? shifts : [];
  const seen = new Set<string>();
  const items: CalendarShiftGroup[] = [];

  for (const shift of list) {
    const gid = shift.crew_group_id ? String(shift.crew_group_id) : '';
    if (!gid) {
      items.push({ kind: 'solo', shift });
      continue;
    }
    if (seen.has(gid)) continue;
    seen.add(gid);
    const members = list
      .filter((s) => String(s.crew_group_id || '') === gid)
      .slice()
      .sort((a, b) => {
        if (a.crew_role === 'lead' && b.crew_role !== 'lead') return -1;
        if (b.crew_role === 'lead' && a.crew_role !== 'lead') return 1;
        return 0;
      });
    if (members.length >= 2) {
      items.push({ kind: 'crew', crewGroupId: gid, shifts: members });
    } else if (members[0]) {
      items.push({ kind: 'solo', shift: members[0] });
    }
  }

  return items;
}

function heroTintClass(statusLabel?: string | null, appearance?: string | null): string {
  if (appearance === 'shift_only') return 'border-amber-200 bg-amber-50/90';
  const s = String(statusLabel || '')
    .trim()
    .toLowerCase();
  if (s === 'in progress' || s === 'on progress' || s === 'active' || s === 'ongoing') {
    return 'border-green-200 bg-green-50/90';
  }
  if (s === 'on hold') return 'border-amber-200 bg-amber-50/90';
  if (s === 'finished') return 'border-gray-200 bg-slate-50';
  if (s === 'cancelled' || s === 'canceled') return 'border-red-200 bg-red-50/80';
  return 'border-gray-200 bg-gray-50/90';
}

function ackSummary(shifts: ProjectCalendarShift[]): string | null {
  let accepted = 0;
  let pending = 0;
  let declined = 0;
  let seen = 0;
  for (const shift of shifts) {
    if (!shiftAckTracked(shift.ack_status)) continue;
    const s = (shift.ack_status || 'pending').toLowerCase();
    if (s === 'accepted') accepted += 1;
    else if (s === 'declined') declined += 1;
    else if (s === 'viewed') seen += 1;
    else pending += 1;
  }
  const parts: string[] = [];
  if (accepted) parts.push(`${accepted} accepted`);
  if (pending) parts.push(`${pending} pending`);
  if (seen) parts.push(`${seen} seen`);
  if (declined) parts.push(`${declined} declined`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

type Props = {
  open: boolean;
  entry: ProjectCalendarDayEntry | null;
  date: Date | null;
  detailBasePath: string;
  onClose: () => void;
};

function PersonRow({ label, person }: { label: string; person?: ProjectCalendarPerson | null }) {
  return (
    <div className="min-w-0">
      <div className={uiCx(uiTypography.overline, 'mb-1')}>{label}</div>
      {person?.name ? (
        <div className="flex items-center gap-2">
          <AppUserAvatar user={personToAvatarUser(person)} size="sm" />
          <span className="truncate text-sm font-medium text-gray-800">{person.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-sm text-gray-400">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Unassigned</span>
        </div>
      )}
    </div>
  );
}

function OnsiteLeadRow({ lead }: { lead: ProjectCalendarOnsiteLead }) {
  const label = lead.division_label ? `On-site lead (${lead.division_label})` : 'On-site lead';
  return <PersonRow label={label} person={lead} />;
}

function ModalHero({ entry, dateLabel }: { entry: ProjectCalendarDayEntry; dateLabel: string | null }) {
  const metaLine = [entry.client_display_name, dateLabel].filter(Boolean).join(' · ');
  const divisions = Array.isArray(entry.divisions) ? entry.divisions : [];

  return (
    <div className="space-y-3">
      <div
        className={uiCx(
          'rounded-xl border px-3.5 py-3',
          heroTintClass(entry.status_label, entry.appearance),
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {entry.code ? (
            <span className="text-sm font-semibold tabular-nums text-gray-800">{entry.code}</span>
          ) : null}
          {entry.status_label ? (
            <AppBadge variant={getProjectStatusBadgeVariant(entry.status_label)}>
              {entry.status_label}
            </AppBadge>
          ) : null}
          {entry.appearance === 'shift_only' ? (
            <AppBadge variant="warning">Outside project dates</AppBadge>
          ) : null}
          {entry.shift_count > 0 ? (
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-gray-700 ring-1 ring-inset ring-gray-200/80">
              {entry.shift_count} shift{entry.shift_count === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {metaLine ? <p className="mt-1.5 text-sm text-gray-700">{metaLine}</p> : null}
        {entry.address?.trim() ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-gray-700">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
            <span className="min-w-0">{entry.address.trim()}</span>
          </p>
        ) : null}
      </div>

      <div>
        <div className={uiCx(uiTypography.overline, 'mb-1.5')}>Divisions</div>
        {divisions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {divisions.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-800"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: divisionSwatchColor(d.color, d.id) }}
                  aria-hidden
                />
                {d.label}
              </span>
            ))}
          </div>
        ) : (
          <p className={uiCx(uiTypography.helper, 'text-gray-500')}>No divisions set</p>
        )}
      </div>
    </div>
  );
}

function ScheduledWorkersSection({ entry }: { entry: ProjectCalendarDayEntry }) {
  if (entry.shift_count === 0) {
    return (
      <div
        className={uiCx(
          'flex items-start gap-3 px-3.5 py-3.5',
          uiRadius.control,
          uiBorders.subtle,
          'bg-gray-50/90',
        )}
      >
        <span
          className={uiCx(
            'flex h-8 w-8 shrink-0 items-center justify-center bg-white text-gray-400',
            uiRadius.control,
            uiBorders.subtle,
          )}
        >
          <CalendarOff className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-gray-800">No workers scheduled</p>
          <p className={uiCx('mt-0.5', uiTypography.helper)}>
            This project is active on this day, but no workload shifts are assigned yet.
          </p>
        </div>
      </div>
    );
  }

  if (!entry.workers_visible) {
    return (
      <div
        className={uiCx(
          'flex items-start gap-3 px-3.5 py-3.5',
          uiRadius.control,
          uiBorders.subtle,
          'bg-gray-50/90',
        )}
      >
        <span
          className={uiCx(
            'flex h-8 w-8 shrink-0 items-center justify-center bg-white text-gray-500',
            uiRadius.control,
            uiBorders.subtle,
          )}
        >
          <Users className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-gray-800">
            {entry.shift_count} worker{entry.shift_count === 1 ? '' : 's'} scheduled
          </p>
          <p className={uiCx('mt-0.5', uiTypography.helper)}>
            Shift details are hidden — workload read permission required.
          </p>
        </div>
      </div>
    );
  }

  const renderShiftRow = (shift: ProjectCalendarShift) => {
    const timeRange = formatShiftTimeRange(shift.start_time, shift.end_time);
    const ack = shiftAckTracked(shift.ack_status) ? shiftAckMeta(shift.ack_status) : null;
    const jobName = shift.job_name?.trim() || null;

    return (
      <li key={shift.id} className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {ack ? (
            <AppTooltip content={ack.longLabel} placement="top">
              <span
                className={uiCx(
                  'h-2 w-2 shrink-0 rounded-full ring-1 ring-white/90',
                  ack.dotClass,
                )}
                aria-label={ack.longLabel}
              />
            </AppTooltip>
          ) : null}
          <AppUserAvatar
            user={{
              id: shift.worker_id,
              name: shift.worker_name ?? undefined,
            }}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-gray-900">
                {shift.worker_name || 'Worker'}
              </span>
              {shift.crew_role === 'lead' ? (
                <AppBadge variant="info" className="shrink-0 normal-case !px-1.5 !py-0 !text-[10px]">
                  Lead
                </AppBadge>
              ) : null}
            </div>
            {jobName ? (
              <div className="truncate text-xs text-gray-500">{jobName}</div>
            ) : null}
          </div>
        </div>
        {timeRange ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700">
            <Clock className="h-3 w-3 opacity-60" aria-hidden />
            {timeRange}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-2">
      {groupProjectCalendarShifts(entry.shifts).map((item) => {
        if (item.kind === 'crew') {
          return (
            <div
              key={`crew-${item.crewGroupId}`}
              className={uiCx(
                'overflow-hidden border bg-slate-50/80',
                uiBorders.subtle,
                uiRadius.control,
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3.5 py-1.5">
                <span className={uiCx(uiTypography.overline, 'text-slate-600')}>
                  Crew · {item.shifts.length}{' '}
                  {item.shifts.length === 1 ? 'person' : 'people'}
                </span>
              </div>
              <ul className="divide-y divide-gray-100 bg-white">{item.shifts.map(renderShiftRow)}</ul>
            </div>
          );
        }
        return (
          <ul
            key={item.shift.id}
            className={uiCx(
              'overflow-hidden border bg-white',
              uiBorders.subtle,
              uiRadius.control,
            )}
          >
            {renderShiftRow(item.shift)}
          </ul>
        );
      })}
    </div>
  );
}

export function ProjectCalendarProjectModal({ open, entry, date, detailBasePath, onClose }: Props) {
  const navigate = useNavigate();

  if (!entry) return null;

  const dateLabel = date
    ? date.toLocaleDateString('en-CA', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const openProject = () => {
    navigate(`${detailBasePath}/${entry.project_id}`);
    onClose();
  };

  const openWorkload = () => {
    navigate(`${detailBasePath}/${entry.project_id}?tab=dispatch`);
    onClose();
  };

  const summary =
    entry.workers_visible && entry.shift_count > 0 ? ackSummary(entry.shifts) : null;
  const workersDescription =
    entry.shift_count > 0
      ? [
          `${entry.shift_count} shift${entry.shift_count === 1 ? '' : 's'} on this day`,
          summary,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'No shifts assigned for this day';

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      headerContent={
        <AppSectionHeader
          {...appSectionPresetProps('projects')}
          title={entry.name}
          description="Project details for this calendar day."
          className="min-w-0"
        />
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-end')}>
          <AppButton type="button" variant="secondary" onClick={onClose}>
            Close
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={openWorkload}>
            Open workload
          </AppButton>
          <AppButton type="button" onClick={openProject}>
            Open project
          </AppButton>
        </div>
      }
    >
      <div className="space-y-6">
        <ModalHero entry={entry} dateLabel={dateLabel} />

        <section className="border-t border-gray-100 pt-5">
          <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Leadership</div>
          <p className={uiCx(uiTypography.helper, 'mb-3 text-gray-500')}>
            Project roles for this job.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {entry.estimators.length > 0 ? (
              entry.estimators.map((est, idx) => (
                <PersonRow
                  key={est.id}
                  label={entry.estimators.length > 1 ? `Estimator ${idx + 1}` : 'Estimator'}
                  person={est}
                />
              ))
            ) : (
              <PersonRow label="Estimator" person={null} />
            )}
            <PersonRow label="Project admin" person={entry.project_admin} />
            {entry.onsite_leads.length > 0 ? (
              entry.onsite_leads.map((lead) => <OnsiteLeadRow key={lead.id} lead={lead} />)
            ) : (
              <PersonRow label="On-site lead" person={null} />
            )}
          </div>
        </section>

        <section className="border-t border-gray-100 pt-5">
          <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Scheduled workers</div>
          <p className={uiCx(uiTypography.helper, 'mb-3 text-gray-500')}>{workersDescription}</p>
          <ScheduledWorkersSection entry={entry} />
        </section>
      </div>
    </AppModal>
  );
}
