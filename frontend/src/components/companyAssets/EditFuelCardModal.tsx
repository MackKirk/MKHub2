import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { FUEL_CARD_FIELD_HINTS as H } from '@/lib/fuelCardFieldHints';
import { getTodayLocal } from '@/lib/dateUtils';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
} from '@/components/ui';

export type FuelCardEditSection = 'card' | 'notes';

type CardRecord = {
  id: string;
  card_number: string;
  pin: string;
  date_issued: string;
  status: string;
  notes?: string | null;
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

const SECTION_COPY: Record<FuelCardEditSection, { title: string; description: string; quickInfo: ReactNode }> = {
  card: {
    title: 'Edit card record',
    description: 'Update fuel card details stored in MKHub.',
    quickInfo: <p>Status controls whether the card can be assigned to an employee.</p>,
  },
  notes: {
    title: 'Edit notes',
    description: 'Internal notes for this fuel card.',
    quickInfo: <p>Optional notes visible on the card record.</p>,
  },
};

type Props = {
  open: boolean;
  section: FuelCardEditSection | null;
  onClose: () => void;
  card: CardRecord | null | undefined;
  onSaved?: () => void;
};

export default function EditFuelCardModal({ open, section, onClose, card, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const hydrate = useCallback((item: CardRecord) => {
    setForm({
      card_number: item.card_number || '',
      pin: item.pin || '',
      date_issued: item.date_issued || getTodayLocal(),
      status: item.status || 'active',
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
    if (!meta || !card) return 'Edit fuel card';
    const label = card.card_number?.trim();
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
          card_number: form.card_number.trim(),
          pin: form.pin.trim(),
          date_issued: form.date_issued,
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
      if (!form.card_number.trim()) {
        toast.error('Card # is required');
        return;
      }
      if (!form.pin.trim()) {
        toast.error('PIN # is required');
        return;
      }
      if (!form.date_issued.trim()) {
        toast.error('Date card issued is required');
        return;
      }
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PATCH', `/fuel-cards/${card.id}`, payload);
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
        <div className={uiCx('grid gap-4 md:grid-cols-2')}>
          <AppInput
            label="Card #"
            value={form.card_number}
            onChange={(e) => setField('card_number', e.target.value)}
            className="font-mono tracking-wider"
            disabled={isSaving}
            fieldHint={H.card_number}
          />
          <AppInput
            label="PIN #"
            value={form.pin}
            onChange={(e) => setField('pin', e.target.value)}
            className="font-mono tracking-widest"
            disabled={isSaving}
            fieldHint={H.pin}
          />
          <AppInput
            label="Date card issued"
            type="date"
            value={form.date_issued}
            onChange={(e) => setField('date_issued', e.target.value)}
            disabled={isSaving}
            fieldHint={H.date_issued}
          />
          <AppSelect
            label="Status"
            value={form.status}
            onChange={(e) => setField('status', e.target.value)}
            options={STATUS_OPTIONS}
            disabled={isSaving}
            fieldHint={H.status}
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
