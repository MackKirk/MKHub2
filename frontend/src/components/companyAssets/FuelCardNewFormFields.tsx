import { FUEL_CARD_FIELD_HINTS as H } from '@/lib/fuelCardFieldHints';
import { AppInput, AppTextarea, uiLayout, uiSpacing } from '@/components/ui';

export type FuelCardNewFormValues = {
  card_number: string;
  pin: string;
  date_issued: string;
  crew: string;
  notes: string;
};

type Props = {
  formId: string;
  values: FuelCardNewFormValues;
  disabled?: boolean;
  onChange: (field: keyof FuelCardNewFormValues, value: string) => void;
  onSubmit: () => void;
};

export function FuelCardNewFormFields({ formId, values, disabled, onChange, onSubmit }: Props) {
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiSpacing.sectionStack}
    >
      <AppInput
        label="Card # *"
        value={values.card_number}
        onChange={(e) => onChange('card_number', e.target.value)}
        placeholder="e.g. 21"
        className="font-mono tracking-wider"
        required
        disabled={disabled}
        fieldHint={H.card_number}
      />
      <div className={uiLayout.sectionGrid2}>
        <AppInput
          label="PIN # *"
          value={values.pin}
          onChange={(e) => onChange('pin', e.target.value)}
          placeholder="0000"
          className="font-mono tracking-widest"
          required
          disabled={disabled}
          fieldHint={H.pin}
        />
        <AppInput
          label="Crew"
          value={values.crew}
          onChange={(e) => onChange('crew', e.target.value)}
          placeholder="e.g. Metal, Flat, Repairs"
          disabled={disabled}
          fieldHint={H.crew}
        />
      </div>
      <AppInput
        label="Date card issued"
        type="date"
        value={values.date_issued}
        onChange={(e) => onChange('date_issued', e.target.value)}
        disabled={disabled}
        fieldHint={H.date_issued}
      />
      <AppTextarea
        label="Notes"
        value={values.notes}
        onChange={(e) => onChange('notes', e.target.value)}
        rows={3}
        disabled={disabled}
        fieldHint={H.notes}
      />
    </form>
  );
}
