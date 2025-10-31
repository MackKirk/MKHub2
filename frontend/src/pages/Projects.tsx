import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
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
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    if (!newOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNewOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newOpen]);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Projects</div>
        <div className="text-sm opacity-90">List, search and manage projects.</div>
      </div>
      <div className="mb-3 rounded-xl border bg-white p-3 flex items-end gap-2">
        <div className="flex-1 max-w-[420px]"><label className="text-xs text-gray-600">Search</label><input className="w-full border rounded px-3 py-2" placeholder="code/name" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} /></div>
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
        <button onClick={()=>setNewOpen(true)} className="px-3 py-2 rounded bg-black text-white">New Project</button>
      </div>
      <div className="grid md:grid-cols-4 gap-2">
        {isLoading? <div className="h-32 bg-gray-100 animate-pulse rounded"/> : arr.map(p => (
          <ProjectListCard key={p.id} project={p} />
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
      {newOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">New Project</div><button onClick={()=>setNewOpen(false)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button></div>
            <div className="p-4 grid gap-3">
              <div>
                <label className="text-xs text-gray-600">Project Name</label>
                <input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Client ID</label>
                <input className="w-full border rounded px-3 py-2" value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="client uuid" />
              </div>
              <div className="text-right">
                <button onClick={async()=>{ if(!name||!clientId){ toast.error('Name and client required'); return; } try{ const created:any = await api('POST','/projects', { name, client_id: clientId }); toast.success('Project created'); setNewOpen(false); setName(''); setClientId(''); if(created?.id){ location.href = `/projects/${encodeURIComponent(String(created.id))}`; } }catch(_e){ toast.error('Failed to create'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectListCard({ project }:{ project: Project }){
  const { data:files } = useQuery({ queryKey:['client-files-for-proj-card', project.client_id], queryFn: ()=> project.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(project.client_id))}/files`) : Promise.resolve([]), enabled: !!project.client_id, staleTime: 60_000 });
  const pfiles = useMemo(()=> (files||[]).filter((f:any)=> String((f as any).project_id||'')===String(project.id)), [files, project?.id]);
  const cover = pfiles.find((f:any)=> String(f.category||'')==='project-cover-derived') || pfiles.find((f:any)=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? `/files/${cover.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
  const { data:details } = useQuery({ queryKey:['project-detail-card', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const { data:reports } = useQuery({ queryKey:['project-reports-count-card', project.id], queryFn: async()=> { const r = await api<any[]>('GET', `/projects/${encodeURIComponent(String(project.id))}/reports`); return r?.length||0; }, staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['proj-client', project.client_id], queryFn: ()=> project.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(project.client_id||''))}`): Promise.resolve(null), enabled: !!project.client_id, staleTime: 300_000 });
  const status = (project as any).status_label || details?.status_label || '';
  const progress = Math.max(0, Math.min(100, Number((project as any).progress ?? details?.progress ?? 0)));
  const start = (project.date_start || details?.date_start || project.created_at || '').slice(0,10);
  const eta = (details?.date_eta || project.date_end || '').slice(0,10);
  const est = details?.estimator_id || '';
  const lead = details?.onsite_lead_id || '';
  const clientName = client?.display_name || client?.name || '';
  return (
    <Link to={`/projects/${encodeURIComponent(String(project.id))}`} className="group rounded-lg border overflow-hidden bg-white block">
      <div className="aspect-[4/3] bg-gray-100 relative">
        <img className="w-full h-full object-cover" src={src} />
        <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); }} className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-black/70 text-white" title="Change cover (open project)">Cover</button>
      </div>
      <div className="p-2">
        <div className="text-xs text-gray-600 truncate">{clientName||''}</div>
        <div className="font-semibold text-sm truncate group-hover:underline">{project.name||'Project'}</div>
        <div className="text-xs text-gray-600 truncate">{project.code||''}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-full text-[11px] border bg-gray-50 text-gray-800 truncate max-w-[60%]" title={status}>{status||'—'}</span>
          <span className="text-[11px] text-gray-600">{reports||0} reports</span>
        </div>
        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-red" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div><span className="opacity-70">Start:</span> {start||'—'}</div>
          <div><span className="opacity-70">ETA:</span> {eta||'—'}</div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div className="truncate" title={est}><span className="opacity-70">Estimator:</span> {est? <UserInline id={est} /> : '—'}</div>
          <div className="truncate" title={lead}><span className="opacity-70">On-site:</span> {lead? <UserInline id={lead} /> : '—'}</div>
        </div>
      </div>
    </Link>
  );
}

function UserInline({ id }:{ id:string }){
  const { data } = useQuery({ queryKey:['user-inline', id], queryFn: ()=> api<any>('GET', `/auth/users/${encodeURIComponent(String(id))}/profile`), enabled: !!id, staleTime: 300_000 });
  const fn = data?.profile?.preferred_name || data?.profile?.first_name || '';
  const ln = data?.profile?.last_name || '';
  const label = `${fn} ${ln}`.trim() || '';
  return <span className="font-medium">{label||'—'}</span>;
}


