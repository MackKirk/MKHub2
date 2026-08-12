import { useEffect, useState } from 'react';
import { FuelCardAssignmentAttachmentsPicker } from '@/components/companyAssets/FuelCardAssignmentAttachmentsPicker';
import { FUEL_CARD_FIELD_HINTS as H } from '@/lib/fuelCardFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'fuel-card-return-custody-form';

const RETURN_CUSTODY_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record when the fuel card is back in the office or no longer with the assigned employee.</>,
  howToUse: (
    <>
      Optionally add {uiLabel('Reason')}, {uiLabel('Notes')}, and attachments about the handoff, then confirm the
      return.
    </>
  ),
  actions: (
    <>
      {uiLabel('Confirm return')} closes the active custody and logs the event in History. {uiLabel('Cancel')} closes
      without changes.
    </>
  ),
});

export type FuelCardReturnCustodyPayload = {
  notes?: string;
  reason?: string;
  attachment_ids?: string[];
};

export type FuelCardReturnCustodyModalProps = {
  open: boolean;
  cardLabel?: string;
  assignedToName?: string | null;
  onClose: () => void;
  onConfirm: (data: FuelCardReturnCustodyPayload) => void;
  isPending?: boolean;
};

export default function FuelCardReturnCustodyModal({
  open,
  cardLabel,
  assignedToName,
  onClose,
  onConfirm,
  isPending = false,
}: FuelCardReturnCustodyModalProps) {
  const [reason, setReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setReturnNotes('');
    setAttachmentIds([]);
    setUploading(false);
  }, [open]);

  const title = cardLabel?.trim() ? `Return — ${cardLabel.trim()}` : 'Return';
  const busy = isPending || uploading;
  const holder = assignedToName?.trim();

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description={
        holder
          ? `Mark the card available — currently with ${holder}.`
          : 'When the card is back in the office or handed to another process.'
      }
      formWidth="comfortable"
      quickInfo={RETURN_CUSTODY_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={FORM_ID} size="sm" disabled={busy} loading={isPending}>
            {isPending ? 'Saving…' : 'Confirm return'}
          </AppButton>
        </div>
      }
    >
      <form
        id={FORM_ID}
        className={uiSpacing.sectionStack}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          onConfirm({
            notes: returnNotes.trim() || undefined,
            reason: reason.trim() || undefined,
            attachment_ids: attachmentIds.length ? attachmentIds : undefined,
          });
        }}
      >
        <AppInput
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          placeholder="Optional"
          fieldHint={H.return_reason}
        />
        <AppTextarea
          label="Notes"
          placeholder="Optional notes"
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          rows={3}
          disabled={busy}
          fieldHint={H.return_notes}
        />
        <FuelCardAssignmentAttachmentsPicker
          label="Attachments"
          fileIds={attachmentIds}
          onFileIdsChange={setAttachmentIds}
          onUploadingChange={setUploading}
          disabled={busy}
          fieldHint={H.return_attachments}
        />
      </form>
    </AppFormModal>
  );
}
