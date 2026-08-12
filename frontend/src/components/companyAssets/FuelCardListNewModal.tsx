import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FuelCardNewForm } from '@/pages/FuelCardNew';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  FORM_MODAL_COMFORTABLE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'fuel-card-list-new-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Register a fuel card with its card number, PIN, and issue date.</>,
  howToUse: (
    <>
      Set {uiLabel('Card #')}, {uiLabel('PIN #')}, and {uiLabel('Date card issued')}. Add optional{' '}
      {uiLabel('Notes')} for search.
    </>
  ),
  actions: (
    <>
      Create saves the card and opens its detail page. Cancel closes without saving.
    </>
  ),
});

export type FuelCardListNewModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { id: string }) => void;
};

export default function FuelCardListNewModal({ open, onClose, onCreated }: FuelCardListNewModalProps) {
  const queryClient = useQueryClient();
  const [canSubmit, setCanSubmit] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!open) {
      setCanSubmit(false);
      setIsPending(false);
    }
  }, [open]);

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Add fuel card"
      description="Card #, PIN #, and date issued."
      formWidth="comfortable"
      dialogClassNameExpanded={FORM_MODAL_COMFORTABLE_DIALOG_EXPANDED}
      quickInfo={QUICK_INFO}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={!canSubmit || isPending}
            loading={isPending}
          >
            {isPending ? 'Saving…' : 'Create'}
          </AppButton>
        </div>
      }
    >
      <FuelCardNewForm
        key={open ? 'new-card' : 'closed'}
        formId={FORM_ID}
        onSuccess={(data) => {
          queryClient.invalidateQueries({ queryKey: ['fuel-cards'] });
          onCreated(data);
          onClose();
        }}
        onCancel={onClose}
        onValidationChange={(nextCanSubmit, nextPending) => {
          setCanSubmit(nextCanSubmit);
          setIsPending(nextPending);
        }}
      />
    </AppFormModal>
  );
}
