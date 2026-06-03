import { useMemo } from 'react';
import {
  buildFleetAuditChangeRows,
  formatFleetAuditActionVerb,
  formatFleetAuditEntityTitle,
  isFleetAuditDeleteOnlyChanges,
} from '@/lib/fleetActivityLabels';
import { formatFleetHistoryPerformedBy } from '@/lib/fleetHistoryActor';
import { fleetHistoryAuditChangeQuickInfo } from '@/lib/fleetHistoryQuickInfo';
import {
  AppButton,
  AppFormModal,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type FleetHistoryAuditDetailPayload = {
  changes: Record<string, unknown>;
  entityType: string | null;
  auditAction: string | null;
  summary: string;
  auditContext: Record<string, unknown> | null | undefined;
  performedBy?: string | null;
  occurredAt?: string | null;
};

type Props = {
  open: boolean;
  detail: FleetHistoryAuditDetailPayload;
  onClose: () => void;
};

export default function FleetHistoryAuditChangeModal({ open, detail, onClose }: Props) {
  const rows = useMemo(
    () => buildFleetAuditChangeRows(detail.entityType, detail.changes, detail.auditContext),
    [detail.entityType, detail.changes, detail.auditContext],
  );

  const deleteOnly = isFleetAuditDeleteOnlyChanges(detail.changes);

  const headline = `${formatFleetAuditEntityTitle(detail.entityType)} · ${formatFleetAuditActionVerb(detail.auditAction)}`;

  const occurredDisplay = detail.occurredAt
    ? new Date(detail.occurredAt).toLocaleString()
    : null;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      formWidth="comfortable"
      quickInfo={fleetHistoryAuditChangeQuickInfo}
      title="Change details"
      description={
        <div className={uiSpacing.sectionStack}>
          <span className={uiCx(uiTypography.controlLabel, 'text-gray-700')}>{headline}</span>
          <span className={uiTypography.sectionSubtitle}>{detail.summary}</span>
        </div>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <div className={uiCx(uiLayout.sectionGrid2, 'gap-y-3')}>
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Performed by</div>
            <div className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>
              {formatFleetHistoryPerformedBy(detail.performedBy)}
            </div>
          </div>
          {occurredDisplay && (
            <div className="space-y-1">
              <div className={uiTypography.controlLabel}>When</div>
              <div className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{occurredDisplay}</div>
            </div>
          )}
        </div>

      {rows.length > 0 ? (
        <div className={uiCx('overflow-hidden', uiRadius.card, uiBorders.subtle)}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className={uiColors.surfaceSubtle}>
                <tr>
                  <th className={uiCx('w-[30%] p-2.5 text-left', uiTypography.controlLabel)}>Field</th>
                  <th className={uiCx('p-2.5 text-left', uiTypography.controlLabel)}>Before</th>
                  <th className={uiCx('p-2.5 text-left', uiTypography.controlLabel)}>After</th>
                </tr>
              </thead>
              <tbody className={uiColors.surface}>
                {rows.map((r, i) => (
                  <tr key={`${r.label}-${i}`} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className={uiCx('p-2.5 align-top font-medium text-gray-900', uiTypography.body)}>
                      {r.label}
                    </td>
                    <td
                      className={uiCx(
                        'max-w-[34vw] break-words p-2.5 align-top whitespace-pre-wrap text-gray-700',
                        uiTypography.body,
                      )}
                    >
                      {r.before}
                    </td>
                    <td
                      className={uiCx(
                        'max-w-[34vw] break-words p-2.5 align-top whitespace-pre-wrap text-gray-900',
                        uiTypography.body,
                      )}
                    >
                      {r.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : deleteOnly ? (
        <p className={uiTypography.helper}>
          This entry is a deletion. The summary above describes what was removed; individual fields are not listed here.
        </p>
      ) : (
        <div className={uiSpacing.sectionStack}>
          <p className={uiTypography.helper}>No field-by-field breakdown is available for this entry.</p>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-brand-red hover:underline">Technical payload</summary>
            <pre
              className={uiCx(
                'mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] text-gray-800',
              )}
            >
              {JSON.stringify(detail.changes, null, 2)}
            </pre>
          </details>
        </div>
      )}
      </div>
    </AppFormModal>
  );
}
