import { useEffect, useState } from 'react';
import { COMPANY_CREDIT_CARD_FIELD_HINTS as H } from '@/lib/companyCreditCardFieldHints';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'company-credit-card-return-custody-form';

const RETURN_CUSTODY_QUICK_INFO = formModalQuickInfo({
  purpose: <>Record when the corporate card is back in the office or no longer with the assigned employee.</>,
  howToUse: (
    <>
      Add optional {uiLabel('Notes')} about the handoff or where the card was received, then confirm the return.
    </>
  ),
  actions: (
    <>
      {uiLabel('Confirm return')} closes the active custody and logs the event in History. {uiLabel('Cancel')} closes
      without changes.
    </>
  ),
});

export type CompanyCreditCardReturnCustodyModalProps = {
  open: boolean;
  cardLabel?: string;
  onClose: () => void;
  onConfirm: (notes?: string) => void;
  isPending?: boolean;
};

export default function CompanyCreditCardReturnCustodyModal({
  open,
  cardLabel,
  onClose,
  onConfirm,
  isPending = false,
}: CompanyCreditCardReturnCustodyModalProps) {
  const [returnNotes, setReturnNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setReturnNotes('');
  }, [open]);

  const title = cardLabel?.trim() ? `Record return — ${cardLabel.trim()}` : 'Record return';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={title}
      description="When the card is back in the office or handed to another process."
      formWidth="comfortable"
      quickInfo={RETURN_CUSTODY_QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={isPending}
            loading={isPending}
          >
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
          onConfirm(returnNotes.trim() || undefined);
        }}
      >
        <AppTextarea
          label="Notes"
          placeholder="Optional notes"
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          rows={3}
          disabled={isPending}
          fieldHint={H.return_notes}
        />
      </form>
    </AppFormModal>
  );
}
