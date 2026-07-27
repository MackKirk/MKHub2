import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { projectWarrantyFormQuickInfo } from '@/lib/formModalQuickInfo';
import { calculateWarrantyEndDate } from '@/lib/warrantyDateUtils';
import { AppButton, AppFormModal, uiCx, uiLayout } from '@/components/ui';
import {
  EMPTY_WARRANTY_FORM,
  WarrantyFormFields,
  type WarrantyFormValues,
  type WarrantyPeriodMode,
} from '@/components/warranties/WarrantyFormFields';

const FORM_ID = 'project-warranty-form';

export type WarrantyEditSource = {
  id: string;
  name: string;
  warranty_type: string;
  provider_type: string;
  provider_name?: string | null;
  status: string;
  coverage_description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  maintenance_required?: boolean;
  maintenance_frequency?: string | null;
  maintenance_interval_value?: number | null;
  maintenance_interval_unit?: string | null;
  next_maintenance_due_date?: string | null;
  first_maintenance_due_date?: string | null;
  last_maintenance_completed_at?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editingWarranty?: WarrantyEditSource | null;
  onSuccess: () => void;
};

function inferPeriodMode(editing?: WarrantyEditSource | null): WarrantyPeriodMode {
  if (!editing) return 'duration';
  if (editing.duration_value && editing.duration_unit) return 'duration';
  if (editing.end_date) return 'end_date';
  return 'duration';
}

function buildInitialForm(editing?: WarrantyEditSource | null): WarrantyFormValues {
  if (!editing) return { ...EMPTY_WARRANTY_FORM };
  return {
    name: editing.name,
    warranty_type: editing.warranty_type,
    provider_type: editing.provider_type,
    provider_name: editing.provider_name || '',
    status: editing.status,
    coverage_type: 'entire_project',
    coverage_description: editing.coverage_description || '',
    start_date: editing.start_date?.slice(0, 10) || '',
    duration_value: editing.duration_value != null ? String(editing.duration_value) : '',
    duration_unit: editing.duration_unit || 'years',
    end_date: editing.end_date?.slice(0, 10) || '',
    maintenance_required: Boolean(editing.maintenance_required),
    maintenance_frequency: editing.maintenance_frequency || 'annually',
    maintenance_interval_value:
      editing.maintenance_interval_value != null ? String(editing.maintenance_interval_value) : '',
    maintenance_interval_unit: editing.maintenance_interval_unit || 'months',
    maintenance_due_date: editing.next_maintenance_due_date?.slice(0, 10) || '',
    document_required: false,
    registration_required: false,
    notes: '',
  };
}

function buildPeriodPayload(form: WarrantyFormValues, periodMode: WarrantyPeriodMode) {
  if (periodMode === 'duration') {
    return {
      duration_value: form.duration_value ? Number(form.duration_value) : null,
      duration_unit: form.duration_unit || null,
      end_date: null,
    };
  }

  return {
    end_date: form.end_date || null,
    duration_value: null,
    duration_unit: null,
  };
}

function buildMaintenancePayload(
  form: WarrantyFormValues,
  options: { isCreate: boolean; hadMaintenanceCompletion: boolean },
) {
  if (!form.maintenance_required) {
    return {
      maintenance_required: false,
      maintenance_frequency: null,
      maintenance_interval_value: null,
      maintenance_interval_unit: null,
      next_maintenance_due_date: null,
      first_maintenance_due_date: null,
    };
  }

  const isCustom = form.maintenance_frequency === 'custom';
  const payload: Record<string, unknown> = {
    maintenance_required: true,
    maintenance_frequency: form.maintenance_frequency || null,
    maintenance_interval_value:
      isCustom && form.maintenance_interval_value ? Number(form.maintenance_interval_value) : null,
    maintenance_interval_unit: isCustom ? form.maintenance_interval_unit || null : null,
    next_maintenance_due_date: form.maintenance_due_date || null,
  };

  if (options.isCreate && !options.hadMaintenanceCompletion && form.maintenance_due_date) {
    payload.first_maintenance_due_date = form.maintenance_due_date;
  }

  return payload;
}

function buildWarrantyPayload(
  form: WarrantyFormValues,
  periodMode: WarrantyPeriodMode,
  options: { isCreate: boolean; hadMaintenanceCompletion: boolean },
) {
  return {
    name: form.name.trim(),
    warranty_type: form.warranty_type,
    provider_type: form.provider_type,
    provider_name: form.provider_name.trim() || null,
    status: form.status,
    coverage_type: form.coverage_type,
    coverage_description: form.coverage_description.trim() || null,
    start_date: form.start_date || null,
    document_required: Boolean(form.document_required),
    registration_required: Boolean(form.registration_required),
    notes: form.notes.trim() || null,
    ...buildPeriodPayload(form, periodMode),
    ...buildMaintenancePayload(form, options),
  };
}

function validatePeriod(form: WarrantyFormValues, periodMode: WarrantyPeriodMode): string | null {
  if (periodMode === 'duration') {
    if (form.start_date && (!form.duration_value || Number(form.duration_value) <= 0)) {
      return 'Enter a positive duration when a start date is set.';
    }
    if (form.duration_value && !form.start_date) {
      return 'Start date is required when using duration.';
    }
    if (form.status === 'active') {
      if (!form.start_date) return 'Active warranty requires a start date.';
      if (!form.duration_value || Number(form.duration_value) <= 0) {
        return 'Active warranty requires a duration.';
      }
    }
    return null;
  }

  if (form.start_date && form.end_date && form.end_date < form.start_date) {
    return 'End date cannot be before start date.';
  }
  if (form.status === 'active') {
    if (!form.start_date) return 'Active warranty requires a start date.';
    if (!form.end_date) return 'Active warranty requires an end date.';
  }
  return null;
}

function validateMaintenance(form: WarrantyFormValues): string | null {
  if (!form.maintenance_required) return null;
  if (!form.maintenance_frequency) return 'Maintenance frequency is required.';
  if (!form.maintenance_due_date) return 'Maintenance due date is required.';
  if (form.maintenance_frequency === 'custom') {
    if (!form.maintenance_interval_value || Number(form.maintenance_interval_value) <= 0) {
      return 'Enter a positive custom maintenance interval.';
    }
    if (!form.maintenance_interval_unit) return 'Maintenance interval unit is required.';
  }
  return null;
}

const CLEARED_MAINTENANCE_FIELDS: Pick<
  WarrantyFormValues,
  'maintenance_frequency' | 'maintenance_interval_value' | 'maintenance_interval_unit' | 'maintenance_due_date'
> = {
  maintenance_frequency: 'annually',
  maintenance_interval_value: '',
  maintenance_interval_unit: 'months',
  maintenance_due_date: '',
};

export default function WarrantyFormModal({ open, onClose, projectId, editingWarranty, onSuccess }: Props) {
  const [form, setForm] = useState<WarrantyFormValues>(() => buildInitialForm(editingWarranty));
  const [periodMode, setPeriodMode] = useState<WarrantyPeriodMode>(() => inferPeriodMode(editingWarranty));

  useEffect(() => {
    if (open) {
      setForm(buildInitialForm(editingWarranty));
      setPeriodMode(inferPeriodMode(editingWarranty));
    }
  }, [open, editingWarranty]);

  const updateField = <K extends keyof WarrantyFormValues>(field: K, value: WarrantyFormValues[K]) => {
    if (field === 'maintenance_required' && value === false) {
      setForm((prev) => ({
        ...prev,
        maintenance_required: false,
        ...CLEARED_MAINTENANCE_FIELDS,
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePeriodModeChange = (mode: WarrantyPeriodMode) => {
    if (mode === 'end_date' && periodMode === 'duration') {
      const computed = calculateWarrantyEndDate(form.start_date, form.duration_value, form.duration_unit);
      if (computed) {
        setForm((prev) => ({ ...prev, end_date: computed }));
      }
    }
    setPeriodMode(mode);
  };

  const hadMaintenanceCompletion = Boolean(editingWarranty?.last_maintenance_completed_at);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = buildWarrantyPayload(form, periodMode, {
        isCreate: !editingWarranty,
        hadMaintenanceCompletion,
      });
      if (editingWarranty) {
        return api('PATCH', `/projects/${projectId}/warranties/${editingWarranty.id}`, body);
      }
      return api('POST', `/projects/${projectId}/warranties`, body);
    },
    onSuccess: () => {
      toast.success(editingWarranty ? 'Warranty updated' : 'Warranty created');
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save warranty'),
  });

  const canSubmit = form.name.trim().length > 0;
  const submitDisabled = !canSubmit || saveMutation.isPending;
  const isEditing = Boolean(editingWarranty);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const periodError = validatePeriod(form, periodMode);
    if (periodError) {
      toast.error(periodError);
      return;
    }
    const maintenanceError = validateMaintenance(form);
    if (maintenanceError) {
      toast.error(maintenanceError);
      return;
    }
    saveMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit warranty' : 'Add warranty'}
      description={
        isEditing
          ? 'Update coverage, dates, and status for this warranty record.'
          : 'Create a warranty record for this project. You can attach documents from Files after saving.'
      }
      formWidth="wide"
      quickInfo={projectWarrantyFormQuickInfo}
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
            {saveMutation.isPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create warranty'}
          </AppButton>
        </div>
      }
    >
      <WarrantyFormFields
        formId={FORM_ID}
        values={form}
        periodMode={periodMode}
        onPeriodModeChange={handlePeriodModeChange}
        disabled={saveMutation.isPending}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
