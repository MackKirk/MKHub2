import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

type Project = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_end?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

export default function Projects(){
  const [q, setQ] = useState('');
  const qs = useMemo(()=> q? ('?q='+encodeURIComponent(q)) : '', [q]);
  const { data, isLoading, refetch } = useQuery({ queryKey:['projects', qs], queryFn: ()=>api<Project[]>('GET', `/projects${qs}`) });
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-white p-3 flex items-end gap-2">
        <div className="flex-1 max-w-[420px]"><label className="text-xs text-gray-600">Search</label><input className="w-full border rounded px-3 py-2" placeholder="code/name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} /></div>
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {isLoading? <div className="h-32 bg-gray-100 animate-pulse rounded"/> : arr.map(p => (
          <div key={p.id} className="rounded-xl border bg-white overflow-hidden">
            <div className="h-28 bg-gray-100 relative">
              <button onClick={()=>setPickerOpen({ open:true, clientId: p.client_id, projectId: p.id })} className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-black/70 text-white">Change cover</button>
            </div>
            <div className="p-3 text-sm">
              <div className="font-semibold">{p.name||'Project'}</div>
              <div className="text-gray-600">{p.code||''}</div>
              <div className="text-[11px] text-gray-500 mt-1">{(p.date_start||p.created_at||'').slice(0,10)}</div>
              <div className="mt-3 flex justify-end"><Link to={`/projects/${encodeURIComponent(String(p.id))}`} className="px-3 py-1.5 rounded bg-brand-red text-white">Open</Link></div>
            </div>
          </div>
        ))}
      </div>
      {pickerOpen?.open && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(null)} clientId={String(pickerOpen?.clientId||'')} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            // Upload derived cover and associate to client (category project-cover-derived)
            const up:any = await api('POST','/files/upload',{ project_id: pickerOpen?.projectId||null, client_id: pickerOpen?.clientId||null, employee_id:null, category_id:'project-cover-derived', original_name: 'project-cover.jpg', content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            if (pickerOpen?.clientId){ await api('POST', `/clients/${pickerOpen.clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`); }
            toast.success('Cover updated');
            setPickerOpen(null);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(null); }
        }} />
      )}
    </div>
  );
}


