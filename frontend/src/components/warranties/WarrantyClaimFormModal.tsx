import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { projectWarrantyClaimQuickInfo } from '@/lib/formModalQuickInfo';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';
import {
  EMPTY_CLAIM_FORM,
  WarrantyClaimFormFields,
  type WarrantyClaimFormValues,
} from '@/components/warranties/WarrantyClaimFormFields';

const FORM_ID = 'project-warranty-claim-form';

type WarrantyOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  warranties: WarrantyOption[];
  defaultWarrantyId?: string;
  onSuccess: () => void;
};

function buildInitialForm(defaultWarrantyId?: string): WarrantyClaimFormValues {
  return { ...EMPTY_CLAIM_FORM, warranty_id: defaultWarrantyId || '' };
}

export default function WarrantyClaimFormModal({
  open,
  onClose,
  projectId,
  warranties,
  defaultWarrantyId,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<WarrantyClaimFormValues>(() => buildInitialForm(defaultWarrantyId));

  useEffect(() => {
    if (open) setForm(buildInitialForm(defaultWarrantyId));
  }, [open, defaultWarrantyId]);

  const updateField = <K extends keyof WarrantyClaimFormValues>(field: K, value: WarrantyClaimFormValues[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api('POST', `/projects/${projectId}/warranty-claims`, {
        ...form,
        warranty_id: form.warranty_id || null,
      }),
    onSuccess: () => {
      toast.success('Claim registered');
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to register claim'),
  });

  const canSubmit = form.description.trim().length > 0;
  const submitDisabled = !canSubmit || saveMutation.isPending;

  const handleSubmit = () => {
    if (canSubmit) saveMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Register claim"
      description="Log a warranty claim for this project. Emergency severity notifies the project admin immediately."
      formWidth="comfortable"
      quickInfo={projectWarrantyClaimQuickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form={FORM_ID}
            size="sm"
            disabled={submitDisabled}
            loading={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Registering…' : 'Register claim'}
          </AppButton>
        </div>
      }
    >
      <WarrantyClaimFormFields
        formId={FORM_ID}
        values={form}
        warranties={warranties}
        disabled={saveMutation.isPending}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
