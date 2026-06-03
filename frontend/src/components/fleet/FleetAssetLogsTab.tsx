import {
  buildFleetHistoryDescription,
  buildFleetHistoryListSummary,
  fleetHistoryChangeDetailEligible,
} from '@/lib/fleetActivityLabels';
import {
  formatFleetHistoryPerformedBy,
  resolveFleetHistoryActor,
} from '@/lib/fleetHistoryActor';
import { getFleetHistoryEntryBadgeVariant } from '@/lib/fleetUi';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import type { FleetHistoryAuditDetailPayload } from '@/components/fleet/FleetHistoryAuditChangeModal';
import type { FleetAssignmentLogRecord } from '@/components/fleet/FleetAssignmentLogDetailModal';

export type FleetAssetHistoryItem = {
  id: string;
  source: 'assignment' | 'audit' | 'fleet_log';
  kind: string;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  occurred_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  assignment_id?: string | null;
  log_subtype?: 'assign' | 'return' | null;
  audit_action?: string | null;
  changes_json?: Record<string, unknown> | null;
  odometer_snapshot?: number | null;
  hours_snapshot?: number | null;
  entity_type?: string | null;
  entity_id?: string | null;
  audit_context?: Record<string, unknown> | null;
};

function historyEntryBorderClass(item: FleetAssetHistoryItem): string {
  const isAssignmentAudit =
    item.source === 'audit' && item.entity_type === 'asset_assignment' && !!item.entity_id;
  if (item.source === 'assignment' && item.kind === 'checkout') return 'border-brand-red';
  if (item.source === 'assignment' && item.kind === 'return') return 'border-sky-500';
  if (isAssignmentAudit && item.audit_action === 'CREATE') return 'border-brand-red';
  if (isAssignmentAudit && item.audit_action === 'UPDATE') return 'border-sky-500';
  if (item.source === 'audit') return 'border-amber-500';
  return 'border-gray-300';
}

function historyEntryBadge(item: FleetAssetHistoryItem): string {
  const isAssignmentAudit =
    item.source === 'audit' && item.entity_type === 'asset_assignment' && !!item.entity_id;
  if (item.source === 'assignment' && item.kind === 'checkout') return 'Check-out';
  if (item.source === 'assignment' && item.kind === 'return') return 'Return';
  if (isAssignmentAudit && item.audit_action === 'CREATE') return 'Check-out';
  if (isAssignmentAudit && item.audit_action === 'UPDATE') return 'Return';
  if (item.source === 'audit') return 'Change';
  return 'Log';
}

type Props = {
  historyItems: FleetAssetHistoryItem[];
  assignments: FleetAssignmentLogRecord[];
  onOpenAssignmentDetail: (
    assignment: FleetAssignmentLogRecord,
    logType: 'assignment' | 'return',
    performedBy: string | null,
  ) => void;
  onOpenAuditDetail: (detail: FleetHistoryAuditDetailPayload) => void;
};

export function FleetAssetLogsTab({
  historyItems,
  assignments,
  onOpenAssignmentDetail,
  onOpenAuditDetail,
}: Props) {
  const hasItems = historyItems.length > 0;

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Activity history"
        description="Check-outs and returns, edits to this asset, and other fleet log entries (newest first)."
        {...appSectionPresetProps('workload')}
      />

      <AppCard className="min-w-0" bodyClassName={hasItems ? uiSpacing.cardPadding : '!p-0'}>
        {!hasItems ? (
          <AppEmptyState
            title="No activity recorded yet"
            className="border-0 bg-transparent p-0 shadow-none"
          />
        ) : (
          <div className={uiSpacing.sectionStack}>
            {historyItems.map((item) => {
              const isAssignmentAudit =
                item.source === 'audit' &&
                item.entity_type === 'asset_assignment' &&
                !!item.entity_id;
              const assign =
                item.assignment_id && item.log_subtype
                  ? assignments.find((a) => a.id === item.assignment_id)
                  : isAssignmentAudit
                    ? (assignments.find((a) => a.id === item.entity_id) ?? null)
                    : null;
              const isSyntheticAssignRow =
                item.source === 'assignment' &&
                !!item.log_subtype &&
                (item.log_subtype === 'assign' || item.log_subtype === 'return');
              const openAssignDetail =
                !!assign &&
                (isSyntheticAssignRow ||
                  (isAssignmentAudit &&
                    (item.audit_action === 'CREATE' || item.audit_action === 'UPDATE')));
              const cj = item.changes_json;
              const openAuditDetailBase =
                item.source === 'audit' &&
                !!cj &&
                typeof cj === 'object' &&
                ('before' in cj || 'after' in cj || 'deleted' in cj || Object.keys(cj).length > 0) &&
                !(isAssignmentAudit && assign);
              const openAuditDetail =
                openAuditDetailBase && fleetHistoryChangeDetailEligible(item);
              const borderClass = historyEntryBorderClass(item);
              const clickable = openAssignDetail || !!openAuditDetail;
              const badge = historyEntryBadge(item);
              const summaryFull = buildFleetHistoryDescription(item);
              const summaryList =
                openAuditDetail && item.source === 'audit'
                  ? buildFleetHistoryListSummary(item)
                  : summaryFull;
              const performedBy = resolveFleetHistoryActor(item, historyItems);
              const performedByLabel = formatFleetHistoryPerformedBy(performedBy);

              const handleClick = () => {
                if (openAssignDetail && assign) {
                  if (isSyntheticAssignRow && item.log_subtype) {
                    onOpenAssignmentDetail(
                      assign,
                      item.log_subtype === 'assign' ? 'assignment' : 'return',
                      performedBy,
                    );
                  } else if (isAssignmentAudit) {
                    onOpenAssignmentDetail(
                      assign,
                      item.audit_action === 'UPDATE' ? 'return' : 'assignment',
                      performedBy,
                    );
                  }
                  return;
                }
                if (openAuditDetail) {
                  onOpenAuditDetail({
                    changes: cj as Record<string, unknown>,
                    entityType: item.entity_type ?? null,
                    auditAction: item.audit_action ?? null,
                    summary: summaryFull,
                    auditContext: item.audit_context ?? null,
                    performedBy,
                    occurredAt: item.occurred_at ?? null,
                  });
                }
              };

              return (
                <div
                  key={item.id}
                  className={uiCx(
                    'border-l-4 py-2 pl-4',
                    borderClass,
                    clickable && 'cursor-pointer rounded-r-lg transition-colors hover:bg-gray-50',
                  )}
                  onClick={clickable ? handleClick : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleClick();
                          }
                        }
                      : undefined
                  }
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
                          {summaryList}
                        </span>
                        <AppBadge variant={getFleetHistoryEntryBadgeVariant(badge)}>{badge}</AppBadge>
                      </div>
                      <div className={uiCx(uiTypography.helper, 'mt-1')}>
                        Performed by {performedByLabel}
                      </div>
                      {item.source === 'fleet_log' && item.odometer_snapshot != null && (
                        <div className={uiCx(uiTypography.helper, 'mt-1')}>
                          Odometer: {item.odometer_snapshot.toLocaleString()}
                        </div>
                      )}
                      {item.source === 'fleet_log' && item.hours_snapshot != null && (
                        <div className={uiCx(uiTypography.helper, 'mt-1')}>
                          Hours: {Number(item.hours_snapshot).toLocaleString()}
                        </div>
                      )}
                      {clickable && (
                        <div className={uiCx(uiTypography.helper, 'mt-1 text-brand-red')}>
                          {openAssignDetail
                            ? 'Click for assignment details'
                            : 'Click to view change details'}
                        </div>
                      )}
                    </div>
                    <div className={uiCx(uiTypography.body, 'shrink-0 text-right text-gray-500')}>
                      {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : '—'}
                    </div>
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
