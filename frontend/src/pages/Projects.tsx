import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';

type Project = { id:string, code?:string, name?:string, slug?:string };

export default function Projects(){
  const [q, setQ] = useState('');
  const qs = useMemo(()=> q? ('?q='+encodeURIComponent(q)) : '', [q]);
  const { data, isLoading, refetch } = useQuery({ queryKey:['projects', qs], queryFn: ()=>api<Project[]>('GET', `/projects${qs}`) });
  const arr = data||[];
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-white p-3 flex items-end gap-2">
        <div className="flex-1 max-w-[420px]"><label className="text-xs text-gray-600">Search</label><input className="w-full border rounded px-3 py-2" placeholder="code/name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} /></div>
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {isLoading? <div className="h-32 bg-gray-100 animate-pulse rounded"/> : arr.map(p => (
          <div key={p.id} className="rounded-xl border bg-white overflow-hidden">
            <div className="h-28 bg-gray-100"/>
            <div className="p-3 text-sm">
              <div className="font-semibold">{p.name||'Project'}</div>
              <div className="text-gray-600">{p.code||''}</div>
              <div className="mt-3 flex justify-end"><a href="#" className="px-3 py-1.5 rounded bg-brand-red text-white">Open</a></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


