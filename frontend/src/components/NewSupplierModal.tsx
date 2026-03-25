import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';

interface NewSupplierModalProps {
  open: boolean;
  onClose: () => void;
  onSupplierCreated: (supplierName: string) => void;
}

export default function NewSupplierModal({ open, onClose, onSupplierCreated }: NewSupplierModalProps) {
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine1Complement, setAddressLine1Complement] = useState('');
  const [showAddress2, setShowAddress2] = useState(false);
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine2Complement, setAddressLine2Complement] = useState('');
  const [showAddress3, setShowAddress3] = useState(false);
  const [addressLine3, setAddressLine3] = useState('');
  const [addressLine3Complement, setAddressLine3Complement] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      return await api<any>('POST', '/inventory/suppliers', data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions'] });
      queryClient.invalidateQueries({ queryKey: ['invSuppliersOptions-select'] });
      toast.success('Supplier created');
      onSupplierCreated(data.name);
      resetForm();
      onClose();
    },
    onError: () => {
      toast.error('Failed to create supplier');
    },
  });

  const resetForm = () => {
    setName('');
    setNameError(false);
    setLegalName('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setAddressLine1('');
    setAddressLine1Complement('');
    setShowAddress2(false);
    setAddressLine2('');
    setAddressLine2Complement('');
    setShowAddress3(false);
    setAddressLine3('');
    setAddressLine3Complement('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
  };

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') onClose(); 
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll when modal is open (same as New Opportunity)
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError(true);
      toast.error('Name is required');
      return;
    }
    
    const data = {
      name: name.trim(),
      legal_name: legalName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      website: website.trim() || undefined,
      address_line1: addressLine1.trim() || undefined,
      address_line1_complement: addressLine1Complement.trim() || undefined,
      address_line2: addressLine2.trim() || undefined,
      address_line2_complement: addressLine2Complement.trim() || undefined,
      address_line3: addressLine3.trim() || undefined,
      address_line3_complement: addressLine3Complement.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      country: country.trim() || undefined,
      is_active: true,
    };

    createMut.mutate(data);
  };

  if (!open) return null;

  const inputBase = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';
  const inputError = nameError && !name.trim() ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : '';
  const labelClass = 'text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1';

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl">
        {/* Title bar - same style as New Customer */}
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
                <div className="text-sm font-semibold text-gray-900">New Supplier</div>
                <div className="text-xs text-gray-500 mt-0.5">Add a new supplier to your inventory</div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <div className="rounded-xl border bg-white p-4">
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">Company</h4>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 mb-2">Core supplier identity details.</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className={labelClass}>
                      Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      className={`${inputBase} ${inputError}`}
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

                  <div className="md:col-span-2">
                    <label className={labelClass}>Legal name</label>
                    <input
                      type="text"
                      className={inputBase}
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      className={inputBase}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="text"
                      className={inputBase}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>Website</label>
                    <input
                      type="url"
                      className={inputBase}
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">Address</h4>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5 mb-2">Primary mailing and location address.</div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Address line 1</label>
                      <AddressAutocomplete
                        value={addressLine1}
                        onChange={(value) => setAddressLine1(value)}
                        onAddressSelect={(address) => {
                          setAddressLine1(address.address_line1 || addressLine1);
                          setCity(address.city !== undefined ? address.city : city);
                          setProvince(address.province !== undefined ? address.province : province);
                          setPostalCode(address.postal_code !== undefined ? address.postal_code : postalCode);
                          setCountry(address.country !== undefined ? address.country : country);
                        }}
                        placeholder="Enter address"
                        className={inputBase}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Complement</label>
                      <input
                        type="text"
                        className={inputBase}
                        value={addressLine1Complement}
                        onChange={(e) => setAddressLine1Complement(e.target.value)}
                        placeholder="Apartment, Unit, Block, etc (Optional)"
                      />
                    </div>
                  </div>
            {!showAddress2 && !showAddress3 && (
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={() => setShowAddress2(true)}
                  className="text-xs font-medium text-brand-red hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add another Address
                </button>
              </div>
            )}
            {showAddress2 && (
              <>
                <div className="col-span-2 grid grid-cols-[1fr_0.8fr_auto] gap-3 items-end">
                  <div>
                    <label className={labelClass}>Address 2</label>
                    <AddressAutocomplete
                      value={addressLine2}
                      onChange={(value) => setAddressLine2(value)}
                      onAddressSelect={(address) => {
                        setAddressLine2(address.address_line1 || addressLine2);
                      }}
                      placeholder="Enter address"
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Complement</label>
                    <input
                      type="text"
                      className={inputBase}
                      value={addressLine2Complement}
                      onChange={(e) => setAddressLine2Complement(e.target.value)}
                      placeholder="Apartment, Unit, Block, etc (Optional)"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddress2(false);
                      setAddressLine2('');
                      setAddressLine2Complement('');
                      if (showAddress3) {
                        setAddressLine2(addressLine3);
                        setAddressLine2Complement(addressLine3Complement);
                        setAddressLine3('');
                        setAddressLine3Complement('');
                        setShowAddress3(false);
                      }
                    }}
                    className="mb-[2px] px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                    title="Remove Address 2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {!showAddress3 && (
                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => setShowAddress3(true)}
                      className="text-xs font-medium text-brand-red hover:underline flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add another Address
                    </button>
                  </div>
                )}
              </>
            )}
            {showAddress3 && (
              <>
                <div className="col-span-2 grid grid-cols-[1fr_0.8fr_auto] gap-3 items-end">
                  <div>
                    <label className={labelClass}>Address 3</label>
                    <AddressAutocomplete
                      value={addressLine3}
                      onChange={(value) => setAddressLine3(value)}
                      onAddressSelect={(address) => {
                        setAddressLine3(address.address_line1 || addressLine3);
                      }}
                      placeholder="Enter address"
                      className={inputBase}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Complement</label>
                    <input
                      type="text"
                      className={inputBase}
                      value={addressLine3Complement}
                      onChange={(e) => setAddressLine3Complement(e.target.value)}
                      placeholder="Apartment, Unit, Block, etc (Optional)"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddress3(false);
                      setAddressLine3('');
                      setAddressLine3Complement('');
                    }}
                    className="mb-[2px] px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                    title="Remove Address 3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </>
            )}
                  <div>
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      className={`${inputBase} bg-gray-50 cursor-not-allowed border-gray-200`}
                      value={city}
                      readOnly
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Province</label>
                    <input
                      type="text"
                      className={`${inputBase} bg-gray-50 cursor-not-allowed border-gray-200`}
                      value={province}
                      readOnly
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Postal code</label>
                    <input
                      type="text"
                      className={`${inputBase} bg-gray-50 cursor-not-allowed border-gray-200`}
                      value={postalCode}
                      readOnly
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Country</label>
                    <input
                      type="text"
                      className={`${inputBase} bg-gray-50 cursor-not-allowed border-gray-200`}
                      value={country}
                      readOnly
                      placeholder=""
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-between gap-3 rounded-b-xl">
          <div className="text-xs text-gray-500" />
          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={createMut.isPending}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMut.isPending ? 'Creating...' : 'Create'}
          </button>
          </div>
        </div>
      </div>
    </div>
    </OverlayPortal>
  );
}

