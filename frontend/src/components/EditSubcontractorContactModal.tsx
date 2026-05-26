import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatContactPhone } from '@/lib/contactPhoto';
import {
  AppButton,
  AppControlLabelRow,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiTypography,
} from '@/components/ui';

export type SubcontractorContactRecord = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role_title?: string;
  department?: string;
  is_primary?: boolean;
  photo_file_id?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyDisplayName?: string | null;
  contact: SubcontractorContactRecord | null;
  photoUrl?: string;
  onSaved?: () => void;
  onDeleted?: () => void;
};

async function uploadSubcontractorContactPhoto(companyId: string, contactId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('original_name', file.name);
  fd.append('content_type', file.type || 'image/jpeg');
  fd.append('project_id', '');
  fd.append('client_id', '');
  fd.append('employee_id', '');
  fd.append('category_id', 'files');
  const res = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
  await api('PATCH', `/subcontractors/companies/${companyId}/contacts/${contactId}`, { photo_file_id: res.id });
}

export default function EditSubcontractorContactModal({
  open,
  onClose,
  companyId,
  companyDisplayName,
  contact,
  photoUrl = '',
  onSaved,
  onDeleted,
}: Props) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState<'true' | 'false'>('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = useCallback(() => {
    setIsSaving(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || !contact) return;
    setName(contact.name || '');
    setEmail(contact.email || '');
    setPhone(contact.phone || '');
    setPrimary(contact.is_primary ? 'true' : 'false');
    setRole(contact.role_title || '');
    setDept(contact.department || '');
    setPhotoFile(null);
    setPhotoPreview(photoUrl || '');
    setPickerOpen(false);
  }, [open, contact, photoUrl]);

  const title = contact?.name?.trim()
    ? `Edit contact — ${contact.name.trim()}`
    : companyDisplayName?.trim()
      ? `Edit contact — ${companyDisplayName.trim()}`
      : 'Edit contact';

  const handleSave = async () => {
    if (!contact || isSaving) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setIsSaving(true);
      await api('PATCH', `/subcontractors/companies/${companyId}/contacts/${contact.id}`, {
        name: name.trim(),
        email,
        phone,
        role_title: role,
        department: dept,
        is_primary: primary === 'true',
      });
      if (photoFile) {
        try {
          await uploadSubcontractorContactPhoto(companyId, String(contact.id), photoFile);
        } catch {
          toast.error('Contact saved, but photo upload failed');
        }
      }
      toast.success('Contact updated');
      onSaved?.();
      handleClose();
    } catch {
      toast.error('Failed to update contact');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contact || isSaving) return;
    const ok = await confirm({
      title: 'Delete contact',
      message: 'Are you sure you want to delete this contact?',
    });
    if (!ok) return;
    try {
      setIsSaving(true);
      await api('DELETE', `/subcontractors/companies/${companyId}/contacts/${contact.id}`);
      toast.success('Contact deleted');
      onDeleted?.();
      handleClose();
    } catch {
      toast.error('Failed to delete contact');
    } finally {
      setIsSaving(false);
    }
  };

  if (!companyId || !contact) return null;

  return (
    <>
      <AppFormModal
        open={open}
        onClose={handleClose}
        title={title}
        description="Update name, role, and contact details"
        formWidth="comfortable"
        quickInfo={
          <>
            <p>Changes apply to this subcontractor&apos;s contact list.</p>
            <p>Mark as primary for default communication.</p>
            <p>Photo updates when you save after selecting a new image.</p>
          </>
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between gap-2')}>
            <AppButton type="button" variant="danger" size="sm" disabled={isSaving} onClick={handleDelete}>
              Delete
            </AppButton>
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
                Cancel
              </AppButton>
              <AppButton type="button" size="sm" disabled={isSaving} loading={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving…' : 'Save'}
              </AppButton>
            </div>
          </div>
        }
      >
        <div className="grid items-start gap-3 md:grid-cols-5">
          <div className="space-y-1.5 md:col-span-2">
            <AppControlLabelRow
              label="Contact photo"
              fieldHint={<AppFieldHint hint="Contact photo\n\nOptional profile image for this contact." />}
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={isSaving}
              className={uiCx(
                'relative grid h-40 w-full place-items-center overflow-hidden bg-gray-50',
                uiRadius.control,
                uiBorders.input,
                isSaving && 'cursor-not-allowed opacity-60',
              )}
            >
              {photoPreview ? (
                <img src={photoPreview} className="h-full w-full object-cover" alt="Contact preview" />
              ) : (
                <span className={uiTypography.helper}>Select photo</span>
              )}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-3">
            <AppInput
              className="col-span-2"
              label="Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
              fieldHint="Name\n\nFull name shown in contact lists."
            />
            <AppInput
              label="Role/title"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              label="Department"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              className="col-span-2"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSaving}
            />
            <AppInput
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(formatContactPhone(e.target.value))}
              disabled={isSaving}
            />
            <AppSelect
              label="Primary"
              value={primary}
              onChange={(e) => setPrimary(e.target.value as 'true' | 'false')}
              options={[
                { value: 'false', label: 'No' },
                { value: 'true', label: 'Yes' },
              ]}
              disabled={isSaving}
              fieldHint="Primary\n\nPrimary contact receives default communication for this company."
            />
          </div>
        </div>
      </AppFormModal>

      {pickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          targetWidth={400}
          targetHeight={400}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            try {
              const file = new File([blob], 'contact-photo.jpg', { type: 'image/jpeg' });
              setPhotoFile(file);
              setPhotoPreview(URL.createObjectURL(blob));
            } finally {
              setPickerOpen(false);
            }
          }}
        />
      )}
    </>
  );
}
