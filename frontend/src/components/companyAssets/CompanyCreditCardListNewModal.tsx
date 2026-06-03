import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CompanyCreditCardNewForm } from '@/pages/CompanyCreditCardNew';
import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  FORM_MODAL_COMFORTABLE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'company-credit-card-list-new-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Register a company corporate card using only safe metadata (last four + expiry).</>,
  howToUse: (
    <>
      Set {uiLabel('Internal label')}, {uiLabel('Network')}, and {uiLabel('Last four digits')}. Add optional
      cardholder and billing details for search.
    </>
  ),
  actions: (
    <>
      Create saves the card and opens its detail page. Cancel closes without saving.
    </>
  ),
});

export type CompanyCreditCardListNewModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (data: { id: string }) => void;
};

export default function CompanyCreditCardListNewModal({
  open,
  onClose,
  onCreated,
}: CompanyCreditCardListNewModalProps) {
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
      title="Add corporate card"
      description="Last four digits and expiry only — never full card numbers."
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
      <CompanyCreditCardNewForm
        key={open ? 'new-card' : 'closed'}
        formId={FORM_ID}
        onSuccess={(data) => {
          queryClient.invalidateQueries({ queryKey: ['company-credit-cards'] });
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
