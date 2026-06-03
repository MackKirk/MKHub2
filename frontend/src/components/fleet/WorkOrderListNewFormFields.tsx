import {
  AppButton,
  AppCheckbox,
  AppCombobox,
  AppDatePicker,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  AppTimePicker,
  AppUserSelect,
  type AppComboboxOption,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { FLEET_WORK_ORDER_FIELD_HINTS as H } from '@/lib/fleetWorkOrderFieldHints';

const ENTITY_TYPE_OPTIONS = [
  { value: 'fleet', label: 'Fleet asset' },
  { value: 'equipment', label: 'Equipment' },
];

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export type WorkOrderListNewFormValues = {
  entity_type: string;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  assigned_to_user_id: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: string;
  body_repair_required: boolean;
  new_stickers_applied: boolean;
  labor_cost: string;
  parts_cost: string;
  other_cost: string;
};

type Props = {
  formId: string;
  values: WorkOrderListNewFormValues;
  disabled?: boolean;
  employees: unknown[];
  vehicleOptions: AppComboboxOption[];
  vehicleLoading?: boolean;
  vehicleError?: boolean;
  onRetryVehicles?: () => void;
  onChange: (field: keyof WorkOrderListNewFormValues, value: string | boolean) => void;
  onSubmit: () => void;
};

export function WorkOrderListNewFormFields({
  formId,
  values,
  disabled,
  employees,
  vehicleOptions,
  vehicleLoading = false,
  vehicleError = false,
  onRetryVehicles,
  onChange,
  onSubmit,
}: Props) {
  const assignUsers = (Array.isArray(employees) ? employees : []).map((e: unknown) =>
    mapEmployeeToAppUserSelect(e as Record<string, unknown>),
  );

  const isFleet = values.entity_type === 'fleet';

  const vehicleLabel = (
    <>
      Vehicle <span className="text-brand-red">*</span>
    </>
  );

  const vehicleField = vehicleLoading ? (
    <AppInput label={vehicleLabel} value="Loading vehicles…" readOnly disabled fieldHint={H.vehicle} />
  ) : vehicleError ? (
    <div className="space-y-2">
      <p className={uiTypography.helper}>Could not load vehicles. Check your connection and try again.</p>
      {onRetryVehicles ? (
        <AppButton type="button" variant="secondary" size="sm" onClick={onRetryVehicles}>
          Retry
        </AppButton>
      ) : null}
    </div>
  ) : (
    <AppCombobox
      label={vehicleLabel}
      value={values.entity_id}
      onChange={(v) => onChange('entity_id', v)}
      options={vehicleOptions}
      placeholder="Search by name, unit #, type…"
      disabled={disabled}
      fieldHint={H.vehicle}
      emptyMessage="No vehicles match. Try another search."
    />
  );

  const descriptionLabel = (
    <>
      Description / notes <span className="text-brand-red">*</span>
    </>
  );

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
          label="Entity type"
          value={values.entity_type}
          onChange={(e) => {
            onChange('entity_type', e.target.value);
            onChange('entity_id', '');
          }}
          options={ENTITY_TYPE_OPTIONS}
          disabled={disabled}
          fieldHint={H.entity_type}
        />
        {isFleet ? vehicleField : null}
        <AppSelect
          label="Category"
          value={values.category}
          onChange={(e) => onChange('category', e.target.value)}
          options={CATEGORY_OPTIONS}
          disabled={disabled}
          fieldHint={H.category}
        />
        <AppSelect
          label="Urgency"
          value={values.urgency}
          onChange={(e) => onChange('urgency', e.target.value)}
          options={URGENCY_OPTIONS}
          disabled={disabled}
          fieldHint={H.urgency}
        />
        <AppUserSelect
          mode="single"
          label="Assigned to"
          users={assignUsers}
          value={values.assigned_to_user_id}
          onChange={(userId) => onChange('assigned_to_user_id', userId ?? '')}
          placeholder="Unassigned"
          disabled={disabled}
          fieldHint={H.assigned_to}
        />
      </div>

      <AppTextarea
        label={descriptionLabel}
        value={values.description}
        onChange={(e) => onChange('description', e.target.value)}
        rows={4}
        placeholder="Describe the issue, work needed, and any additional notes…"
        required
        disabled={disabled}
        fieldHint={H.description}
      />

      {isFleet ? (
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader title="Service / scheduling" />
          <div className={uiLayout.sectionGrid2}>
            <AppDatePicker
              label="Scheduled date"
              value={values.scheduled_date}
              onChange={(e) => onChange('scheduled_date', e.target.value)}
              disabled={disabled}
              fieldHint={H.scheduled_date}
            />
            <AppTimePicker
              label="Time"
              value={values.scheduled_time}
              onChange={(e) => onChange('scheduled_time', e.target.value)}
              disabled={disabled}
              fieldHint={H.scheduled_time}
            />
            <AppInput
              label="Estimated duration (min)"
              type="number"
              min={0}
              placeholder="e.g. 120"
              value={values.estimated_duration_minutes}
              onChange={(e) => onChange('estimated_duration_minutes', e.target.value)}
              disabled={disabled}
              fieldHint={H.estimated_duration}
            />
          </div>
          <div className="flex flex-wrap gap-6">
            <AppCheckbox
              label="Body repair required"
              checked={values.body_repair_required}
              onChange={(checked) => onChange('body_repair_required', checked)}
              disabled={disabled}
              fieldHint={H.body_repair_required}
            />
            <AppCheckbox
              label="New decals required"
              checked={values.new_stickers_applied}
              onChange={(checked) => onChange('new_stickers_applied', checked)}
              disabled={disabled}
              fieldHint={H.new_stickers_applied}
            />
          </div>
        </div>
      ) : null}

      <div className={uiSpacing.sectionStack}>
        <AppSectionHeader title="Costs (optional)" />
        <div className="grid grid-cols-3 gap-4">
          <AppInput
            label="Labor ($)"
            type="number"
            min={0}
            step="0.01"
            value={values.labor_cost}
            onChange={(e) => onChange('labor_cost', e.target.value)}
            disabled={disabled}
          />
          <AppInput
            label="Parts ($)"
            type="number"
            min={0}
            step="0.01"
            value={values.parts_cost}
            onChange={(e) => onChange('parts_cost', e.target.value)}
            disabled={disabled}
          />
          <AppInput
            label="Other ($)"
            type="number"
            min={0}
            step="0.01"
            value={values.other_cost}
            onChange={(e) => onChange('other_cost', e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </form>
  );
}
