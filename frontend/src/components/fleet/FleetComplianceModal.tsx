import { useEffect, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { api, withFileAccessToken } from '@/lib/api';
import { FLEET_COMPLIANCE_FIELD_HINTS as H } from '@/lib/fleetComplianceFieldHints';
import {
  AppButton,
  AppDatePicker,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const FORM_ID = 'fleet-compliance-form';
const ATTACH_ACCEPT = 'image/*,.pdf,.doc,.docx';

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

function seedDocumentIds(initialRecord?: FleetComplianceRecord): string[] {
  return (initialRecord?.documents ?? []).map(String).filter(Boolean);
}

async function uploadComplianceFile(file: File): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const up: { upload_url: string; key: string } = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'fleet-compliance',
  });
  await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  const conf: { id: string } = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  return String(conf.id);
}

function ComplianceAttachmentThumb({
  fileId,
  disabled,
  onRemove,
}: {
  fileId: string;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const [showImage, setShowImage] = useState(true);

  if (!showImage) {
    return (
      <div className="relative group h-20 w-20 shrink-0">
        <div className="flex h-full w-full flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-100 p-1 text-center text-[10px] font-medium text-gray-600">
          Doc
        </div>
        {!disabled && (
          <button
            type="button"
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
            onClick={onRemove}
            aria-label="Remove file"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative group h-20 w-20 shrink-0">
      <img
        src={withFileAccessToken(`/files/${encodeURIComponent(fileId)}/thumbnail?w=120`)}
        alt=""
        className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
        onError={() => setShowImage(false)}
      />
      {!disabled && (
        <button
          type="button"
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-5 text-white hover:bg-black/80"
          onClick={onRemove}
          aria-label="Remove file"
        >
          ×
        </button>
      )}
    </div>
  );
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
  const [documentIds, setDocumentIds] = useState<string[]>(() => seedDocumentIds(initialRecord));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const busy = saving || uploading;

  useEffect(() => {
    if (!open) return;
    setForm(buildFormState(initialRecord));
    setDocumentIds(seedDocumentIds(initialRecord));
    setSaving(false);
    setUploading(false);
  }, [open, initialRecord, recordId]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFilesSelected = async (added: File[]) => {
    if (!added.length || busy) return;
    setUploading(true);
    try {
      const newIds: string[] = [];
      for (const file of added) {
        newIds.push(await uploadComplianceFile(file));
      }
      setDocumentIds((prev) => [...prev, ...newIds]);
      toast.success(added.length === 1 ? 'File uploaded' : `${added.length} files uploaded`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSaving(true);
    try {
      const documents = documentIds.length > 0 ? documentIds : null;
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
        documents,
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
          documents: payload.documents,
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
      description="Certification type, facility, equipment, dates, file reference, and attachments."
      formWidth="wide"
      quickInfo={
        <>
          <p>Track CVIP, CRANE, NDT, PROPANE, and other certifications for this asset.</p>
          <p>Expiry date drives due / overdue status on the compliance tab and general summary.</p>
          <p>Attach PDFs, images, or Word docs; file reference is an optional internal number.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton type="submit" form={FORM_ID} size="sm" disabled={busy} loading={saving}>
            {saving ? 'Saving…' : uploading ? 'Uploading…' : 'Save'}
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
            disabled={busy}
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
            disabled={busy}
            fieldHint={H.equipment_make_model}
          />
          <AppInput
            label="Facility"
            value={form.facility}
            onChange={(e) => updateField('facility', e.target.value)}
            disabled={busy}
            fieldHint={H.facility}
          />
          <AppInput
            label="Serial number"
            value={form.serial_number}
            onChange={(e) => updateField('serial_number', e.target.value)}
            disabled={busy}
            fieldHint={H.serial_number}
          />
          <AppInput
            label="Completed by"
            value={form.completed_by}
            onChange={(e) => updateField('completed_by', e.target.value)}
            disabled={busy}
            fieldHint={H.completed_by}
          />
          <AppDatePicker
            label="Annual inspection date"
            value={form.annual_inspection_date}
            onChange={(e) => updateField('annual_inspection_date', e.target.value)}
            disabled={busy}
            fieldHint={H.annual_inspection_date}
          />
          <AppInput
            label="Equipment classification"
            value={form.equipment_classification}
            onChange={(e) => updateField('equipment_classification', e.target.value)}
            disabled={busy}
            fieldHint={H.equipment_classification}
          />
          <AppDatePicker
            label="Expiry date"
            value={form.expiry_date}
            onChange={(e) => updateField('expiry_date', e.target.value)}
            disabled={busy}
            fieldHint={H.expiry_date}
          />
        </div>
        <AppInput
          label="File reference number"
          value={form.file_reference_number}
          onChange={(e) => updateField('file_reference_number', e.target.value)}
          disabled={busy}
          fieldHint={H.file_reference_number}
        />
        <div className={uiSpacing.sectionStack}>
          {documentIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {documentIds.map((fid) => (
                <ComplianceAttachmentThumb
                  key={fid}
                  fileId={fid}
                  disabled={busy}
                  onRemove={() => setDocumentIds((prev) => prev.filter((id) => id !== fid))}
                />
              ))}
            </div>
          ) : null}
          <AppFileUpload
            mode="multiple"
            value={[]}
            onChange={() => {}}
            accept={ATTACH_ACCEPT}
            label="Attachments"
            fieldHint={
              'Attachments\n\nDrag, click, or Ctrl+V to add PDFs, images, or Word documents. Upload starts when files are added.'
            }
            helperText="Images, PDF, and Word documents"
            disabled={busy}
            onFilesSelected={handleFilesSelected}
          />
        </div>
        <AppTextarea
          label="Notes"
          value={form.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          rows={3}
          disabled={busy}
          fieldHint={H.notes}
        />
      </form>
    </AppFormModal>
  );
}
