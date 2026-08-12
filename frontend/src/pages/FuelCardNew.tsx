import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { getTodayLocal } from '@/lib/dateUtils';
import { FuelCardNewFormFields, type FuelCardNewFormValues } from '@/components/companyAssets/FuelCardNewFormFields';
import { AppButton, AppCard, uiCx, uiLayout, uiSpacing } from '@/components/ui';

function buildInitialForm(): FuelCardNewFormValues {
  return {
    card_number: '',
    pin: '',
    date_issued: getTodayLocal(),
    crew: '',
    notes: '',
  };
}

export function FuelCardNewForm({
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'fuel-card-new-form',
}: {
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
}) {
  const [form, setForm] = useState<FuelCardNewFormValues>(buildInitialForm);
  const embedInModal = Boolean(onValidationChange);

  const updateField = (field: keyof FuelCardNewFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api<{ id: string }>('POST', '/fuel-cards', {
        card_number: form.card_number.trim(),
        pin: form.pin.trim(),
        date_issued: form.date_issued.trim() || undefined,
        crew: form.crew.trim() || undefined,
        status: 'active',
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success('Fuel card created');
      onSuccess(data);
    },
    onError: (e: { message?: string }) => toast.error(e?.message || 'Failed to create'),
  });

  const canSubmit = form.card_number.trim().length > 0 && form.pin.trim().length > 0;

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  const handleSubmit = () => {
    if (!form.card_number.trim()) {
      toast.error('Card # is required');
      return;
    }
    if (!form.pin.trim()) {
      toast.error('PIN # is required');
      return;
    }
    createMutation.mutate();
  };

  const fields = (
    <FuelCardNewFormFields
      formId={formId}
      values={form}
      disabled={createMutation.isPending}
      onChange={updateField}
      onSubmit={handleSubmit}
    />
  );

  if (embedInModal) {
    return fields;
  }

  return (
    <AppCard bodyClassName={uiSpacing.cardPadding}>
      {fields}
      <div className={uiCx(uiLayout.actionsRow, 'mt-4 justify-end border-t border-gray-200 pt-4')}>
        <AppButton type="button" variant="secondary" onClick={onCancel} disabled={createMutation.isPending}>
          Cancel
        </AppButton>
        <AppButton
          type="submit"
          form={formId}
          disabled={!canSubmit || createMutation.isPending}
          loading={createMutation.isPending}
        >
          {createMutation.isPending ? 'Saving…' : 'Create'}
        </AppButton>
      </div>
    </AppCard>
  );
}

/** Legacy route: redirect to list (create opens in modal). */
export default function FuelCardNew() {
  const nav = useNavigate();
  useEffect(() => {
    nav('/company-assets/fuel-cards?create=1', { replace: true });
  }, [nav]);
  return null;
}
