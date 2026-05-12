import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import NewSubcontractorContactModal from '@/components/NewSubcontractorContactModal';

type Contact = {
  id: string;
  name: string;
  role_title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  photo_file_id?: string | null;
};

export default function SubcontractorContactsCard({
  companyId,
  companyDisplayName,
  hasEditPermission,
}: {
  companyId: string;
  companyDisplayName?: string;
  hasEditPermission?: boolean;
}) {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { data, refetch, isSuccess } = useQuery({
    queryKey: ['subcontractor-company-contacts', companyId],
    queryFn: () => api<Contact[]>('GET', `/subcontractors/companies/${companyId}/contacts`),
    enabled: !!companyId,
  });
  const [list, setList] = useState<Contact[]>([]);
  useEffect(() => {
    setList(data || []);
  }, [data]);
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eRole, setERole] = useState('');
  const [eDept, setEDept] = useState('');
  const [ePrimary, setEPrimary] = useState<'true' | 'false'>('false');
  const [createOpen, setCreateOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreateOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createOpen]);

  const formatPhone = (v: string) => {
    const d = String(v || '')
      .replace(/\D+/g, '')
      .slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
    if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  };

  const avatarFor = (c: Contact) => {
    if (!c.photo_file_id) return '';
    return withFileAccessTokenIfNeeded(`/files/${c.photo_file_id}/thumbnail?w=160`) || '';
  };

  const beginEdit = (c: Contact) => {
    setEditId(c.id);
    setEName(c.name || '');
    setEEmail(c.email || '');
    setEPhone(c.phone || '');
    setERole(c.role_title || '');
    setEDept(c.department || '');
    setEPrimary(c.is_primary ? 'true' : 'false');
  };

  const onDragStart = (cid: string) => setDragId(cid);
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDropOver = async (overId: string) => {
    if (!dragId || dragId === overId) return;
    const curr = [...list];
    const from = curr.findIndex((x) => x.id === dragId);
    const to = curr.findIndex((x) => x.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = curr.splice(from, 1);
    curr.splice(to, 0, moved);
    setList(curr);
    try {
      await api('POST', `/subcontractors/companies/${companyId}/contacts/reorder`, curr.map((c) => String(c.id)));
      toast.success('Order saved');
      refetch();
      qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
    } catch {
      toast.error('Failed to save order');
      refetch();
    }
  };

  const uploadContactPhoto = async (contactId: string, file: File | null) => {
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
      await api('PATCH', `/subcontractors/companies/${companyId}/contacts/${contactId}`, { photo_file_id: res.id });
      toast.success('Photo updated');
      refetch();
      qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
    } catch {
      toast.error('Upload failed');
    }
  };

  return (
    <div>
      <div className="mb-2">
        <h4 className="font-semibold text-gray-900">Contacts</h4>
        <p className="text-xs text-gray-500 mt-0.5">People at this subcontractor company.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {hasEditPermission && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl border-2 border-dashed border-gray-300 p-4 hover:border-brand-red hover:bg-gray-50 transition-all bg-white flex items-center justify-center min-h-[100px]"
          >
            <div className="text-lg text-gray-400 mr-2">+</div>
            <div className="font-medium text-xs text-gray-700">New Contact</div>
          </button>
        )}
        {(list || []).map((c) => (
          <div
            key={c.id}
            className="rounded-xl border bg-white overflow-hidden flex"
            draggable
            onDragStart={() => onDragStart(String(c.id))}
            onDragOver={onDragOver}
            onDrop={() => onDropOver(String(c.id))}
          >
            <div className="w-28 bg-gray-100 flex items-center justify-center relative group flex-shrink-0">
              {avatarFor(c) ? (
                <img className="w-20 h-20 object-cover rounded border" src={avatarFor(c)} alt="" />
              ) : (
                <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">{(c.name || '?').slice(0, 2).toUpperCase()}</div>
              )}
              {hasEditPermission && (
                <label className="hidden group-hover:flex absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white cursor-pointer">
                  Photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadContactPhoto(c.id, e.target.files?.[0] || null)} />
                </label>
              )}
              <div className="absolute left-1 top-1 text-[10px] text-gray-600">⋮⋮</div>
            </div>
            <div className="flex-1 p-3 text-sm min-w-0">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold">Edit contact</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <select className="border rounded px-2 py-1 text-xs" value={ePrimary} onChange={(e) => setEPrimary(e.target.value as 'true' | 'false')}>
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                      {hasEditPermission && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({ title: 'Delete contact', message: 'Are you sure you want to delete this contact?' });
                            if (!ok) return;
                            try {
                              await api('DELETE', `/subcontractors/companies/${companyId}/contacts/${c.id}`);
                              toast.success('Contact deleted');
                              setEditId(null);
                              refetch();
                              qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
                            } catch {
                              toast.error('Failed to delete contact');
                            }
                          }}
                          className="px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 text-xs"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name</label>
                      <input className="border rounded px-2 py-1 w-full text-sm" value={eName} onChange={(e) => setEName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Role/Title</label>
                      <input className="border rounded px-2 py-1 w-full text-sm" value={eRole} onChange={(e) => setERole(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Department</label>
                      <input className="border rounded px-2 py-1 w-full text-sm" value={eDept} onChange={(e) => setEDept(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input className="border rounded px-2 py-1 w-full text-sm" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input className="border rounded px-2 py-1 w-full text-sm" value={ePhone} onChange={(e) => setEPhone(formatPhone(e.target.value))} />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button type="button" onClick={() => setEditId(null)} className="px-2 py-1 rounded bg-gray-100 text-xs">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api('PATCH', `/subcontractors/companies/${companyId}/contacts/${c.id}`, {
                            name: eName,
                            role_title: eRole,
                            department: eDept,
                            email: eEmail,
                            phone: ePhone,
                            is_primary: ePrimary === 'true',
                          });
                          setEditId(null);
                          refetch();
                          qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
                        } catch {
                          toast.error('Failed to save');
                        }
                      }}
                      className="px-2 py-1 rounded bg-brand-red text-white text-xs"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}
                      {!c.is_primary && hasEditPermission && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await api('PATCH', `/subcontractors/companies/${companyId}/contacts/${c.id}`, { is_primary: true });
                              refetch();
                              qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
                            } catch {
                              toast.error('Failed to set primary');
                            }
                          }}
                          className="px-2 py-1 rounded bg-gray-100 text-xs"
                        >
                          Set Primary
                        </button>
                      )}
                      {hasEditPermission && (
                        <button type="button" onClick={() => beginEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-600 text-xs">
                    {c.role_title || ''} {c.department ? `· ${c.department}` : ''}
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Email</div>
                    <div className="text-gray-700 text-xs break-all">{c.email || '—'}</div>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Phone</div>
                    <div className="text-gray-700 text-xs">{c.phone || '—'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {isSuccess && (!list || !list.length) && (
          <div className="text-sm text-gray-600 md:col-span-2">No contacts yet.</div>
        )}
      </div>
      <NewSubcontractorContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        companyId={companyId}
        companyName={companyDisplayName}
        onCreated={() => {
          refetch();
          qc.invalidateQueries({ queryKey: ['subcontractor-company', companyId] });
        }}
      />
    </div>
  );
}
