import { formatDateLocal } from '@/lib/dateUtils';
import { formatFleetHistoryPerformedBy } from '@/lib/fleetHistoryActor';
import {
  AppButton,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type AssignmentRow = {
  id: string;
  assigned_to_name?: string | null;
  assigned_at: string;
  returned_at?: string | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  assignment: AssignmentRow;
  logType: 'assignment' | 'return';
  performedBy?: string | null;
  onClose: () => void;
};

function ReadOnlyDetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.body, 'break-words font-medium text-gray-900')}>{value || '—'}</div>
    </div>
  );
}

export default function CompanyCreditCardCustodyLogDetailModal({
  open,
  assignment,
  logType,
  performedBy,
  onClose,
}: Props) {
  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      formWidth="comfortable"
      title={logType === 'assignment' ? 'Assign custody details' : 'Return custody details'}
      description="Information recorded for this custody event."
      quickInfo={
        <p>
          Custody events track who physically held this corporate card. Only the last four digits are stored in MKHub.
        </p>
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
        <ReadOnlyDetailField label="Performed by" value={formatFleetHistoryPerformedBy(performedBy)} />
        <ReadOnlyDetailField label="Employee" value={assignment.assigned_to_name || '—'} />
        <ReadOnlyDetailField
          label="Assigned at"
          value={assignment.assigned_at ? formatDateLocal(new Date(assignment.assigned_at)) : '—'}
        />
        {logType === 'return' && assignment.returned_at ? (
          <ReadOnlyDetailField
            label="Returned at"
            value={formatDateLocal(new Date(assignment.returned_at))}
          />
        ) : null}
        {assignment.notes?.trim() ? (
          <ReadOnlyDetailField label="Notes" value={assignment.notes.trim()} />
        ) : null}
      </div>
    </AppFormModal>
  );
}
