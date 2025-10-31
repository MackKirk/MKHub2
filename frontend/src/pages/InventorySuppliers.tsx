import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import ImagePicker from '@/components/ImagePicker';

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerForContact, setPickerForContact] = useState<string | null>(null);
  const [supplierTab, setSupplierTab] = useState<'overview' | 'contacts'>('overview');
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any | null>(null);
  
  // Contact form fields
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [contactNotes, setContactNotes] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['suppliers', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const path = params.toString() ? `/inventory/suppliers?${params.toString()}` : '/inventory/suppliers';
      return await api<Supplier[]>('GET', path);
    },
  });

  const { data: contactsData, refetch: refetchContacts } = useQuery({
    queryKey: ['supplierContacts', viewing?.id],
    queryFn: async () => {
      if (!viewing?.id) return [];
      return await api<any[]>('GET', `/inventory/suppliers/${viewing.id}/contacts`);
    },
    enabled: !!viewing?.id && supplierTab === 'contacts',
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
    onSuccess: async (updatedSupplier) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier updated');
      // Set the updated supplier as viewing instead of closing
      setViewing(updatedSupplier);
      setEditing(null);
      // Reset form fields
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

  const handleImageUpdate = async (blob: Blob) => {
    if (!viewing) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imageBase64 = e.target?.result as string;
      try {
        // Get the updated supplier data from the backend
        const updatedSupplier = await api<Supplier>('PUT', `/inventory/suppliers/${viewing.id}`, {
          image_base64: imageBase64
        });
        
        // Update the viewing state with the full updated supplier
        setViewing(updatedSupplier);
        
        // Force refetch to refresh the list
        await queryClient.refetchQueries({ queryKey: ['suppliers'] });
        
        toast.success('Image updated');
      } catch (error) {
        toast.error('Failed to update image');
      }
    };
    reader.readAsDataURL(blob);
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
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Suppliers</div>
          <div className="text-sm opacity-90">Manage vendors and contact information.</div>
        </div>
        <button
          onClick={() => {
            resetForm();
            setOpen(true);
          }}
          className="px-4 py-2 rounded bg-black text-white"
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
                    <button
                      onClick={() => setPickerOpen(true)}
                      className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden hover:border-white/80 transition-all relative group"
                    >
                      <img 
                        src={viewing.image_base64 || '/ui/assets/login/logo-light.svg'} 
                        className="w-full h-full object-cover" 
                        alt={viewing.name}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-semibold text-sm transition-opacity">
                        ✏️ Change
                      </div>
                    </button>
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
                      {/* Tab buttons */}
                      <div className="flex items-center gap-2 mt-4">
                        <button
                          onClick={() => setSupplierTab('overview')}
                          className={`px-4 py-2 rounded-full ${
                            supplierTab === 'overview' 
                              ? 'bg-black text-white' 
                              : 'bg-white/10 text-white/80 hover:bg-white/20'
                          }`}
                        >
                          Overview
                        </button>
                        <button
                          onClick={() => setSupplierTab('contacts')}
                          className={`px-4 py-2 rounded-full ${
                            supplierTab === 'contacts' 
                              ? 'bg-black text-white' 
                              : 'bg-white/10 text-white/80 hover:bg-white/20'
                          }`}
                        >
                          Contacts
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Tab Content */}
                  {supplierTab === 'overview' ? (
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
                  ) : (
                    <div className="px-6 pb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Contacts</h3>
                        <button
                          onClick={() => {
                            setContactModalOpen(true);
                            setEditingContact(null);
                            setContactName('');
                            setContactEmail('');
                            setContactPhone('');
                            setContactTitle('');
                            setContactNotes('');
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold"
                        >
                          + Add Contact
                        </button>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        {contactsData?.length ? (
                          contactsData.map((contact: any) => (
                            <div key={contact.id} className="rounded-xl border bg-white overflow-hidden flex group">
                              <div className="w-28 bg-gray-100 flex items-center justify-center relative">
                                {contact.image_base64 ? (
                                  <img 
                                    className="w-20 h-20 object-cover rounded border" 
                                    src={contact.image_base64}
                                    alt={contact.name}
                                  />
                                ) : viewing?.image_base64 ? (
                                  <img 
                                    className="w-20 h-20 object-cover rounded border" 
                                    src={viewing.image_base64}
                                    alt={contact.name}
                                  />
                                ) : (
                                  <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">
                                    {(contact.name||'?').slice(0,2).toUpperCase()}
                                  </div>
                                )}
                                <button 
                                  onClick={() => setPickerForContact(contact.id)} 
                                  className="hidden group-hover:block absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white"
                                >
                                  Photo
                                </button>
                              </div>
                              <div className="flex-1 p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold">{contact.name}</div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingContact(contact);
                                        setContactModalOpen(true);
                                        setContactName(contact.name || '');
                                        setContactEmail(contact.email || '');
                                        setContactPhone(contact.phone || '');
                                        setContactTitle(contact.title || '');
                                        setContactNotes(contact.notes || '');
                                      }}
                                      className="px-2 py-1 rounded bg-gray-100 text-xs"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const ok = await confirm({
                                          title: 'Delete contact',
                                          message: 'Are you sure you want to delete this contact?',
                                          confirmText: 'Delete',
                                          cancelText: 'Cancel'
                                        });
                                        if (ok) {
                                          try {
                                            await api('DELETE', `/inventory/contacts/${contact.id}`);
                                            refetchContacts();
                                            toast.success('Contact deleted');
                                          } catch (error) {
                                            toast.error('Failed to delete contact');
                                          }
                                        }
                                      }}
                                      className="px-2 py-1 rounded bg-gray-100 text-xs"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                                {contact.title && (
                                  <div className="text-gray-600 text-xs">{contact.title}</div>
                                )}
                                <div className="mt-2">
                                  <div className="text-[11px] uppercase text-gray-500">Email</div>
                                  <div className="text-gray-700">{contact.email||'-'}</div>
                                </div>
                                <div className="mt-2">
                                  <div className="text-[11px] uppercase text-gray-500">Phone</div>
                                  <div className="text-gray-700">{contact.phone||'-'}</div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 text-center py-8 text-gray-500">
                            No contacts yet. Add a contact to get started.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Edit/Create mode - form inputs
                <div className="space-y-6">
                  {/* Edit Header */}
                  <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-extrabold text-white">
                          {editing ? 'Edit Supplier' : 'New Supplier'}
                        </h2>
                        {editing && (
                          <p className="text-sm text-white/80 mt-1">
                            Update supplier information
                          </p>
                        )}
                        {!editing && (
                          <p className="text-sm text-white/80 mt-1">
                            Add a new supplier to your inventory
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
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
                    className="px-4 py-2 rounded bg-gray-100"
                  >
                    Edit
                  </button>
                </>
              ) : (
                // Edit/Create mode buttons
                <>
                  <button
                    onClick={() => {
                      if (editing) {
                        // If editing, go back to view mode
                        setEditing(null);
                        resetForm();
                      } else {
                        // If creating new, close modal
                        setOpen(false);
                        resetForm();
                      }
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

      {pickerOpen && (
        <ImagePicker 
          isOpen={true} 
          onClose={() => setPickerOpen(false)} 
          targetWidth={800} 
          targetHeight={800} 
          allowEdit={true}
          onConfirm={async (blob) => {
            await handleImageUpdate(blob);
            setPickerOpen(false);
          }} 
        />
      )}

      {pickerForContact && viewing && (
        <ImagePicker 
          isOpen={true} 
          onClose={() => setPickerForContact(null)} 
          targetWidth={400} 
          targetHeight={400} 
          allowEdit={true}
          onConfirm={async (blob) => {
            try {
              const reader = new FileReader();
              reader.onload = async (e) => {
                const imageBase64 = e.target?.result as string;
                try {
                  await api('PUT', `/inventory/contacts/${pickerForContact}`, {
                    image_base64: imageBase64
                  });
                  toast.success('Contact photo updated');
                  refetchContacts();
                } catch (error) {
                  toast.error('Failed to update contact photo');
                }
              };
              reader.readAsDataURL(blob);
            } catch (error) {
              toast.error('Failed to process image');
            } finally {
              setPickerForContact(null);
            }
          }} 
        />
      )}

      {contactModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
              <div className="font-semibold text-lg">
                {editingContact ? 'Edit Contact' : 'New Contact'}
              </div>
              <button
                onClick={() => {
                  setContactModalOpen(false);
                  setEditingContact(null);
                }}
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-700">Name *</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Enter contact name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Email</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Phone</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Title / Department</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="Enter title or department"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2 mt-1"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Enter notes"
                  rows={3}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => {
                  setContactModalOpen(false);
                  setEditingContact(null);
                }}
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!contactName.trim()) {
                    toast.error('Name is required');
                    return;
                  }
                  try {
                    if (editingContact) {
                      await api('PUT', `/inventory/contacts/${editingContact.id}`, {
                        name: contactName,
                        email: contactEmail || undefined,
                        phone: contactPhone || undefined,
                        title: contactTitle || undefined,
                        notes: contactNotes || undefined,
                        supplier_id: viewing?.id
                      });
                      toast.success('Contact updated');
                    } else {
                      await api('POST', '/inventory/contacts', {
                        name: contactName,
                        email: contactEmail || undefined,
                        phone: contactPhone || undefined,
                        title: contactTitle || undefined,
                        notes: contactNotes || undefined,
                        supplier_id: viewing?.id
                      });
                      toast.success('Contact created');
                    }
                    setContactModalOpen(false);
                    setEditingContact(null);
                    refetchContacts();
                  } catch (error) {
                    toast.error('Failed to save contact');
                  }
                }}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-brand-red-dark"
              >
                {editingContact ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
