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

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">City</th>
              <th className="text-left p-2">Province</th>
              <th className="text-left p-2">Created</th>
              <th className="text-left p-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr>
            ) : (data||[]).map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.display_name||c.name||c.id}</td>
                <td className="p-2">{c.city||''}</td>
                <td className="p-2">{c.province||''}</td>
                <td className="p-2">{(c.created_at||'').slice(0,10)}</td>
                <td className="p-2 text-right"><Link className="px-3 py-1.5 rounded bg-brand-red text-white" to={`/customers/${encodeURIComponent(c.id)}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


