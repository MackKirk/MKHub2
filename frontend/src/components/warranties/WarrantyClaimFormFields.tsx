import {
  AppCheckbox,
  AppDatePicker,
  AppInput,
  AppSelect,
  AppTextarea,
  AppUserSelect,
  uiLayout,
  uiSpacing,
  uiTypography,
  uiCx,
} from '@/components/ui';
import { WARRANTY_FIELD_HINTS as H } from '@/lib/warrantyFieldHints';
import {
  CLAIM_SEVERITY_LABELS,
  CLAIM_STATUS_LABELS,
  COST_RESPONSIBILITY_LABELS,
  COVERAGE_DECISION_LABELS,
} from '@/lib/warrantyLabels';

export type WarrantyClaimFormValues = {
  warranty_id: string;
  description: string;
  severity: string;
  status: string;
  reported_date: string;
  issue_location: string;
  coverage_decision: string;
  assigned_user_id: string;
  assessment_notes: string;
  denial_reason: string;
  decision_date: string;
  customer_notified_date: string;
  root_cause: string;
  work_performed: string;
  resolution_notes: string;
  completion_date: string;
  resolved_by_user_id: string;
  customer_confirmation: string;
  follow_up_required: boolean;
  follow_up_date: string;
  labour_cost: string;
  material_cost: string;
  subcontractor_cost: string;
  other_cost: string;
  amount_charged_to_customer: string;
  recoverable_amount: string;
  cost_responsibility: string;
};

export const EMPTY_CLAIM_FORM: WarrantyClaimFormValues = {
  warranty_id: '',
  description: '',
  severity: 'medium',
  status: 'reported',
  reported_date: new Date().toISOString().slice(0, 10),
  issue_location: '',
  coverage_decision: 'pending_assessment',
  assigned_user_id: '',
  assessment_notes: '',
  denial_reason: '',
  decision_date: '',
  customer_notified_date: '',
  root_cause: '',
  work_performed: '',
  resolution_notes: '',
  completion_date: '',
  resolved_by_user_id: '',
  customer_confirmation: '',
  follow_up_required: false,
  follow_up_date: '',
  labour_cost: '',
  material_cost: '',
  subcontractor_cost: '',
  other_cost: '',
  amount_charged_to_customer: '',
  recoverable_amount: '',
  cost_responsibility: '',
};

type WarrantyOption = { id: string; name: string };

type Props = {
  formId: string;
  values: WarrantyClaimFormValues;
  warranties: WarrantyOption[];
  isEdit?: boolean;
  canViewCosts?: boolean;
  disabled?: boolean;
  onChange: <K extends keyof WarrantyClaimFormValues>(field: K, value: WarrantyClaimFormValues[K]) => void;
  onSubmit: () => void;
};

function toSelectOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className={uiTypography.sectionTitle}>{children}</h3>;
}

export function WarrantyClaimFormFields({
  formId,
  values,
  warranties,
  isEdit = false,
  canViewCosts = false,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const warrantyOptions = [
    { value: '', label: '— Optional —' },
    ...warranties.map((w) => ({ value: w.id, label: w.name })),
  ];

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiCx(uiSpacing.sectionStack, isEdit && '[overflow-anchor:none]')}
    >
      <div className={uiLayout.sectionGrid2}>
        <AppSelect
          label="Related warranty"
          value={values.warranty_id}
          onChange={(e) => onChange('warranty_id', e.target.value)}
          options={warrantyOptions}
          disabled={disabled}
          fieldHint={H.claim_warranty}
        />
        <AppSelect
          label="Severity"
          value={values.severity}
          onChange={(e) => onChange('severity', e.target.value)}
          options={toSelectOptions(CLAIM_SEVERITY_LABELS)}
          disabled={disabled}
          fieldHint={H.claim_severity}
        />
      </div>
      <AppTextarea
        label={
          <>
            Description <span className="text-brand-red">*</span>
          </>
        }
        value={values.description}
        onChange={(e) => onChange('description', e.target.value)}
        rows={4}
        disabled={disabled}
        fieldHint={H.claim_description}
      />
      <div className={uiLayout.sectionGrid2}>
        <AppInput
          label="Issue location"
          value={values.issue_location}
          onChange={(e) => onChange('issue_location', e.target.value)}
          disabled={disabled}
          fieldHint={H.claim_issue_location}
        />
        <AppDatePicker
          label="Reported date"
          value={values.reported_date}
          onChange={(e) => onChange('reported_date', e.target.value)}
          disabled={disabled}
          fieldHint={H.claim_reported_date}
        />
      </div>

      {isEdit ? (
        <>
          <SectionTitle>Workflow</SectionTitle>
          <div className={uiLayout.sectionGrid2}>
            <AppSelect
              label="Status"
              value={values.status}
              onChange={(e) => onChange('status', e.target.value)}
              options={toSelectOptions(CLAIM_STATUS_LABELS)}
              disabled={disabled}
              fieldHint={H.claim_status}
            />
            <AppUserSelect
              label="Assigned to"
              value={values.assigned_user_id || null}
              onChange={(id) => onChange('assigned_user_id', id || '')}
              disabled={disabled}
              fieldHint={H.claim_assigned_user}
            />
          </div>

          <SectionTitle>Assessment</SectionTitle>
          <div className={uiLayout.sectionGrid2}>
            <AppSelect
              label="Coverage decision"
              value={values.coverage_decision}
              onChange={(e) => onChange('coverage_decision', e.target.value)}
              options={toSelectOptions(COVERAGE_DECISION_LABELS)}
              disabled={disabled}
              fieldHint={H.claim_coverage_decision}
            />
            <AppDatePicker
              label="Decision date"
              value={values.decision_date}
              onChange={(e) => onChange('decision_date', e.target.value)}
              disabled={disabled}
              fieldHint={H.claim_decision_date}
            />
          </div>
          <AppTextarea
            label="Assessment notes"
            value={values.assessment_notes}
            onChange={(e) => onChange('assessment_notes', e.target.value)}
            rows={3}
            disabled={disabled}
            fieldHint={H.claim_assessment_notes}
          />
          {values.coverage_decision === 'not_covered' ? (
            <AppTextarea
              label={
                <>
                  Denial reason <span className="text-brand-red">*</span>
                </>
              }
              value={values.denial_reason}
              onChange={(e) => onChange('denial_reason', e.target.value)}
              rows={3}
              disabled={disabled}
              fieldHint={H.claim_denial_reason}
            />
          ) : null}
          <AppDatePicker
            label="Customer notified date"
            value={values.customer_notified_date}
            onChange={(e) => onChange('customer_notified_date', e.target.value)}
            disabled={disabled}
            fieldHint={H.claim_customer_notified_date}
          />

          <SectionTitle>Resolution</SectionTitle>
          <AppTextarea
            label="Root cause"
            value={values.root_cause}
            onChange={(e) => onChange('root_cause', e.target.value)}
            rows={2}
            disabled={disabled}
            fieldHint={H.claim_root_cause}
          />
          <AppTextarea
            label="Work performed"
            value={values.work_performed}
            onChange={(e) => onChange('work_performed', e.target.value)}
            rows={2}
            disabled={disabled}
            fieldHint={H.claim_work_performed}
          />
          <AppTextarea
            label={
              values.status === 'resolved' ? (
                <>
                  Resolution notes <span className="text-brand-red">*</span>
                </>
              ) : (
                'Resolution notes'
              )
            }
            value={values.resolution_notes}
            onChange={(e) => onChange('resolution_notes', e.target.value)}
            rows={3}
            disabled={disabled}
            fieldHint={H.claim_resolution_notes}
          />
          <div className={uiLayout.sectionGrid2}>
            <AppDatePicker
              label={
                values.status === 'resolved' ? (
                  <>
                    Completion date <span className="text-brand-red">*</span>
                  </>
                ) : (
                  'Completion date'
                )
              }
              value={values.completion_date}
              onChange={(e) => onChange('completion_date', e.target.value)}
              disabled={disabled}
              fieldHint={H.claim_completion_date}
            />
            <AppUserSelect
              label={
                values.status === 'resolved' ? (
                  <>
                    Resolved by <span className="text-brand-red">*</span>
                  </>
                ) : (
                  'Resolved by'
                )
              }
              value={values.resolved_by_user_id || null}
              onChange={(id) => onChange('resolved_by_user_id', id || '')}
              disabled={disabled}
              fieldHint={H.claim_resolved_by}
            />
          </div>
          <AppSelect
            label="Customer confirmation"
            value={values.customer_confirmation}
            onChange={(e) => onChange('customer_confirmation', e.target.value)}
            options={[
              { value: '', label: '— Not set —' },
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' },
            ]}
            disabled={disabled}
            fieldHint={H.claim_customer_confirmation}
          />

          <SectionTitle>Follow-up</SectionTitle>
          <AppCheckbox
            label="Follow-up required"
            checked={values.follow_up_required}
            onChange={(checked) => onChange('follow_up_required', checked)}
            disabled={disabled}
            fieldHint={H.claim_follow_up_required}
          />
          {values.follow_up_required ? (
            <AppDatePicker
              label={
                <>
                  Follow-up date <span className="text-brand-red">*</span>
                </>
              }
              value={values.follow_up_date}
              onChange={(e) => onChange('follow_up_date', e.target.value)}
              disabled={disabled}
              fieldHint={H.claim_follow_up_date}
            />
          ) : null}

          {canViewCosts ? (
            <>
              <SectionTitle>Costs</SectionTitle>
              <div className={uiLayout.sectionGrid2}>
                <AppInput
                  label="Labour cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.labour_cost}
                  onChange={(e) => onChange('labour_cost', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_labour_cost}
                />
                <AppInput
                  label="Material cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.material_cost}
                  onChange={(e) => onChange('material_cost', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_material_cost}
                />
                <AppInput
                  label="Subcontractor cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.subcontractor_cost}
                  onChange={(e) => onChange('subcontractor_cost', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_subcontractor_cost}
                />
                <AppInput
                  label="Other cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.other_cost}
                  onChange={(e) => onChange('other_cost', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_other_cost}
                />
                <AppInput
                  label="Amount charged to customer"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.amount_charged_to_customer}
                  onChange={(e) => onChange('amount_charged_to_customer', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_amount_charged}
                />
                <AppInput
                  label="Recoverable amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={values.recoverable_amount}
                  onChange={(e) => onChange('recoverable_amount', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.claim_recoverable_amount}
                />
              </div>
              <AppSelect
                label="Cost responsibility"
                value={values.cost_responsibility}
                onChange={(e) => onChange('cost_responsibility', e.target.value)}
                options={[{ value: '', label: '— Not set —' }, ...toSelectOptions(COST_RESPONSIBILITY_LABELS)]}
                disabled={disabled}
                fieldHint={H.claim_cost_responsibility}
              />
            </>
          ) : null}
        </>
      ) : null}
    </form>
  );
}
