import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppCheckbox,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
} from '@/components/ui';

export type CustomerGeneralEditSection = 'company' | 'address' | 'billing' | 'description';

const YES_NO_OPTIONS = [
  { value: 'false', label: 'No' },
  { value: 'true', label: 'Yes' },
] as const;

export type CustomerGeneralClient = {
  id?: string;
  display_name?: string | null;
  legal_name?: string | null;
  client_type?: string | null;
  client_status?: string | null;
  lead_source?: string | null;
  tax_number?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  postal_code?: string | null;
  billing_email?: string | null;
  po_required?: boolean | null;
  billing_same_as_address?: boolean | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_country?: string | null;
  billing_province?: string | null;
  billing_city?: string | null;
  billing_postal_code?: string | null;
  description?: string | null;
};

type Props = {
  open: boolean;
  section: CustomerGeneralEditSection | null;
  onClose: () => void;
  clientId: string;
  client: CustomerGeneralClient | null | undefined;
  clientDisplayName?: string | null;
  onSaved?: () => void;
};

const SECTION_COPY: Record<
  CustomerGeneralEditSection,
  { title: string; description: string; quickInfo: ReactNode }
> = {
  company: {
    title: 'Edit company',
    description: 'Core company identity details.',
    quickInfo: (
      <>
        <p>Display and legal names are required.</p>
        <p>Type and status come from your organization settings.</p>
        <p>Changes apply across projects and opportunities for this customer.</p>
      </>
    ),
  },
  address: {
    title: 'Edit address',
    description: 'Primary mailing and location address.',
    quickInfo: (
      <>
        <p>Used on documents and site defaults where applicable.</p>
        <p>Leave fields blank if not applicable.</p>
      </>
    ),
  },
  billing: {
    title: 'Edit billing',
    description: 'Invoice delivery and billing address preferences.',
    quickInfo: (
      <>
        <p>Billing email receives invoices when configured.</p>
        <p>When billing matches the primary address, invoice fields copy from address on save.</p>
      </>
    ),
  },
  description: {
    title: 'Edit description',
    description: 'Internal notes about this customer.',
    quickInfo: (
      <>
        <p>Optional free-form notes for your team.</p>
        <p>Not shown on customer-facing documents by default.</p>
      </>
    ),
  },
};

function clientBillingUsesDifferentAddress(client: CustomerGeneralClient | null | undefined): boolean {
  return (client as { billing_same_as_address?: boolean } | null | undefined)?.billing_same_as_address === false;
}

export default function EditCustomerGeneralModal({
  open,
  section,
  onClose,
  clientId,
  client,
  clientDisplayName,
  onSaved,
}: Props) {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
    enabled: open,
  });

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [clientType, setClientType] = useState('');
  const [clientStatus, setClientStatus] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [poRequired, setPoRequired] = useState<'true' | 'false'>('false');
  const [useDifferentBillingAddress, setUseDifferentBillingAddress] = useState(false);
  const [billingAddressLine1, setBillingAddressLine1] = useState('');
  const [billingAddressLine2, setBillingAddressLine2] = useState('');
  const [billingCountry, setBillingCountry] = useState('');
  const [billingProvince, setBillingProvince] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostalCode, setBillingPostalCode] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const leadSources = (settings?.lead_sources || []) as any[];

  const clientTypeOptions = useMemo(
    () => [
      { value: '', label: 'Select...' },
      ...sortByLabel(settings?.client_types || [], (t: any) => (t.label || '').toString()).map((t: any) => ({
        value: t.label,
        label: t.label,
      })),
    ],
    [settings?.client_types],
  );

  const clientStatusOptions = useMemo(
    () => [
      { value: '', label: 'Select...' },
      ...sortByLabel(settings?.client_statuses || [], (t: any) => (t.label || '').toString()).map((t: any) => ({
        value: t.label,
        label: t.label,
      })),
    ],
    [settings?.client_statuses],
  );

  const leadSourceOptions = useMemo(
    () => [
      { value: '', label: 'Select...' },
      ...sortByLabel(leadSources, (ls: any) => (ls?.label ?? ls?.name ?? '').toString()).map((ls: any) => {
        const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls);
        const label = ls?.label ?? ls?.name ?? String(ls);
        return { value: String(val), label: String(label) };
      }),
    ],
    [leadSources],
  );

  const hydrateFromClient = useCallback((c: CustomerGeneralClient) => {
    setDisplayName(c.display_name || '');
    setLegalName(c.legal_name || '');
    setClientType(c.client_type || '');
    setClientStatus(c.client_status || '');
    setLeadSource(c.lead_source || '');
    setTaxNumber(c.tax_number || '');
    setAddressLine1(c.address_line1 || '');
    setAddressLine2(c.address_line2 || '');
    setCountry(c.country || '');
    setProvince(c.province || '');
    setCity(c.city || '');
    setPostalCode(c.postal_code || '');
    setBillingEmail(c.billing_email || '');
    setPoRequired(c.po_required ? 'true' : 'false');
    const different = clientBillingUsesDifferentAddress(c);
    setUseDifferentBillingAddress(different);
    setBillingAddressLine1(c.billing_address_line1 || '');
    setBillingAddressLine2(c.billing_address_line2 || '');
    setBillingCountry(c.billing_country || '');
    setBillingProvince(c.billing_province || '');
    setBillingCity(c.billing_city || '');
    setBillingPostalCode(c.billing_postal_code || '');
    setDescription(c.description || '');
  }, []);

  useEffect(() => {
    if (!open || !section || !client) return;
    hydrateFromClient(client);
    setIsSaving(false);
  }, [open, section, client, hydrateFromClient]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const activeSection = open && section ? section : null;
  const meta = activeSection ? SECTION_COPY[activeSection] : null;

  const modalTitle = useMemo(() => {
    if (!meta) return 'Edit customer';
    const name = clientDisplayName?.trim() || client?.display_name?.trim();
    return name ? `${meta.title} — ${name}` : meta.title;
  }, [meta, clientDisplayName, client?.display_name]);

  const buildPayload = (): Record<string, unknown> | null => {
    if (!activeSection || !client) return null;
    switch (activeSection) {
      case 'company':
        return {
          display_name: displayName.trim() || null,
          legal_name: legalName.trim() || null,
          client_type: clientType || null,
          client_status: clientStatus || null,
          lead_source: leadSource || null,
          tax_number: taxNumber || null,
        };
      case 'address':
        return {
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          country: country || null,
          province: province || null,
          city: city || null,
          postal_code: postalCode || null,
        };
      case 'billing': {
        const sameAsPrimary = !useDifferentBillingAddress;
        return {
          billing_email: billingEmail || null,
          po_required: poRequired === 'true',
          billing_same_as_address: sameAsPrimary,
          billing_address_line1: sameAsPrimary ? addressLine1 || client.address_line1 || null : billingAddressLine1 || null,
          billing_address_line2: sameAsPrimary ? addressLine2 || client.address_line2 || null : billingAddressLine2 || null,
          billing_country: sameAsPrimary ? country || client.country || null : billingCountry || null,
          billing_province: sameAsPrimary ? province || client.province || null : billingProvince || null,
          billing_city: sameAsPrimary ? city || client.city || null : billingCity || null,
          billing_postal_code: sameAsPrimary ? postalCode || client.postal_code || null : billingPostalCode || null,
        };
      }
      case 'description':
        return { description: description || null };
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!activeSection || !clientId || isSaving) return;
    if (activeSection === 'company') {
      if (!displayName.trim() || !legalName.trim()) {
        toast.error('Display name and Legal name are required');
        return;
      }
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PATCH', `/clients/${clientId}`, payload);
      toast.success('Saved');
      onSaved?.();
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      if (msg.includes('HTTP 4') && !msg.includes('HTTP 40')) {
        toast.error(msg);
      } else {
        toast.success('Saved');
        onSaved?.();
        handleClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !activeSection || !meta) return null;

  const formWidth = activeSection === 'company' || activeSection === 'billing' ? 'comfortable' : 'default';

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={modalTitle}
      description={meta.description}
      formWidth={formWidth}
      quickInfo={meta.quickInfo}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
            Cancel
          </AppButton>
          <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
            {isSaving ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      }
    >
      {activeSection === 'company' && (
        <div className="grid gap-4 md:grid-cols-2">
          <AppInput
            label="Display name *"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isSaving}
            error={!displayName.trim() ? 'Required' : undefined}
            fieldHint="Display name\n\nPublic name shown across the app."
          />
          <AppInput
            label="Legal name *"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            disabled={isSaving}
            error={!legalName.trim() ? 'Required' : undefined}
            fieldHint="Legal name\n\nRegistered legal entity name."
          />
          <AppSelect
            label="Type"
            value={clientType}
            onChange={(e) => setClientType(e.target.value)}
            options={clientTypeOptions}
            disabled={isSaving}
            fieldHint="Type\n\nCustomer classification."
          />
          <AppSelect
            label="Status"
            value={clientStatus}
            onChange={(e) => setClientStatus(e.target.value)}
            options={clientStatusOptions}
            disabled={isSaving}
            fieldHint="Status\n\nRelationship status."
          />
          <AppSelect
            label="Lead source"
            value={leadSource}
            onChange={(e) => setLeadSource(e.target.value)}
            options={leadSourceOptions}
            disabled={isSaving}
            fieldHint="Lead source\n\nWhere did this lead originate?"
          />
          <AppInput
            label="Tax number"
            value={taxNumber}
            onChange={(e) => setTaxNumber(e.target.value)}
            disabled={isSaving}
            fieldHint="Tax number\n\nTax/VAT identifier used for invoicing."
          />
        </div>
      )}

      {activeSection === 'address' && (
        <div className="grid gap-4 md:grid-cols-2">
          <AppInput label="Address 1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={isSaving} />
          <AppInput label="Address 2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={isSaving} />
          <AppInput label="Country" value={country} onChange={(e) => setCountry(e.target.value)} disabled={isSaving} />
          <AppInput label="Province/State" value={province} onChange={(e) => setProvince(e.target.value)} disabled={isSaving} />
          <AppInput label="City" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSaving} />
          <AppInput label="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} disabled={isSaving} />
        </div>
      )}

      {activeSection === 'billing' && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <AppInput
              label="Billing email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
              disabled={isSaving}
              fieldHint="Billing email\n\nEmail used for invoice delivery."
            />
            <AppSelect
              label="PO required"
              value={poRequired}
              onChange={(e) => setPoRequired(e.target.value as 'true' | 'false')}
              options={[...YES_NO_OPTIONS]}
              disabled={isSaving}
              fieldHint="PO required\n\nWhether a purchase order is required before invoicing."
            />
          </div>
          <AppCheckbox
            label="Use different address for Billing address"
            checked={useDifferentBillingAddress}
            onChange={setUseDifferentBillingAddress}
            disabled={isSaving}
            fieldHint="Billing address\n\nWhen enabled, enter a separate address for invoices. When off, billing uses the primary address."
          />
          {useDifferentBillingAddress && (
            <div className="grid gap-4 md:grid-cols-2">
              <AppInput
                label="Billing Address 1"
                value={billingAddressLine1}
                onChange={(e) => setBillingAddressLine1(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing Address 1\n\nStreet address for billing."
              />
              <AppInput
                label="Billing Address 2"
                value={billingAddressLine2}
                onChange={(e) => setBillingAddressLine2(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing Address 2\n\nApartment, suite, unit, building, floor, etc."
              />
              <AppInput
                label="Billing Country"
                value={billingCountry}
                onChange={(e) => setBillingCountry(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing Country\n\nCountry or region for billing."
              />
              <AppInput
                label="Billing Province/State"
                value={billingProvince}
                onChange={(e) => setBillingProvince(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing Province/State\n\nState, province, or region."
              />
              <AppInput
                label="Billing City"
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing City\n\nCity or locality for billing."
              />
              <AppInput
                label="Billing Postal code"
                value={billingPostalCode}
                onChange={(e) => setBillingPostalCode(e.target.value)}
                disabled={isSaving}
                fieldHint="Billing Postal code\n\nZIP or postal code for billing."
              />
            </div>
          )}
        </div>
      )}

      {activeSection === 'description' && (
        <AppTextarea
          label="Description"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isSaving}
        />
      )}
    </AppFormModal>
  );
}
