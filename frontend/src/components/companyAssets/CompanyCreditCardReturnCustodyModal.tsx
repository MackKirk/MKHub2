import { useEffect, useState } from 'react';
import {
  AppButton,
  AppModal,
  AppTextarea,
  uiCx,
  uiLayout,
} from '@/components/ui';

export type CompanyCreditCardReturnCustodyModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (notes?: string) => void;
  isPending?: boolean;
};

export default function CompanyCreditCardReturnCustodyModal({
  open,
  onClose,
  onConfirm,
  isPending = false,
}: CompanyCreditCardReturnCustodyModalProps) {
  const [returnNotes, setReturnNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setReturnNotes('');
  }, [open]);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      size="sm"
      title="Record return"
      description="When the card is back in the office or handed to another process."
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={isPending}
            loading={isPending}
            onClick={() => onConfirm(returnNotes.trim() || undefined)}
          >
            {isPending ? 'Saving…' : 'Confirm return'}
          </AppButton>
        </div>
      }
    >
      <AppTextarea
        label="Notes"
        placeholder="Optional notes"
        value={returnNotes}
        onChange={(e) => setReturnNotes(e.target.value)}
        rows={3}
        disabled={isPending}
      />
    </AppModal>
  );
}
