import { Link } from 'react-router-dom';
import type { OffboardingDetail } from './offboardingUtils';
import {
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

function SummaryCard({
  label,
  count,
  actionLabel,
  to,
}: {
  label: string;
  count: number;
  actionLabel: string;
  to: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
      <div>
        <div className={uiTypography.helper}>{label}</div>
        <div className="mt-1 text-2xl font-bold text-gray-900">{count}</div>
      </div>
      <Link to={to} className={uiCx(uiTypography.helper, 'text-brand-red hover:underline')}>
        {actionLabel}
      </Link>
    </div>
  );
}

export default function OffboardingOverviewTab({ detail }: { detail: OffboardingDetail }) {
  const s = detail.operational_summary as Record<string, number>;
  const caseId = detail.id;
  const userId = detail.user_id;

  const cards = [
    {
      label: 'Assets Pending Return',
      count: s.assets_pending_return || 0,
      actionLabel: 'View assets',
      to: `/human-resources/offboarding/${encodeURIComponent(caseId)}?tab=assets`,
    },
    {
      label: 'Future Shifts',
      count: s.future_shifts || 0,
      actionLabel: 'View dispatch',
      to: '/schedule',
    },
    {
      label: 'Pending Timesheets',
      count: s.pending_timesheets || 0,
      actionLabel: 'View timesheets',
      to: `/settings/attendance?worker_id=${encodeURIComponent(userId)}&status=pending`,
    },
    {
      label: 'Project Roles to Review',
      count: (s.project_admin_roles || 0) + (s.onsite_lead_roles || 0),
      actionLabel: 'View work items',
      to: `/human-resources/offboarding/${encodeURIComponent(caseId)}?tab=work`,
    },
    {
      label: 'Safety Items',
      count: s.safety_items || 0,
      actionLabel: 'View safety',
      to: '/safety/inspections',
    },
    {
      label: 'Open Tasks',
      count: s.open_tasks || 0,
      actionLabel: 'View tasks',
      to: '/tasks',
    },
  ];

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Operational summary"
        description="Counts of open items tied to this employee. Use the links to review each area."
        {...appSectionPresetProps('workload')}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <SummaryCard key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
