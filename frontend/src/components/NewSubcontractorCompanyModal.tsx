import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppTextarea,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';

type Company = {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type Props = {
  onClose: () => void;
  onSuccess: (companyId: string) => void;
};

export default function NewSubcontractorCompanyModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, 'px-3 py-2');

  const createMut = useMutation({
    mutationFn: () =>
      api<Company>('POST', '/subcontractors/companies', {
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        notes: notes.trim() || undefined,
        is_active: true,
      }),
    onSuccess: (c) => {
      toast.success('Company created');
      onSuccess(c.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = name.trim().length > 0;

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="New subcontractor company"
      description="Add a third-party company and its workers later"
      formWidth="comfortable"
      quickInfo={
        <>
          <p>Create a subcontractor company record before adding workers.</p>
          <p>Company name is required; contact and address fields are optional.</p>
          <p>Use address search to auto-fill city, province, postal code, and country.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={createMut.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!canSubmit || createMut.isPending}
            loading={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? 'Creating…' : 'Create company'}
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppInput
          label="Company name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="organization"
          fieldHint="Company name\n\nLegal or trading name of the subcontractor company."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <AppInput
            label="Contact name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            fieldHint="Contact name\n\nPrimary contact person at this company."
          />
          <AppInput
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fieldHint="Phone\n\nMain phone number for the company or contact."
          />
          <AppInput
            className="sm:col-span-2"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fieldHint="Email\n\nCompany or contact email address."
          />
        </div>
        <div className="space-y-1.5">
          <AppControlLabelRow
            label="Address"
            fieldHint={<AppFieldHint hint="Address\n\nStreet address. Suggestions appear as you type." />}
          />
          <AddressAutocomplete
            value={addressLine1}
            onChange={setAddressLine1}
            onAddressSelect={(a) => {
              setAddressLine1(a.address_line1 || '');
              setAddressLine2(a.address_line2 || '');
              setCity(a.city || '');
              setProvince(a.province || '');
              setPostalCode(a.postal_code || '');
              setCountry(a.country || '');
            }}
            placeholder="Start typing an address…"
            className={controlInputClass}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <AppInput
            label="Address line 2"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            fieldHint="Address line 2\n\nSuite, unit, or additional address detail."
          />
          <AppInput
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            fieldHint="City\n\nCity for this company address."
          />
          <AppInput
            label="Province"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            fieldHint="Province\n\nProvince or state."
          />
          <AppInput
            label="Postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            fieldHint="Postal code\n\nZIP or postal code."
          />
          <AppInput
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            fieldHint="Country\n\nCountry for this address."
          />
        </div>
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          fieldHint="Notes\n\nInternal notes about this subcontractor (optional)."
        />
      </div>
    </AppFormModal>
  );
}
