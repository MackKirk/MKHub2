import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EquipmentNewForm } from '@/pages/EquipmentNew';
import { formModalQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppFormModal,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiCx,
  uiLayout,
} from '@/components/ui';

const FORM_ID = 'equipment-list-new-form';

const QUICK_INFO = formModalQuickInfo({
  purpose: <>Add a generator, tool, electronics item, or other company equipment to the registry.</>,
  howToUse: (
    <>
      Choose category and fill identity fields. Unit number and serial help search and checkout tracking.
    </>
  ),
  actions: (
    <>
      Create Equipment saves the record and opens the equipment detail. Cancel closes without saving.
    </>
  ),
});

export type EquipmentListNewModalProps = {
  open: boolean;
  onClose: () => void;
  initialCategory: string;
  onCreated: (data: { id: string }) => void;
};

export default function EquipmentListNewModal({
  open,
  onClose,
  initialCategory,
  onCreated,
}: EquipmentListNewModalProps) {
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
      title="New Equipment"
      description="Create a new equipment item"
      formWidth="wide"
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
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
            {isPending ? 'Creating…' : 'Create Equipment'}
          </AppButton>
        </div>
      }
    >
      <EquipmentNewForm
        formId={FORM_ID}
        initialCategory={initialCategory}
        onSuccess={(data) => {
          queryClient.invalidateQueries({ queryKey: ['equipment'] });
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
