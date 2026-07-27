import {
  AppDatePicker,
  AppInput,
  AppSelect,
  AppTextarea,
  uiLayout,
  uiSpacing,
} from '@/components/ui';
import { WARRANTY_FIELD_HINTS as H } from '@/lib/warrantyFieldHints';
import { CLAIM_SEVERITY_LABELS } from '@/lib/warrantyLabels';

export type WarrantyClaimFormValues = {
  warranty_id: string;
  description: string;
  severity: string;
  status: string;
  reported_date: string;
  issue_location: string;
  coverage_decision: string;
};

export const EMPTY_CLAIM_FORM: WarrantyClaimFormValues = {
  warranty_id: '',
  description: '',
  severity: 'medium',
  status: 'reported',
  reported_date: new Date().toISOString().slice(0, 10),
  issue_location: '',
  coverage_decision: 'pending_assessment',
};

type WarrantyOption = { id: string; name: string };

type Props = {
  formId: string;
  values: WarrantyClaimFormValues;
  warranties: WarrantyOption[];
  disabled?: boolean;
  onChange: <K extends keyof WarrantyClaimFormValues>(field: K, value: WarrantyClaimFormValues[K]) => void;
  onSubmit: () => void;
};

export function WarrantyClaimFormFields({ formId, values, warranties, disabled, onChange, onSubmit }: Props) {
  const warrantyOptions = [
    { value: '', label: '— Optional —' },
    ...warranties.map((w) => ({ value: w.id, label: w.name })),
  ];
  const severityOptions = Object.entries(CLAIM_SEVERITY_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiSpacing.sectionStack}
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
          options={severityOptions}
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
    </form>
  );
}
