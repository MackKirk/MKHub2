import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { COMPANY_CREDIT_CARD_FIELD_HINTS as H } from '@/lib/companyCreditCardFieldHints';
import {
  CARD_NETWORK_OPTIONS,
  buildExpiryMonthOptions,
  buildExpiryYearOptions,
} from '@/components/companyAssets/CompanyCreditCardNewFormFields';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type CompanyCreditCardEditSection = 'card' | 'notes';

type CardRecord = {
  id: string;
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
  status: string;
  notes?: string | null;
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

const SECTION_COPY: Record<
  CompanyCreditCardEditSection,
  { title: string; description: string; quickInfo: ReactNode }
> = {
  card: {
    title: 'Edit card record',
    description: 'Update card metadata stored in MKHub.',
    quickInfo: (
      <>
        <p>
          <span className="font-semibold">Privacy / PCI:</span> Only the last four digits belong in MKHub. Never enter
          full card numbers, CVV, or PIN.
        </p>
        <p>Status controls whether the card can be assigned to an employee.</p>
      </>
    ),
  },
  notes: {
    title: 'Edit notes',
    description: 'Internal notes for this corporate card.',
    quickInfo: <p>Optional notes visible on the card record.</p>,
  },
};

type Props = {
  open: boolean;
  section: CompanyCreditCardEditSection | null;
  onClose: () => void;
  card: CardRecord | null | undefined;
  onSaved?: () => void;
};

export default function EditCompanyCreditCardModal({ open, section, onClose, card, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const expiryMonthOptions = buildExpiryMonthOptions();
  const expiryYearOptions = buildExpiryYearOptions();

  const hydrate = useCallback((item: CardRecord) => {
    setForm({
      label: item.label || '',
      status: item.status || 'active',
      network: item.network || 'visa',
      last_four: item.last_four || '',
      expiry_month: String(item.expiry_month || 1),
      expiry_year: String(item.expiry_year || new Date().getFullYear()),
      cardholder_name: item.cardholder_name || '',
      issuer: item.issuer || '',
      billing_entity: item.billing_entity || '',
      notes: item.notes || '',
    });
  }, []);

  useEffect(() => {
    if (!open || !section || !card) return;
    hydrate(card);
    setIsSaving(false);
  }, [open, section, card, hydrate]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const activeSection = open && section ? section : null;
  const meta = activeSection ? SECTION_COPY[activeSection] : null;

  const modalTitle = useMemo(() => {
    if (!meta || !card) return 'Edit corporate card';
    const label = card.label?.trim();
    return label ? `${meta.title} — ${label}` : meta.title;
  }, [meta, card]);

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = (): Record<string, unknown> | null => {
    if (!activeSection || !card) return null;
    switch (activeSection) {
      case 'card':
        return {
          label: form.label.trim(),
          network: form.network,
          last_four: form.last_four.trim(),
          expiry_month: parseInt(form.expiry_month, 10),
          expiry_year: parseInt(form.expiry_year, 10),
          cardholder_name: form.cardholder_name.trim() || null,
          issuer: form.issuer.trim() || null,
          billing_entity: form.billing_entity.trim() || null,
          status: form.status,
        };
      case 'notes':
        return { notes: form.notes.trim() || null };
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!activeSection || !card?.id || isSaving) return;
    if (activeSection === 'card') {
      if (!form.label.trim()) {
        toast.error('Internal label is required');
        return;
      }
      if (!/^\d{4}$/.test(form.last_four.trim())) {
        toast.error('Last four must be 4 digits');
        return;
      }
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PATCH', `/company-credit-cards/${card.id}`, payload);
      toast.success('Saved');
      onSaved?.();
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !activeSection || !meta || !card) return null;

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={modalTitle}
      description={meta.description}
      formWidth={activeSection === 'card' ? 'comfortable' : 'default'}
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
      {activeSection === 'card' && (
        <div className={uiSpacing.sectionStack}>
          <p
            className={uiCx(
              uiTypography.helper,
              'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900',
            )}
          >
            <span className="font-semibold">Privacy / PCI:</span> Only the last four digits belong in MKHub. Never enter
            full card numbers, CVV, or PIN.
          </p>
          <div className={uiCx('grid gap-4 md:grid-cols-2')}>
            <AppInput
              label="Internal label"
              value={form.label}
              onChange={(e) => setField('label', e.target.value)}
              disabled={isSaving}
              fieldHint={H.label}
            />
            <AppSelect
              label="Status"
              value={form.status}
              onChange={(e) => setField('status', e.target.value)}
              options={STATUS_OPTIONS}
              disabled={isSaving}
              fieldHint={H.status}
            />
            <AppSelect
              label="Network"
              value={form.network}
              onChange={(e) => setField('network', e.target.value)}
              options={CARD_NETWORK_OPTIONS}
              disabled={isSaving}
              fieldHint={H.network}
            />
            <AppInput
              label="Last four digits"
              inputMode="numeric"
              maxLength={4}
              value={form.last_four}
              onChange={(e) => setField('last_four', e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="font-mono tracking-widest"
              disabled={isSaving}
              fieldHint={H.last_four}
            />
            <AppSelect
              label="Expiry month"
              value={form.expiry_month}
              onChange={(e) => setField('expiry_month', e.target.value)}
              options={expiryMonthOptions}
              disabled={isSaving}
              fieldHint={H.expiry_month}
            />
            <AppSelect
              label="Expiry year"
              value={form.expiry_year}
              onChange={(e) => setField('expiry_year', e.target.value)}
              options={expiryYearOptions}
              disabled={isSaving}
              fieldHint={H.expiry_year}
            />
            <AppInput
              label="Name on card"
              value={form.cardholder_name}
              onChange={(e) => setField('cardholder_name', e.target.value)}
              disabled={isSaving}
              fieldHint={H.cardholder_name}
            />
            <AppInput
              label="Issuer / bank"
              value={form.issuer}
              onChange={(e) => setField('issuer', e.target.value)}
              disabled={isSaving}
              fieldHint={H.issuer}
            />
          </div>
          <AppInput
            label="Billing entity"
            value={form.billing_entity}
            onChange={(e) => setField('billing_entity', e.target.value)}
            disabled={isSaving}
            fieldHint={H.billing_entity}
          />
        </div>
      )}

      {activeSection === 'notes' && (
        <AppTextarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setField('notes', e.target.value)}
          rows={4}
          disabled={isSaving}
          fieldHint={H.notes}
        />
      )}
    </AppFormModal>
  );
}
