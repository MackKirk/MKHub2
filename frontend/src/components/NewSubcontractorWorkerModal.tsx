import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import AddressAutocomplete from '@/components/AddressAutocomplete';

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

const fieldLabelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';
const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300';

export default function NewSubcontractorWorkerModal({
  open,
  onClose,
  companyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (open) return;
    setName('');
    setPhone('');
    setEmail('');
    setJobTitle('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
    setEmergencyName('');
    setEmergencyPhone('');
    setNotes('');
    setIsActive(true);
    setPhotoFileId(null);
    setPhotoPreview(null);
  }, [open]);

  const createMut = useMutation({
    mutationFn: (body: NewWorkerPayload) =>
      api<{ id: string }>('POST', `/subcontractors/companies/${companyId}/workers`, body),
    onSuccess: () => {
      toast.success('Worker created');
      qc.invalidateQueries({ queryKey: ['subcontractor-workers', companyId] });
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
      const res = await api<{ id: string }>('POST', '/files/upload-proxy', fd);
      setPhotoFileId(res.id);
      setPhotoPreview(withFileAccessTokenIfNeeded(`/files/${res.id}/thumbnail?w=160`) || null);
      toast.success('Photo uploaded');
    } catch {
      toast.error('Photo upload failed');
    }
  };

  const submit = () => {
    const n = name.trim();
    if (!n) {
      toast.error('Name is required');
      return;
    }
    const body: NewWorkerPayload = {
      name: n,
      is_active: isActive,
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

  if (!open) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
        role="presentation"
        onClick={handleClose}
      >
        <div
          className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-worker-modal-title"
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
                  <div id="new-worker-modal-title" className="text-sm font-semibold text-gray-900">
                    New worker
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Add a worker for this subcontractor company. QR code is available on the worker profile after creation.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <span className={fieldLabelClass}>Photo (optional)</span>
                    <div className="flex items-center gap-3">
                      {photoPreview ? (
                        <img src={photoPreview} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 border border-dashed border-gray-300 grid place-items-center text-xs text-gray-400">
                          No photo
                        </div>
                      )}
                      <label className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => void onPickPhoto(e.target.files?.[0] || null)}
                        />
                      </label>
                      {photoFileId && (
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => {
                            setPhotoFileId(null);
                            setPhotoPreview(null);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={fieldLabelClass}>
                      Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      className={inputClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Worker name"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Phone</label>
                    <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Email</label>
                    <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Job title</label>
                    <input className={inputClass} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                    <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                    Active
                  </label>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={fieldLabelClass}>Address line 1</label>
                    <AddressAutocomplete
                      value={addressLine1}
                      onChange={setAddressLine1}
                      onAddressSelect={(a) => {
                        setAddressLine1(a.address_line1 || '');
                        setAddressLine2(a.address_line2 || '');
                        setCity(a.city || '');
                        setProvince(a.province || '');
                        setPostalCode(a.postal_code || '');
                        setCountry(a.country || '');
                      }}
                      placeholder="Start typing an address…"
                      className={`${inputClass} bg-white`}
                    />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Address line 2</label>
                    <input className={inputClass} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={fieldLabelClass}>City</label>
                      <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Province</label>
                      <input className={inputClass} value={province} onChange={(e) => setProvince(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Postal code</label>
                      <input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                    </div>
                    <div>
                      <label className={fieldLabelClass}>Country</label>
                      <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Emergency contact name</label>
                    <input className={inputClass} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Emergency contact phone</label>
                    <input className={inputClass} value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                  </div>

                  <div>
                    <label className={fieldLabelClass}>Notes</label>
                    <textarea
                      className={`${inputClass} min-h-[88px] resize-y`}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
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
              disabled={!name.trim() || createMut.isPending}
              onClick={() => submit()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#c41e1e] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMut.isPending ? 'Creating…' : 'Create worker'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
