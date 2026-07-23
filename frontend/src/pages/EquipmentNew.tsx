import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  EquipmentNewFormFields,
  type EquipmentNewFormValues,
} from '@/components/fleet/EquipmentNewFormFields';
import {
  AppButton,
  AppCard,
  AppPageHeader,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Wrench } from 'lucide-react';

function buildInitialForm(initialCategory: string): EquipmentNewFormValues {
  return {
    category: initialCategory,
    name: '',
    unit_number: '',
    serial_number: '',
    brand: '',
    model: '',
    value: '',
    warranty_expiry: '',
    purchase_date: '',
    status: 'active',
    notes: '',
  };
}

export function EquipmentNewForm({
  initialCategory = 'generator',
  onSuccess,
  onCancel,
  onValidationChange,
  formId = 'equipment-new-form',
}: {
  initialCategory?: string;
  onSuccess: (data: { id: string }) => void;
  onCancel: () => void;
  onValidationChange?: (canSubmit: boolean, isPending: boolean) => void;
  formId?: string;
}) {
  const [form, setForm] = useState<EquipmentNewFormValues>(() => buildInitialForm(initialCategory));
  const embedInModal = Boolean(onValidationChange);

  useEffect(() => {
    setForm((prev) => ({ ...prev, category: initialCategory }));
  }, [initialCategory]);

  const updateField = (field: keyof EquipmentNewFormValues, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        category: form.category,
        name: form.name.trim(),
        unit_number: form.unit_number.trim() || null,
        serial_number: form.serial_number.trim() || null,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        value: form.value ? parseFloat(form.value) : null,
        warranty_expiry: form.warranty_expiry || null,
        purchase_date: form.purchase_date || null,
        status: form.status,
        notes: form.notes.trim() || null,
      };
      return api<{ id: string }>('POST', '/fleet/equipment', payload);
    },
    onSuccess: (data) => {
      toast.success('Equipment created successfully');
      onSuccess(data);
    },
    onError: () => {
      toast.error('Failed to create equipment');
    },
  });

  const canSubmit = form.name.trim().length > 0 && form.unit_number.trim().length > 0;

  useEffect(() => {
    onValidationChange?.(canSubmit, createMutation.isPending);
  }, [canSubmit, createMutation.isPending, onValidationChange]);

  const handleSubmit = () => {
    if (canSubmit) createMutation.mutate();
  };

  const fields = (
    <EquipmentNewFormFields
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
        <AppButton type="submit" form={formId} disabled={!canSubmit || createMutation.isPending} loading={createMutation.isPending}>
          {createMutation.isPending ? 'Creating…' : 'Create Equipment'}
        </AppButton>
      </div>
    </AppCard>
  );
}

export default function EquipmentNew() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get('category') || 'generator';



  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="New Equipment"
        subtitle="Create a new equipment item"
        icon={<Wrench className="h-4 w-4" />}
        onBack={() => nav(-1)}
        backLabel="Equipment"
      />
      <EquipmentNewForm
        initialCategory={categoryFromUrl}
        onSuccess={(data) => nav(`/company-assets/equipment/${data.id}`)}
        onCancel={() => nav(-1)}
      />
    </div>
  );
}
