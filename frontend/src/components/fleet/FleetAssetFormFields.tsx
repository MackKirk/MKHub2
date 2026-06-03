import { FLEET_ASSET_FIELD_HINTS } from '@/lib/fleetAssetFieldHints';
import { AppInput, AppSelect, uiLayout, uiSpacing } from '@/components/ui';

export type FleetAssetFormValues = {
  asset_type: string;
  name: string;
  make: string;
  model: string;
  year: string;
  vin: string;
  license_plate: string;
  unit_number: string;
  vehicle_type: string;
  fuel_type: string;
  equipment_type_label: string;
  condition: string;
  status: string;
};

const ASSET_TYPE_OPTIONS = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'heavy_machinery', label: 'Heavy Machinery' },
  { value: 'other', label: 'Other' },
];

const CONDITION_OPTIONS = [
  { value: '', label: 'Select' },
  { value: 'new', label: 'New' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

type FleetAssetFormFieldsProps = {
  formId: string;
  values: FleetAssetFormValues;
  onChange: (field: keyof FleetAssetFormValues, value: string) => void;
  onSubmit: () => void;
};

export function FleetAssetFormFields({ formId, values, onChange, onSubmit }: FleetAssetFormFieldsProps) {
  const isHoursAsset = values.asset_type === 'heavy_machinery' || values.asset_type === 'other';
  const licenseLabel = isHoursAsset ? 'License' : 'License Plate';

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
          label="Asset Type"
          value={values.asset_type}
          onChange={(v) => onChange('asset_type', v)}
          options={ASSET_TYPE_OPTIONS}
          fieldHint={FLEET_ASSET_FIELD_HINTS.asset_type}
        />
        <AppInput
          label="Name"
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.name}
        />
        <AppInput
          label="Make"
          value={values.make}
          onChange={(e) => onChange('make', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.make}
        />
        <AppInput
          label="Model"
          value={values.model}
          onChange={(e) => onChange('model', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.model}
        />
        <AppInput
          label="Year"
          type="number"
          value={values.year}
          onChange={(e) => onChange('year', e.target.value)}
          min={1900}
          max={new Date().getFullYear() + 1}
          fieldHint={FLEET_ASSET_FIELD_HINTS.year}
        />
        <AppInput
          label="VIN / Serial"
          value={values.vin}
          onChange={(e) => onChange('vin', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.vin}
        />
        <AppInput
          label={licenseLabel}
          value={values.license_plate}
          onChange={(e) => onChange('license_plate', e.target.value)}
          fieldHint={isHoursAsset ? FLEET_ASSET_FIELD_HINTS.license : FLEET_ASSET_FIELD_HINTS.license_plate}
        />
        <AppInput
          label="Unit Number"
          value={values.unit_number}
          onChange={(e) => onChange('unit_number', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.unit_number}
        />
        {!isHoursAsset ? (
          <AppInput
            label="Vehicle Type"
            value={values.vehicle_type}
            onChange={(e) => onChange('vehicle_type', e.target.value)}
            fieldHint={FLEET_ASSET_FIELD_HINTS.vehicle_type}
          />
        ) : null}
        <AppInput
          label="Fuel Type"
          value={values.fuel_type}
          onChange={(e) => onChange('fuel_type', e.target.value)}
          fieldHint={FLEET_ASSET_FIELD_HINTS.fuel_type}
        />
        {isHoursAsset ? (
          <AppInput
            label="Type"
            value={values.equipment_type_label}
            onChange={(e) => onChange('equipment_type_label', e.target.value)}
            fieldHint={FLEET_ASSET_FIELD_HINTS.equipment_type_label}
          />
        ) : null}
        <AppSelect
          label="Condition"
          value={values.condition}
          onChange={(v) => onChange('condition', v)}
          options={CONDITION_OPTIONS}
          fieldHint={FLEET_ASSET_FIELD_HINTS.condition}
        />
        <AppSelect
          label="Status"
          value={values.status}
          onChange={(v) => onChange('status', v)}
          options={STATUS_OPTIONS}
          fieldHint={FLEET_ASSET_FIELD_HINTS.status}
        />
      </div>
    </form>
  );
}

export function buildEmptyFleetAssetForm(initialAssetType: string): FleetAssetFormValues {
  return {
    asset_type: initialAssetType,
    name: '',
    make: '',
    model: '',
    year: '',
    vin: '',
    license_plate: '',
    unit_number: '',
    vehicle_type: '',
    fuel_type: '',
    equipment_type_label: '',
    condition: '',
    status: 'active',
  };
}

export function fleetAssetFormCanSubmit(values: FleetAssetFormValues): boolean {
  const fillable = [
    values.name,
    values.make,
    values.model,
    values.year,
    values.vin,
    values.license_plate,
    values.unit_number,
    values.vehicle_type,
    values.fuel_type,
    values.equipment_type_label,
    values.condition,
  ];
  return fillable.some((v) => String(v ?? '').trim() !== '');
}

export function fleetAssetFormToPayload(values: FleetAssetFormValues) {
  return {
    asset_type: values.asset_type,
    name: values.name.trim(),
    make: values.make.trim() || null,
    model: values.model.trim() || null,
    year: values.year ? parseInt(values.year, 10) : null,
    vin: values.vin.trim() || null,
    license_plate: values.license_plate.trim() || null,
    unit_number: values.unit_number.trim() || null,
    vehicle_type: values.vehicle_type.trim() || null,
    fuel_type: values.fuel_type.trim() || null,
    equipment_type_label:
      values.asset_type === 'heavy_machinery' || values.asset_type === 'other'
        ? values.equipment_type_label.trim() || null
        : null,
    condition: values.condition || null,
    status: values.status,
  };
}
