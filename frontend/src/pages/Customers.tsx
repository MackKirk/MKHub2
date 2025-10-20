import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type Client = { id:string, name?:string, display_name?:string, city?:string, province?:string, client_status?:string, client_type?:string, address_line1?:string, created_at?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, original_name?:string, uploaded_at?:string };

export default function Customers(){
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [ctype, setCtype] = useState('');
  const queryString = useMemo(()=>{
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (city) p.set('city', city);
    if (status) p.set('status', status);
    if (ctype) p.set('type', ctype);
    const s = p.toString();
    return s? ('?'+s): '';
  }, [q, city, status, ctype]);
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey:['clients', queryString], queryFn: ()=>api<Client[]>('GET', `/clients${queryString}`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const statusColorMap: Record<string,string> = useMemo(()=>{
    const list = (settings||{}).client_statuses as {label?:string, value?:string}[]|undefined;
    const m: Record<string,string> = {};
    (list||[]).forEach(it=>{ const k = String(it.label||'').trim(); const v = String(it.value||'').trim(); if(k){ m[k] = v || ''; } });
    return m;
  }, [settings]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link to="/customers/new" className="px-4 py-2 rounded bg-brand-red text-white">New Customer</Link>
      </div>
      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="grid md:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-xs text-gray-600">Search</label>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="name, email..." className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-600">City</label>
            <input value={city} onChange={e=>setCity(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-600">Status</label>
            <input value={status} onChange={e=>setStatus(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-600">Type</label>
            <input value={ctype} onChange={e=>setCtype(e.target.value)} className="w-full border rounded px-3 py-2" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
          {isFetching && <span className="text-sm text-gray-600">Loading...</span>}
        </div>
      </div>

      <div className="rounded-xl border bg-white">
        {isLoading ? (
          <div className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></div>
        ) : (
          <div className="divide-y">
            {(data||[]).map(c => (
              <ClientRow key={c.id} c={c} statusColorMap={statusColorMap} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientRow({ c, statusColorMap }:{ c: Client, statusColorMap: Record<string,string> }){
  const { data:files } = useQuery({ queryKey:['clientFilesForList', c.id], queryFn: ()=>api<ClientFile[]>('GET', `/clients/${encodeURIComponent(c.id)}/files`) });
  const logo = (files||[]).find(f=> !f.site_id && String(f.category||'').toLowerCase()==='client-logo-derived');
  const avatarUrl = logo? `/files/${logo.file_object_id}/thumbnail?w=96${logo.uploaded_at?`&t=${encodeURIComponent(logo.uploaded_at)}`:''}` : '/ui/assets/login/logo-light.svg';
  const status = String(c.client_status||'').trim();
  const color = status ? (statusColorMap[status] || '') : '';
  const badgeStyle: any = color ? { backgroundColor: `${color}20`, borderColor: color, color: color } : {};
  return (
    <div className="p-3 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <img src={avatarUrl} className="w-8 h-8 rounded-full border object-cover"/>
        <div className="min-w-0">
          <div className="font-medium truncate">{c.display_name||c.name||c.id}</div>
          {c.address_line1 && <div className="text-xs text-gray-700 truncate">{String(c.address_line1)}</div>}
          <div className="text-xs text-gray-600 truncate">{[c.city, c.province].filter(Boolean).join(', ')}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-600">Status:</span>
        <span className="px-2 py-0.5 rounded-full border" style={badgeStyle}>{status || '—'}</span>
        <span className="text-gray-600">Type:</span>
        <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{String(c.client_type||'—')}</span>
        <Link className="ml-2 px-3 py-1.5 rounded bg-brand-red text-white" to={`/customers/${encodeURIComponent(c.id)}`}>Edit</Link>
      </div>
    </div>
  );
}


