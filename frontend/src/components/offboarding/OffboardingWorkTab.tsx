import { Link } from 'react-router-dom';
import { AppCard } from '@/components/ui';
import type { OffboardingDetail } from './offboardingUtils';

export default function OffboardingWorkTab({ detail }: { detail: OffboardingDetail }) {
  const s = detail.operational_summary as Record<string, unknown>;
  const userId = detail.user_id;
  const projectRoles = (s.project_roles as { project_id: string; project_name: string; role: string }[]) || [];
  const shiftItems = (s.future_shift_items as { id: string; date?: string; project_id?: string }[]) || [];

  const sections = [
    {
      title: 'Future Dispatch Shifts',
      count: Number(s.future_shifts || 0),
      link: '/schedule',
      linkLabel: 'View Dispatch',
    },
    {
      title: 'Pending Timesheets',
      count: Number(s.pending_timesheets || 0),
      link: `/settings/attendance?worker_id=${encodeURIComponent(userId)}&status=pending`,
      linkLabel: 'View Timesheets',
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((sec) => (
        <AppCard key={sec.title} className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium text-gray-900">{sec.title}</div>
            <div className="text-2xl font-semibold">{sec.count}</div>
          </div>
          <Link className="text-sm text-brand-red hover:underline" to={sec.link}>
            {sec.linkLabel}
          </Link>
        </AppCard>
      ))}

      <AppCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium text-gray-900">Project Roles</div>
            <div className="text-sm text-gray-500">
              {Number(s.project_admin_roles || 0) + Number(s.onsite_lead_roles || 0)} role(s) to review
            </div>
          </div>
        </div>
        {projectRoles.length === 0 ? (
          <p className="text-sm text-gray-500">No project admin or on-site lead roles found.</p>
        ) : (
          <ul className="space-y-2">
            {projectRoles.map((p) => (
              <li key={`${p.project_id}-${p.role}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{p.project_name}</span>
                  <span className="text-gray-500"> — {p.role}</span>
                </span>
                <Link
                  className="text-brand-red hover:underline"
                  to={`/projects/${encodeURIComponent(p.project_id)}`}
                >
                  Reassign Project Role
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      {shiftItems.length > 0 ? (
        <AppCard className="p-4">
          <div className="font-medium mb-2">Upcoming shifts</div>
          <ul className="text-sm space-y-1 text-gray-700">
            {shiftItems.map((sh) => (
              <li key={sh.id}>
                {sh.date || '—'}
                {sh.project_id ? (
                  <>
                    {' — '}
                    <Link className="text-brand-red hover:underline" to={`/projects/${encodeURIComponent(sh.project_id)}`}>
                      View project
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </AppCard>
      ) : null}

      <AppCard className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">Safety Items</div>
          <div className="text-2xl font-semibold">{Number(s.safety_items || 0)}</div>
        </div>
        <Link className="text-sm text-brand-red hover:underline" to="/safety/inspections">
          View Safety
        </Link>
      </AppCard>

      <AppCard className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">Open Tasks</div>
          <div className="text-2xl font-semibold">{Number(s.open_tasks || 0)}</div>
        </div>
        <Link className="text-sm text-brand-red hover:underline" to="/tasks">
          View Tasks
        </Link>
      </AppCard>
    </div>
  );
}
