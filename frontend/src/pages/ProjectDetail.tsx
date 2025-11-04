import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import EstimateBuilder from '@/components/EstimateBuilder';
import ProposalForm from '@/components/ProposalForm';

type Project = { id:string, code?:string, name?:string, client_id?:string, address_city?:string, address_province?:string, address_country?:string, description?:string, status_id?:string, division_id?:string, estimator_id?:string, onsite_lead_id?:string, date_start?:string, date_eta?:string, date_end?:string, cost_estimated?:number, cost_actual?:number, service_value?:number, progress?:number };
type ProjectFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, original_name?:string, uploaded_at?:string };
type Update = { id:string, timestamp?:string, text?:string, images?:any };
type Report = { id:string, category_id?:string, division_id?:string, description?:string, images?:any, status?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function ProjectDetail(){
  const location = useLocation();
  const { id } = useParams();
  const { data:proj, isLoading } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['projectFiles', id], queryFn: ()=>api<ProjectFile[]>('GET', `/projects/${id}/files`) });
  const { data:updates, refetch: refetchUpdates } = useQuery({ queryKey:['projectUpdates', id], queryFn: ()=>api<Update[]>('GET', `/projects/${id}/updates`) });
  const { data:reports, refetch: refetchReports } = useQuery({ queryKey:['projectReports', id], queryFn: ()=>api<Report[]>('GET', `/projects/${id}/reports`) });
  const { data:proposals } = useQuery({ queryKey:['projectProposals', id], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(id||''))}`) });
  // Check for tab query parameter
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'overview'|'general'|'reports'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|null) || 'overview';
  const [tab, setTab] = useState<'overview'|'general'|'reports'|'timesheet'|'files'|'photos'|'proposal'|'estimate'>(initialTab);
  const [pickerOpen, setPickerOpen] = useState(false);
  
  // Update tab when URL search params change
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'overview'|'general'|'reports'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|null;
    if (tabParam && ['overview','general','reports','timesheet','files','photos','proposal','estimate'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);
  
  const cover = useMemo(()=>{
    const img = (files||[]).find(f=> String(f.category||'')==='project-cover-derived') || (files||[]).find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
    return img? `/files/${img.file_object_id}/thumbnail?w=1000` : '/ui/assets/login/logo-light.svg';
  }, [files]);

  return (
    <div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] rounded-t-xl p-5 text-white">
          <div className="flex gap-4 items-stretch min-h-[220px]">
            <div className="w-[260px] relative group">
              <img src={cover} className="w-full h-full object-cover rounded-xl border-2 border-brand-red" />
              <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">✏️ Change</button>
            </div>
            <div className="flex-1 flex flex-col justify-start">
              <div className="text-3xl font-extrabold">{proj?.name||'Project'}</div>
              <div className="text-sm opacity-90 mt-1">{proj?.code||''} · {proj?.client_display_name||''}</div>
              <div className="text-sm opacity-90">
                {proj?.site_id ? (
                  <Link to={`/customers/${encodeURIComponent(String(proj?.client_id||''))}/sites/${encodeURIComponent(String(proj?.site_id||''))}`} state={{ backgroundLocation: location }} className="underline">Site: {proj?.site_name||proj?.site_id}</Link>
                ) : ''}
              </div>
              <div className="text-sm opacity-90">{proj?.site_address_line1||''} {proj?.site_city||''} {proj?.site_province||''} {proj?.site_country||''}</div>
              <div className="mt-2 flex items-center gap-3">
                {(() => { const statusLabel = String((proj as any)?.status_label||'').trim(); const color = ((settings||{}).project_statuses||[]).find((s:any)=>s.label===statusLabel)?.value || '#e5e7eb'; return (<span className="px-2 py-0.5 rounded-full border text-black" style={{ backgroundColor: color }}>{statusLabel||'—'}</span>); })()}
                <div className="flex items-center gap-2">
                  <div className="h-2 w-40 bg-white/40 rounded-full overflow-hidden"><div className="h-full bg-black" style={{ width: `${Math.max(0,Math.min(100,Number(proj?.progress||0)))}%` }} /></div>
                  <span className="text-sm">{Math.max(0,Math.min(100,Number(proj?.progress||0)))}%</span>
                </div>
              </div>
              <div className="mt-auto flex gap-3">
                {(['overview','general','reports','timesheet','files','photos','proposal','estimate'] as const).map(k=> (
                  <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-full ${tab===k?'bg-black text-white':'bg-white text-black'}`}>{k[0].toUpperCase()+k.slice(1)}</button>
                ))}
              </div>
            </div>
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
                  <ClientName clientId={String(proj?.client_id||'')} />
                  <div className="text-sm text-gray-500">{proj?.address_city||''} {proj?.address_province||''} {proj?.address_country||''}</div>
                </div>
                <ProjectQuickEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
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
                  <h4 className="font-semibold mb-2">Schedule</h4>
                  <div className="text-sm text-gray-600">(Calendar view placeholder) Define milestones and production expectations here.</div>
                </div>
                <div className="md:col-span-3 rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Description</h4>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{proj?.description||'-'}</div>
                </div>
              </div>
            )}

            {tab==='general' && (
              <ProjectGeneralForm projectId={String(id)} proj={proj||{}} onSaved={()=> location.reload()} />
            )}

            {tab==='reports' && (
              <ReportsTabEnhanced projectId={String(id)} items={reports||[]} onRefresh={refetchReports} />
            )}

            {tab==='timesheet' && (
              <TimesheetTab projectId={String(id)} />
            )}

            {tab==='files' && (
              <ProjectFilesTab projectId={String(id)} files={files||[]} onRefresh={refetchFiles} />
            )}

            {tab==='photos' && (
              <PhotosTab files={(files||[]).filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'))} />
            )}

            {tab==='proposal' && (
              <ProjectProposalTab projectId={String(id)} clientId={String(proj?.client_id||'')} siteId={String(proj?.site_id||'')} proposals={proposals||[]} statusLabel={proj?.status_label||''} settings={settings||{}} />
            )}

            {tab==='estimate' && (
              <div className="rounded-xl border bg-white p-4">
                <EstimateBuilder projectId={String(id)} statusLabel={proj?.status_label||''} settings={settings||{}} />
              </div>
            )}
          </>
        )}
      </div>

      {pickerOpen && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(false)} clientId={String(proj?.client_id||'')} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
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

function ReportsTabEnhanced({ projectId, items, onRefresh }:{ projectId:string, items: Report[], onRefresh: ()=>any }){
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<File|null>(null);
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const avatar = me?.profile_photo_file_id ? `/files/${me.profile_photo_file_id}/thumbnail?w=64` : '/ui/assets/login/logo-light.svg';
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-3">New Report</h4>
        <div className="flex items-center gap-2 mb-2"><img src={avatar} className="w-6 h-6 rounded-full" /><span className="text-sm">{me?.username||'me'}</span></div>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 h-28" placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />
        <div className="mt-2 flex items-center gap-2"><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} /><span className="text-[11px] text-gray-500">(optional)</span></div>
        <div className="mt-3 text-right"><button onClick={async()=>{ try{ let imgMeta:any = undefined; if(file){ const up:any = await api('POST','/files/upload',{ project_id: projectId, client_id:null, employee_id:null, category_id:'project-report', original_name:file.name, content_type: file.type||'application/octet-stream' }); await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, body: file }); const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type: file.type||'application/octet-stream' }); imgMeta = { file_object_id: conf.id, original_name: file.name, content_type: file.type||'application/octet-stream' }; }
          await api('POST', `/projects/${projectId}/reports`, { category_id: category||null, description: desc||null, images: imgMeta? { attachments:[imgMeta] } : undefined }); setCategory(''); setDesc(''); setFile(null); await onRefresh(); toast.success('Report created'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Create Report</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white divide-y">
        {items.length? items.map(r=> (
          <div key={r.id} className="p-3 text-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <img src={avatar} className="w-6 h-6 rounded-full" />
                <div>
                  <div className="text-gray-800 whitespace-pre-wrap">{r.description||''}</div>
                  <div className="text-[11px] text-gray-500">{(r as any).created_at? String((r as any).created_at).slice(0,19).replace('T',' ') : ''} · {r.category_id||''}</div>
                  {r.images?.attachments?.length? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.images.attachments.map((a:any, i:number)=> (
                        <a key={i} href={`/files/${a.file_object_id}/download`} target="_blank" className="text-[11px] underline">{a.original_name||'attachment'}</a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <button onClick={async()=>{ if(!confirm('Delete this report?')) return; try{ await api('DELETE', `/projects/${projectId}/reports/${r.id}`); await onRefresh(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
            </div>
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

function ProjectProposalTab({ projectId, clientId, siteId, proposals, statusLabel, settings }:{ projectId:string, clientId:string, siteId?:string, proposals: Proposal[], statusLabel:string, settings:any }){
  // Get the first (and only) proposal for this project
  const proposal = (proposals||[])[0];
  
  // Fetch full proposal data if it exists
  const { data: proposalData, isLoading: isLoadingProposal, refetch: refetchProposal } = useQuery({
    queryKey: ['proposal', proposal?.id],
    queryFn: () => proposal?.id ? api<any>('GET', `/proposals/${proposal.id}`) : Promise.resolve(null),
    enabled: !!proposal?.id
  });
  
  // Refetch proposals list when needed
  const { refetch: refetchProposals } = useQuery({ 
    queryKey:['projectProposals', projectId], 
    queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId||''))}`) 
  });
  
  // Check if editing is allowed based on status
  const canEdit = useMemo(()=>{
    if (!statusLabel) return true; // Default to allow if no status
    const statusConfig = ((settings?.project_statuses||[]) as any[]).find((s:any)=> s.label === statusLabel);
    // Allow editing if status is "estimating" or if allow_edit_proposal is true in meta
    if (statusLabel.toLowerCase() === 'estimating') return true;
    // Check both boolean true and string "true" for compatibility
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    return allowEdit === true || allowEdit === 'true' || allowEdit === 1;
  }, [statusLabel, settings]);
  
  return (
    <div className="rounded-xl border bg-white p-4">
      {!canEdit && statusLabel && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing proposals or estimates. 
          Please change the project status to allow editing.
        </div>
      )}
      {isLoadingProposal && proposal ? (
        <div className="h-24 bg-gray-100 animate-pulse rounded"/>
      ) : (
        <ProposalForm 
          mode={proposal ? 'edit' : 'new'} 
          clientId={clientId} 
          siteId={siteId} 
          projectId={projectId} 
          initial={proposalData?.proposal || null}
          disabled={!canEdit}
          onSave={()=>{
            // Refetch proposal data and proposals list after save
            if (proposal?.id) refetchProposal();
            refetchProposals();
          }}
        />
      )}
    </div>
  );
}

function ClientName({ clientId }:{ clientId:string }){
  const { data } = useQuery({ queryKey:['client-name', clientId], queryFn: ()=> clientId? api<any>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const name = data?.display_name || data?.name || clientId || '-';
  return <div className="text-sm text-gray-700">{name}</div>;
}

function AddDivisionDropdown({ divisions, selected, onAdd }:{ divisions:any[], selected:string[], onAdd:(id:string)=>void }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = (divisions||[]).filter((d:any)=>{
    const id = String(d.id||d.label||d.value);
    const txt = (String(d.label||'') + ' ' + String(d.meta?.abbr||'')).toLowerCase();
    return !selected.includes(id) && txt.includes(q.toLowerCase());
  });
  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="px-2 py-1 rounded-full border text-xs bg-white">+ Add Division</button>
      {open && (
        <div className="absolute z-50 mt-2 w-56 rounded-lg border bg-white shadow-lg p-2">
          <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
          <div className="max-h-56 overflow-auto">
            {list.length? list.map((d:any)=>{
              const id = String(d.id||d.label||d.value);
              const bg = d.meta?.color || '#eef2f7';
              return (
                <button key={id} onClick={()=>{ onAdd(id); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: bg }} />
                  <span className="text-sm">{d.meta?.abbr || d.label}</span>
                </button>
              );
            }) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeSelect({ label, value, onChange, employees }:{ label:string, value?:string, onChange:(v:string)=>void, employees:any[] }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = (employees||[]).find((e:any)=> String(e.id)===String(value||''));
  const filtered = (employees||[]).filter((e:any)=>{
    const t = (String(e.name||'') + ' ' + String(e.username||'')).toLowerCase();
    return t.includes(q.toLowerCase());
  });
  return (
    <div>
      <label className="text-xs text-gray-600">{label}</label>
      <div className="relative">
        <button onClick={()=>setOpen(v=>!v)} className="w-full border rounded px-2 py-1.5 flex items-center gap-2 bg-white">
          {current?.profile_photo_file_id ? (<img src={`/files/${current.profile_photo_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
          <span className="text-sm truncate">{current? (current.name || current.username) : 'Select...'}</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-72 rounded-lg border bg-white shadow-lg p-2">
            <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
            <div className="max-h-60 overflow-auto">
              {filtered.length? filtered.map((e:any)=> (
                <button key={e.id} onClick={()=>{ onChange(String(e.id)); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  {e.profile_photo_file_id ? (<img src={`/files/${e.profile_photo_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
                  <span className="text-sm">{e.name || e.username}</span>
                </button>
              )) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimesheetTab({ projectId }:{ projectId:string }){
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7));
  const [userFilter, setUserFilter] = useState<string>('');
  const qs = useMemo(()=>{
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    if (userFilter) p.set('user_id', userFilter);
    const s = p.toString();
    return s? ('?'+s): '';
  }, [month, userFilter]);
  const { data, refetch } = useQuery({ queryKey:['timesheet', projectId, qs], queryFn: ()=> api<any[]>(`GET`, `/projects/${projectId}/timesheet${qs}`), refetchInterval: 10000 });
  const entries = data||[];
  const [workDate, setWorkDate] = useState<string>(new Date().toISOString().slice(0,10));
  const [hours, setHours] = useState<string>('8');
  const [start, setStart] = useState<string>('');
  const [end, setEnd] = useState<string>('');
  const [targetUser, setTargetUser] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const minutesTotal = (entries||[]).reduce((acc:number, e:any)=> acc + Number(e.minutes||0), 0);
  const hoursTotal = (minutesTotal/60).toFixed(1);
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  const csvExport = async()=>{
    try{
      const qs = new URLSearchParams();
      if (month) qs.set('month', month);
      if (userFilter) qs.set('user_id', userFilter);
      const rows:any[] = await api('GET', `/projects/${projectId}/timesheet?${qs.toString()}`);
      const header = ['Date','User','Hours','Notes'];
      const csv = [header.join(',')].concat(rows.map(r=> [r.work_date, JSON.stringify(r.user_name||''), (r.minutes/60).toFixed(2), JSON.stringify(r.notes||'')].join(','))).join('\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `timesheet_${projectId}_${month||'all'}.csv`; a.click(); URL.revokeObjectURL(url);
    }catch(_e){ toast.error('Export failed'); }
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">Add Time Entry</h4>
        <div className="grid gap-2 text-sm">
          <div><label className="text-xs text-gray-600">Employee (admin)</label><select className="w-full border rounded px-3 py-2" value={targetUser} onChange={e=>setTargetUser(e.target.value)}><option value="">Me</option>{(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}</select></div>
          <div><label className="text-xs text-gray-600">Date</label><input type="date" className="w-full border rounded px-3 py-2" value={workDate} onChange={e=>setWorkDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2"><div><label className="text-xs text-gray-600">Start</label><input type="time" className="w-full border rounded px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} /></div><div><label className="text-xs text-gray-600">End</label><input type="time" className="w-full border rounded px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} /></div></div>
          <div><label className="text-xs text-gray-600">Hours (fallback)</label><input className="w-full border rounded px-3 py-2" value={hours} onChange={e=>setHours(e.target.value)} /></div>
          <div><label className="text-xs text-gray-600">Notes (required)</label><input className="w-full border rounded px-3 py-2" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Justification" /></div>
        </div>
        <div className="mt-3 text-right"><button onClick={async()=>{ try{ if(!notes.trim()){ toast.error('Notes required'); return; } let mins = Math.round(Number(hours||'0')*60); if(start && end){ const [sh,sm] = start.split(':').map(Number); const [eh,em] = end.split(':').map(Number); mins = Math.max(0,(eh*60+em)-(sh*60+sm)); } const payload:any = { work_date: workDate, minutes: mins, notes, start_time: start||null, end_time: end||null }; if(targetUser) payload.user_id = targetUser; await api('POST', `/projects/${projectId}/timesheet`, payload); setNotes(''); setStart(''); setEnd(''); await refetch(); toast.success('Saved'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Add</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Month</label><input type="month" className="border rounded px-2 py-1" value={month} onChange={e=>{ setMonth(e.target.value); }} /></div>
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Employee</label><select className="border rounded px-2 py-1 text-sm" value={userFilter} onChange={e=>setUserFilter(e.target.value)}><option value="">All</option>{(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}</select></div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">Total: {hoursTotal}h</div>
            <button onClick={csvExport} className="px-2 py-1 rounded bg-gray-100 text-sm">Export CSV</button>
          </div>
        </div>
        <div className="border-t divide-y">
          {entries.length? entries.map((e:any)=> {
            const now = new Date();
            const endDt = e.end_time? new Date(`${e.work_date}T${e.end_time}`) : new Date(`${e.work_date}T23:59:00`);
            const created = e.created_at? new Date(e.created_at) : null;
            const future = endDt.getTime() > now.getTime();
            let offIcon = '';
            if(created){
              const wdEnd = new Date(`${e.work_date}T23:59:00`);
              const diffH = (created.getTime()-wdEnd.getTime())/3600000;
              if(diffH>0){ if(diffH<=12) offIcon='🟢'; else if(diffH<=24) offIcon='🟡'; else offIcon='🔴'; }
            }
            const futIcon = future? '⏳' : '';
            return (
            <div key={e.id} className="px-3 py-2 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                {e.user_avatar_file_id? <img src={`/files/${e.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                <div className="w-24 text-gray-700 truncate">{e.user_name||''}</div>
                <div className="w-12 text-gray-600">{String(e.work_date).slice(5,10)}</div>
                <div className="w-20 text-gray-600">{(e.start_time||'--:--')} - {(e.end_time||'--:--')}</div>
                <div className="w-14 font-medium">{(e.minutes/60).toFixed(2)}h</div>
                <div className="text-gray-600">{e.notes||''}</div>
                {(futIcon||offIcon) && <span title={future? 'Future time': 'Logged after day end'}>{futIcon}{offIcon}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={async()=>{ const val = prompt('New hours', (e.minutes/60).toFixed(2)); if(val==null) return; const mins = Math.round(Number(val||'0')*60); try{ await api('PATCH', `/projects/${projectId}/timesheet/${e.id}`, { minutes: mins }); await refetch(); }catch(_e){ toast.error('Not authorized'); } }} className="px-2 py-1 rounded bg-gray-100">Edit</button>
                <button onClick={async()=>{ if(!confirm('Delete entry?')) return; await api('DELETE', `/projects/${projectId}/timesheet/${e.id}`); await refetch(); }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
              </div>
            </div>
          );
          }) : <div className="p-3 text-sm text-gray-600">No time entries</div>}
        </div>
      </div>
      <TimeAudit projectId={projectId} month={month} />
    </div>
  );
}

function TimeAudit({ projectId, month }:{ projectId:string, month:string }){
  const [offset, setOffset] = useState<number>(0);
  const limit = 50;
  const qs = (()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); p.set('limit', String(limit)); p.set('offset', String(offset)); const s=p.toString(); return s? ('?'+s): ''; })();
  const { data, refetch, isFetching } = useQuery({ queryKey:['timesheetLogs', projectId, month, offset], queryFn: ()=> api<any[]>('GET', `/projects/${projectId}/timesheet/logs${qs}`) });
  const logs = data||[];
  return (
    <div className="md:col-span-3 mt-4 rounded-xl border bg-white">
      <div className="p-3 font-semibold flex items-center justify-between">Audit Log {isFetching && <span className="text-[11px] text-gray-500">Loading...</span>}</div>
      <div className="border-t divide-y">
        {logs.length? logs.map((l:any)=> {
          const ch = l.changes||{};
          const before = ch.before||{}; const after = ch.after||{};
          const bMin = typeof before.minutes==='number'? (before.minutes/60).toFixed(2): null;
          const aMin = typeof after.minutes==='number'? (after.minutes/60).toFixed(2): null;
          return (
            <div key={l.id} className="px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                {l.user_avatar_file_id? <img src={`/files/${l.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-500">{String(l.timestamp||'').slice(0,19).replace('T',' ')} · {l.user_name||''}</div>
                  <div className="text-gray-800 capitalize">{l.action}</div>
                  {(l.action==='update' && (before||after)) && (
                    <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-gray-700">
                      <div>
                        <div className="text-gray-500">Date</div>
                        <div>{(before.work_date||'') ? String(before.work_date).slice(0,10) : '-' } → {(after.work_date||'') ? String(after.work_date).slice(0,10) : '-'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Hours</div>
                        <div>{bMin??'-'} → {aMin??'-'}</div>
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <div className="text-gray-500">Notes</div>
                        <div className="truncate" title={`${before.notes||''} → ${after.notes||''}`}>{(before.notes||'-') + ' → ' + (after.notes||'-')}</div>
                      </div>
                    </div>
                  )}
                  {(l.action!=='update' && l.changes) && (
                    <div className="mt-1 text-[11px] text-gray-700">{JSON.stringify(l.changes)}</div>
                  )}
                </div>
              </div>
            </div>
          );
        }) : <div className="p-3 text-sm text-gray-600">No changes yet</div>}
      </div>
      <div className="p-3 text-right">
        <button onClick={()=>{ setOffset(o=> Math.max(0, o - limit)); refetch(); }} disabled={offset<=0} className="px-2 py-1 rounded bg-gray-100 text-sm mr-2 disabled:opacity-50">Prev</button>
        <button onClick={()=>{ setOffset(o=> o + limit); refetch(); }} className="px-2 py-1 rounded bg-gray-100 text-sm">Load more</button>
      </div>
    </div>
  );
}

function ProjectQuickEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const [status, setStatus] = useState<string>(proj?.status_label||'');
  const [divs, setDivs] = useState<string[]>(Array.isArray(proj?.division_ids)? proj.division_ids : []);
  const [progress, setProgress] = useState<number>(Number(proj?.progress||0));
  const [estimator, setEstimator] = useState<string>(proj?.estimator_id||'');
  const [lead, setLead] = useState<string>(proj?.onsite_lead_id||'');
  const statuses = (settings?.project_statuses||[]) as any[];
  const divisions = (settings?.divisions||[]) as any[];
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  const toggleDiv = (id:string)=> setDivs(prev=> prev.includes(id)? prev.filter(x=>x!==id) : [...prev, id]);
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-2">Quick Edit</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="text-xs text-gray-600">Status</label>
          <select className="w-full border rounded px-2 py-1.5" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">Select...</option>
            {statuses.map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">Progress</label>
          <div className="flex items-center gap-2"><input type="range" min={0} max={100} value={progress} onChange={e=>setProgress(Number(e.target.value||0))} className="flex-1" /><span className="w-10 text-right">{progress}%</span></div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-600">Divisions</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {divs.map((id)=>{
              const d = divisions.find((x:any)=> String(x.id||x.label||x.value)===id);
              const bg = d?.meta?.color || '#eef2f7';
              const ab = d?.meta?.abbr || d?.label || id;
              return (
                <span key={id} className="px-2 py-1 rounded-full border text-xs flex items-center gap-1" style={{ backgroundColor: bg }}>
                  {ab}
                  <button onClick={()=> setDivs(prev=> prev.filter(x=>x!==id))} className="ml-1 text-[10px]">✕</button>
                </span>
              );
            })}
            <AddDivisionDropdown divisions={divisions} selected={divs} onAdd={(id)=> setDivs(prev=> prev.includes(id)? prev : [...prev, id])} />
          </div>
        </div>
        <EmployeeSelect label="Estimator" value={estimator} onChange={setEstimator} employees={employees||[]} />
        <EmployeeSelect label="On-site lead" value={lead} onChange={setLead} employees={employees||[]} />
        <div className="col-span-2 text-right">
          <button onClick={async()=>{ try{ await api('PATCH', `/projects/${projectId}`, { status_label: status||null, division_ids: divs, progress, estimator_id: estimator||null, onsite_lead_id: lead||null }); toast.success('Saved'); location.reload(); }catch(_e){ toast.error('Failed to save'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

function ProjectGeneralForm({ projectId, proj, onSaved }:{ projectId:string, proj:any, onSaved: ()=>void }){
  const [name, setName] = useState<string>(proj?.name||'');
  const [code, setCode] = useState<string>(proj?.code||'');
  const [city, setCity] = useState<string>(proj?.address_city||'');
  const [province, setProvince] = useState<string>(proj?.address_province||'');
  const [country, setCountry] = useState<string>(proj?.address_country||'');
  const [desc, setDesc] = useState<string>(proj?.description||'');
  const [start, setStart] = useState<string>((proj?.date_start||'').slice(0,10));
  const [eta, setEta] = useState<string>((proj?.date_eta||'').slice(0,10));
  const [end, setEnd] = useState<string>((proj?.date_end||'').slice(0,10));
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Code</label><input className="w-full border rounded px-3 py-2" value={code} onChange={e=>setCode(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">City</label><input className="w-full border rounded px-3 py-2" value={city} onChange={e=>setCity(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Province/State</label><input className="w-full border rounded px-3 py-2" value={province} onChange={e=>setProvince(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Country</label><input className="w-full border rounded px-3 py-2" value={country} onChange={e=>setCountry(e.target.value)} /></div>
      <div className="md:col-span-2"><label className="text-xs text-gray-600">Description</label><textarea rows={6} className="w-full border rounded px-3 py-2" value={desc} onChange={e=>setDesc(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">Start date</label><input type="date" className="w-full border rounded px-3 py-2" value={start} onChange={e=>setStart(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">ETA</label><input type="date" className="w-full border rounded px-3 py-2" value={eta} onChange={e=>setEta(e.target.value)} /></div>
      <div><label className="text-xs text-gray-600">End date</label><input type="date" className="w-full border rounded px-3 py-2" value={end} onChange={e=>setEnd(e.target.value)} /></div>
      <div className="md:col-span-2 text-right"><button onClick={async()=>{ try{ await api('PATCH', `/projects/${projectId}`, { name, code, address_city: city, address_province: province, address_country: country, description: desc, date_start: start||null, date_eta: eta||null, date_end: end||null }); toast.success('Saved'); onSaved(); }catch(_e){ toast.error('Failed to save'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Save</button></div>
    </div>
  );
}



