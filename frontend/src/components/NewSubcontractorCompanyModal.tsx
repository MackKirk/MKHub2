import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import OverlayPortal from '@/components/OverlayPortal';

type Company = {
  id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type Props = {
  onClose: () => void;
  onSuccess: (companyId: string) => void;
};

export default function NewSubcontractorCompanyModal({ onClose, onSuccess }: Props) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const createMut = useMutation({
    mutationFn: () =>
      api<Company>('POST', '/subcontractors/companies', {
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
        postal_code: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        notes: notes.trim() || undefined,
        is_active: isActive,
      }),
    onSuccess: (c) => {
      toast.success('Company created');
      onSuccess(c.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit = name.trim().length > 0;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
        <div className="w-[640px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl">
          <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                  title="Close"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </button>
                <div>
                  <div className="text-sm font-semibold text-gray-900">New subcontractor company</div>
                  <div className="text-xs text-gray-500 mt-0.5">Add a third-party company and its workers later</div>
                </div>
              </div>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-4">
            <div className="rounded-xl border bg-white p-4 space-y-4">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                  Company name <span className="text-red-600">*</span>
                </label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="organization"
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Contact name</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address</label>
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
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Address line 2</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">City</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Province</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Postal code</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Country</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
              </label>
            </div>
          </div>
          <div className="border-t border-gray-200 bg-white p-4 flex justify-end gap-2 flex-shrink-0">
            <button type="button" className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-xs font-medium bg-[#7f1010] text-white disabled:opacity-50"
              disabled={!canSubmit || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
