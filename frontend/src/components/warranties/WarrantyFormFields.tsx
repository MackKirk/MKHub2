import {
  AppCheckbox,
  AppDatePicker,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { formatFriendlyDate } from '@/lib/dateUtils';
import { calculateWarrantyEndDate } from '@/lib/warrantyDateUtils';
import { WARRANTY_FIELD_HINTS as H } from '@/lib/warrantyFieldHints';
import {
  MAINTENANCE_FREQUENCY_LABELS,
  PROVIDER_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
} from '@/lib/warrantyLabels';

const DURATION_UNIT_OPTIONS = [
  { value: 'days', label: 'Days' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
];

const MAINTENANCE_INTERVAL_UNIT_OPTIONS = DURATION_UNIT_OPTIONS;

const MAINTENANCE_FREQUENCY_OPTIONS = Object.entries(MAINTENANCE_FREQUENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PERIOD_MODE_OPTIONS = [
  { value: 'duration', label: 'By duration' },
  { value: 'end_date', label: 'By end date' },
];

export type WarrantyPeriodMode = 'duration' | 'end_date';

export type WarrantyFormValues = {
  name: string;
  warranty_type: string;
  provider_type: string;
  provider_name: string;
  status: string;
  coverage_type: string;
  coverage_description: string;
  start_date: string;
  duration_value: string;
  duration_unit: string;
  end_date: string;
  maintenance_required: boolean;
  maintenance_frequency: string;
  maintenance_interval_value: string;
  maintenance_interval_unit: string;
  maintenance_due_date: string;
  document_required: boolean;
  registration_required: boolean;
  notes: string;
};

export const EMPTY_WARRANTY_FORM: WarrantyFormValues = {
  name: '',
  warranty_type: 'workmanship',
  provider_type: 'mack_kirk',
  provider_name: '',
  status: 'draft',
  coverage_type: 'entire_project',
  coverage_description: '',
  start_date: '',
  duration_value: '',
  duration_unit: 'years',
  end_date: '',
  maintenance_required: false,
  maintenance_frequency: 'annually',
  maintenance_interval_value: '',
  maintenance_interval_unit: 'months',
  maintenance_due_date: '',
  document_required: false,
  registration_required: false,
  notes: '',
};

type Props = {
  formId: string;
  values: WarrantyFormValues;
  periodMode: WarrantyPeriodMode;
  onPeriodModeChange: (mode: WarrantyPeriodMode) => void;
  disabled?: boolean;
  onChange: <K extends keyof WarrantyFormValues>(field: K, value: WarrantyFormValues[K]) => void;
  onSubmit: () => void;
};

export function WarrantyFormFields({
  formId,
  values,
  periodMode,
  onPeriodModeChange,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const warrantyTypeOptions = Object.entries(WARRANTY_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const providerTypeOptions = Object.entries(PROVIDER_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  const statusOptions = Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => ({ value, label }));

  const computedEndDate =
    periodMode === 'duration'
      ? calculateWarrantyEndDate(values.start_date, values.duration_value, values.duration_unit)
      : null;

  const isCustomMaintenance = values.maintenance_frequency === 'custom';

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiSpacing.sectionStack}
    >
      <div>
        <p className={uiCx(uiTypography.overline, 'mb-3')}>General</p>
        <div className={uiLayout.sectionGrid2}>
          <AppInput
            label={
              <>
                Name <span className="text-brand-red">*</span>
              </>
            }
            value={values.name}
            onChange={(e) => onChange('name', e.target.value)}
            disabled={disabled}
            fieldHint={H.name}
          />
          <AppSelect
            label="Type"
            value={values.warranty_type}
            onChange={(e) => onChange('warranty_type', e.target.value)}
            options={warrantyTypeOptions}
            disabled={disabled}
            fieldHint={H.warranty_type}
          />
          <AppSelect
            label="Provider type"
            value={values.provider_type}
            onChange={(e) => onChange('provider_type', e.target.value)}
            options={providerTypeOptions}
            disabled={disabled}
            fieldHint={H.provider_type}
          />
          <AppInput
            label="Provider name"
            value={values.provider_name}
            onChange={(e) => onChange('provider_name', e.target.value)}
            disabled={disabled}
            fieldHint={H.provider_name}
          />
          <AppSelect
            label="Status"
            value={values.status}
            onChange={(e) => onChange('status', e.target.value)}
            options={statusOptions}
            disabled={disabled}
            fieldHint={H.status}
          />
        </div>
      </div>

      <div>
        <p className={uiCx(uiTypography.overline, 'mb-3')}>Coverage</p>
        <AppTextarea
          label="Coverage description"
          value={values.coverage_description}
          onChange={(e) => onChange('coverage_description', e.target.value)}
          rows={3}
          disabled={disabled}
          fieldHint={H.coverage_description}
        />
      </div>

      <div>
        <p className={uiCx(uiTypography.overline, 'mb-3')}>Period</p>
        <div className={uiSpacing.sectionStack}>
          <AppSelect
            label="Period definition"
            value={periodMode}
            onChange={(e) => onPeriodModeChange(e.target.value as WarrantyPeriodMode)}
            options={PERIOD_MODE_OPTIONS}
            disabled={disabled}
            fieldHint={H.period_definition}
          />
          {periodMode === 'duration' ? (
            <>
              <div className={uiLayout.sectionGrid3}>
                <AppDatePicker
                  label="Start date"
                  value={values.start_date}
                  onChange={(e) => onChange('start_date', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.start_date}
                />
                <AppInput
                  label="Duration"
                  type="number"
                  min={1}
                  value={values.duration_value}
                  onChange={(e) => onChange('duration_value', e.target.value)}
                  disabled={disabled}
                  fieldHint={H.duration_value}
                />
                <AppSelect
                  label="Duration unit"
                  value={values.duration_unit}
                  onChange={(e) => onChange('duration_unit', e.target.value)}
                  options={DURATION_UNIT_OPTIONS}
                  disabled={disabled}
                  fieldHint={H.duration_unit}
                />
              </div>
              {computedEndDate ? (
                <p className={uiTypography.helper}>
                  Coverage ends on {formatFriendlyDate(computedEndDate)}.
                </p>
              ) : null}
            </>
          ) : (
            <div className={uiLayout.sectionGrid2}>
              <AppDatePicker
                label="Start date"
                value={values.start_date}
                onChange={(e) => onChange('start_date', e.target.value)}
                disabled={disabled}
                fieldHint={H.start_date}
              />
              <AppDatePicker
                label="End date"
                value={values.end_date}
                onChange={(e) => onChange('end_date', e.target.value)}
                disabled={disabled}
                fieldHint={H.end_date}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        <p className={uiCx(uiTypography.overline, 'mb-3')}>Maintenance & notes</p>
        <div className={uiSpacing.sectionStack}>
          <AppCheckbox
            label="Maintenance required"
            checked={values.maintenance_required}
            onChange={(checked) => onChange('maintenance_required', checked)}
            disabled={disabled}
            fieldHint={H.maintenance_required}
          />
          {values.maintenance_required ? (
            <div className={uiSpacing.sectionStack}>
              {isCustomMaintenance ? (
                <>
                  <AppSelect
                    label="Frequency"
                    value={values.maintenance_frequency}
                    onChange={(e) => onChange('maintenance_frequency', e.target.value)}
                    options={MAINTENANCE_FREQUENCY_OPTIONS}
                    disabled={disabled}
                    fieldHint={H.maintenance_frequency}
                  />
                  <div className={uiLayout.sectionGrid2}>
                    <AppInput
                      label="Custom interval"
                      type="number"
                      min={1}
                      value={values.maintenance_interval_value}
                      onChange={(e) => onChange('maintenance_interval_value', e.target.value)}
                      disabled={disabled}
                      fieldHint={H.maintenance_interval_value}
                    />
                    <AppSelect
                      label="Interval unit"
                      value={values.maintenance_interval_unit}
                      onChange={(e) => onChange('maintenance_interval_unit', e.target.value)}
                      options={MAINTENANCE_INTERVAL_UNIT_OPTIONS}
                      disabled={disabled}
                      fieldHint={H.maintenance_interval_unit}
                    />
                  </div>
                  <AppDatePicker
                    label="Maintenance due date"
                    value={values.maintenance_due_date}
                    onChange={(e) => onChange('maintenance_due_date', e.target.value)}
                    disabled={disabled}
                    fieldHint={H.maintenance_due_date}
                  />
                </>
              ) : (
                <div className={uiLayout.sectionGrid2}>
                  <AppSelect
                    label="Frequency"
                    value={values.maintenance_frequency}
                    onChange={(e) => onChange('maintenance_frequency', e.target.value)}
                    options={MAINTENANCE_FREQUENCY_OPTIONS}
                    disabled={disabled}
                    fieldHint={H.maintenance_frequency}
                  />
                  <AppDatePicker
                    label="Maintenance due date"
                    value={values.maintenance_due_date}
                    onChange={(e) => onChange('maintenance_due_date', e.target.value)}
                    disabled={disabled}
                    fieldHint={H.maintenance_due_date}
                  />
                </div>
              )}
            </div>
          ) : null}
          <AppTextarea
            label="Notes"
            value={values.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            rows={3}
            disabled={disabled}
            fieldHint={H.notes}
          />
        </div>
      </div>
    </form>
  );
}
