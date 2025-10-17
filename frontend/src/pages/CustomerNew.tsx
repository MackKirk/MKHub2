import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function CustomerNew(){
  const [display_name, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [country, setCountry] = useState('');
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-3">New Customer</h1>
      <div className="rounded-xl border bg-white p-4 grid md:grid-cols-2 gap-3">
        <div className="md:col-span-2"><label className="text-xs text-gray-600">Display name</label><input className="w-full border rounded px-3 py-2" value={display_name} onChange={e=>setDisplayName(e.target.value)} /></div>
        <div><label className="text-xs text-gray-600">City</label><input className="w-full border rounded px-3 py-2" value={city} onChange={e=>setCity(e.target.value)} /></div>
        <div><label className="text-xs text-gray-600">Province</label><input className="w-full border rounded px-3 py-2" value={province} onChange={e=>setProvince(e.target.value)} /></div>
        <div><label className="text-xs text-gray-600">Country</label><input className="w-full border rounded px-3 py-2" value={country} onChange={e=>setCountry(e.target.value)} /></div>
        <div className="md:col-span-2 text-right">
          <button onClick={async()=>{ if(!display_name){ toast.error('Display name required'); return; } try{ const payload:any = { display_name, name: display_name, city, province, country }; const created:any = await api('POST','/clients', payload); toast.success('Customer created'); if(created?.id){ location.href = `/customers/${encodeURIComponent(String(created.id))}`; } }catch(_e){ toast.error('Failed to create'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
        </div>
      </div>
    </div>
  );
}


