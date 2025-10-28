import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

type Supplier = { id:string, name:string, legal_name?:string, email?:string, phone?:string, city?:string, province?:string, country?:string };

export default function InventorySuppliers(){
  const { data, refetch, isLoading, error } = useQuery({ 
    queryKey:['suppliers'], 
    queryFn: async()=> await api<any[]>('GET','/inventory/suppliers'),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-brand-red text-white">New Supplier</button>
      </div>
      {error && <div className="mb-3 p-3 bg-red-100 text-red-800 rounded">{String(error)}</div>}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Phone</th><th className="p-2 text-left">City</th></tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : Array.isArray(data) && data.length? data.map(s=> (
              <tr key={s.id} className="border-t"><td className="p-2">{s.name}</td><td className="p-2">{s.email||''}</td><td className="p-2">{s.phone||''}</td><td className="p-2">{s.city||''}</td></tr>
            )) : (!isLoading && !Array.isArray(data)) ? <tr><td colSpan={4} className="p-4 text-red-600">Error loading suppliers</td></tr> : <tr><td colSpan={4} className="p-3 text-gray-600">No suppliers yet</td></tr>}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">New Supplier</div><button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Email</label><input className="w-full border rounded px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Phone</label><input className="w-full border rounded px-3 py-2" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
              <div className="col-span-2 text-right"><button onClick={async()=>{ if(!name){ toast.error('Name required'); return; } try{ await api('POST','/inventory/suppliers', { name, email, phone }); toast.success('Supplier created'); setOpen(false); setName(''); setEmail(''); setPhone(''); refetch(); }catch(_e){ toast.error('Failed'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


