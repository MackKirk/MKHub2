import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FuelCardAssignmentAttachmentsPicker } from '@/components/companyAssets/FuelCardAssignmentAttachmentsPicker';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { FUEL_CARD_FIELD_HINTS as H } from '@/lib/fuelCardFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppTextarea,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'fuel-card-assign-custody-form';

const ASSIGN_CUSTODY_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record who is taking physical custody of this fuel card.</>,
  howToUse: (
    <>
      Select {uiLabel('Employee')}. Optionally add {uiLabel('Reason')}, {uiLabel('Notes')}, and attachments, then
      confirm the assignment.
    </>
  ),
  actions: (
    <>
      {uiLabel('Assign')} saves custody and appears in History. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

export type FuelCardAssignCustodyPayload = {
  assigned_to_user_id: string;
  notes?: string;
  reason?: string;
  attachment_ids?: string[];
};

export type FuelCardAssignCustodyModalProps = {
  open: boolean;
  cardLabel?: string;
  onClose: () => void;
  onAssign: (data: FuelCardAssignCustodyPayload) => void;
  isPending?: boolean;
};

export default function FuelCardAssignCustodyModal({
  open,
  cardLabel,
  onClose,
  onAssign,
  isPending = false,
}: FuelCardAssignCustodyModalProps) {
  const [assignUserId, setAssignUserId] = useState('');
  const [reason, setReason] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<unknown[]>('GET', '/employees'),
    enabled: open,
  });

  const assignUsers = useMemo(
    () => (Array.isArray(employees) ? employees : []).map((e) => mapEmployeeToAppUserSelect(e as Record<string, unknown>)),
    [employees],
  );

  useEffect(() => {
    if (!open) return;
    setAssignUserId('');
    setReason('');
    setAssignNotes('');
    setAttachmentIds([]);
    setUploading(false);
  }, [open]);

  const title = cardLabel?.trim() ? `Assign — ${cardLabel.trim()}` : 'Assign';
  const busy = isPending || uploading;

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="Who will physically hold this fuel card."
      formWidth="comfortable"
      quickInfo={ASSIGN_CUSTODY_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={!assignUserId || busy}
            loading={isPending}
          >
            {isPending ? 'Assigning…' : 'Assign'}
          </AppButton>
        </div>
      }
    >
      <form
        id={FORM_ID}
        className={uiSpacing.sectionStack}
        onSubmit={(e) => {
          e.preventDefault();
          if (!assignUserId || busy) return;
          onAssign({
            assigned_to_user_id: assignUserId,
            notes: assignNotes.trim() || undefined,
            reason: reason.trim() || undefined,
            attachment_ids: attachmentIds.length ? attachmentIds : undefined,
          });
        }}
      >
        <AppUserSelect
          mode="single"
          label="Employee"
          users={assignUsers}
          value={assignUserId}
          onChange={(userId) => setAssignUserId(userId ?? '')}
          placeholder="Search or select user…"
          disabled={busy}
          fieldHint={H.assign_employee}
        />
        <AppInput
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          placeholder="Optional"
          fieldHint={H.assign_reason}
        />
        <AppTextarea
          label="Notes"
          value={assignNotes}
          onChange={(e) => setAssignNotes(e.target.value)}
          rows={2}
          disabled={busy}
          fieldHint={H.assign_notes}
        />
        <FuelCardAssignmentAttachmentsPicker
          label="Attachments"
          fileIds={attachmentIds}
          onFileIdsChange={setAttachmentIds}
          onUploadingChange={setUploading}
          disabled={busy}
          fieldHint={H.assign_attachments}
        />
      </form>
    </AppFormModal>
  );
}
