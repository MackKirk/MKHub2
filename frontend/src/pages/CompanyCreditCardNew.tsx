import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  buildExpiryMonthOptions,
  buildExpiryYearOptions,
  CompanyCreditCardNewFormFields,
  type CompanyCreditCardNewFormValues,
} from '@/components/companyAssets/CompanyCreditCardNewFormFields';
import { AppButton, AppCard, uiCx, uiLayout, uiSpacing } from '@/components/ui';

function buildInitialForm(): CompanyCreditCardNewFormValues {
  const now = new Date();
  return {
    label: '',
    network: 'visa',
    last_four: '',
    expiry_month: String(now.getMonth() + 1),
    expiry_year: String(now.getFullYear() + 3),
    cardholder_name: '',
    issuer: '',
    billing_entity: '',
    notes: '',
  };
}

export function CompanyCreditCardNewForm({
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'company-credit-card-new-form',
}: {
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
}) {
  const [form, setForm] = useState<CompanyCreditCardNewFormValues>(buildInitialForm);
  const embedInModal = Boolean(onValidationChange);

  const expiryMonthOptions = useMemo(() => buildExpiryMonthOptions(), []);
  const expiryYearOptions = useMemo(() => buildExpiryYearOptions(), []);

  const updateField = (field: keyof CompanyCreditCardNewFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const em = parseInt(form.expiry_month, 10);
      const ey = parseInt(form.expiry_year, 10);
      return api<{ id: string }>('POST', '/company-credit-cards', {
        label: form.label.trim(),
        network: form.network,
        last_four: form.last_four.trim(),
        expiry_month: em,
        expiry_year: ey,
        cardholder_name: form.cardholder_name.trim() || undefined,
        issuer: form.issuer.trim() || undefined,
        billing_entity: form.billing_entity.trim() || undefined,
        status: 'active',
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      toast.success('Card record created');
      onSuccess(data);
    },
    onError: (e: { message?: string }) => toast.error(e?.message || 'Failed to create'),
  });

  const canSubmit = form.label.trim().length > 0 && /^\d{4}$/.test(form.last_four.trim());

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  const handleSubmit = () => {
    if (!form.label.trim()) {
      toast.error('Label is required');
      return;
    }
    if (!/^\d{4}$/.test(form.last_four.trim())) {
      toast.error('Last four must be exactly 4 digits');
      return;
    }
    const em = parseInt(form.expiry_month, 10);
    if (em < 1 || em > 12) {
      toast.error('Invalid expiry month');
      return;
    }
    createMutation.mutate();
  };

  const fields = (
    <CompanyCreditCardNewFormFields
      formId={formId}
      values={form}
      disabled={createMutation.isPending}
      expiryMonthOptions={expiryMonthOptions}
      expiryYearOptions={expiryYearOptions}
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
export default function CompanyCreditCardNew() {
  const nav = useNavigate();
  useEffect(() => {
    nav('/company-assets/credit-cards?create=1', { replace: true });
  }, [nav]);
  return null;
}
