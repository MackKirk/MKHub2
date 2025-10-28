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
    setViewing(null);
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

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">
                <button onClick={() => handleSort('name')} className="font-semibold hover:text-blue-600 flex items-center gap-1">
                  Name {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="p-3 text-left">
                <button onClick={() => handleSort('email')} className="font-semibold hover:text-blue-600 flex items-center gap-1">
                  Email {sortColumn === 'email' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="p-3 text-left">
                <button onClick={() => handleSort('phone')} className="font-semibold hover:text-blue-600 flex items-center gap-1">
                  Phone {sortColumn === 'phone' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="p-3 text-left">
                <button onClick={() => handleSort('city')} className="font-semibold hover:text-blue-600 flex items-center gap-1">
                  City {sortColumn === 'city' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
              <th className="p-3 text-left">
                <button onClick={() => handleSort('province')} className="font-semibold hover:text-blue-600 flex items-center gap-1">
                  Province {sortColumn === 'province' && (sortDirection === 'asc' ? '↑' : '↓')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="p-4">
                  <div className="h-6 bg-gray-100 animate-pulse rounded" />
                </td>
              </tr>
            ) : !Array.isArray(rows) || !rows.length ? (
              <tr>
                <td colSpan={5} className="p-4 text-gray-600 text-center">
                  No suppliers yet
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <button
                      onClick={() => openViewModal(s)}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {s.name}
                    </button>
                  </td>
                  <td className="p-3 text-gray-600">{s.email || '-'}</td>
                  <td className="p-3 text-gray-600">{formatPhone(s.phone)}</td>
                  <td className="p-3 text-gray-600">{s.city || '-'}</td>
                  <td className="p-3 text-gray-600">{s.province || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">
                {editing ? 'Edit Supplier' : viewing ? 'Supplier Details' : 'New Supplier'}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {viewing && !editing ? (
                // View mode - display supplier details
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Name</label>
                      <div className="mt-1 text-gray-900">{viewing.name}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Legal Name</label>
                      <div className="mt-1 text-gray-600">{viewing.legal_name || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Email</label>
                      <div className="mt-1 text-gray-600">{viewing.email || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Phone</label>
                      <div className="mt-1 text-gray-600">{formatPhone(viewing.phone)}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Website</label>
                      <div className="mt-1 text-gray-600">{viewing.website || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Address Line 1</label>
                      <div className="mt-1 text-gray-600">{(viewing as any).address_line1 || '-'}</div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700">Address Line 2</label>
                      <div className="mt-1 text-gray-600">{(viewing as any).address_line2 || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">City</label>
                      <div className="mt-1 text-gray-600">{viewing.city || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Province</label>
                      <div className="mt-1 text-gray-600">{viewing.province || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Postal Code</label>
                      <div className="mt-1 text-gray-600">{(viewing as any).postal_code || '-'}</div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">Country</label>
                      <div className="mt-1 text-gray-600">{viewing.country || '-'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                // Edit/Create mode - form inputs
                <div className="grid grid-cols-2 gap-4">
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
                  <button
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                    className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                  >
                    Close
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
