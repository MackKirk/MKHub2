import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getFleetHistoryEntryBadgeVariant } from '@/lib/fleetUi';
import {
  formatOffboardingActivityMessage,
  getOffboardingActivityMeta,
} from './offboardingUtils';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ActivityRow = {
  id: string;
  action: string;
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
  const hasItems = items.length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Activity history"
        description="Case edits, access changes, checklist updates, and asset actions (newest first)."
        {...appSectionPresetProps('notesHistory')}
      />

      <AppCard className="min-w-0" bodyClassName={hasItems && !isLoading ? uiSpacing.cardPadding : '!p-0'}>
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading activity…</div>
        ) : !hasItems ? (
          <AppEmptyState
            title="No activity recorded yet"
            className="border-0 bg-transparent p-0 py-6 shadow-none"
          />
        ) : (
          <div className={uiSpacing.sectionStack}>
            {items.map((row) => {
              const meta = getOffboardingActivityMeta(row.action);
              const message = formatOffboardingActivityMessage(
                row.action,
                row.details,
                row.action_label,
              );

              return (
                <div
                  key={row.id}
                  className={uiCx('rounded-r-lg border-l-4 py-2 pl-4', meta.borderClass)}
                >
                  <div className={uiCx(uiLayout.actionsRow, 'items-start justify-between gap-3')}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
                          {message}
                        </span>
                        <AppBadge variant={getFleetHistoryEntryBadgeVariant(meta.badge)}>
                          {meta.badge}
                        </AppBadge>
                      </div>
                      <p className={uiCx(uiTypography.helper, 'mt-1')}>
                        Performed by {row.performed_by_name || 'System'}
                      </p>
                    </div>
                    <p className={uiCx(uiTypography.body, 'shrink-0 text-right text-gray-500')}>
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AppCard>
    </div>
  );
}
