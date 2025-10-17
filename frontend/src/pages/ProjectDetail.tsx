import { useParams } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';

type Project = { id:string, code?:string, name?:string, client_id?:string, address_city?:string, address_province?:string, address_country?:string, description?:string, status_id?:string, division_id?:string, estimator_id?:string, onsite_lead_id?:string, date_start?:string, date_eta?:string, date_end?:string, cost_estimated?:number, cost_actual?:number, service_value?:number };
type ProjectFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, original_name?:string, uploaded_at?:string };
type Update = { id:string, timestamp?:string, text?:string, images?:any };
type Report = { id:string, category_id?:string, division_id?:string, description?:string, images?:any, status?:string };

export default function ProjectDetail(){
  const { id } = useParams();
  const { data:proj, isLoading } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['projectFiles', id], queryFn: ()=>api<ProjectFile[]>('GET', `/projects/${id}/files`) });
  const { data:updates, refetch: refetchUpdates } = useQuery({ queryKey:['projectUpdates', id], queryFn: ()=>api<Update[]>('GET', `/projects/${id}/updates`) });
  const { data:reports, refetch: refetchReports } = useQuery({ queryKey:['projectReports', id], queryFn: ()=>api<Report[]>('GET', `/projects/${id}/reports`) });
  const [tab, setTab] = useState<'overview'|'updates'|'reports'|'files'|'photos'>('overview');
  const [pickerOpen, setPickerOpen] = useState(false);
  const cover = useMemo(()=>{
    const img = (files||[]).find(f=> String(f.category||'')==='project-cover-derived') || (files||[]).find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
    return img? `/files/${img.file_object_id}/thumbnail?w=1000` : '/ui/assets/login/logo-light.svg';
  }, [files]);

  return (
    <div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="h-48 relative bg-gray-100">
          <img className="w-full h-full object-cover" src={cover} />
          <button onClick={()=>setPickerOpen(true)} className="absolute right-3 top-3 text-xs px-2 py-1 rounded bg-black/70 text-white">Change cover</button>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-extrabold">{proj?.name||'Project'}</div>
              <div className="text-sm text-gray-600">{proj?.code||''} · {proj?.address_city||''} {proj?.address_province||''}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] bg-gray-100 border rounded-full px-2">{proj?.status_id||'Estimating'}</span>
              <span className="text-[11px] bg-gray-100 border rounded-full px-2">{proj?.division_id||'Division'}</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            {(['overview','updates','reports','files','photos'] as const).map(k=> (
              <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-full text-sm ${tab===k? 'bg-black text-white':'bg-white border'}`}>{k[0].toUpperCase()+k.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : (
          <>
            {tab==='overview' && (
              <div className="grid md:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Client</h4>
                  <div className="text-sm text-gray-700">{proj?.client_id||'-'}</div>
                  <div className="text-sm text-gray-500">{proj?.address_city||''} {proj?.address_province||''} {proj?.address_country||''}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Team</h4>
                  <div className="text-sm text-gray-700">Estimator: {proj?.estimator_id||'-'}</div>
                  <div className="text-sm text-gray-700">On-site lead: {proj?.onsite_lead_id||'-'}</div>
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Dates & Costs</h4>
                  <div className="text-sm text-gray-700">Start: {(proj?.date_start||'').slice(0,10)||'-'}</div>
                  <div className="text-sm text-gray-700">ETA: {(proj?.date_eta||'').slice(0,10)||'-'}</div>
                  <div className="text-sm text-gray-700">End: {(proj?.date_end||'').slice(0,10)||'-'}</div>
                  <div className="text-sm text-gray-700 mt-1">Estimated: {proj?.cost_estimated ?? '-'}</div>
                  <div className="text-sm text-gray-700">Actual: {proj?.cost_actual ?? '-'}</div>
                  <div className="text-sm text-gray-700">Service: {proj?.service_value ?? '-'}</div>
                </div>
                <div className="md:col-span-3 rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Description</h4>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{proj?.description||'-'}</div>
                </div>
              </div>
            )}

            {tab==='updates' && (
              <UpdatesTab projectId={String(id)} items={updates||[]} onRefresh={refetchUpdates} />
            )}

            {tab==='reports' && (
              <ReportsTab projectId={String(id)} items={reports||[]} onRefresh={refetchReports} />
            )}

            {tab==='files' && (
              <ProjectFilesTab projectId={String(id)} files={files||[]} onRefresh={refetchFiles} />
            )}

            {tab==='photos' && (
              <PhotosTab files={(files||[]).filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'))} />
            )}
          </>
        )}
      </div>

      {pickerOpen && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(false)} clientId={String(proj?.client_id||'')} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id:id, client_id:proj?.client_id||null, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/projects/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
            toast.success('Cover updated');
            await refetchFiles();
            setPickerOpen(false);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(false); }
        }} />
      )}
    </div>
  );
}

function UpdatesTab({ projectId, items, onRefresh }:{ projectId:string, items: Update[], onRefresh: ()=>any }){
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">New Update</h4>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="Category (optional)" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 h-28" placeholder="What happened?" value={text} onChange={e=>setText(e.target.value)} />
        <div className="mt-2 text-right"><button onClick={async()=>{ try{ await api('POST', `/projects/${projectId}/updates`, { text, category }); setText(''); setCategory(''); await onRefresh(); toast.success('Update added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Add Update</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white divide-y">
        {items.length? items.map(u=> (
          <div key={u.id} className="p-3 text-sm flex items-start justify-between">
            <div>
              <div className="text-[11px] text-gray-500">{(u.timestamp||'').slice(0,19).replace('T',' ')}</div>
              <div className="text-gray-800 whitespace-pre-wrap">{u.text||''}</div>
            </div>
            <button onClick={async()=>{ if(!confirm('Delete this update?')) return; try{ await api('DELETE', `/projects/${projectId}/updates/${u.id}`); await onRefresh(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
          </div>
        )) : <div className="p-3 text-sm text-gray-600">No updates yet</div>}
      </div>
    </div>
  );
}

function ReportsTab({ projectId, items, onRefresh }:{ projectId:string, items: Report[], onRefresh: ()=>any }){
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">New Report</h4>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 h-28" placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />
        <div className="mt-2 text-right"><button onClick={async()=>{ try{ await api('POST', `/projects/${projectId}/reports`, { category_id: category, description: desc }); setCategory(''); setDesc(''); await onRefresh(); toast.success('Report created'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Create Report</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white divide-y">
        {items.length? items.map(r=> (
          <div key={r.id} className="p-3 text-sm flex items-start justify-between">
            <div>
              <div className="text-gray-800 whitespace-pre-wrap">{r.description||''}</div>
              <div className="text-[11px] text-gray-500">{r.category_id||''}</div>
            </div>
            <button onClick={async()=>{ if(!confirm('Delete this report?')) return; try{ await api('DELETE', `/projects/${projectId}/reports/${r.id}`); await onRefresh(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
          </div>
        )) : <div className="p-3 text-sm text-gray-600">No reports yet</div>}
      </div>
    </div>
  );
}

function ProjectFilesTab({ projectId, files, onRefresh }:{ projectId:string, files: ProjectFile[], onRefresh: ()=>any }){
  const [which, setWhich] = useState<'docs'|'pics'>('docs');
  const docs = useMemo(()=> files.filter(f=> !(f.is_image===true) && !String(f.content_type||'').startsWith('image/')), [files]);
  const pics = useMemo(()=> files.filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/')), [files]);
  const [file, setFile] = useState<File|null>(null);
  const iconFor = (f:ProjectFile)=>{
    const name = String(f.original_name||'');
    const ext = (name.includes('.')? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type||'').toLowerCase();
    const is = (x:string)=> ct.includes(x) || ext===x;
    if (is('pdf')) return { label:'PDF', color:'bg-red-500' };
    if (['xlsx','xls','csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label:'XLS', color:'bg-green-600' };
    if (['doc','docx'].includes(ext) || ct.includes('word')) return { label:'DOC', color:'bg-blue-600' };
    if (['ppt','pptx'].includes(ext) || ct.includes('powerpoint')) return { label:'PPT', color:'bg-orange-500' };
    if (['zip','rar','7z'].includes(ext) || ct.includes('zip')) return { label:'ZIP', color:'bg-gray-700' };
    if (is('txt')) return { label:'TXT', color:'bg-gray-500' };
    return { label: (ext||'FILE').toUpperCase().slice(0,4), color:'bg-gray-600' };
  };
  const fetchDownloadUrl = async (fid:string)=>{
    try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; }
  };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <select className="border rounded px-3 py-2" value={which} onChange={e=>setWhich(e.target.value as any)}>
          <option value="docs">Documents</option>
          <option value="pics">Pictures</option>
        </select>
        <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <button onClick={async()=>{
          if(!file) return; try{
            const category = which==='pics'? 'project-photos' : 'project-docs';
            const up:any = await api('POST','/files/upload',{ project_id: projectId, client_id:null, employee_id:null, category_id:category, original_name:file.name, content_type: file.type||'application/octet-stream' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, body: file });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type: file.type||'application/octet-stream' });
            await api('POST', `/projects/${projectId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(category)}&original_name=${encodeURIComponent(file.name)}`);
            toast.success('Uploaded'); setFile(null); await onRefresh();
          }catch(_e){ toast.error('Upload failed'); }
        }} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
      </div>
      {which==='docs' ? (
        <div className="rounded-xl border overflow-hidden divide-y">
          {docs.length? docs.map(f=> {
            const icon = iconFor(f); const name = f.original_name||f.file_object_id;
            return (
              <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded grid place-items-center text-[10px] font-bold text-white ${icon.color}`}>{icon.label}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{name}</div>
                    <div className="text-[11px] text-gray-500">{(f.uploaded_at||'').slice(0,10)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async()=>{ const url = await fetchDownloadUrl(f.file_object_id); if(url) window.open(url,'_blank'); }} className="px-2 py-1 rounded bg-gray-100">Download</button>
                </div>
              </div>
            );
          }) : <div className="p-3 text-sm text-gray-600 bg-white">No documents</div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {pics.length? pics.map(f=> (
            <div key={f.id} className="relative group">
              <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=600`} />
              <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                <button onClick={async()=>{ const url = await fetchDownloadUrl(f.file_object_id); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</button>
              </div>
            </div>
          )) : <div className="text-sm text-gray-600">No pictures</div>}
        </div>
      )}
    </div>
  );
}

function PhotosTab({ files }:{ files: ProjectFile[] }){
  const groups = useMemo(()=>{
    const m: Record<string, ProjectFile[]> = {};
    files.forEach(f=>{
      const d = (f.uploaded_at||'').slice(0,10) || 'Unknown';
      m[d] = m[d] || []; m[d].push(f);
    });
    return Object.entries(m).sort(([a], [b])=> b.localeCompare(a));
  }, [files]);
  const fetchDownloadUrl = async (fid:string)=>{
    try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; }
  };
  return (
    <div className="space-y-6">
      {groups.length? groups.map(([date, arr])=> (
        <div key={date}>
          <div className="text-sm font-semibold mb-2">{date}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {arr.map(f=> (
              <div key={f.id} className="relative group">
                <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=600`} />
                <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                  <button onClick={async()=>{ const url = await fetchDownloadUrl(f.file_object_id); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )) : <div className="text-sm text-gray-600">No photos</div>}
    </div>
  );
}


