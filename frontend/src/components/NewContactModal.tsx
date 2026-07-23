import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatContactPhone, uploadContactPhoto } from '@/lib/contactPhoto';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
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
  uiRadius,
  uiSpacing,
  uiModalLayer,
  uiTypography,
} from '@/components/ui';

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  /** Shown in the header as "New contact — {name}" for context */
  clientDisplayName?: string | null;
  onCreated?: (contact: { id: string; name?: string }) => void;
  /** Higher z-index when opened on top of another full-screen flow (e.g. new opportunity). */
  stackOnTop?: boolean;
  /** Prefill contact name from dropdown search. */
  initialName?: string;
};

export default function NewContactModal({
  open,
  onClose,
  clientId,
  clientDisplayName,
  onCreated,
  stackOnTop = false,
  initialName = '',
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState<'true' | 'false'>('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isCreatingContact, setIsCreatingContact] = useState(false);

  const handleClose = useCallback(() => {
    setIsCreatingContact(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    setName(String(initialName || '').trim());
    setEmail('');
    setPhone('');
    setPrimary('false');
    setRole('');
    setDept('');
    setPhotoBlob(null);
    setPhotoPreview('');
    setPickerOpen(false);
  }, [open, clientId, initialName]);

  const title = clientDisplayName?.trim()
    ? `New contact — ${clientDisplayName.trim()}`
    : 'New contact';

  const handleCreate = async () => {
    if (isCreatingContact) return;
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setIsCreatingContact(true);
      const created = await api<{ id: string; name?: string }>('POST', `/clients/${clientId}/contacts`, {
        name: name.trim(),
        email,
        phone,
        role_title: role,
        department: dept,
        is_primary: primary === 'true',
      });
      if (photoBlob && created?.id) {
        try {
          await uploadContactPhoto(clientId, String(created.id), photoBlob);
        } catch {
          toast.error('Contact created, but photo upload failed');
        }
      }
      toast.success('Contact created');
      onCreated?.({ id: String(created.id), name: created.name });
      handleClose();
    } catch {
      toast.error('Failed to create contact');
    } finally {
      setIsCreatingContact(false);
    }
  };

  if (!clientId) return null;

  return (
    <>
      <AppFormModal
        open={open}
        onClose={handleClose}
        title={title}
        description="Name, role, and contact details"
        formWidth="comfortable"
        overlayClassName={stackOnTop ? 'z-[200]' : undefined}
        quickInfo={
          <>
            <p>Add a contact for this customer. Name is required.</p>
            <p>Mark one contact as primary for default communication.</p>
            <p>Photo is optional and can be added before saving.</p>
          </>
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={isCreatingContact}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={isCreatingContact}
              loading={isCreatingContact}
              onClick={handleCreate}
            >
              {isCreatingContact ? 'Creating…' : 'Create'}
            </AppButton>
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
              disabled={isCreatingContact}
              className={uiCx(
                'relative grid h-40 w-full place-items-center overflow-hidden bg-gray-50',
                uiRadius.control,
                uiBorders.input,
                isCreatingContact && 'cursor-not-allowed opacity-60',
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
              disabled={isCreatingContact}
              fieldHint="Name\n\nFull name shown in contact lists."
            />
            <AppInput
              label="Role/title"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isCreatingContact}
              fieldHint="Role/title\n\nJob title or role at the company."
            />
            <AppInput
              label="Department"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              disabled={isCreatingContact}
              fieldHint="Department\n\nDepartment or team (optional)."
            />
            <AppInput
              className="col-span-2"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isCreatingContact}
              fieldHint="Email\n\nWork email for this contact."
            />
            <AppInput
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(formatContactPhone(e.target.value))}
              disabled={isCreatingContact}
              fieldHint="Phone\n\nDirect phone number for this contact."
            />
            <AppSelect
              label="Primary"
              value={primary}
              onChange={(e) => setPrimary(e.target.value as 'true' | 'false')}
              options={[
                { value: 'false', label: 'No' },
                { value: 'true', label: 'Yes' },
              ]}
              disabled={isCreatingContact}
              fieldHint="Primary\n\nPrimary contact receives default communication for this customer."
            />
          </div>
        </div>
      </AppFormModal>

      {pickerOpen && (
        <ImagePicker
          isOpen
          onClose={() => setPickerOpen(false)}
          clientId={String(clientId)}
          targetWidth={400}
          targetHeight={400}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            try {
              setPhotoBlob(blob);
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
