import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
      onClose();
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
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-xl p-4 space-y-3 my-8">
          <div className="text-sm font-semibold text-gray-900">New worker</div>
          <p className="text-xs text-gray-500">
            Create a worker for this subcontractor company. QR code and full profile are available on the worker page.
          </p>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Photo (optional)</label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 border border-dashed border-gray-300 grid place-items-center text-xs text-gray-400">No photo</div>
              )}
              <label className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void onPickPhoto(e.target.files?.[0] || null)} />
              </label>
              {photoFileId && (
                <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => { setPhotoFileId(null); setPhotoPreview(null); }}>
                  Remove
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Name *</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Worker name"
              autoFocus
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Job title</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address line 1</label>
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address line 2</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">City</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Province</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={province} onChange={(e) => setProvince(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Postal code</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Country</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Emergency contact name</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Emergency contact phone</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
            <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" className="px-3 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-700 hover:bg-gray-50" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#7f1010] text-white disabled:opacity-50"
              disabled={!name.trim() || createMut.isPending}
              onClick={() => submit()}
            >
              {createMut.isPending ? 'Creating…' : 'Create worker'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
