import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useLocation } from 'react-router-dom';

type Opportunity = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_end?:string, is_bidding?:boolean };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

export default function Opportunities(){
  const location = useLocation();
  const [q, setQ] = useState('');
  const qs = useMemo(()=> q? ('?q='+encodeURIComponent(q)) : '', [q]);
  const { data, isLoading, refetch } = useQuery({ queryKey:['opportunities', qs], queryFn: ()=>api<Opportunity[]>('GET', `/projects?is_bidding=true${qs}`) });
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Opportunities</div>
        <div className="text-sm opacity-90">Create, edit and track bids and quotes.</div>
      </div>
      <div className="mb-3 rounded-xl border bg-white p-3 flex items-end gap-2">
        <div className="flex-1 max-w-[420px]"><label className="text-xs text-gray-600">Search</label><input className="w-full border rounded px-3 py-2" placeholder="code/name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} /></div>
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
        <Link to="/projects/new?is_bidding=true" state={{ backgroundLocation: location }} className="px-3 py-2 rounded bg-black text-white">New Opportunity</Link>
      </div>
      <div className="grid md:grid-cols-4 gap-2">
        {isLoading? <div className="h-32 bg-gray-100 animate-pulse rounded"/> : arr.map(p => (
          <OpportunityListCard key={p.id} opportunity={p} />
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

function OpportunityListCard({ opportunity }:{ opportunity: Opportunity }){
  const { data:files } = useQuery({ queryKey:['client-files-for-opportunity-card', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id))}/files`) : Promise.resolve([]), enabled: !!opportunity.client_id, staleTime: 60_000 });
  const pfiles = useMemo(()=> (files||[]).filter((f:any)=> String((f as any).project_id||'')===String(opportunity.id)), [files, opportunity?.id]);
  const cover = pfiles.find((f:any)=> String(f.category||'')==='project-cover-derived') || pfiles.find((f:any)=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? `/files/${cover.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
  const { data:details } = useQuery({ queryKey:['opportunity-detail-card', opportunity.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['opportunity-client', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), enabled: !!opportunity.client_id, staleTime: 300_000 });
  const status = (opportunity as any).status_label || details?.status_label || '';
  const progress = Math.max(0, Math.min(100, Number((opportunity as any).progress ?? details?.progress ?? 0)));
  const start = (opportunity.date_start || details?.date_start || opportunity.created_at || '').slice(0,10);
  const clientName = client?.display_name || client?.name || '';
  return (
    <Link to={`/opportunities/${encodeURIComponent(String(opportunity.id))}`} className="group rounded-lg border overflow-hidden bg-white block">
      <div className="aspect-[4/3] bg-gray-100 relative">
        <img className="w-full h-full object-cover" src={src} />
        <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); }} className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-black/70 text-white" title="Change cover (open opportunity)">Cover</button>
      </div>
      <div className="p-2">
        <div className="text-xs text-gray-600 truncate">{clientName||''}</div>
        <div className="font-semibold text-sm truncate group-hover:underline">{opportunity.name||'Opportunity'}</div>
        <div className="text-xs text-gray-600 truncate">{opportunity.code||''}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-full text-[11px] border bg-gray-50 text-gray-800 truncate max-w-[60%]" title={status}>{status||'—'}</span>
        </div>
        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-red" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 grid grid-cols-1 gap-2 text-[11px] text-gray-700">
          <div><span className="opacity-70">Created:</span> {start||'—'}</div>
        </div>
      </div>
    </Link>
  );
}

