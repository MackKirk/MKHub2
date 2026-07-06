import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { fmtDateTime } from './offboardingUtils';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type ChecklistRow = {
  item_key: string;
  label: string;
  is_auto: boolean;
  is_completed: boolean;
  is_not_applicable: boolean;
  completed_at?: string | null;
  completed_by_name?: string | null;
};

export default function OffboardingChecklistTab({
  caseId,
  canEdit,
  status,
}: {
  caseId: string;
  canEdit: boolean;
  status: string;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['offboarding-checklist', caseId],
    queryFn: () => api<{ items: ChecklistRow[] }>('GET', `/offboarding/${encodeURIComponent(caseId)}/checklist`),
  });

  const items = data?.items || [];
  const hasItems = items.length > 0;

  const toggle = async (item: ChecklistRow) => {
    if (!canEdit || item.is_auto || status !== 'in_progress') return;
    try {
      await api('PATCH', `/offboarding/${encodeURIComponent(caseId)}/checklist/${encodeURIComponent(item.item_key)}`, {
        completed: !item.is_completed,
      });
      queryClient.invalidateQueries({ queryKey: ['offboarding-checklist', caseId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update checklist');
    }
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Offboarding checklist"
        description="Required and optional steps to close out the employee departure."
        {...appSectionPresetProps('documents')}
      />

      <AppCard className="min-w-0" bodyClassName={hasItems && !isLoading ? uiSpacing.cardPadding : '!p-0'}>
        {isLoading ? (
          <div className={uiCx(uiTypography.helper, 'px-4 py-8 text-center')}>Loading checklist…</div>
        ) : !hasItems ? (
          <AppEmptyState
            title="Checklist not available yet"
            className="border-0 bg-transparent p-0 py-6 shadow-none"
          />
        ) : (
          <div className={uiSpacing.sectionStack}>
            {items.map((item) => (
              <div
                key={item.item_key}
                className={uiCx(
                  uiLayout.actionsRow,
                  'flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4',
                )}
              >
                <div className="min-w-0 space-y-1">
                  <div className={uiTypography.sectionTitle}>{item.label}</div>
                  {item.completed_at ? (
                    <div className={uiTypography.helper}>
                      {item.is_auto ? 'Auto-completed' : `Completed by ${item.completed_by_name || '—'}`}
                      {' · '}
                      {fmtDateTime(item.completed_at)}
                    </div>
                  ) : item.is_auto ? (
                    <div className={uiTypography.helper}>Automatic</div>
                  ) : null}
                </div>
                <div className={uiCx(uiLayout.actionsRow, 'items-center gap-2')}>
                  {item.is_not_applicable ? (
                    <AppBadge variant="neutral">Not Applicable</AppBadge>
                  ) : item.is_completed ? (
                    <AppBadge variant="success">Done</AppBadge>
                  ) : (
                    <AppBadge variant="warning">Pending</AppBadge>
                  )}
                  {!item.is_auto && canEdit && status === 'in_progress' ? (
                    <AppButton size="sm" variant="secondary" onClick={() => toggle(item)}>
                      {item.is_completed ? 'Reopen' : 'Mark Done'}
                    </AppButton>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>
    </div>
  );
}
