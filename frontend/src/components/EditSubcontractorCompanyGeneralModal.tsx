import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';

export type SubcontractorGeneralEditSection = 'company' | 'address' | 'notes';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
] as const;

export type SubcontractorCompanyRecord = {
  id?: string;
  name?: string | null;
  is_active?: boolean | null;
  address_line1?: string | null;
  address_line2?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  postal_code?: string | null;
  notes?: string | null;
};

type Props = {
  open: boolean;
  section: SubcontractorGeneralEditSection | null;
  onClose: () => void;
  companyId: string;
  company: SubcontractorCompanyRecord | null | undefined;
  companyDisplayName?: string | null;
  activeWorkerCount?: number;
  onSaved?: () => void;
};

const SECTION_COPY: Record<
  SubcontractorGeneralEditSection,
  { title: string; description: string; quickInfo: ReactNode }
> = {
  company: {
    title: 'Edit company',
    description: 'Legal and trading identity for this subcontractor.',
    quickInfo: (
      <>
        <p>Company name is required.</p>
        <p>Inactive companies are hidden from most pickers; workers may still exist.</p>
      </>
    ),
  },
  address: {
    title: 'Edit address',
    description: 'Primary mailing and location address.',
    quickInfo: (
      <>
        <p>Used on projects and safety forms where applicable.</p>
        <p>Leave fields blank if not applicable.</p>
      </>
    ),
  },
  notes: {
    title: 'Edit notes',
    description: 'Internal notes about this subcontractor company.',
    quickInfo: (
      <>
        <p>Optional free-form notes for your team.</p>
        <p>Not shown on external documents by default.</p>
      </>
    ),
  },
};

export default function EditSubcontractorCompanyGeneralModal({
  open,
  section,
  onClose,
  companyId,
  company,
  companyDisplayName,
  activeWorkerCount = 0,
  onSaved,
}: Props) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState<'active' | 'inactive'>('active');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [country, setCountry] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, uiSpacing.controlX, 'py-2');

  const hydrateFromCompany = useCallback((c: SubcontractorCompanyRecord) => {
    setName(c.name || '');
    setIsActive(c.is_active === false ? 'inactive' : 'active');
    setAddressLine1(c.address_line1 || '');
    setAddressLine2(c.address_line2 || '');
    setCountry(c.country || '');
    setProvince(c.province || '');
    setCity(c.city || '');
    setPostalCode(c.postal_code || '');
    setNotes(c.notes || '');
  }, []);

  useEffect(() => {
    if (!open || !section || !company) return;
    hydrateFromCompany(company);
    setIsSaving(false);
  }, [open, section, company, hydrateFromCompany]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const activeSection = open && section ? section : null;
  const meta = activeSection ? SECTION_COPY[activeSection] : null;

  const modalTitle = useMemo(() => {
    if (!meta) return 'Edit subcontractor';
    const label = companyDisplayName?.trim() || company?.name?.trim();
    return label ? `${meta.title} — ${label}` : meta.title;
  }, [meta, companyDisplayName, company?.name]);

  const buildPayload = (): Record<string, unknown> | null => {
    if (!activeSection) return null;
    switch (activeSection) {
      case 'company':
        return {
          name: name.trim() || null,
          is_active: isActive === 'active',
        };
      case 'address':
        return {
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
          country: country.trim() || null,
          province: province.trim() || null,
          city: city.trim() || null,
          postal_code: postalCode.trim() || null,
        };
      case 'notes':
        return { notes: notes.trim() || null };
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!activeSection || !companyId || isSaving) return;
    if (activeSection === 'company') {
      if (!name.trim()) {
        toast.error('Company name is required');
        return;
      }
      const nextActive = isActive === 'active';
      if (company?.is_active && !nextActive && activeWorkerCount > 0) {
        const ok = await confirm({
          title: 'Deactivate company',
          message: `This company has ${activeWorkerCount} active worker(s). Deactivate the company anyway? Workers can remain in the system but you should review their status separately.`,
        });
        if (!ok) return;
      }
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PATCH', `/subcontractors/companies/${companyId}`, payload);
      toast.success('Saved');
      onSaved?.();
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !activeSection || !meta) return null;

  const formWidth = activeSection === 'company' ? 'comfortable' : 'default';

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
            label="Company name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSaving}
            error={!name.trim() ? 'Required' : undefined}
            fieldHint="Company name\n\nShown on projects, safety forms, and reports."
          />
          <AppSelect
            label="Status"
            value={isActive}
            onChange={(e) => setIsActive(e.target.value as 'active' | 'inactive')}
            options={[...STATUS_OPTIONS]}
            disabled={isSaving}
            fieldHint="Status\n\nInactive companies are hidden from most pickers; workers may still exist."
          />
        </div>
      )}

      {activeSection === 'address' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <AppControlLabelRow
              label="Address 1"
              fieldHint={<AppFieldHint hint="Address 1\n\nStreet address. Suggestions appear as you type." />}
            />
            <AddressAutocomplete
              value={addressLine1}
              onChange={setAddressLine1}
              disabled={isSaving}
              placeholder="Enter address"
              className={controlInputClass}
              onAddressSelect={(address) => {
                if (address.address_line1) setAddressLine1(address.address_line1);
                if (address.address_line2 !== undefined) setAddressLine2(address.address_line2);
                if (address.city !== undefined) setCity(address.city);
                if (address.province !== undefined) setProvince(address.province);
                if (address.country !== undefined) setCountry(address.country);
                if (address.postal_code !== undefined) setPostalCode(address.postal_code);
              }}
            />
          </div>
          <AppInput
            label="Address 2"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            disabled={isSaving}
            fieldHint="Address 2\n\nSuite, unit, or building (optional)."
          />
          <AppInput
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={isSaving}
          />
          <AppInput
            label="Province/State"
            value={province}
            onChange={(e) => setProvince(e.target.value)}
            disabled={isSaving}
          />
          <AppInput
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={isSaving}
          />
          <AppInput
            label="Postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            disabled={isSaving}
          />
        </div>
      )}

      {activeSection === 'notes' && (
        <AppTextarea
          label="Notes"
          rows={6}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isSaving}
          fieldHint="Notes\n\nInternal notes (optional)."
        />
      )}
    </AppFormModal>
  );
}
