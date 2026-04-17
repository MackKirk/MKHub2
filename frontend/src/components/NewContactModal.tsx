import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import OverlayPortal from '@/components/OverlayPortal';

type Props = {
  open: boolean;
  onClose: () => void;
  clientId: string;
  /** Shown in the header as "New contact — {name}" for context */
  clientDisplayName?: string | null;
  onCreated?: (contact: { id: string; name?: string }) => void;
  /** Higher z-index when opened on top of another full-screen flow (e.g. new opportunity). */
  stackOnTop?: boolean;
};

export default function NewContactModal({
  open,
  onClose,
  clientId,
  clientDisplayName,
  onCreated,
  stackOnTop = false,
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [pickerForContact, setPickerForContact] = useState<string | null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [nameError, setNameError] = useState(false);

  const handleClose = useCallback(() => {
    setIsCreatingContact(false);
    setNameError(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPhone('');
      setPrimary('false');
      setRole('');
      setDept('');
      setNameError(false);
      setPickerForContact(null);
    }
  }, [open, clientId]);

  const formatPhone = (v: string) => {
    const d = String(v || '')
      .replace(/\D+/g, '')
      .slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  const zBase = stackOnTop ? 'z-[200]' : 'z-50';

  if (!open || !clientId) return null;

  return (
    <>
      <OverlayPortal>
        <div
          className={`fixed inset-0 ${zBase} bg-black/50 flex items-center justify-center overflow-y-auto p-4`}
          role="presentation"
          onClick={handleClose}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            role="dialog"
            aria-labelledby="new-contact-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div id="new-contact-modal-title" className="text-sm font-semibold text-gray-900">
                      {clientDisplayName?.trim()
                        ? `New contact — ${clientDisplayName.trim()}`
                        : 'New contact'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Name, role and contact details</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              <div className="rounded-xl border bg-white p-4 grid md:grid-cols-5 gap-4 items-start">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                    Contact photo <span className="opacity-60">(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPickerForContact('__new__')}
                    className="w-full h-40 border border-gray-200 rounded-lg grid place-items-center bg-gray-50 hover:bg-gray-100 text-sm text-gray-600"
                  >
                    Select photo
                  </button>
                </div>
                <div className="md:col-span-3 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${
                        nameError && !name.trim()
                          ? 'border-red-500 focus:ring-red-500'
                          : 'border-gray-200 focus:ring-gray-300 focus:border-gray-300'
                      }`}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (nameError) setNameError(false);
                      }}
                    />
                    {nameError && !name.trim() && (
                      <div className="text-[11px] text-red-600 mt-1">This field is required</div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Role/title
                    </label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Department
                    </label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={dept}
                      onChange={(e) => setDept(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Email
                    </label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Phone
                    </label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                      Primary
                    </label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={primary}
                      onChange={(e) => setPrimary(e.target.value)}
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (isCreatingContact) return;
                  if (!name.trim()) {
                    setNameError(true);
                    toast.error('Name is required');
                    return;
                  }
                  try {
                    setIsCreatingContact(true);
                    const payload: Record<string, unknown> = {
                      name,
                      email,
                      phone,
                      role_title: role,
                      department: dept,
                      is_primary: primary === 'true',
                    };
                    const created = await api<{
                      id: string;
                      name?: string;
                    }>('POST', `/clients/${clientId}/contacts`, payload);
                    setIsCreatingContact(false);
                    toast.success('Contact created');
                    onCreated?.({ id: String(created.id), name: created.name });
                    handleClose();
                  } catch {
                    toast.error('Failed to create contact');
                    setIsCreatingContact(false);
                  }
                }}
                disabled={isCreatingContact}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#c41e1e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingContact ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </OverlayPortal>

      {pickerForContact && (
        <ImagePicker
          isOpen
          onClose={() => setPickerForContact(null)}
          clientId={String(clientId)}
          targetWidth={400}
          targetHeight={400}
          allowEdit
          onConfirm={async (blob) => {
            try {
              if (pickerForContact === '__new__') {
                // No contact id yet; add a photo after the contact is created from the customer page if needed.
              } else if (pickerForContact) {
                const up: any = await api('POST', '/files/upload', {
                  project_id: null,
                  client_id: clientId,
                  employee_id: null,
                  category_id: 'contact-photo',
                  original_name: `contact-${pickerForContact}.jpg`,
                  content_type: 'image/jpeg',
                });
                await fetch(up.upload_url, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
                  body: blob,
                });
                const conf: any = await api('POST', '/files/confirm', {
                  key: up.key,
                  size_bytes: blob.size,
                  checksum_sha256: 'na',
                  content_type: 'image/jpeg',
                });
                await api(
                  'POST',
                  `/clients/${clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-' + pickerForContact)}&original_name=${encodeURIComponent('contact-' + pickerForContact + '.jpg')}`
                );
                toast.success('Contact photo updated');
              }
            } catch {
              toast.error('Failed to update contact photo');
            } finally {
              setPickerForContact(null);
            }
          }}
        />
      )}
    </>
  );
}
