import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatContactPhone } from '@/lib/contactPhoto';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppSectionHeader,
  AppTextarea,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type NewWorkerPayload = {
  name: string;
  phone?: string | null;
  email?: string | null;
  photo_file_id?: string | null;
  is_active: boolean;
  notes?: string | null;
  job_title?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName?: string | null;
  onCreated?: () => void;
};

export default function NewSubcontractorWorkerModal({
  open,
  onClose,
  companyId,
  companyName,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const controlInputClass = uiCx('w-full text-sm', uiRadius.control, uiBorders.input, uiSpacing.controlX, 'py-2');

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) return;
    setStep(1);
    setName('');
    setPhone('');
    setEmail('');
    setJobTitle('');
    setNotes('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
    setEmergencyName('');
    setEmergencyPhone('');
    setPhotoFileId(null);
    setPhotoPreview(null);
    setPhotoUploading(false);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (body: NewWorkerPayload) =>
      api<{ id: string }>('POST', `/subcontractors/companies/${companyId}/workers`, body),
    onSuccess: () => {
      toast.success('Worker created');
      qc.invalidateQueries({ queryKey: ['subcontractor-workers', companyId] });
      qc.invalidateQueries({ queryKey: ['subcontractor-workers-overview', companyId] });
      qc.invalidateQueries({ queryKey: ['subcontractor-company-activity', companyId] });
      qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
      qc.invalidateQueries({ queryKey: ['subcontractor-companies'] });
      onCreated?.();
      handleClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickPhoto = async (file: File | null) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('original_name', file.name);
    fd.append('content_type', file.type || 'image/jpeg');
    fd.append('project_id', '');
    fd.append('client_id', '');
    fd.append('employee_id', '');
    fd.append('category_id', 'files');
    try {
      setPhotoUploading(true);
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
      setPhotoFileId(res.id);
      setPhotoPreview(withFileAccessTokenIfNeeded(`/files/${res.id}/thumbnail?w=160`) || null);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Photo upload failed');
    } finally {
      setPhotoUploading(false);
    }
  };

  const submit = () => {
    const n = name.trim();
    if (!n) {
      toast.error('Name is required');
      setStep(1);
      return;
    }
    const body: NewWorkerPayload = {
      name: n,
      is_active: true,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      job_title: jobTitle.trim() || undefined,
      address_line1: addressLine1.trim() || undefined,
      address_line2: addressLine2.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      country: country.trim() || undefined,
      emergency_contact_name: emergencyName.trim() || undefined,
      emergency_contact_phone: emergencyPhone.trim() || undefined,
      notes: notes.trim() || undefined,
      photo_file_id: photoFileId || undefined,
    };
    createMut.mutate(body);
  };

  const isSaving = createMut.isPending;
  const canGoToStep2 = !!name.trim();
  const title = companyName?.trim() ? `New worker — ${companyName.trim()}` : 'New worker';
  const stepSubtitle = step === 1 ? 'Identity and contact details' : 'Address and emergency contact';

  const stepPillClass = (n: number) =>
    uiCx(
      'rounded-full px-2 py-1 text-[10px] font-medium',
      step === n ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600',
    );

  const stepIndicators = (
    <div className={uiCx(uiLayout.actionsRow, uiTypography.helper, 'text-[10px] font-medium')}>
      <span className={stepPillClass(1)}>Step 1</span>
      <span className="text-gray-400">→</span>
      <span className={stepPillClass(2)}>Step 2</span>
    </div>
  );

  const modalFooter = (
    <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
      <span className={uiTypography.helper}>{step === 1 ? 'Step 1 of 2' : 'Step 2 of 2'}</span>
      <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
        <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
          Cancel
        </AppButton>
        {step === 1 ? (
          <AppButton type="button" size="sm" disabled={!canGoToStep2} onClick={() => setStep(2)}>
            Next
          </AppButton>
        ) : (
          <>
            <AppButton type="button" variant="secondary" size="sm" disabled={isSaving} onClick={() => setStep(1)}>
              Back
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={!canGoToStep2 || isSaving}
              loading={isSaving}
              onClick={() => submit()}
            >
              {isSaving ? 'Creating…' : 'Create worker'}
            </AppButton>
          </>
        )}
      </div>
    </div>
  );

  if (!companyId) return null;

  return (
    <AppFormModal
      open={open}
      onClose={handleClose}
      title={title}
      description={stepSubtitle}
      formWidth="wide"
      dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
      dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
      headerExtra={stepIndicators}
      quickInfo={
        <>
          <p>Step 1: name, phone, email, job title, notes, and optional photo. Name is required.</p>
          <p>Step 2: address and emergency contact (all optional).</p>
          <p>New workers are created as active. QR code is available on the profile after creation.</p>
        </>
      }
      footer={modalFooter}
    >
      {step === 1 ? (
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader
            title="Worker details"
            description="Basic identity and how to reach this person."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <AppInput
              className="md:col-span-2"
              label="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              autoFocus
              fieldHint="Name\n\nFull name shown on worker lists and safety forms."
            />
            <AppInput
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(formatContactPhone(e.target.value))}
              disabled={isSaving}
              fieldHint="Phone\n\nDirect phone number for this worker."
            />
            <AppInput
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSaving}
              fieldHint="Email\n\nWork email for this worker."
            />
            <AppInput
              className="md:col-span-2"
              label="Job title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              disabled={isSaving}
              fieldHint="Job title\n\nRole or trade (optional)."
            />
          </div>

          <div className="grid items-start gap-3 md:grid-cols-5">
            <AppTextarea
              className="md:col-span-3"
              label="Notes"
              rows={3}
              textareaClassName="h-32 min-h-32 resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSaving}
              fieldHint="Notes\n\nInternal notes about this worker (optional)."
            />
            <div className="space-y-1.5 md:col-span-2">
              <AppControlLabelRow
                label="Photo"
                fieldHint={<AppFieldHint hint="Photo\n\nOptional profile image for this worker." />}
              />
              <label
                className={uiCx(
                  'relative grid h-32 w-full cursor-pointer place-items-center overflow-hidden bg-gray-50',
                  uiRadius.control,
                  uiBorders.input,
                  (photoUploading || isSaving) && 'pointer-events-none opacity-60',
                )}
              >
                {photoPreview ? (
                  <img src={photoPreview} className="h-full w-full object-cover" alt="Worker photo preview" />
                ) : (
                  <span className={uiTypography.helper}>{photoUploading ? 'Uploading…' : 'Select photo'}</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={photoUploading || isSaving}
                  onChange={(e) => void onPickPhoto(e.target.files?.[0] || null)}
                />
              </label>
              {photoFileId ? (
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    setPhotoFileId(null);
                    setPhotoPreview(null);
                  }}
                >
                  Remove photo
                </AppButton>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className={uiSpacing.sectionStack}>
          <AppSectionHeader
            title="Address"
            description="Mailing address"
          />

          <div className="space-y-1.5">
            <AppControlLabelRow
              label="Address 1"
              fieldHint={<AppFieldHint hint="Address 1\n\nStreet address. Suggestions appear as you type." />}
            />
            <AddressAutocomplete
              value={addressLine1}
              onChange={setAddressLine1}
              disabled={isSaving}
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

          <div className="space-y-1.5">
            <AppControlLabelRow
              label="Address 2"
              fieldHint={
                <AppFieldHint hint="Address 2\n\nSuite, unit, or building (optional). Suggestions appear as you type." />
              }
            />
            <AddressAutocomplete
              value={addressLine2}
              onChange={setAddressLine2}
              disabled={isSaving}
              lineOnly
              placeholder="Enter a second address"
              className={controlInputClass}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput label="City" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSaving} />
            <AppInput
              label="Province/State"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              label="Postal code"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              label="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <AppSectionHeader
            title="Emergency contact"
            description="Optional person to call in an emergency."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <AppInput
              label="Emergency contact name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              disabled={isSaving}
              fieldHint="Emergency contact name\n\nPerson to call in an emergency."
            />
            <AppInput
              label="Emergency contact phone"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(formatContactPhone(e.target.value))}
              disabled={isSaving}
              fieldHint="Emergency contact phone\n\nPhone number for emergency contact."
            />
          </div>
        </div>
      )}
    </AppFormModal>
  );
}
