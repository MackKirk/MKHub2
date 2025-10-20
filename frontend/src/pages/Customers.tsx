import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type Client = { id:string, name?:string, display_name?:string, city?:string, province?:string, status_id?:string, created_at?:string };

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
              <div key={c.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <img src="/ui/assets/login/logo-light.svg" className="w-8 h-8 rounded-full border"/>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.display_name||c.name||c.id}</div>
                    {(c as any).address_line1 && <div className="text-xs text-gray-700 truncate">{String((c as any).address_line1)}</div>}
                    <div className="text-xs text-gray-600 truncate">{[c.city, c.province].filter(Boolean).join(', ')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{String((c as any).client_status||'—')}</span>
                  <span className="text-gray-600">Type:</span>
                  <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{String((c as any).client_type||'—')}</span>
                  <Link className="ml-2 px-3 py-1.5 rounded bg-brand-red text-white" to={`/customers/${encodeURIComponent(c.id)}`}>Edit</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


