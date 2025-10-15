import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';

type Client = { id:string, name?:string, display_name?:string, city?:string, province?:string, status_id?:string, created_at?:string };

export default function Customers(){
  const [q, setQ] = useState('');
  const { data, isLoading, refetch } = useQuery({ queryKey:['clients', q], queryFn: ()=>api<Client[]>('GET', `/clients${q?`?q=${encodeURIComponent(q)}`:''}`) });
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} placeholder="Search customers" className="border rounded px-3 py-2 w-80" />
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Search</button>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="text-left p-2">Name</th><th className="text-left p-2">City</th><th className="text-left p-2">Province</th><th className="text-left p-2">Created</th></tr></thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr>
            ) : (data||[]).map(c => (
              <tr key={c.id} className="border-t"><td className="p-2">{c.display_name||c.name||c.id}</td><td className="p-2">{c.city||''}</td><td className="p-2">{c.province||''}</td><td className="p-2">{(c.created_at||'').slice(0,10)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


