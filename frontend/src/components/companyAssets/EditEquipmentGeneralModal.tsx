import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { FLEET_EQUIPMENT_FIELD_HINTS as H } from '@/lib/fleetEquipmentFieldHints';
import { EQUIPMENT_CATEGORY_OPTIONS } from '@/components/fleet/EquipmentNewFormFields';
import { EQUIPMENT_STATUS_OPTIONS, normalizeEquipmentOperationalStatus } from '@/lib/equipmentUi';
import {
  AppButton,
  AppDatePicker,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

export type EquipmentGeneralEditSection = 'basic' | 'dates' | 'notes';

export type EquipmentGeneralAsset = {
  id: string;
  category: string;
  name: string;
  unit_number?: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  warranty_expiry?: string;
  purchase_date?: string;
  status: string;
  notes?: string;
};

const SECTION_COPY: Record<
  EquipmentGeneralEditSection,
  { title: string; description: string; quickInfo: ReactNode }
> = {
  basic: {
    title: 'Edit basic information',
    description: 'Identity, identification, and operational status for this equipment.',
    quickInfo: (
      <>
        <p>Name is required. Status controls whether the item is available for assignment.</p>
        <p>Category is set at creation and cannot be changed here.</p>
      </>
    ),
  },
  dates: {
    title: 'Edit assignment & dates',
    description: 'Warranty and purchase dates for this equipment.',
    quickInfo: (
      <>
        <p>Active assignment is managed via Assign and Return on the hero area.</p>
        <p>Dates are optional and used for warranty tracking.</p>
      </>
    ),
  },
  notes: {
    title: 'Edit notes',
    description: 'Internal notes for this equipment.',
    quickInfo: <p>Optional notes visible on the equipment record. The primary photo is managed from the hero area.</p>,
  },
};

type Props = {
  open: boolean;
  section: EquipmentGeneralEditSection | null;
  onClose: () => void;
  equipment: EquipmentGeneralAsset | null | undefined;
  onSaved?: () => void;
};

export default function EditEquipmentGeneralModal({ open, section, onClose, equipment, onSaved }: Props) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const hydrate = useCallback((item: EquipmentGeneralAsset) => {
    setForm({
      name: item.name || '',
      unit_number: item.unit_number || '',
      serial_number: item.serial_number || '',
      brand: item.brand || '',
      model: item.model || '',
      value: item.value != null ? String(item.value) : '',
      status: normalizeEquipmentOperationalStatus(item.status || 'active'),
      warranty_expiry: item.warranty_expiry ? item.warranty_expiry.slice(0, 10) : '',
      purchase_date: item.purchase_date ? item.purchase_date.slice(0, 10) : '',
      notes: item.notes || '',
    });
  }, []);

  useEffect(() => {
    if (!open || !section || !equipment) return;
    hydrate(equipment);
    setIsSaving(false);
  }, [open, section, equipment, hydrate]);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const activeSection = open && section ? section : null;
  const meta = activeSection ? SECTION_COPY[activeSection] : null;

  const modalTitle = useMemo(() => {
    if (!meta || !equipment) return 'Edit equipment';
    const label = [equipment.name, equipment.unit_number ? `#${equipment.unit_number}` : null]
      .filter(Boolean)
      .join(' \u00b7 ');
    return label ? `${meta.title} — ${label}` : meta.title;
  }, [meta, equipment]);

  const categoryLabel = useMemo(() => {
    if (!equipment?.category) return '';
    const opt = EQUIPMENT_CATEGORY_OPTIONS.find((o) => o.value === equipment.category);
    return opt?.label ?? equipment.category.replace(/_/g, ' ');
  }, [equipment?.category]);

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildPayload = (): Record<string, unknown> | null => {
    if (!activeSection || !equipment) return null;
    switch (activeSection) {
      case 'basic':
        return {
          name: form.name.trim(),
          unit_number: form.unit_number?.trim() || null,
          serial_number: form.serial_number?.trim() || null,
          brand: form.brand?.trim() || null,
          model: form.model?.trim() || null,
          value: form.value !== '' ? parseFloat(form.value) : null,
          status: form.status,
        };
      case 'dates':
        return {
          warranty_expiry: form.warranty_expiry || null,
          purchase_date: form.purchase_date || null,
        };
      case 'notes':
        return { notes: form.notes?.trim() || null };
      default:
        return null;
    }
  };

  const handleSave = async () => {
    if (!activeSection || !equipment?.id || isSaving) return;
    if (activeSection === 'basic' && !form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    try {
      setIsSaving(true);
      await api('PUT', `/fleet/equipment/${equipment.id}`, payload);
      toast.success('Equipment updated successfully');
      onSaved?.();
      handleClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update equipment');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !activeSection || !meta || !equipment) return null;

  const formWidth = activeSection === 'basic' ? 'comfortable' : 'default';

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
      {activeSection === 'basic' && (
        <div className={uiCx('grid gap-4 md:grid-cols-2')}>
          <AppInput
            label="Name *"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            disabled={isSaving}
            required
            fieldHint={H.name}
          />
          <AppInput
            label="Unit Number"
            value={form.unit_number}
            onChange={(e) => setField('unit_number', e.target.value)}
            disabled={isSaving}
            fieldHint={H.unit_number}
          />
          <AppInput label="Category" value={categoryLabel} disabled fieldHint={H.category} />
          <AppInput
            label="Serial Number"
            value={form.serial_number}
            onChange={(e) => setField('serial_number', e.target.value)}
            disabled={isSaving}
            fieldHint={H.serial_number}
          />
          <AppInput
            label="Brand"
            value={form.brand}
            onChange={(e) => setField('brand', e.target.value)}
            disabled={isSaving}
            fieldHint={H.brand}
          />
          <AppInput
            label="Model"
            value={form.model}
            onChange={(e) => setField('model', e.target.value)}
            disabled={isSaving}
            fieldHint={H.model}
          />
          <AppInput
            label="Value ($)"
            type="number"
            min={0}
            step="0.01"
            value={form.value}
            onChange={(e) => setField('value', e.target.value)}
            disabled={isSaving}
            fieldHint={H.value}
          />
          <AppSelect
            label="Status"
            value={form.status}
            onChange={(e) => setField('status', e.target.value)}
            options={EQUIPMENT_STATUS_OPTIONS}
            disabled={isSaving}
            fieldHint={H.status}
          />
        </div>
      )}

      {activeSection === 'dates' && (
        <div className={uiSpacing.sectionStack}>
          <AppDatePicker
            label="Warranty Expiry"
            value={form.warranty_expiry}
            onChange={(e) => setField('warranty_expiry', e.target.value)}
            disabled={isSaving}
            fieldHint={H.warranty_expiry}
          />
          <AppDatePicker
            label="Purchase Date"
            value={form.purchase_date}
            onChange={(e) => setField('purchase_date', e.target.value)}
            disabled={isSaving}
            fieldHint={H.purchase_date}
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
