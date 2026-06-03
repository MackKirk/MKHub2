import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { WORK_ORDER_STATUS_LABELS } from '@/lib/fleetBadges';
import { getFleetHistoryEntryBadgeVariant } from '@/lib/fleetUi';
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

const EM_DASH = '—';

type ActivityLogEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string | null;
  created_by: string | null;
  created_by_display: string | null;
};

function formatActivityMessage(entry: ActivityLogEntry): string {
  const d = entry.details || {};
  switch (entry.action) {
    case 'work_order_created_from_inspection':
      return `Created automatically from ${String(d.inspection_type ?? 'inspection')} inspection`;
    case 'work_order_created':
      return `Work order created (${String(d.work_order_number ?? 'N/A')})`;
    case 'work_order_updated':
      if (Array.isArray(d.changed_fields) && d.changed_fields.length > 0) {
        return `Updated fields: ${d.changed_fields.join(', ')}`;
      }
      return 'Work order details updated';
    case 'assignment_changed':
      return 'Assignment updated';
    case 'check_in':
      return 'Check-in recorded';
    case 'check_out':
      return 'Check-out recorded';
    case 'work_order_reopened':
      return `Work order reopened to ${WORK_ORDER_STATUS_LABELS[String(d.new_status ?? 'open')] ?? String(d.new_status ?? 'pending')}`;
    case 'file_updated':
      return 'File metadata updated';
    case 'file_attached':
      return `Attached file "${d.original_name ?? 'file'}" to ${String(d.category ?? '').toLowerCase()}`;
    case 'file_removed':
      return `Removed file "${d.original_name ?? d.file_object_id ?? 'file'}" from ${String(d.category ?? '').toLowerCase()}`;
    case 'status_changed': {
      const oldL = WORK_ORDER_STATUS_LABELS[d.old_status as string] ?? d.old_status;
      const newL = WORK_ORDER_STATUS_LABELS[d.new_status as string] ?? d.new_status;
      return `Status changed from ${oldL} to ${newL}${d.reason ? ` (${String(d.reason)})` : ''}`;
    }
    case 'cost_added':
      return `Added cost: ${d.description ?? EM_DASH} (${d.category}) $${Number(d.amount ?? 0).toFixed(2)}`;
    case 'cost_removed':
      return `Removed cost: ${d.description ?? EM_DASH} (${d.category}) $${Number(d.amount ?? 0).toFixed(2)}`;
    default:
      return entry.action;
  }
}

function getWorkOrderActivityMeta(action: string): { borderClass: string; badge: string } {
  switch (action) {
    case 'work_order_created_from_inspection':
      return { borderClass: 'border-brand-red', badge: 'Inspection' };
    case 'work_order_created':
      return { borderClass: 'border-brand-red', badge: 'Created' };
    case 'work_order_updated':
      return { borderClass: 'border-sky-500', badge: 'Updated' };
    case 'assignment_changed':
      return { borderClass: 'border-indigo-500', badge: 'Assignment' };
    case 'check_in':
      return { borderClass: 'border-cyan-500', badge: 'Check-in' };
    case 'check_out':
      return { borderClass: 'border-violet-500', badge: 'Check-out' };
    case 'work_order_reopened':
      return { borderClass: 'border-amber-500', badge: 'Reopened' };
    case 'file_updated':
      return { borderClass: 'border-blue-500', badge: 'File update' };
    case 'status_changed':
      return { borderClass: 'border-amber-500', badge: 'Status' };
    case 'file_attached':
      return { borderClass: 'border-brand-red', badge: 'Attachment' };
    case 'file_removed':
      return { borderClass: 'border-rose-500', badge: 'Removal' };
    case 'cost_added':
      return { borderClass: 'border-emerald-500', badge: 'Cost added' };
    case 'cost_removed':
      return { borderClass: 'border-orange-500', badge: 'Cost removed' };
    default:
      return { borderClass: 'border-gray-300', badge: 'Log' };
  }
}

type Props = {
  workOrderId: string;
};

export function WorkOrderActivityTab({ workOrderId }: Props) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['workOrderActivity', workOrderId],
    queryFn: () => api<ActivityLogEntry[]>('GET', `/fleet/work-orders/${workOrderId}/activity`),
    enabled: !!workOrderId,
  });

  const hasItems = activity.length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Activity history"
        description="File attachments, status changes, and cost updates (newest first)."
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
            {activity.map((entry) => {
              const meta = getWorkOrderActivityMeta(entry.action);
              return (
                <div
                  key={entry.id}
                  className={uiCx('rounded-r-lg border-l-4 py-2 pl-4', meta.borderClass)}
                >
                  <div className={uiCx(uiLayout.actionsRow, 'items-start justify-between gap-3')}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
                          {formatActivityMessage(entry)}
                        </span>
                        <AppBadge variant={getFleetHistoryEntryBadgeVariant(meta.badge)}>{meta.badge}</AppBadge>
                      </div>
                      <p className={uiCx(uiTypography.helper, 'mt-1')}>
                        By {entry.created_by_display ?? 'System'}
                      </p>
                    </div>
                    <p className={uiCx(uiTypography.body, 'shrink-0 text-right text-gray-500')}>
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : EM_DASH}
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
