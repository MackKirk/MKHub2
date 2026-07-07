import { useEffect, useState } from 'react';
import {
  formatScheduledRevocationLabel,
  hubAccessAllowsCompleteWithActive,
} from './offboardingUtils';
import { AppButton, AppCheckbox, AppModal } from '@/components/ui';
import { HubAccessBadge } from './OffboardingStatusBadge';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  hubAccessActive: boolean;
  accessRevocationTiming?: string | null;
  accessRevokeAtLocal?: string | null;
  companyTimezone?: string | null;
  assetsPending: number;
  futureShifts: number;
  pendingTimesheets: number;
  projectRoles: number;
  blockers: string[];
  warnings: string[];
};

export default function OffboardingCompleteModal({
  open,
  onClose,
  onConfirm,
  loading,
  hubAccessActive,
  accessRevocationTiming,
  accessRevokeAtLocal,
  companyTimezone,
  assetsPending,
  futureShifts,
  pendingTimesheets,
  projectRoles,
  blockers,
  warnings,
}: Props) {
  const [hubAcknowledged, setHubAcknowledged] = useState(false);

  const requiresHubAcknowledgment =
    hubAccessActive && hubAccessAllowsCompleteWithActive(accessRevocationTiming);

  const canComplete =
    blockers.length === 0 && (!requiresHubAcknowledgment || hubAcknowledged);

  useEffect(() => {
    if (!open) {
      setHubAcknowledged(false);
    }
  }, [open]);

  const scheduledRevocationLabel =
    accessRevocationTiming === 'scheduled'
      ? formatScheduledRevocationLabel(accessRevokeAtLocal, companyTimezone)
      : null;

  const hubAcknowledgmentLabel =
    accessRevocationTiming === 'scheduled'
      ? `I understand Hub access is still active and will be revoked on ${scheduledRevocationLabel || 'the scheduled date'}.`
      : 'I understand Hub access is still active and will remain until manually deactivated.';

  return (
    <AppModal open={open} onClose={onClose} title="Complete Offboarding" size="md">
      <div className="space-y-4 text-sm text-gray-700">
        <p>Review the summary below before completing this offboarding case.</p>

        <div className="rounded-lg border border-gray-200 divide-y">
          <div className="flex items-center justify-between p-3">
            <span>Hub Access</span>
            <HubAccessBadge active={hubAccessActive} />
          </div>
          {accessRevocationTiming === 'scheduled' && hubAccessActive ? (
            <div className="flex items-center justify-between gap-3 p-3 text-gray-600">
              <span>Scheduled revocation</span>
              <span className="text-right font-medium text-gray-900">{scheduledRevocationLabel}</span>
            </div>
          ) : null}
          {accessRevocationTiming === 'manually_later' && hubAccessActive ? (
            <div className="flex items-center justify-between gap-3 p-3 text-gray-600">
              <span>Access revocation</span>
              <span className="text-right font-medium text-gray-900">Manual — when deactivated</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between p-3">
            <span>Assets Pending Return</span>
            <span className={assetsPending > 0 ? 'font-semibold text-red-600' : ''}>{assetsPending}</span>
          </div>
          <div className="flex items-center justify-between p-3 text-gray-600">
            <span>Future Shifts</span>
            <span>{futureShifts}</span>
          </div>
          <div className="flex items-center justify-between p-3 text-gray-600">
            <span>Pending Timesheets</span>
            <span>{pendingTimesheets}</span>
          </div>
          <div className="flex items-center justify-between p-3 text-gray-600">
            <span>Project Roles to Review</span>
            <span>{projectRoles}</span>
          </div>
        </div>

        {blockers.length > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="font-medium text-red-800 mb-1">Blocking issues</div>
            <ul className="list-disc pl-5 text-red-700 space-y-0.5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="font-medium text-amber-900 mb-1">Warnings (will not block completion)</div>
            <ul className="list-disc pl-5 text-amber-800 space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {requiresHubAcknowledgment ? (
          <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <AppCheckbox checked={hubAcknowledged} onChange={setHubAcknowledged} />
            <span className="text-amber-950">{hubAcknowledgmentLabel}</span>
          </label>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <AppButton variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </AppButton>
          <AppButton onClick={onConfirm} disabled={!canComplete || loading}>
            {loading ? 'Completing…' : 'Complete Offboarding'}
          </AppButton>
        </div>
      </div>
    </AppModal>
  );
}
