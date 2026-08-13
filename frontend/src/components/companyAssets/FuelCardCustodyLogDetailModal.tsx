import { useMemo } from 'react';
import { withFileAccessToken } from '@/lib/api';
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
  notes_in?: string | null;
  reason_out?: string | null;
  reason_in?: string | null;
  attachments_out?: string[] | null;
  attachments_in?: string[] | null;
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

function AttachmentThumbs({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <a
          key={id}
          href={withFileAccessToken(`/files/${encodeURIComponent(id)}/download`)}
          target="_blank"
          rel="noreferrer"
          className="block"
        >
          <img
            src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=200`)}
            alt=""
            className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
          />
        </a>
      ))}
    </div>
  );
}

export default function FuelCardCustodyLogDetailModal({
  open,
  assignment,
  logType,
  performedBy,
  onClose,
}: Props) {
  const reason = logType === 'assignment' ? assignment.reason_out : assignment.reason_in;
  const notes = logType === 'assignment' ? assignment.notes : assignment.notes_in;
  const attachments = useMemo(() => {
    const raw = logType === 'assignment' ? assignment.attachments_out : assignment.attachments_in;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, [assignment.attachments_in, assignment.attachments_out, logType]);

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      formWidth="comfortable"
      title={logType === 'assignment' ? 'Assign custody details' : 'Return custody details'}
      description="Information recorded for this custody event."
      quickInfo={<p>Custody events track who physically held this fuel card.</p>}
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
        {reason?.trim() ? <ReadOnlyDetailField label="Reason" value={reason.trim()} /> : null}
        {notes?.trim() ? <ReadOnlyDetailField label="Notes" value={notes.trim()} /> : null}
        {attachments.length > 0 ? (
          <div className="space-y-1">
            <div className={uiTypography.controlLabel}>Attachments</div>
            <AttachmentThumbs ids={attachments} />
          </div>
        ) : null}
      </div>
    </AppFormModal>
  );
}
