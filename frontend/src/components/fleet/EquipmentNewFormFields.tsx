import { FLEET_EQUIPMENT_FIELD_HINTS as H } from '@/lib/fleetEquipmentFieldHints';
import {
  AppDatePicker,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTextarea,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

export const EQUIPMENT_CATEGORY_OPTIONS = [
  { value: 'generator', label: 'Generator' },
  { value: 'tool', label: 'Tool' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'small_tool', label: 'Small Tool' },
  { value: 'safety', label: 'Safety Equipment' },
];

export const EQUIPMENT_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

export type EquipmentNewFormValues = {
  category: string;
  name: string;
  unit_number: string;
  serial_number: string;
  brand: string;
  model: string;
  value: string;
  warranty_expiry: string;
  purchase_date: string;
  status: string;
  notes: string;
};

type Props = {
  formId: string;
  values: EquipmentNewFormValues;
  disabled?: boolean;
  onChange: (field: keyof EquipmentNewFormValues, value: string) => void;
  onSubmit: () => void;
};

export function EquipmentNewFormFields({ formId, values, disabled, onChange, onSubmit }: Props) {
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiSpacing.sectionStack}
    >
      <AppSectionHeader title="Basic information" />
      <div className={uiLayout.sectionGrid2}>
        <AppInput
          label="Name *"
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          required
          disabled={disabled}
          fieldHint={H.name}
        />
        <AppInput
          label="Unit Number *"
          value={values.unit_number}
          onChange={(e) => onChange('unit_number', e.target.value)}
          required
          disabled={disabled}
          fieldHint={H.unit_number}
        />
        <AppSelect
          label="Category *"
          value={values.category}
          onChange={(e) => onChange('category', e.target.value)}
          options={EQUIPMENT_CATEGORY_OPTIONS}
          disabled={disabled}
          fieldHint={H.category}
        />
        <AppInput
          label="Serial Number"
          value={values.serial_number}
          onChange={(e) => onChange('serial_number', e.target.value)}
          disabled={disabled}
          fieldHint={H.serial_number}
        />
        <AppInput
          label="Brand"
          value={values.brand}
          onChange={(e) => onChange('brand', e.target.value)}
          disabled={disabled}
          fieldHint={H.brand}
        />
        <AppInput
          label="Model"
          value={values.model}
          onChange={(e) => onChange('model', e.target.value)}
          disabled={disabled}
          fieldHint={H.model}
        />
        <AppInput
          label="Value ($)"
          type="number"
          min={0}
          step="0.01"
          value={values.value}
          onChange={(e) => onChange('value', e.target.value)}
          disabled={disabled}
          fieldHint={H.value}
        />
        <AppDatePicker
          label="Warranty Expiry"
          value={values.warranty_expiry}
          onChange={(e) => onChange('warranty_expiry', e.target.value)}
          disabled={disabled}
          fieldHint={H.warranty_expiry}
        />
        <AppDatePicker
          label="Purchase Date"
          value={values.purchase_date}
          onChange={(e) => onChange('purchase_date', e.target.value)}
          disabled={disabled}
          fieldHint={H.purchase_date}
        />
        <AppSelect
          label="Status"
          value={values.status}
          onChange={(e) => onChange('status', e.target.value)}
          options={EQUIPMENT_STATUS_OPTIONS}
          disabled={disabled}
          fieldHint={H.status}
        />
      </div>
      <AppTextarea
        label="Notes"
        value={values.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        rows={4}
        disabled={disabled}
        fieldHint={H.notes}
      />
    </form>
  );
}
