import { Link } from 'react-router-dom';
import { AppCard } from '@/components/ui';
import { HubAccessBadge } from './OffboardingStatusBadge';
import type { OffboardingDetail } from './offboardingUtils';

export default function OffboardingOverviewTab({ detail }: { detail: OffboardingDetail }) {
  const s = detail.operational_summary as Record<string, number>;
  const caseId = detail.id;
  const userId = detail.user_id;

  const cards = [
    {
      label: 'Assets Pending Return',
      count: s.assets_pending_return || 0,
      action: 'View Assets',
      to: `/human-resources/offboarding/${encodeURIComponent(caseId)}?tab=assets`,
    },
    {
      label: 'Future Shifts',
      count: s.future_shifts || 0,
      action: 'View Dispatch',
      to: '/schedule',
    },
    {
      label: 'Pending Timesheets',
      count: s.pending_timesheets || 0,
      action: 'View Timesheets',
      to: `/settings/attendance?worker_id=${encodeURIComponent(userId)}&status=pending`,
    },
    {
      label: 'Project Roles to Review',
      count: (s.project_admin_roles || 0) + (s.onsite_lead_roles || 0),
      action: 'View Projects',
      to: `/human-resources/offboarding/${encodeURIComponent(caseId)}?tab=work`,
    },
    {
      label: 'Safety Items',
      count: s.safety_items || 0,
      action: 'View Safety',
      to: '/safety/inspections',
    },
    {
      label: 'Open Tasks',
      count: s.open_tasks || 0,
      action: 'View Tasks',
      to: '/tasks',
    },
  ];

  return (
    <div className="space-y-4">
      <AppCard className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">Hub Access</div>
          <HubAccessBadge active={detail.hub_access_active} />
        </div>
        <Link
          className="text-sm text-brand-red hover:underline"
          to={`/users/${encodeURIComponent(userId)}`}
        >
          View Employee Profile
        </Link>
      </AppCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <AppCard key={c.label} className="p-4 flex flex-col gap-2">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="text-2xl font-semibold text-gray-900">{c.count}</div>
            <Link className="text-sm text-brand-red hover:underline" to={c.to}>
              {c.action}
            </Link>
          </AppCard>
        ))}
      </div>
    </div>
  );
}
