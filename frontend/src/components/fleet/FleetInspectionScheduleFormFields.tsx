import {
  AppButton,
  AppCombobox,
  AppDatePicker,
  AppInput,
  AppSelect,
  AppTextarea,
  type AppComboboxOption,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { FLEET_INSPECTION_SCHEDULE_FIELD_HINTS as H } from '@/lib/fleetInspectionScheduleFieldHints';

const URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const CATEGORY_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'other', label: 'Other' },
];

export type FleetInspectionScheduleFormValues = {
  fleet_asset_id: string;
  scheduled_at: string;
  urgency: string;
  category: string;
  notes: string;
};

type Props = {
  formId: string;
  values: FleetInspectionScheduleFormValues;
  disabled?: boolean;
  onChange: (field: keyof FleetInspectionScheduleFormValues, value: string) => void;
  onSubmit: () => void;
  /** Locked label from asset detail, or searchable picker for calendar. */
  vehicleMode?: 'locked' | 'picker';
  lockedVehicleDisplayName?: string;
  vehicleOptions?: AppComboboxOption[];
  vehicleLoading?: boolean;
  vehicleError?: boolean;
  onRetryVehicles?: () => void;
};

export function FleetInspectionScheduleFormFields({
  formId,
  values,
  disabled,
  onChange,
  onSubmit,
  vehicleMode = 'locked',
  lockedVehicleDisplayName = '',
  vehicleOptions = [],
  vehicleLoading = false,
  vehicleError = false,
  onRetryVehicles,
}: Props) {
  const vehicleLabel = (
    <>
      Vehicle <span className="text-brand-red">*</span>
    </>
  );

  const vehicleField =
    vehicleMode === 'picker' ? (
      vehicleLoading ? (
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
          value={values.fleet_asset_id}
          onChange={(v) => onChange('fleet_asset_id', v)}
          options={vehicleOptions}
          placeholder="Search by name, unit #, type…"
          disabled={disabled}
          fieldHint={H.vehicle}
          emptyMessage="No vehicles match. Try another search."
        />
      )
    ) : (
      <AppInput
        label="Vehicle *"
        value={lockedVehicleDisplayName}
        readOnly
        disabled
        fieldHint={H.vehicle}
      />
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
        {vehicleField}
        <AppDatePicker
          label="Date *"
          value={values.scheduled_at}
          onChange={(e) => onChange('scheduled_at', e.target.value)}
          disabled={disabled}
          fieldHint={H.scheduled_at}
        />
        <AppSelect
          label="Urgency"
          value={values.urgency}
          onChange={(e) => onChange('urgency', e.target.value)}
          options={URGENCY_OPTIONS}
          disabled={disabled}
          fieldHint={H.urgency}
        />
        <AppSelect
          label="Category"
          value={values.category}
          onChange={(e) => onChange('category', e.target.value)}
          options={CATEGORY_OPTIONS}
          disabled={disabled}
          fieldHint={H.category}
        />
      </div>
      <AppTextarea
        label="Notes (optional)"
        value={values.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        rows={3}
        placeholder="Observações..."
        disabled={disabled}
        fieldHint={H.notes}
      />
    </form>
  );
}
