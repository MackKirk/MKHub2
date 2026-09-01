import { CalendarOff, Clock, User, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AppBadge,
  AppButton,
  AppModal,
  AppSectionHeader,
  AppUserAvatar,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import type { ProjectCalendarDayEntry, ProjectCalendarOnsiteLead, ProjectCalendarPerson } from './projectCalendar.types';
import { formatShiftTimeRange, personToAvatarUser } from './projectCalendar.utils';

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
      <div className={uiCx(uiTypography.overline, 'mb-1.5')}>{label}</div>
      {person?.name ? (
        <div className="flex items-center gap-2">
          <AppUserAvatar user={personToAvatarUser(person)} size="sm" />
          <span className="truncate text-sm text-gray-800">{person.name}</span>
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

function ModalMeta({ entry, dateLabel }: { entry: ProjectCalendarDayEntry; dateLabel: string | null }) {
  const metaLine = [entry.client_display_name, dateLabel].filter(Boolean).join(' · ');

  return (
    <div className={uiCx(uiLayout.stack, 'gap-1.5')}>
      <div className="flex flex-wrap items-center gap-2">
        {entry.code ? <span className={uiTypography.helper}>{entry.code}</span> : null}
        {entry.status_label ? (
          <AppBadge variant={getProjectStatusBadgeVariant(entry.status_label)}>{entry.status_label}</AppBadge>
        ) : null}
        {entry.appearance === 'shift_only' ? (
          <AppBadge variant="warning">Outside project dates</AppBadge>
        ) : null}
      </div>
      {metaLine ? <p className="text-sm text-gray-600">{metaLine}</p> : null}
    </div>
  );
}

function ScheduledWorkersSection({ entry }: { entry: ProjectCalendarDayEntry }) {
  if (entry.shift_count === 0) {
    return (
      <div
        className={uiCx(
          'flex items-start gap-3 px-4 py-4',
          uiRadius.control,
          uiBorders.subtle,
          'bg-gray-50/90',
        )}
      >
        <span
          className={uiCx(
            'flex h-9 w-9 shrink-0 items-center justify-center bg-white text-gray-400',
            uiRadius.control,
            uiBorders.subtle,
          )}
        >
          <CalendarOff className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-medium text-gray-800">No workers scheduled</p>
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
          'flex items-start gap-3 px-4 py-4',
          uiRadius.control,
          uiBorders.subtle,
          'bg-gray-50/90',
        )}
      >
        <span
          className={uiCx(
            'flex h-9 w-9 shrink-0 items-center justify-center bg-white text-gray-500',
            uiRadius.control,
            uiBorders.subtle,
          )}
        >
          <Users className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-medium text-gray-800">
            {entry.shift_count} worker{entry.shift_count === 1 ? '' : 's'} scheduled
          </p>
          <p className={uiCx('mt-0.5', uiTypography.helper)}>
            Shift details are hidden — workload read permission required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className={uiCx('divide-y divide-gray-100 overflow-hidden border bg-white', uiBorders.subtle, uiRadius.control)}>
      {entry.shifts.map((shift) => {
          const timeRange = formatShiftTimeRange(shift.start_time, shift.end_time);
          return (
            <li key={shift.id} className="flex items-center justify-between gap-3 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <AppUserAvatar
                  user={{
                    id: shift.worker_id,
                    name: shift.worker_name ?? undefined,
                  }}
                  size="sm"
                />
                <span className="truncate text-sm font-medium text-gray-900">
                  {shift.worker_name || 'Worker'}
                </span>
              </div>
              {timeRange ? (
                <span
                  className={uiCx(
                    'inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium tabular-nums text-gray-700',
                  )}
                >
                  <Clock className="h-3 w-3 opacity-60" aria-hidden />
                  {timeRange}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
  );
}

export function ProjectCalendarProjectModal({ open, entry, date, detailBasePath, onClose }: Props) {
  const navigate = useNavigate();

  if (!entry) return null;

  const dateLabel = date
    ? date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const openProject = () => {
    const suffix = entry.shift_count > 0 ? '?tab=dispatch' : '';
    navigate(`${detailBasePath}/${entry.project_id}${suffix}`);
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="lg"
      title={entry.name}
      description={<ModalMeta entry={entry} dateLabel={dateLabel} />}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" onClick={onClose}>
            Close
          </AppButton>
          <AppButton type="button" onClick={openProject}>
            Open project
          </AppButton>
        </div>
      }
    >
      <div className={uiCx(uiLayout.stack, 'gap-0')}>
        <section className="pb-2">
          <AppSectionHeader
            {...appSectionPresetProps('team')}
            title="Leadership"
            description="Project roles for this job."
            className="mb-4"
          />
          <div className="grid gap-4 sm:grid-cols-2">
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

        <section className={uiCx('mt-8 border-t border-gray-100 pt-8')}>
          <AppSectionHeader
            {...appSectionPresetProps('workload')}
            title="Scheduled workers"
            description={
              entry.shift_count > 0
                ? `${entry.shift_count} shift${entry.shift_count === 1 ? '' : 's'} on this day`
                : 'No shifts assigned for this day'
            }
            className="mb-4"
          />
          <ScheduledWorkersSection entry={entry} />
        </section>
      </div>
    </AppModal>
  );
}
