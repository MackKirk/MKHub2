import AddressAutocomplete from '@/components/AddressAutocomplete';
import { Plus, Trash2 } from 'lucide-react';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppInput,
  AppSectionHeader,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export const supplierControlInputClass = uiCx(
  'w-full text-sm',
  uiRadius.control,
  uiBorders.input,
  uiSpacing.controlX,
  'py-2',
);

export type SupplierFormFieldsProps = {
  name: string;
  nameError: boolean;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine1Complement: string;
  showAddress2: boolean;
  addressLine2: string;
  addressLine2Complement: string;
  showAddress3: boolean;
  addressLine3: string;
  addressLine3Complement: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  onNameChange: (v: string) => void;
  onClearNameError: () => void;
  onLegalNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onWebsiteChange: (v: string) => void;
  onAddressLine1Change: (v: string) => void;
  onAddressLine1ComplementChange: (v: string) => void;
  onShowAddress2: (v: boolean) => void;
  onAddressLine2Change: (v: string) => void;
  onAddressLine2ComplementChange: (v: string) => void;
  onShowAddress3: (v: boolean) => void;
  onAddressLine3Change: (v: string) => void;
  onAddressLine3ComplementChange: (v: string) => void;
  onCityChange: (v: string) => void;
  onProvinceChange: (v: string) => void;
  onPostalCodeChange: (v: string) => void;
  onCountryChange: (v: string) => void;
  onAddressSelect: (address: {
    address_line1?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country?: string;
  }) => void;
};

export function SupplierCompanyFields({
  name,
  nameError,
  legalName,
  email,
  phone,
  website,
  onNameChange,
  onClearNameError,
  onLegalNameChange,
  onEmailChange,
  onPhoneChange,
  onWebsiteChange,
}: Pick<
  SupplierFormFieldsProps,
  | 'name'
  | 'nameError'
  | 'legalName'
  | 'email'
  | 'phone'
  | 'website'
  | 'onNameChange'
  | 'onClearNameError'
  | 'onLegalNameChange'
  | 'onEmailChange'
  | 'onPhoneChange'
  | 'onWebsiteChange'
>) {
  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader title="Company" description="Core supplier identity details." />
      <div className="grid gap-3 md:grid-cols-2">
        <AppInput
          className="md:col-span-2"
          label={
            <>
              Name <span className="text-red-600">*</span>
            </>
          }
          value={name}
          onChange={(e) => {
            onNameChange(e.target.value);
            if (nameError) onClearNameError();
          }}
          error={nameError && !name.trim() ? 'This field is required' : undefined}
          fieldHint="Name\n\nDisplay name for this vendor in inventory and estimates."
        />
        <AppInput
          className="md:col-span-2"
          label="Legal name"
          value={legalName}
          onChange={(e) => onLegalNameChange(e.target.value)}
          fieldHint="Legal name\n\nRegistered company name (optional)."
        />
        <AppInput
          label="Email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          fieldHint="Email\n\nMain contact email for this supplier."
        />
        <AppInput
          label="Phone"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          fieldHint="Phone\n\nMain phone number."
        />
        <AppInput
          className="md:col-span-2"
          label="Website"
          type="url"
          value={website}
          onChange={(e) => onWebsiteChange(e.target.value)}
          fieldHint="Website\n\nCompany website URL (optional)."
        />
      </div>
    </div>
  );
}

export function SupplierAddressFields(props: SupplierFormFieldsProps) {
  const {
    addressLine1,
    addressLine1Complement,
    showAddress2,
    addressLine2,
    addressLine2Complement,
    showAddress3,
    addressLine3,
    addressLine3Complement,
    city,
    province,
    postalCode,
    country,
    onAddressLine1Change,
    onAddressLine1ComplementChange,
    onShowAddress2,
    onAddressLine2Change,
    onAddressLine2ComplementChange,
    onShowAddress3,
    onAddressLine3Change,
    onAddressLine3ComplementChange,
    onAddressSelect,
  } = props;

  const applyAddressSelect = (address: {
    address_line1?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country?: string;
  }) => {
    onAddressSelect(address);
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader title="Address" description="Primary mailing and location address." />
      <div className={uiSpacing.sectionStack}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <AppControlLabelRow
              label="Address line 1"
              fieldHint={
                <AppFieldHint hint="Address line 1\n\nStreet address. Suggestions appear as you type; city and province fill in automatically." />
              }
            />
            <AddressAutocomplete
              value={addressLine1}
              onChange={onAddressLine1Change}
              onAddressSelect={(address) => applyAddressSelect(address)}
              placeholder="Enter address"
              className={supplierControlInputClass}
            />
          </div>
          <AppInput
            className="min-w-0"
            label="Complement"
            value={addressLine1Complement}
            onChange={(e) => onAddressLine1ComplementChange(e.target.value)}
            placeholder="Apartment, Unit, Block, etc (Optional)"
            fieldHint="Complement\n\nSuite, unit, or building (optional)."
          />
        </div>

        {!showAddress2 && !showAddress3 && (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            className="text-brand-red hover:text-brand-red"
            onClick={() => onShowAddress2(true)}
          >
            Add another Address
          </AppButton>
        )}

        {showAddress2 && (
          <>
            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="min-w-0 space-y-1.5">
                <AppControlLabelRow
                  label="Address 2"
                  fieldHint={<AppFieldHint hint="Address 2\n\nAdditional street address (optional)." />}
                />
                <AddressAutocomplete
                  value={addressLine2}
                  onChange={onAddressLine2Change}
                  onAddressSelect={(address) => {
                    onAddressLine2Change(address.address_line1 || addressLine2);
                  }}
                  placeholder="Enter address"
                  className={supplierControlInputClass}
                />
              </div>
              <AppInput
                className="min-w-0"
                label="Complement"
                value={addressLine2Complement}
                onChange={(e) => onAddressLine2ComplementChange(e.target.value)}
                placeholder="Apartment, Unit, Block, etc (Optional)"
                fieldHint="Complement\n\nSuite, unit, or building (optional)."
              />
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className="mb-0.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Remove Address 2"
                onClick={() => {
                  onShowAddress2(false);
                  onAddressLine2Change('');
                  onAddressLine2ComplementChange('');
                  if (showAddress3) {
                    onAddressLine2Change(addressLine3);
                    onAddressLine2ComplementChange(addressLine3Complement);
                    onAddressLine3Change('');
                    onAddressLine3ComplementChange('');
                    onShowAddress3(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </AppButton>
            </div>
            {!showAddress3 && (
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                className="text-brand-red hover:text-brand-red"
                onClick={() => onShowAddress3(true)}
              >
                Add another Address
              </AppButton>
            )}
          </>
        )}

        {showAddress3 && (
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="min-w-0 space-y-1.5">
              <AppControlLabelRow
                label="Address 3"
                fieldHint={<AppFieldHint hint="Address 3\n\nThird address line (optional)." />}
              />
              <AddressAutocomplete
                value={addressLine3}
                onChange={onAddressLine3Change}
                onAddressSelect={(address) => {
                  onAddressLine3Change(address.address_line1 || addressLine3);
                }}
                placeholder="Enter address"
                className={supplierControlInputClass}
              />
            </div>
            <AppInput
              className="min-w-0"
              label="Complement"
              value={addressLine3Complement}
              onChange={(e) => onAddressLine3ComplementChange(e.target.value)}
              placeholder="Apartment, Unit, Block, etc (Optional)"
              fieldHint="Complement\n\nSuite, unit, or building (optional)."
            />
            <AppButton
              type="button"
              variant="ghost"
              size="sm"
              className="mb-0.5 text-red-600 hover:bg-red-50 hover:text-red-700"
              title="Remove Address 3"
              onClick={() => {
                onShowAddress3(false);
                onAddressLine3Change('');
                onAddressLine3ComplementChange('');
              }}
            >
              <Trash2 className="h-4 w-4" />
            </AppButton>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AppInput
            label="City"
            value={city}
            readOnly
            tabIndex={-1}
            inputClassName="cursor-default"
            fieldHint="City\n\nFilled automatically when you select an address."
          />
          <AppInput
            label="Province"
            value={province}
            readOnly
            tabIndex={-1}
            inputClassName="cursor-default"
            fieldHint="Province\n\nFilled automatically when you select an address."
          />
          <AppInput
            label="Postal code"
            value={postalCode}
            readOnly
            tabIndex={-1}
            inputClassName="cursor-default"
            fieldHint="Postal code\n\nFilled automatically when you select an address."
          />
          <AppInput
            label="Country"
            value={country}
            readOnly
            tabIndex={-1}
            inputClassName="cursor-default"
            fieldHint="Country\n\nFilled automatically when you select an address."
          />
        </div>
      </div>
    </div>
  );
}

export function supplierFormStepPills(step: number, total = 2) {
  const stepPillClass = (n: number) =>
    uiCx(
      'rounded-full px-2 py-1 text-[10px] font-medium',
      step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
    );
  return (
    <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-[10px] font-medium')}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        return (
          <span key={n} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-gray-400">→</span> : null}
            <span className={stepPillClass(n)}>{n}</span>
          </span>
        );
      })}
    </div>
  );
}
