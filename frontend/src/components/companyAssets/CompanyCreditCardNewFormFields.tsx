import { COMPANY_CREDIT_CARD_FIELD_HINTS as H } from '@/lib/companyCreditCardFieldHints';
import {
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export const CARD_NETWORK_OPTIONS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'Amex' },
  { value: 'other', label: 'Other' },
];

export function buildExpiryMonthOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return { value: String(m), label: String(m).padStart(2, '0') };
  });
}

export function buildExpiryYearOptions(count = 15) {
  const start = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => {
    const y = String(start + i);
    return { value: y, label: y };
  });
}

export type CompanyCreditCardNewFormValues = {
  label: string;
  network: string;
  last_four: string;
  expiry_month: string;
  expiry_year: string;
  cardholder_name: string;
  issuer: string;
  billing_entity: string;
  notes: string;
};

type Props = {
  formId: string;
  values: CompanyCreditCardNewFormValues;
  disabled?: boolean;
  expiryMonthOptions: Array<{ value: string; label: string }>;
  expiryYearOptions: Array<{ value: string; label: string }>;
  onChange: (field: keyof CompanyCreditCardNewFormValues, value: string) => void;
  onSubmit: () => void;
};

export function CompanyCreditCardNewFormFields({
  formId,
  values,
  disabled,
  expiryMonthOptions,
  expiryYearOptions,
  onChange,
  onSubmit,
}: Props) {
  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={uiSpacing.sectionStack}
    >
      <p
        className={uiCx(
          uiTypography.helper,
          'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900',
        )}
      >
        Enter only the last four digits and expiry — never store full card numbers, CVV, or PIN in MKHub.
      </p>

      <AppInput
        label="Internal label *"
        value={values.label}
        onChange={(e) => onChange('label', e.target.value)}
        placeholder="e.g. Marketing fuel card"
        required
        disabled={disabled}
        fieldHint={H.label}
      />

      <div className={uiLayout.sectionGrid2}>
        <AppSelect
          label="Network *"
          value={values.network}
          onChange={(e) => onChange('network', e.target.value)}
          options={CARD_NETWORK_OPTIONS}
          disabled={disabled}
          fieldHint={H.network}
        />
        <AppInput
          label="Last four digits *"
          inputMode="numeric"
          maxLength={4}
          value={values.last_four}
          onChange={(e) => onChange('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4242"
          className="tracking-widest"
          required
          disabled={disabled}
          fieldHint={H.last_four}
        />
      </div>

      <div className={uiLayout.sectionGrid2}>
        <AppSelect
          label="Expiry month *"
          value={values.expiry_month}
          onChange={(e) => onChange('expiry_month', e.target.value)}
          options={expiryMonthOptions}
          disabled={disabled}
          fieldHint={H.expiry_month}
        />
        <AppSelect
          label="Expiry year *"
          value={values.expiry_year}
          onChange={(e) => onChange('expiry_year', e.target.value)}
          options={expiryYearOptions}
          disabled={disabled}
          fieldHint={H.expiry_year}
        />
      </div>

      <AppInput
        label="Name on card"
        value={values.cardholder_name}
        onChange={(e) => onChange('cardholder_name', e.target.value)}
        disabled={disabled}
        fieldHint={H.cardholder_name}
      />
      <AppInput
        label="Issuer / bank"
        value={values.issuer}
        onChange={(e) => onChange('issuer', e.target.value)}
        disabled={disabled}
        fieldHint={H.issuer}
      />
      <AppInput
        label="Billing entity"
        value={values.billing_entity}
        onChange={(e) => onChange('billing_entity', e.target.value)}
        disabled={disabled}
        fieldHint={H.billing_entity}
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
