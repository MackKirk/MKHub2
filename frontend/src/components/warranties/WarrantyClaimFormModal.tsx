import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { projectWarrantyClaimEditQuickInfo, projectWarrantyClaimQuickInfo } from '@/lib/formModalQuickInfo';
import { AppButton, AppFormModal, uiCx, uiLayout, uiSpacing } from '@/components/ui';
import {
  EMPTY_CLAIM_FORM,
  WarrantyClaimFormFields,
  type WarrantyClaimFormValues,
} from '@/components/warranties/WarrantyClaimFormFields';

const FORM_ID = 'project-warranty-claim-form';

type WarrantyOption = { id: string; name: string };

export type WarrantyClaimEditSource = {
  id: string;
  claim_number: string;
  warranty_id?: string | null;
  description: string;
  severity: string;
  status: string;
  reported_date?: string | null;
  issue_location?: string | null;
  coverage_decision: string;
  assigned_user_id?: string | null;
  assessment_notes?: string | null;
  denial_reason?: string | null;
  decision_date?: string | null;
  customer_notified_date?: string | null;
  root_cause?: string | null;
  work_performed?: string | null;
  resolution_notes?: string | null;
  completion_date?: string | null;
  resolved_by_user_id?: string | null;
  customer_confirmation?: boolean | null;
  follow_up_required?: boolean;
  follow_up_date?: string | null;
  labour_cost?: number | null;
  material_cost?: number | null;
  subcontractor_cost?: number | null;
  other_cost?: number | null;
  amount_charged_to_customer?: number | null;
  recoverable_amount?: number | null;
  cost_responsibility?: string | null;
  total_internal_cost?: number | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  warranties: WarrantyOption[];
  defaultWarrantyId?: string;
  editingClaim?: WarrantyClaimEditSource | null;
  canViewCosts?: boolean;
  currentUserId?: string;
  onSuccess: () => void;
};

function sliceDate(s?: string | null) {
  return s ? String(s).slice(0, 10) : '';
}

function numToStr(n?: number | null) {
  return n != null ? String(n) : '';
}

function buildInitialForm(defaultWarrantyId?: string, editing?: WarrantyClaimEditSource | null): WarrantyClaimFormValues {
  if (!editing) return { ...EMPTY_CLAIM_FORM, warranty_id: defaultWarrantyId || '' };
  return {
    warranty_id: editing.warranty_id || '',
    description: editing.description || '',
    severity: editing.severity || 'medium',
    status: editing.status || 'reported',
    reported_date: sliceDate(editing.reported_date) || new Date().toISOString().slice(0, 10),
    issue_location: editing.issue_location || '',
    coverage_decision: editing.coverage_decision || 'pending_assessment',
    assigned_user_id: editing.assigned_user_id || '',
    assessment_notes: editing.assessment_notes || '',
    denial_reason: editing.denial_reason || '',
    decision_date: sliceDate(editing.decision_date),
    customer_notified_date: sliceDate(editing.customer_notified_date),
    root_cause: editing.root_cause || '',
    work_performed: editing.work_performed || '',
    resolution_notes: editing.resolution_notes || '',
    completion_date: sliceDate(editing.completion_date),
    resolved_by_user_id: editing.resolved_by_user_id || '',
    customer_confirmation:
      editing.customer_confirmation === true ? 'true' : editing.customer_confirmation === false ? 'false' : '',
    follow_up_required: Boolean(editing.follow_up_required),
    follow_up_date: sliceDate(editing.follow_up_date),
    labour_cost: numToStr(editing.labour_cost),
    material_cost: numToStr(editing.material_cost),
    subcontractor_cost: numToStr(editing.subcontractor_cost),
    other_cost: numToStr(editing.other_cost),
    amount_charged_to_customer: numToStr(editing.amount_charged_to_customer),
    recoverable_amount: numToStr(editing.recoverable_amount),
    cost_responsibility: editing.cost_responsibility || '',
  };
}

function parseOptionalNumber(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function validateClaimForm(values: WarrantyClaimFormValues, isEdit: boolean): string | null {
  if (!values.description.trim()) return 'Description is required';
  if (!isEdit) return null;
  if (values.coverage_decision === 'not_covered' && !values.denial_reason.trim()) {
    return 'Denial reason is required for Not Covered';
  }
  if (values.coverage_decision === 'partially_covered' && !values.assessment_notes.trim()) {
    return 'Assessment notes are required for Partially Covered';
  }
  if (values.status === 'resolved') {
    if (!values.completion_date) return 'Completion date is required to resolve claim';
    if (!values.resolution_notes.trim()) return 'Resolution notes are required to resolve claim';
    if (!values.resolved_by_user_id) return 'Resolved by is required to resolve claim';
  }
  if (values.follow_up_required && !values.follow_up_date) {
    return 'Follow-up date is required when follow-up is required';
  }
  return null;
}

function buildPayload(values: WarrantyClaimFormValues, isEdit: boolean, canViewCosts: boolean) {
  const base: Record<string, unknown> = {
    warranty_id: values.warranty_id || null,
    description: values.description.trim(),
    severity: values.severity,
    reported_date: values.reported_date || null,
    issue_location: values.issue_location.trim() || null,
  };

  if (!isEdit) return base;

  const payload: Record<string, unknown> = {
    ...base,
    status: values.status,
    coverage_decision: values.coverage_decision,
    assigned_user_id: values.assigned_user_id || null,
    assessment_notes: values.assessment_notes.trim() || null,
    denial_reason: values.denial_reason.trim() || null,
    decision_date: values.decision_date || null,
    customer_notified_date: values.customer_notified_date || null,
    root_cause: values.root_cause.trim() || null,
    work_performed: values.work_performed.trim() || null,
    resolution_notes: values.resolution_notes.trim() || null,
    completion_date: values.completion_date || null,
    resolved_by_user_id: values.resolved_by_user_id || null,
    customer_confirmation:
      values.customer_confirmation === 'true' ? true : values.customer_confirmation === 'false' ? false : null,
    follow_up_required: values.follow_up_required,
    follow_up_date: values.follow_up_required ? values.follow_up_date || null : null,
  };

  if (canViewCosts) {
    payload.labour_cost = parseOptionalNumber(values.labour_cost);
    payload.material_cost = parseOptionalNumber(values.material_cost);
    payload.subcontractor_cost = parseOptionalNumber(values.subcontractor_cost);
    payload.other_cost = parseOptionalNumber(values.other_cost);
    payload.amount_charged_to_customer = parseOptionalNumber(values.amount_charged_to_customer);
    payload.recoverable_amount = parseOptionalNumber(values.recoverable_amount);
    payload.cost_responsibility = values.cost_responsibility || null;
  }

  return payload;
}

export default function WarrantyClaimFormModal({
  open,
  onClose,
  projectId,
  warranties,
  defaultWarrantyId,
  editingClaim,
  canViewCosts = false,
  currentUserId,
  onSuccess,
}: Props) {
  const isEdit = Boolean(editingClaim);
  const [form, setForm] = useState<WarrantyClaimFormValues>(() => buildInitialForm(defaultWarrantyId, editingClaim));

  useEffect(() => {
    if (open) {
      const initial = buildInitialForm(defaultWarrantyId, editingClaim);
      if (isEdit && editingClaim?.status === 'resolved' && !initial.resolved_by_user_id && currentUserId) {
        initial.resolved_by_user_id = currentUserId;
      }
      setForm(initial);
    }
  }, [open, defaultWarrantyId, editingClaim, isEdit, currentUserId]);

  useEffect(() => {
    if (isEdit && form.status === 'resolved' && !form.resolved_by_user_id && currentUserId) {
      setForm((prev) => ({ ...prev, resolved_by_user_id: currentUserId }));
    }
  }, [form.status, form.resolved_by_user_id, isEdit, currentUserId]);

  const updateField = <K extends keyof WarrantyClaimFormValues>(field: K, value: WarrantyClaimFormValues[K]) => {
    setForm((prev) => {
      if (field === 'follow_up_required' && value === false) {
        return { ...prev, follow_up_required: false, follow_up_date: '' };
      }
      return { ...prev, [field]: value };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form, isEdit, canViewCosts);
      if (isEdit && editingClaim) {
        return api('PATCH', `/projects/${projectId}/warranty-claims/${editingClaim.id}`, payload);
      }
      return api('POST', `/projects/${projectId}/warranty-claims`, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Claim updated' : 'Claim registered');
      onSuccess();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message || (isEdit ? 'Failed to update claim' : 'Failed to register claim')),
  });

  const validationError = validateClaimForm(form, isEdit);
  const submitDisabled = Boolean(validationError) || saveMutation.isPending;

  const handleSubmit = () => {
    const err = validateClaimForm(form, isEdit);
    if (err) {
      toast.error(err);
      return;
    }
    saveMutation.mutate();
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      layout={isEdit ? 'detail' : 'form'}
      size={isEdit ? 'lg' : 'sm'}
      title={isEdit ? `Edit claim ${editingClaim?.claim_number || ''}` : 'Register claim'}
      description={
        isEdit
          ? 'Update status, assignment, coverage assessment, resolution and costs.'
          : 'Log a warranty claim for this project. Emergency severity notifies the project admin immediately.'
      }
      formWidth={isEdit ? undefined : 'comfortable'}
      bodyClassName={isEdit ? uiCx(uiSpacing.cardPadding, 'min-w-0') : undefined}
      bodyFill={isEdit ? false : undefined}
      quickInfo={isEdit ? projectWarrantyClaimEditQuickInfo : projectWarrantyClaimQuickInfo}
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
            {saveMutation.isPending ? (isEdit ? 'Saving…' : 'Registering…') : isEdit ? 'Save changes' : 'Register claim'}
          </AppButton>
        </div>
      }
    >
      <WarrantyClaimFormFields
        formId={FORM_ID}
        values={form}
        warranties={warranties}
        isEdit={isEdit}
        canViewCosts={canViewCosts}
        disabled={saveMutation.isPending}
        onChange={updateField}
        onSubmit={handleSubmit}
      />
    </AppFormModal>
  );
}
