import { Link } from 'react-router-dom';
import type { OffboardingDetail } from './offboardingUtils';
import {
  AppCard,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

function WorkSection({
  title,
  count,
  link,
  linkLabel,
  children,
}: {
  title: string;
  count: number;
  link: string;
  linkLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-start justify-between gap-3')}>
        <div>
          <div className={uiTypography.sectionTitle}>{title}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{count}</div>
        </div>
        <Link to={link} className={uiCx(uiTypography.helper, 'text-brand-red hover:underline')}>
          {linkLabel}
        </Link>
      </div>
      {children ? <div className="mt-4 border-t border-gray-100 pt-4">{children}</div> : null}
    </div>
  );
}

export default function OffboardingWorkTab({ detail }: { detail: OffboardingDetail }) {
  const s = detail.operational_summary as Record<string, unknown>;
  const userId = detail.user_id;
  const projectRoles = (s.project_roles as { project_id: string; project_name: string; role: string }[]) || [];
  const shiftItems = (s.future_shift_items as { id: string; date?: string; project_id?: string }[]) || [];

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Work and assignments"
        description="Dispatch, timesheets, project roles, safety, and tasks that may need reassignment before completion."
        {...appSectionPresetProps('projects')}
      />

      <AppCard className="min-w-0">
        <div className={uiSpacing.sectionStack}>
          <WorkSection
            title="Future dispatch shifts"
            count={Number(s.future_shifts || 0)}
            link="/schedule"
            linkLabel="View dispatch"
          />

          <WorkSection
            title="Pending timesheets"
            count={Number(s.pending_timesheets || 0)}
            link={`/settings/attendance?worker_id=${encodeURIComponent(userId)}&status=pending`}
            linkLabel="View timesheets"
          />

          <WorkSection
            title="Project roles"
            count={Number(s.project_admin_roles || 0) + Number(s.onsite_lead_roles || 0)}
            link={`/human-resources/offboarding/${encodeURIComponent(detail.id)}?tab=work`}
            linkLabel="Review roles"
          >
            {projectRoles.length === 0 ? (
              <p className={uiTypography.helper}>No project admin or on-site lead roles found.</p>
            ) : (
              <ul className={uiSpacing.sectionStack}>
                {projectRoles.map((p) => (
                  <li
                    key={`${p.project_id}-${p.role}`}
                    className={uiCx(uiLayout.actionsRow, 'flex-wrap items-center justify-between gap-2')}
                  >
                    <span className={uiTypography.body}>
                      <span className="font-medium text-gray-900">{p.project_name}</span>
                      <span className="text-gray-500"> — {p.role}</span>
                    </span>
                    <Link
                      className={uiCx(uiTypography.helper, 'text-brand-red hover:underline')}
                      to={`/projects/${encodeURIComponent(p.project_id)}`}
                    >
                      Reassign project role
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </WorkSection>

          {shiftItems.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <div className={uiTypography.sectionTitle}>Upcoming shifts</div>
              <ul className={uiCx('mt-3', uiSpacing.sectionStack, uiTypography.helper)}>
                {shiftItems.map((sh) => (
                  <li key={sh.id}>
                    {sh.date || '—'}
                    {sh.project_id ? (
                      <>
                        {' — '}
                        <Link
                          className="text-brand-red hover:underline"
                          to={`/projects/${encodeURIComponent(sh.project_id)}`}
                        >
                          View project
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <WorkSection
            title="Safety items"
            count={Number(s.safety_items || 0)}
            link="/safety/inspections"
            linkLabel="View safety"
          />

          <WorkSection
            title="Open tasks"
            count={Number(s.open_tasks || 0)}
            link="/tasks"
            linkLabel="View tasks"
          />
        </div>
      </AppCard>
    </div>
  );
}
