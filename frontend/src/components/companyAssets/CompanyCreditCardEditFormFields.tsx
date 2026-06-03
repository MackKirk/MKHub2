import { COMPANY_CREDIT_CARD_FIELD_HINTS as H } from '@/lib/companyCreditCardFieldHints';
import {
  CARD_NETWORK_OPTIONS,
  buildExpiryMonthOptions,
  buildExpiryYearOptions,
} from '@/components/companyAssets/CompanyCreditCardNewFormFields';
import {
  AppInput,
  AppSelect,
  AppTextarea,
  uiLayout,
  uiSpacing,
  uiCx,
  uiTypography,
} from '@/components/ui';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

export type CompanyCreditCardEditFormValues = {
  label: string;
  status: string;
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
  values: CompanyCreditCardEditFormValues;
  disabled?: boolean;
  onChange: (field: keyof CompanyCreditCardEditFormValues, value: string) => void;
  onSubmit: () => void;
};

export function CompanyCreditCardEditFormFields({
  formId,
  values,
  disabled,
  onChange,
  onSubmit,
}: Props) {
  const expiryMonthOptions = buildExpiryMonthOptions();
  const expiryYearOptions = buildExpiryYearOptions();

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
        <span className="font-semibold">Privacy / PCI:</span> Only the last four digits belong in MKHub. Never enter
        full card numbers, CVV, or PIN.
      </p>

      <div className={uiLayout.sectionGrid2}>
        <AppInput
          label="Internal label"
          value={values.label}
          onChange={(e) => onChange('label', e.target.value)}
          disabled={disabled}
          fieldHint={H.label}
        />
        <AppSelect
          label="Status"
          value={values.status}
          onChange={(e) => onChange('status', e.target.value)}
          options={STATUS_OPTIONS}
          disabled={disabled}
          fieldHint={H.status}
        />
        <AppSelect
          label="Network"
          value={values.network}
          onChange={(e) => onChange('network', e.target.value)}
          options={CARD_NETWORK_OPTIONS}
          disabled={disabled}
          fieldHint={H.network}
        />
        <AppInput
          label="Last four digits"
          inputMode="numeric"
          maxLength={4}
          value={values.last_four}
          onChange={(e) => onChange('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="tracking-widest font-mono"
          disabled={disabled}
          fieldHint={H.last_four}
        />
        <AppSelect
          label="Expiry month"
          value={values.expiry_month}
          onChange={(e) => onChange('expiry_month', e.target.value)}
          options={expiryMonthOptions}
          disabled={disabled}
          fieldHint={H.expiry_month}
        />
        <AppSelect
          label="Expiry year"
          value={values.expiry_year}
          onChange={(e) => onChange('expiry_year', e.target.value)}
          options={expiryYearOptions}
          disabled={disabled}
          fieldHint={H.expiry_year}
        />
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
      </div>
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
        rows={4}
        disabled={disabled}
        fieldHint={H.notes}
      />
    </form>
  );
}
