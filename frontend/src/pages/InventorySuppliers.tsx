import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Supplier = {
  id: string;
  name: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
  created_at?: string;
  image_base64?: string;
};

// Helper function to format phone numbers
const formatPhone = (phone: string | undefined): string => {
  if (!phone) return '-';
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Format as (XXX) XXX-XXXX for North American numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    // Handle 11-digit numbers starting with 1
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  // Return original if can't format
  return phone;
};

export default function InventorySuppliers() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Form fields
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suppliers', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const path = params.toString() ? `/inventory/suppliers?${params.toString()}` : '/inventory/suppliers';
      return await api<Supplier[]>('GET', path);
    },
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => api('POST', '/inventory/suppliers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier created');
      setOpen(false);
      resetForm();
    },
    onError: () => toast.error('Failed to create supplier'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => api('PUT', `/inventory/suppliers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier updated');
      setOpen(false);
      resetForm();
    },
    onError: () => toast.error('Failed to update supplier'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api('DELETE', `/inventory/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier deleted');
    },
    onError: () => toast.error('Failed to delete supplier'),
  });

  const resetForm = () => {
    setName('');
    setLegalName('');
    setEmail('');
    setPhone('');
    setWebsite('');
    setAddressLine1('');
    setAddressLine2('');
    setCity('');
    setProvince('');
    setPostalCode('');
    setCountry('');
    setImageDataUrl('');
    setEditing(null);
    setViewing(null);
  };

  const openViewModal = (supplier: Supplier) => {
    setViewing(supplier);
    setOpen(true);
  };
  
  const openEditModal = () => {
    if (!viewing) return;
    setEditing(viewing);
    setName(viewing.name);
    setLegalName(viewing.legal_name || '');
    setEmail(viewing.email || '');
    setPhone(viewing.phone || '');
    setWebsite(viewing.website || '');
    setAddressLine1((viewing as any).address_line1 || '');
    setAddressLine2((viewing as any).address_line2 || '');
    setCity(viewing.city || '');
    setProvince(viewing.province || '');
    setPostalCode((viewing as any).postal_code || '');
    setCountry(viewing.country || '');
    setImageDataUrl(viewing.image_base64 || '');
    setViewing(null);
  };

  const onFileChange = (file: File | null) => {
    if (!file) {
      setImageDataUrl('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageDataUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
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
      address_line2: addressLine2.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      postal_code: postalCode.trim() || undefined,
      country: country.trim() || undefined,
      image_base64: imageDataUrl || undefined,
      is_active: true,
    };

    if (editing) {
      updateMut.mutate({ id: editing.id, data });
    } else {
      createMut.mutate(data);
    }
  };

  const sortedRows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data];
    
    sorted.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof Supplier];
      let bVal: any = b[sortColumn as keyof Supplier];
      
      // Convert to string for comparison
      aVal = aVal?.toString() || '';
      bVal = bVal?.toString() || '';
      
      // Primary sort
      let comparison = aVal.localeCompare(bVal);
      
      // If equal, secondary sort by name
      if (comparison === 0) {
        const aName = a.name?.toString() || '';
        const bName = b.name?.toString() || '';
        comparison = aName.localeCompare(bName);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [data, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const rows = sortedRows;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark"
        >
          New Supplier
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search suppliers..."
          className="w-full max-w-md px-4 py-2 border rounded-lg"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="rounded-xl border bg-white">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : !Array.isArray(rows) || !rows.length ? (
          <div className="p-4 text-gray-600 text-center">
            No suppliers yet
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((s) => (
              <div
                key={s.id}
                className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => openViewModal(s)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={s.image_base64 || '/ui/assets/login/logo-light.svg'}
                    className="w-12 h-12 rounded-lg border object-cover"
                    alt={s.name}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-base">{s.name}</div>
                    {(s as any).address_line1 && (
                      <div className="text-xs text-gray-700">{String((s as any).address_line1)}</div>
                    )}
                    <div className="text-xs text-gray-600">
                      {[s.city, s.province].filter(Boolean).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  {s.email && (
                    <>
                      <span className="text-gray-600">Email:</span>
                      <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{s.email}</span>
                    </>
                  )}
                  {s.phone && (
                    <>
                      <span className="text-gray-600">Phone:</span>
                      <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{formatPhone(s.phone)}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="overflow-y-auto">
              {viewing && !editing ? (
                // View mode - display supplier details
                <div className="space-y-6">
                  {/* Profile Header */}
                  <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
                    <button
                      onClick={() => {
                        setOpen(false);
                        resetForm();
                      }}
                      className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
                      title="Close"
                    >
                      ×
                    </button>
                    <img 
                      src={viewing.image_base64 || '/ui/assets/login/logo-light.svg'} 
                      className="w-24 h-24 rounded-xl border-4 border-white object-cover shadow-lg" 
                      alt={viewing.name}
                    />
                    <div className="flex-1">
                      <h2 className="text-3xl font-extrabold text-white">{viewing.name}</h2>
                      {viewing.legal_name && (
                        <p className="text-sm opacity-90 text-white mt-1">{viewing.legal_name}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-sm">
                        {viewing.email && (
                          <div className="flex items-center gap-2">
                            <span className="text-white/80">📧</span>
                            <span className="text-white">{viewing.email}</span>
                          </div>
                        )}
                        {viewing.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-white/80">📞</span>
                            <span className="text-white">{formatPhone(viewing.phone)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* General Information */}
                  <div className="px-6 pb-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Website Card */}
                      {viewing.website && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Website</div>
                          <a href={viewing.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {viewing.website}
                          </a>
                        </div>
                      )}

                      {/* Legal Name Card */}
                      {viewing.legal_name && (
                        <div className="bg-white border rounded-lg p-4">
                          <div className="text-xs font-semibold text-gray-600 mb-1">Legal Name</div>
                          <div className="text-gray-900">{viewing.legal_name}</div>
                        </div>
                      )}
                    </div>

                    {/* Address Card */}
                    {((viewing as any).address_line1 || viewing.city || viewing.province || (viewing as any).postal_code || viewing.country) && (
                      <div className="bg-white border rounded-lg p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-3">📍 Address</div>
                        <div className="space-y-1 text-gray-700">
                          {(viewing as any).address_line1 && <div>{(viewing as any).address_line1}</div>}
                          {(viewing as any).address_line2 && <div>{(viewing as any).address_line2}</div>}
                          <div>
                            {[viewing.city, viewing.province, (viewing as any).postal_code].filter(Boolean).join(', ')}
                          </div>
                          {viewing.country && <div>{viewing.country}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Edit/Create mode - form inputs
                <div className="p-6 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Name *</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Legal Name</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Email</label>
                  <input
                    type="email"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Phone</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Website</label>
                  <input
                    type="url"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Address Line 1</label>
                  <input
                    type="text"
                    placeholder="Enter street address..."
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Address Line 2</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">City</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Province</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Postal Code</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700">Country</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Supplier Image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                    className="w-full border rounded px-3 py-2 mt-1"
                  />
                  {imageDataUrl && (
                    <img src={imageDataUrl} className="mt-2 w-48 border rounded object-cover" alt="Preview" />
                  )}
                </div>
              </div>
              )}
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              {viewing && !editing ? (
                // View mode buttons
                <>
                  <button
                    onClick={async () => {
                      const ok = await confirm({ 
                        title: 'Delete supplier', 
                        message: 'Are you sure you want to delete this supplier? This action cannot be undone.',
                        confirmText: 'Delete',
                        cancelText: 'Cancel'
                      });
                      if (ok) {
                        deleteMut.mutate(viewing.id);
                        setOpen(false);
                        resetForm();
                      }
                    }}
                    className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={openEditModal}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Edit
                  </button>
                </>
              ) : (
                // Edit/Create mode buttons
                <>
                  <button
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={createMut.isPending || updateMut.isPending}
                    className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark disabled:opacity-50"
                  >
                    {editing ? 'Update' : 'Create'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
