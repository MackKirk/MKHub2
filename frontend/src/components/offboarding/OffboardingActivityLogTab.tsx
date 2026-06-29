import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fmtDateTime } from './offboardingUtils';
import { AppCard, AppEmptyState } from '@/components/ui';

type ActivityRow = {
  id: string;
  action_label: string;
  created_at: string;
  performed_by_name?: string | null;
  details?: Record<string, unknown>;
};

export default function OffboardingActivityLogTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['offboarding-activity', caseId],
    queryFn: () =>
      api<{ items: ActivityRow[] }>('GET', `/offboarding/${encodeURIComponent(caseId)}/activity-log`),
  });

  const items = data?.items || [];

  if (isLoading) return <div className="text-sm text-gray-500 p-4">Loading activity…</div>;
  if (!items.length) return <AppEmptyState title="No activity recorded yet" />;

  return (
    <div className="space-y-3">
      {items.map((row) => (
        <AppCard key={row.id} className="p-4">
          <div className="font-medium text-gray-900">{row.action_label}</div>
          <div className="text-sm text-gray-500 mt-1">{fmtDateTime(row.created_at)}</div>
          <div className="text-sm text-gray-600 mt-1">Performed by: {row.performed_by_name || 'System'}</div>
          {row.details && Object.keys(row.details).length > 0 ? (
            <pre className="mt-2 text-xs bg-gray-50 rounded p-2 overflow-x-auto text-gray-700">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          ) : null}
        </AppCard>
      ))}
    </div>
  );
}
