import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { FLEET_COMPLIANCE_FIELD_HINTS as H } from '@/lib/fleetComplianceFieldHints';
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

const FORM_ID = 'fleet-compliance-form';

export type FleetComplianceRecord = {
  id: string;
  fleet_asset_id: string;
  record_type: string;
  facility?: string;
  completed_by?: string;
  equipment_classification?: string;
  equipment_make_model?: string;
  serial_number?: string;
  annual_inspection_date?: string;
  expiry_date?: string;
  file_reference_number?: string;
  notes?: string;
  documents?: string[];
};

type Props = {
  open: boolean;
  assetId: string;
  recordId: string | null;
  initialRecord?: FleetComplianceRecord;
  onClose: () => void;
  onSuccess: () => void;
};

function buildFormState(initialRecord?: FleetComplianceRecord) {
  return {
    record_type: initialRecord?.record_type || 'CVIP',
    facility: initialRecord?.facility || '',
    completed_by: initialRecord?.completed_by || '',
    equipment_classification: initialRecord?.equipment_classification || '',
    equipment_make_model: initialRecord?.equipment_make_model || '',
    serial_number: initialRecord?.serial_number || '',
    annual_inspection_date: initialRecord?.annual_inspection_date?.slice(0, 10) || '',
    expiry_date: initialRecord?.expiry_date?.slice(0, 10) || '',
    file_reference_number: initialRecord?.file_reference_number || '',
    notes: initialRecord?.notes || '',
  };
}

export default function FleetComplianceModal({
  open,
  assetId,
  recordId,
  initialRecord,
  onClose,
  onSuccess,
}: Props) {
  const [form, setForm] = useState(() => buildFormState(initialRecord));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(buildFormState(initialRecord));
    setSaving(false);
  }, [open, initialRecord, recordId]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        fleet_asset_id: assetId,
        record_type: form.record_type,
        facility: form.facility || null,
        completed_by: form.completed_by || null,
        equipment_classification: form.equipment_classification || null,
        equipment_make_model: form.equipment_make_model || null,
        serial_number: form.serial_number || null,
        annual_inspection_date: form.annual_inspection_date || null,
        expiry_date: form.expiry_date || null,
        file_reference_number: form.file_reference_number || null,
        notes: form.notes || null,
      };
      if (recordId) {
        await api('PUT', `/fleet/compliance/${recordId}`, {
          record_type: payload.record_type,
          facility: payload.facility,
          completed_by: payload.completed_by,
          equipment_classification: payload.equipment_classification,
          equipment_make_model: payload.equipment_make_model,
          serial_number: payload.serial_number,
          annual_inspection_date: payload.annual_inspection_date,
          expiry_date: payload.expiry_date,
          file_reference_number: payload.file_reference_number,
          notes: payload.notes,
        });
        toast.success('Record updated');
      } else {
        await api('POST', `/fleet/assets/${assetId}/compliance`, payload);
        toast.success('Record created');
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title={recordId ? 'Edit compliance record' : 'Add compliance record'}
      description="Certification type, facility, equipment, dates, and file reference."
      formWidth="wide"
      quickInfo={
        <>
          <p>Track CVIP, CRANE, NDT, PROPANE, and other certifications for this asset.</p>
          <p>Expiry date drives due / overdue status on the compliance tab and general summary.</p>
          <p>File reference links to internal documentation; notes are optional context.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={FORM_ID} size="sm" disabled={saving} loading={saving}>
            {saving ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      }
    >
      <form id={FORM_ID} className={uiSpacing.sectionStack} onSubmit={handleSubmit}>
        <div className={uiLayout.sectionGrid2}>
          <AppSelect
            label="Record type"
            value={form.record_type}
            onChange={(e) => updateField('record_type', e.target.value)}
            disabled={saving}
            fieldHint={H.record_type}
            options={[
              { value: 'CVIP', label: 'CVIP' },
              { value: 'CRANE', label: 'CRANE' },
              { value: 'NDT', label: 'NDT' },
              { value: 'PROPANE', label: 'PROPANE' },
              { value: 'OTHER', label: 'OTHER' },
            ]}
          />
          <AppInput
            label="Equipment make / model"
            value={form.equipment_make_model}
            onChange={(e) => updateField('equipment_make_model', e.target.value)}
            disabled={saving}
            fieldHint={H.equipment_make_model}
          />
          <AppInput
            label="Facility"
            value={form.facility}
            onChange={(e) => updateField('facility', e.target.value)}
            disabled={saving}
            fieldHint={H.facility}
          />
          <AppInput
            label="Serial number"
            value={form.serial_number}
            onChange={(e) => updateField('serial_number', e.target.value)}
            disabled={saving}
            fieldHint={H.serial_number}
          />
          <AppInput
            label="Completed by"
            value={form.completed_by}
            onChange={(e) => updateField('completed_by', e.target.value)}
            disabled={saving}
            fieldHint={H.completed_by}
          />
          <AppDatePicker
            label="Annual inspection date"
            value={form.annual_inspection_date}
            onChange={(e) => updateField('annual_inspection_date', e.target.value)}
            disabled={saving}
            fieldHint={H.annual_inspection_date}
          />
          <AppInput
            label="Equipment classification"
            value={form.equipment_classification}
            onChange={(e) => updateField('equipment_classification', e.target.value)}
            disabled={saving}
            fieldHint={H.equipment_classification}
          />
          <AppDatePicker
            label="Expiry date"
            value={form.expiry_date}
            onChange={(e) => updateField('expiry_date', e.target.value)}
            disabled={saving}
            fieldHint={H.expiry_date}
          />
        </div>
        <AppInput
          label="File reference number"
          value={form.file_reference_number}
          onChange={(e) => updateField('file_reference_number', e.target.value)}
          disabled={saving}
          fieldHint={H.file_reference_number}
        />
        <AppTextarea
          label="Notes"
          value={form.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          rows={3}
          disabled={saving}
          fieldHint={H.notes}
        />
      </form>
    </AppFormModal>
  );
}
