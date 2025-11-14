import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import EstimateBuilder from '@/components/EstimateBuilder';
import ProposalForm from '@/components/ProposalForm';
import { useConfirm } from '@/components/ConfirmProvider';
import CalendarMock from '@/components/CalendarMock';
import DispatchTab from '@/components/DispatchTab';

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

// Helper function to format hours and minutes in a readable format (e.g., "8h30min")
function formatHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}min`;
}

type Project = { id:string, code?:string, name?:string, client_id?:string, client_display_name?:string, address_city?:string, address_province?:string, address_country?:string, address_postal_code?:string, description?:string, status_id?:string, division_id?:string, estimator_id?:string, onsite_lead_id?:string, contact_id?:string, contact_name?:string, contact_email?:string, contact_phone?:string, date_start?:string, date_eta?:string, date_end?:string, cost_estimated?:number, cost_actual?:number, service_value?:number, progress?:number, site_id?:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, status_label?:string };
type ProjectFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, original_name?:string, uploaded_at?:string };
type Update = { id:string, timestamp?:string, text?:string, images?:any };
type Report = { id:string, category_id?:string, division_id?:string, description?:string, images?:any, status?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function ProjectDetail(){
  const location = useLocation();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { id } = useParams();
  const { data:proj, isLoading } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['projectFiles', id], queryFn: ()=>api<ProjectFile[]>('GET', `/projects/${id}/files`) });
  const { data:clientFiles } = useQuery({ queryKey:['clientFilesForContacts-project', proj?.client_id||''], queryFn: ()=> proj?.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(proj?.client_id||''))}/files`) : Promise.resolve([]), enabled: !!proj?.client_id });
  const { data:updates, refetch: refetchUpdates } = useQuery({ queryKey:['projectUpdates', id], queryFn: ()=>api<Update[]>('GET', `/projects/${id}/updates`) });
  const { data:reports, refetch: refetchReports } = useQuery({ queryKey:['projectReports', id], queryFn: ()=>api<Report[]>('GET', `/projects/${id}/reports`) });
  const { data:proposals } = useQuery({ queryKey:['projectProposals', id], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(id||''))}`) });
  const { data:projectEstimates } = useQuery({ queryKey:['projectEstimates', id], queryFn: ()=>api<any[]>('GET', `/estimate/estimates?project_id=${encodeURIComponent(String(id||''))}`) });
  // Check for tab query parameter
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|null) || 'overview';
  const [tab, setTab] = useState<'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'>(initialTab);
  const [pickerOpen, setPickerOpen] = useState(false);
  
  // Update tab when URL search params change
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|null;
    if (tabParam && ['overview','general','reports','dispatch','timesheet','files','photos','proposal','estimate'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);
  
  const cover = useMemo(()=>{
    const img = (files||[]).find(f=> String(f.category||'')==='project-cover-derived') || (files||[]).find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
    return img? `/files/${img.file_object_id}/thumbnail?w=1000` : '/ui/assets/login/logo-light.svg';
  }, [files]);
  const overlayUrl = useMemo(()=>{
    const branding = (settings?.branding||[]) as any[];
    const row = branding.find((i:any)=> ['project_hero_overlay_url','hero_overlay_url','project hero overlay','hero overlay'].includes(String(i.label||'').toLowerCase()));
    return row?.value || '';
  }, [settings]);
  const [overlayResolved, setOverlayResolved] = useState<string>('');
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);
  const [auditLogSection, setAuditLogSection] = useState<'timesheet' | 'reports' | 'schedule' | 'files' | 'photos' | 'proposal' | 'estimate'>('timesheet');
  useEffect(()=>{
    (async()=>{
      try{
        if(!overlayUrl){ setOverlayResolved(''); return; }
        if(overlayUrl.startsWith('/files/')){
          const r:any = await api('GET', overlayUrl);
          setOverlayResolved(r.download_url||'');
        } else {
          setOverlayResolved(overlayUrl);
        }
      }catch{ setOverlayResolved(''); }
    })();
  }, [overlayUrl]);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Project Information</div>
        <div className="text-sm opacity-90">Overview, files, schedule and contacts.</div>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden relative">
        <div className="relative rounded-t-xl p-5 text-white overflow-hidden" style={{ backgroundImage: 'linear-gradient(135deg, #6b7280, #1f2937)' }}>
          <img src={cover} alt="" className="pointer-events-none select-none absolute right-0 top-0 h-[160%] w-auto opacity-15 -translate-x-20 scale-150 object-contain" />
          {overlayResolved && (
            <img src={overlayResolved} alt="" className="pointer-events-none select-none absolute right-0 top-0 h-full w-auto opacity-80" style={{ WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)', maskImage: 'linear-gradient(to left, black 70%, transparent 100%)' }} />
          )}
          <div className="flex gap-4 items-stretch min-h-[220px] relative">
            <div className="w-[260px] relative group">
              <img src={cover} className="w-full h-full object-cover rounded-xl border-2 border-brand-red" />
              <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">✏️ Change</button>
            </div>
            <div className="flex-1 flex flex-col justify-start">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="text-3xl font-extrabold">{proj?.name||'Project'}</div>
                  <div className="text-sm opacity-90 mt-1">{proj?.code||''} · {proj?.client_id ? (<Link className="underline" to={`/customers/${encodeURIComponent(String(proj?.client_id||''))}`}>{proj?.client_display_name||''}</Link>): (proj?.client_display_name||'')}</div>
                  <div className="text-sm opacity-90">
                    {proj?.site_id ? (
                      <Link to={`/customers/${encodeURIComponent(String(proj?.client_id||''))}/sites/${encodeURIComponent(String(proj?.site_id||''))}`} state={{ backgroundLocation: location }} className="underline">{(proj?.site_name||proj?.site_id)}{(proj?.site_address_line1||proj?.site_city||proj?.site_province||proj?.site_country)? ` (${[proj?.site_address_line1, proj?.site_city, proj?.site_province, proj?.site_country].filter(Boolean).join(', ')})` : ''}</Link>
                    ) : ''}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {(() => { const statusLabel = String((proj as any)?.status_label||'').trim(); const color = ((settings||{}).project_statuses||[]).find((s:any)=>s.label===statusLabel)?.value || '#e5e7eb'; return (<span className="px-2 py-0.5 rounded-full border text-black" style={{ backgroundColor: color }}>{statusLabel||'—'}</span>); })()}
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-40 bg-white/40 rounded-full overflow-hidden"><div className="h-full bg-black" style={{ width: `${Math.max(0,Math.min(100,Number(proj?.progress||0)))}%` }} /></div>
                      <span className="text-sm">{Math.max(0,Math.min(100,Number(proj?.progress||0)))}%</span>
                    </div>
                  </div>
                </div>
                <button onClick={async()=>{
                  const ok = await confirm({ 
                    title: 'Delete Project', 
                    message: `Are you sure you want to delete "${proj?.name||'this project'}"? This action cannot be undone. All related data (updates, reports, timesheets) will also be deleted.`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel'
                  });
                  if (!ok) return;
                  try{
                    await api('DELETE', `/projects/${encodeURIComponent(String(id||''))}`);
                    toast.success('Project deleted');
                    if(proj?.client_id){
                      nav(`/customers/${encodeURIComponent(String(proj?.client_id))}`);
                    } else {
                      nav('/projects');
                    }
                  }catch(_e){ toast.error('Failed to delete project'); }
                }} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm">Delete Project</button>
              </div>
              <div className="mt-auto flex gap-3 items-center justify-between w-full">
                <div className="flex gap-3">
                  {(['overview','reports','dispatch','timesheet','files','photos','proposal','estimate'] as const).map(k=> (
                    <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-full ${tab===k?'bg-black text-white':'bg-white text-black'}`}>{k === 'dispatch' ? 'Schedule' : k[0].toUpperCase()+k.slice(1)}</button>
                  ))}
                </div>
                <button 
                  onClick={() => setShowAuditLogModal(true)}
                  className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-800 text-white text-sm"
                >
                  Audit Log
                </button>
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
                <ProjectGeneralInfoCard projectId={String(id)} proj={proj||{}} />
                <ProjectQuickEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                <ProjectContactCard projectId={String(id)} proj={proj||{}} clientId={proj?.client_id ? String(proj.client_id) : undefined} clientFiles={clientFiles||[]} />
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Estimated Time of Completion</h4>
                  <ProjectEtaEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                </div>
                <ProjectCostsSummary projectId={String(id)} estimates={projectEstimates||[]} />
                <div className="md:col-span-3 rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-2">Schedule</h4>
                  <CalendarMock title="Project Calendar" projectId={String(id)} />
                </div>
              </div>
            )}

            {tab==='reports' && (
              <ReportsTabEnhanced projectId={String(id)} items={reports||[]} onRefresh={refetchReports} />
            )}

            {tab==='dispatch' && (
              <DispatchTab projectId={String(id)} />
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

      {/* Audit Log Modal */}
      {showAuditLogModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Audit Log</h2>
              <button 
                onClick={() => setShowAuditLogModal(false)} 
                className="text-2xl font-bold text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden flex">
              {/* Left side - Section buttons */}
              <div className="w-48 border-r bg-gray-50 p-4">
                <div className="space-y-2">
                  {(['timesheet', 'reports', 'schedule', 'files', 'photos', 'proposal', 'estimate'] as const).map((section) => (
                    <button
                      key={section}
                      onClick={() => setAuditLogSection(section)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        auditLogSection === section
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {section[0].toUpperCase() + section.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Right side - Log content */}
              <div className="flex-1 overflow-y-auto p-6">
                {auditLogSection === 'timesheet' && (
                  <TimesheetAuditSection projectId={String(id)} />
                )}
                {auditLogSection === 'reports' && (
                  <div className="text-center text-gray-500 py-8">
                    Reports audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'schedule' && (
                  <div className="text-center text-gray-500 py-8">
                    Schedule audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'files' && (
                  <div className="text-center text-gray-500 py-8">
                    Files audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'photos' && (
                  <div className="text-center text-gray-500 py-8">
                    Photos audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'proposal' && (
                  <div className="text-center text-gray-500 py-8">
                    Proposal audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'estimate' && (
                  <div className="text-center text-gray-500 py-8">
                    Estimate audit log coming soon...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
  const containerRef = useRef<HTMLDivElement|null>(null);
  const current = (employees||[]).find((e:any)=> String(e.id)===String(value||''));
  const filtered = (employees||[]).filter((e:any)=>{
    const t = (String(e.name||'') + ' ' + String(e.username||'')).toLowerCase();
    return t.includes(q.toLowerCase());
  });
  useEffect(()=>{
    if(!open) return;
    const handleClick = (event: MouseEvent)=>{
      if(!containerRef.current) return;
      if(!containerRef.current.contains(event.target as Node)){
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return ()=> document.removeEventListener('mousedown', handleClick);
  }, [open]);
  return (
    <div ref={containerRef}>
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
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7));
  const [userFilter, setUserFilter] = useState<string>('');
  
  // Edit time entry modal state
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  
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
  
  // Get timesheet settings for default break
  const { data: settings } = useQuery({ queryKey:['settings-bundle'], queryFn: ()=>api<Record<string, any[]>>('GET','/settings') });
  const defaultBreakMin = useMemo(() => {
    const timesheetItems = (settings?.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    return breakItem?.value ? parseInt(breakItem.value, 10) : 30;
  }, [settings]);
  
  // Fetch all shifts for the project to get break minutes for each entry
  // We need to fetch shifts for the month range to get break minutes
  const monthRange = useMemo(() => {
    if (!month) return null;
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const firstDay = new Date(year, monthNum - 1, 1);
      const lastDay = new Date(year, monthNum, 0);
      return `${firstDay.toISOString().slice(0, 10)},${lastDay.toISOString().slice(0, 10)}`;
    } catch {
      return null;
    }
  }, [month]);
  
  const { data: allShifts } = useQuery({
    queryKey: ['dispatch-shifts-all', projectId, monthRange],
    queryFn: () => api<any[]>('GET', `/dispatch/projects/${projectId}/shifts${monthRange ? `?date_range=${monthRange}` : ''}`),
    enabled: !!projectId
  });
  
  // Create a map of shifts by user_id and work_date for quick lookup
  const shiftsByUserAndDate = useMemo(() => {
    const map: Record<string, any> = {};
    if (allShifts) {
      allShifts.forEach((shift: any) => {
        const key = `${shift.worker_id}_${shift.date}`;
        if (!map[key] || !Array.isArray(map[key])) {
          map[key] = [];
        }
        map[key].push(shift);
      });
    }
    return map;
  }, [allShifts]);
  
  // Calculate total minutes with break deduction
  const { minutesTotal, breakTotal } = useMemo(() => {
    let total = 0;
    let breakTotal = 0;
    entries.forEach((e: any) => {
      const entryMinutes = Number(e.minutes || 0);
      total += entryMinutes;
      
      // Find shift for this entry to get break minutes
      const key = `${e.user_id}_${e.work_date}`;
      const shiftsForEntry = shiftsByUserAndDate[key] || [];
      // Use the first shift's break_min, or default from settings
      const breakMin = shiftsForEntry.length > 0 && shiftsForEntry[0].default_break_min 
        ? shiftsForEntry[0].default_break_min 
        : defaultBreakMin;
      breakTotal += breakMin;
    });
    return { minutesTotal: total, breakTotal };
  }, [entries, shiftsByUserAndDate, defaultBreakMin]);
  
  const hoursTotalMinutes = minutesTotal - breakTotal;
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  
  // Get current user info to check if supervisor/admin
  const { data: currentUser } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  
  // Check if user is supervisor or admin
  const isSupervisorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roles = currentUser.roles || [];
    const permissions = currentUser.permissions || [];
    return roles.includes('admin') || roles.includes('supervisor') || permissions.includes('dispatch:write');
  }, [currentUser]);
  
  // Fetch shifts for the selected date
  const dateRange = useMemo(() => {
    return `${workDate},${workDate}`;
  }, [workDate]);

  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts', projectId, dateRange],
    queryFn: async () => {
      try {
        const allShifts = await api<any[]>('GET', `/dispatch/projects/${projectId}/shifts?date_range=${dateRange}`);
        // Return all shifts (not just scheduled) to show all shifts including those with attendances
        return allShifts;
      } catch {
        return [];
      }
    },
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Fetch attendance records for shifts
  const { data: attendances, refetch: refetchAttendances } = useQuery({
    queryKey: ['attendances', projectId, workDate, shifts?.map((s: any) => s.id).join(',')],
    queryFn: async () => {
      if (!shifts || shifts.length === 0) return [];
      try {
        const attendancePromises = shifts.map((shift: any) =>
          api<any[]>('GET', `/dispatch/shifts/${shift.id}/attendance`).catch(() => [])
        );
        const results = await Promise.all(attendancePromises);
        return results.flat();
      } catch {
        return [];
      }
    },
    enabled: !!shifts && shifts.length > 0,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Clock-in/out state
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>(''); // Stores time in 24h format (HH:MM) for backend
  const [selectedHour12, setSelectedHour12] = useState<string>(''); // Stores hour in 12h format (1-12)
  const [selectedMinute, setSelectedMinute] = useState<string>(''); // Stores minute (00, 15, 30, 45)
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM'); // Stores AM/PM
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showClockModal, setShowClockModal] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<{ inside: boolean; distance?: number; radius?: number } | null>(null);

  // Haversine distance calculation (same as backend)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  };

  // Check if GPS location is inside geofence
  const checkGeofence = (lat: number, lng: number, geofences: any[] | null | undefined) => {
    if (!geofences || geofences.length === 0) {
      setGeofenceStatus(null); // No geofence - don't set status, message won't show
      return;
    }

    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      
      if (distance <= radiusM) {
        setGeofenceStatus({ inside: true, distance: Math.round(distance), radius: radiusM });
        return;
      }
    }
    
    // Find the closest geofence to show distance
    let minDistance = Infinity;
    let closestRadius = 150;
    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      if (distance < minDistance) {
        minDistance = distance;
        closestRadius = radiusM;
      }
    }
    
    setGeofenceStatus({ inside: false, distance: Math.round(minDistance), radius: closestRadius });
  };

  // Get GPS location
  const getCurrentLocation = (shiftForGeofence?: any): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      setGpsLoading(true);
      setGpsError('');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLoading(false);
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
          };
          setGpsLocation(location);
          
          // Check geofence if shift has geofences
          // Use shiftForGeofence if provided, otherwise use selectedShift
          const shiftToCheck = shiftForGeofence || selectedShift;
          if (shiftToCheck?.geofences && shiftToCheck.geofences.length > 0) {
            checkGeofence(location.lat, location.lng, shiftToCheck.geofences);
          } else {
            setGeofenceStatus(null); // No geofence - don't set status, message won't show
          }
          
          resolve(location);
        },
        (error) => {
          setGpsLoading(false);
          const errorMsg =
            error.code === 1
              ? 'Location permission denied'
              : error.code === 2
              ? 'Location unavailable'
              : error.code === 3
              ? 'Location request timeout'
              : 'Failed to get location';
          setGpsError(errorMsg);
          setGpsLocation(null);
          setGeofenceStatus(null);
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Helper function to convert 24h to 12h format
  const convert24hTo12h = (hour24: number): { hour12: number; amPm: 'AM' | 'PM' } => {
    if (hour24 === 0) return { hour12: 12, amPm: 'AM' };
    if (hour24 === 12) return { hour12: 12, amPm: 'PM' };
    if (hour24 < 12) return { hour12: hour24, amPm: 'AM' };
    return { hour12: hour24 - 12, amPm: 'PM' };
  };

  // Helper function to convert 12h to 24h format
  const convert12hTo24h = (hour12: number, amPm: 'AM' | 'PM'): number => {
    if (amPm === 'AM') {
      if (hour12 === 12) return 0;
      return hour12;
    } else {
      if (hour12 === 12) return 12;
      return hour12 + 12;
    }
  };

  // Update selectedTime (24h format) when 12h format changes
  const updateTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (hour12 && minute) {
      const hour12Num = parseInt(hour12, 10);
      if (!isNaN(hour12Num) && hour12Num >= 1 && hour12Num <= 12) {
        const hour24 = convert12hTo24h(hour12Num, amPm);
        const time24h = `${String(hour24).padStart(2, '0')}:${minute}`;
        setSelectedTime(time24h);
      }
    } else {
      // Clear selectedTime if fields are incomplete
      setSelectedTime('');
    }
  };

  // Handle clock-in/out
  const handleClockInOut = async (shift: any, type: 'in' | 'out') => {
    setSelectedShift(shift);
    setClockType(type);
    setReasonText('');
    setGpsError('');
    setGpsLocation(null); // Clear previous location
    setGeofenceStatus(null);

    // Set default time to now (rounded to 15 min) in 12h format
    const now = new Date();
    const hour24 = now.getHours();
    const minutes = Math.round(now.getMinutes() / 15) * 15;
    const { hour12, amPm } = convert24hTo12h(hour24);
    
    setSelectedHour12(String(hour12));
    setSelectedMinute(String(minutes).padStart(2, '0'));
    setSelectedAmPm(amPm);
    
    // Also set in 24h format for backend
    const roundedTime = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSelectedTime(roundedTime);

    // Open modal first so user can see it
    setShowClockModal(true);

    // Try to get GPS location automatically when modal opens
    // Pass shift directly to ensure geofence check uses the correct shift
    setGpsLoading(true);
    try {
      await getCurrentLocation(shift);
    } catch (error) {
      console.warn('GPS location failed:', error);
      // Error is already set by getCurrentLocation, so user will see it in the modal
    } finally {
      setGpsLoading(false);
    }
  };

  // Submit attendance
  const submitAttendance = async () => {
    if (!selectedShift || !clockType) {
      toast.error('Invalid shift or clock type');
      return;
    }

    if (!selectedTime || !selectedTime.includes(':')) {
      toast.error('Please select a time');
      return;
    }

    // Ensure time is in valid format (HH:MM) with 15-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || ![0, 15, 30, 45].includes(minutes)) {
      toast.error('Please select a valid time in 15-minute increments');
      return;
    }

    // Use shift date, not workDate, to ensure correct date is used
    const shiftDate = selectedShift.date; // Format: YYYY-MM-DD
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const timeSelectedLocal = `${shiftDate}T${timeStr}:00`;

    setSubmitting(true);

    try {
      const payload: any = {
        shift_id: selectedShift.id,
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add GPS location if available
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      // Check if supervisor is doing for another worker
      const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
      const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
      
      // Add reason text if provided
      if (isSupervisorDoingForOther) {
        if (!reasonText || !reasonText.trim() || reasonText.trim().length < 15) {
          toast.error('Reason text is required (minimum 15 characters) when supervisor clocks in/out for a worker');
          setSubmitting(false);
          return;
        }
        payload.reason_text = reasonText.trim();
      } else if (reasonText && reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      // Use regular attendance endpoint
      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      setSelectedShift(null);
      setClockType(null);
      setSelectedTime('');
      setSelectedHour12('');
      setSelectedMinute('');
      setReasonText('');
      setGpsLocation(null);
      setGpsError('');
      setShowClockModal(false);

      // Refetch both shifts and attendances
      await refetchShifts();
      await refetchAttendances();
      
      // Refetch timesheet entries to show the new attendance
      await refetch();
      
      // Invalidate timesheet logs to show new audit entry
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      // Extract error message from the error object
      let errorMsg = 'Failed to submit attendance';
      if (error.message) {
        errorMsg = error.message;
      } else if (error.response?.data?.detail) {
        errorMsg = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      toast.error(errorMsg);
      // Log full error for debugging
      console.error('Full error object:', error);
      if (error.response?.data) {
        console.error('Error response:', error.response.data);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Get attendance for a shift
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): any => {
    return (attendances || []).find((a: any) => a.shift_id === shiftId && a.type === type);
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800">Approved</span>;
      case 'pending':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">Pending</span>;
      case 'rejected':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-800">Rejected</span>;
      default:
        return null;
    }
  };

  const csvExport = async()=>{
    try{
      const qs = new URLSearchParams();
      if (month) qs.set('month', month);
      if (userFilter) qs.set('user_id', userFilter);
      const rows:any[] = await api('GET', `/projects/${projectId}/timesheet?${qs.toString()}`);
      const header = ['Date','User','Hours','Break','Hours (after break)','Notes'];
      const csv = [header.join(',')].concat(rows.map(r=> {
        const key = `${r.user_id}_${r.work_date}`;
        const shiftsForEntry = shiftsByUserAndDate[key] || [];
        const breakMin = shiftsForEntry.length > 0 && shiftsForEntry[0].default_break_min 
          ? shiftsForEntry[0].default_break_min 
          : defaultBreakMin;
        const hoursAfterBreak = Math.max(0, (r.minutes || 0) - breakMin);
        return [r.work_date, JSON.stringify(r.user_name||''), (r.minutes/60).toFixed(2), breakMin, formatHoursMinutes(hoursAfterBreak), JSON.stringify(r.notes||'')].join(',');
      })).join('\n');
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
          <div><label className="text-xs text-gray-600">Date</label><input type="date" className="w-full border rounded px-3 py-2" value={workDate} onChange={e=>setWorkDate(e.target.value)} /></div>
          
          {/* Clock In/Out for Shifts */}
          {shifts && shifts.length > 0 ? (
            <div>
              <label className="text-xs text-gray-600 mb-2 block font-medium">Clock In/Out</label>
              <div className="space-y-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {shifts.map((shift: any) => {
                  const clockIn = getAttendanceForShift(shift.id, 'in');
                  const clockOut = getAttendanceForShift(shift.id, 'out');
                  const canClockIn = !clockIn || clockIn.status === 'rejected';
                  const canClockOut = clockIn && (clockIn.status === 'approved' || clockIn.status === 'pending') && (!clockOut || clockOut.status === 'rejected');
                  const worker = employees?.find((e: any) => e.id === shift.worker_id);

                  return (
                    <div key={shift.id} className="p-2 border rounded bg-gray-50 text-xs">
                      <div className="font-medium mb-1.5 text-gray-900">
                        {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                        {shift.job_name && <span className="ml-1 text-gray-500 font-normal">({shift.job_name})</span>}
                        {worker && <span className="ml-1 text-gray-600 font-normal">- {worker.name || worker.username}</span>}
                      </div>
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 w-8">In:</span>
                          {clockIn ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              {getStatusBadge(clockIn.status)}
                              <span className="text-gray-700">
                                {new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                              {clockIn.source === 'supervisor' && (
                                <span className="text-gray-500 text-[10px]">(Supervisor)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Not clocked in</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 w-8">Out:</span>
                          {clockOut ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              {getStatusBadge(clockOut.status)}
                              <span className="text-gray-700">
                                {new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </span>
                              {clockOut.source === 'supervisor' && (
                                <span className="text-gray-500 text-[10px]">(Supervisor)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Not clocked out</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleClockInOut(shift, 'in')}
                          disabled={!canClockIn || submitting}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            canClockIn
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Clock In
                        </button>
                        <button
                          onClick={() => handleClockInOut(shift, 'out')}
                          disabled={!canClockOut || submitting}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            canClockOut
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          Clock Out
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded">
              No shifts scheduled for this date
            </div>
          )}
        </div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Month</label><input type="month" className="border rounded px-2 py-1" value={month} onChange={e=>{ setMonth(e.target.value); }} /></div>
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Employee</label><select className="border rounded px-2 py-1 text-sm" value={userFilter} onChange={e=>setUserFilter(e.target.value)}><option value="">All</option>{(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}</select></div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">Total: {formatHoursMinutes(hoursTotalMinutes)} <span className="text-xs text-gray-500">(after break)</span></div>
            <button onClick={csvExport} className="px-2 py-1 rounded bg-gray-100 text-sm">Export CSV</button>
          </div>
        </div>
        <div className="border-t">
          {/* Header row */}
          <div className="px-3 py-2 text-xs font-medium text-gray-600 border-b bg-gray-50 flex items-center gap-3">
            <div className="w-6"></div>
            <div className="w-24">Employee</div>
            <div className="w-12">Date</div>
            <div className="w-20">Time</div>
            <div className="w-20">Hours</div>
            <div className="w-16">Break</div>
            <div className="flex-1">Notes</div>
            <div className="w-24"></div>
          </div>
        </div>
        <div className="divide-y">
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
            // Find shift for this entry to get break minutes
            const key = `${e.user_id}_${e.work_date}`;
            const shiftsForEntry = shiftsByUserAndDate[key] || [];
            const breakMin = shiftsForEntry.length > 0 && shiftsForEntry[0].default_break_min 
              ? shiftsForEntry[0].default_break_min 
              : defaultBreakMin;
            // Calculate hours after deducting break
            const hoursAfterBreak = Math.max(0, e.minutes - breakMin);
            
            return (
            <div key={e.id} className="px-3 py-2 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                {e.user_avatar_file_id? <img src={`/files/${e.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                <div className="w-24 text-gray-700 truncate">{e.user_name||''}</div>
                <div className="w-12 text-gray-600">{String(e.work_date).slice(5,10)}</div>
                <div className="w-20 text-gray-600">{formatTime12h(e.start_time)} - {formatTime12h(e.end_time)}</div>
                <div className="w-20 font-medium">{formatHoursMinutes(hoursAfterBreak)}</div>
                <div className="w-16 font-medium">{breakMin}m</div>
                <div className="flex-1 text-gray-600 truncate">{e.notes||''}</div>
                {(futIcon||offIcon) && <span title={future? 'Future time': 'Logged after day end'}>{futIcon}{offIcon}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setEditingEntry(e);
                    // Extract time from HH:MM:SS format to HH:MM
                    const startTime = e.start_time ? e.start_time.slice(0, 5) : '';
                    const endTime = e.end_time ? e.end_time.slice(0, 5) : '';
                    setEditStartTime(startTime);
                    setEditEndTime(endTime);
                  }} 
                  className="px-2 py-1 rounded bg-gray-100"
                >
                  Edit
                </button>
                <button 
                  onClick={async() => {
                    const confirmed = await confirm({
                      title: 'Delete Time Entry',
                      message: 'Are you sure you want to delete this time entry?',
                      confirmText: 'Delete',
                      cancelText: 'Cancel'
                    });
                    if (!confirmed) return;
                    try {
                      await api('DELETE', `/projects/${projectId}/timesheet/${e.id}`);
                      await refetch();
                      await refetchAttendances();
                      await refetchShifts();
                      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
                      toast.success('Time entry deleted');
                    } catch (_e) {
                      toast.error('Failed to delete time entry');
                    }
                  }} 
                  className="px-2 py-1 rounded bg-gray-100"
                >
                  Delete
                </button>
              </div>
            </div>
          );
          }) : <div className="p-3 text-sm text-gray-600">No time entries</div>}
        </div>
      </div>
      {/* Edit Time Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Edit Time Entry</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setEditingEntry(null);
                  setEditStartTime('');
                  setEditEndTime('');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editStartTime || !editEndTime) {
                    toast.error('Start time and end time are required');
                    return;
                  }
                  
                  try {
                    // Calculate minutes from start and end time
                    const [startH, startM] = editStartTime.split(':').map(Number);
                    const [endH, endM] = editEndTime.split(':').map(Number);
                    const startMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;
                    const minutes = endMinutes - startMinutes;
                    
                    if (minutes <= 0) {
                      toast.error('End time must be after start time');
                      return;
                    }
                    
                    await api('PATCH', `/projects/${projectId}/timesheet/${editingEntry.id}`, {
                      start_time: `${editStartTime}:00`,
                      end_time: `${editEndTime}:00`,
                      minutes: minutes
                    });
                    
                    await refetch();
                    queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
                    toast.success('Time entry updated');
                    
                    setEditingEntry(null);
                    setEditStartTime('');
                    setEditEndTime('');
                  } catch (_e) {
                    toast.error('Failed to update time entry');
                  }
                }}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clock In/Out Modal */}
      {showClockModal && selectedShift && clockType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              Clock {clockType === 'in' ? 'In' : 'Out'}
            </h3>

            {/* Time selector (12h format with AM/PM) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedHour12}
                  onChange={(e) => {
                    const hour12 = e.target.value;
                    setSelectedHour12(hour12);
                    updateTimeFrom12h(hour12, selectedMinute, selectedAmPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="">Hour</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span className="text-gray-500 font-medium">:</span>
                <select
                  value={selectedMinute}
                  onChange={(e) => {
                    const minute = e.target.value;
                    setSelectedMinute(minute);
                    updateTimeFrom12h(selectedHour12, minute, selectedAmPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="">Min</option>
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={String(m).padStart(2, '0')}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedAmPm}
                  onChange={(e) => {
                    const amPm = e.target.value as 'AM' | 'PM';
                    setSelectedAmPm(amPm);
                    updateTimeFrom12h(selectedHour12, selectedMinute, amPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Time must be in 15-minute increments (00, 15, 30, 45)
              </p>
            </div>

            {/* GPS Status */}
            <div>
              {gpsLocation ? (
                <>
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-green-800">✓ Location captured</div>
                        <div className="text-xs text-green-600 mt-1">
                          Accuracy: {Math.round(gpsLocation.accuracy)}m
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => getCurrentLocation(selectedShift)}
                        disabled={gpsLoading}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50 bg-white"
                      >
                        {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                      </button>
                    </div>
                  </div>
                  {selectedShift?.geofences && selectedShift.geofences.length > 0 ? (
                    geofenceStatus && (
                      <div className={`p-3 border rounded text-sm mt-2 ${
                        geofenceStatus.inside
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-orange-50 border-orange-200 text-orange-800'
                      }`}>
                        {geofenceStatus.inside ? (
                          <div>
                            <div className="font-medium">✓ Great! You are at the right site to clock-in/out</div>
                            {geofenceStatus.distance !== undefined && (
                              <div className="text-xs mt-1 opacity-75">
                                Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">⚠ You are not at the correct site</div>
                            {geofenceStatus.distance !== undefined && (
                              <div className="text-xs mt-1 opacity-75">
                                Distance from site: {geofenceStatus.distance}m (required: within {geofenceStatus.radius}m)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 mt-2">
                      <div className="font-medium">ℹ Location validation not required</div>
                      <div className="text-xs mt-1 opacity-75">
                        No geofence is defined for this shift. Your location has been captured but will not be validated.
                      </div>
                    </div>
                  )}
                </>
              ) : gpsLoading ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800"></div>
                    <span>Getting location...</span>
                  </div>
                </div>
              ) : gpsError ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  {gpsError}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                  No location data
                </div>
              )}
            </div>

            {/* Reason text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason {
                  (() => {
                    // Check if supervisor is doing for another worker
                    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                    
                    // Check if time is outside tolerance (30 minutes)
                    let isOutsideTimeTolerance = false;
                    if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                      try {
                        const now = new Date();
                        const shiftDate = selectedShift.date; // YYYY-MM-DD
                        const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12 
                          ? parseInt(selectedHour12) + 12 
                          : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12 
                          ? 0 
                          : parseInt(selectedHour12);
                        const selectedDateTime = new Date(`${shiftDate}T${String(hour24).padStart(2, '0')}:${selectedMinute}:00`);
                        const diffMinutes = Math.abs((selectedDateTime.getTime() - now.getTime()) / (1000 * 60));
                        isOutsideTimeTolerance = diffMinutes > 30;
                      } catch (e) {
                        // Ignore errors in calculation
                      }
                    }
                    
                    // Require reason if: supervisor doing for other worker OR not inside geofence OR outside time tolerance
                    const isOutsideGeofence = geofenceStatus && !geofenceStatus.inside;
                    const requiresReason = isSupervisorDoingForOther || isOutsideGeofence || isOutsideTimeTolerance;
                    return requiresReason && <span className="text-red-500">*</span>;
                  })()
                }
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry..."
                className="w-full border rounded px-3 py-2 h-24"
                minLength={15}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(() => {
                  // Check if supervisor is doing for another worker
                  const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                  const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                  
                  if (isSupervisorDoingForOther) {
                    return (
                      <span className="text-red-600 font-medium">
                        Required (minimum 15 characters): Supervisor clock-in/out for another worker always requires a reason.
                      </span>
                    );
                  }
                  
                  // Check if time is outside tolerance (30 minutes)
                  let isOutsideTimeTolerance = false;
                  if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                    try {
                      const now = new Date();
                      const shiftDate = selectedShift.date; // YYYY-MM-DD
                      const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12 
                        ? parseInt(selectedHour12) + 12 
                        : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12 
                        ? 0 
                        : parseInt(selectedHour12);
                      const selectedDateTime = new Date(`${shiftDate}T${String(hour24).padStart(2, '0')}:${selectedMinute}:00`);
                      const diffMinutes = Math.abs((selectedDateTime.getTime() - now.getTime()) / (1000 * 60));
                      isOutsideTimeTolerance = diffMinutes > 30;
                    } catch (e) {
                      // Ignore errors in calculation
                    }
                  }
                  
                  // Check if outside geofence OR outside time tolerance
                  const isOutsideGeofence = geofenceStatus && !geofenceStatus.inside;
                  const requiresReason = isOutsideGeofence || isOutsideTimeTolerance;
                  
                  if (requiresReason) {
                    return (
                      <span className="text-red-600 font-medium">
                        ⚠ REQUIRED (minimum 15 characters): You are attempting to clock in/out outside the allowed location or outside the permitted time range (±30 minutes). You must provide a written reason explaining why. Your entry will be sent for supervisor review.
                      </span>
                    );
                  }
                  
                  if (!gpsLocation || gpsError) {
                    return (
                      <span className="text-orange-600 font-medium">
                        Recommended (minimum 15 characters): Location cannot be validated. Reason is optional but recommended.
                      </span>
                    );
                  }
                  
                  // If inside geofence and within time tolerance, reason is optional
                  if (geofenceStatus && geofenceStatus.inside) {
                    return 'Optional: You are at the correct site and within the time tolerance. Reason is not required.';
                  }
                  
                  return 'Optional, but recommended. Required if you are not at the correct site or time is outside tolerance window (±30 minutes).';
                })()}
              </p>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-gray-500 mt-2">
              <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setShowClockModal(false);
                  setSelectedShift(null);
                  setClockType(null);
                  setSelectedTime('');
                  setSelectedHour12('');
                  setSelectedMinute('');
                  setReasonText('');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={submitAttendance}
                disabled={submitting || !selectedTime || !selectedHour12 || !selectedMinute}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimesheetAuditSection({ projectId }:{ projectId:string }){
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7));
  const [offset, setOffset] = useState<number>(0);
  const limit = 50;
  const qs = (()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); p.set('limit', String(limit)); p.set('offset', String(offset)); const s=p.toString(); return s? ('?'+s): ''; })();
  const { data, refetch, isFetching } = useQuery({ queryKey:['timesheetLogs', projectId, month, offset], queryFn: ()=> api<any[]>('GET', `/projects/${projectId}/timesheet/logs${qs}`) });
  const logs = data||[];
  return (
    <div>
      {/* Month filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Month:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setOffset(0);
          }}
          className="border rounded px-3 py-1 text-sm"
        />
      </div>
      
      <div className="border rounded-lg divide-y bg-white">
        {isFetching && (
          <div className="p-3 text-right bg-gray-50">
            <span className="text-[11px] text-gray-500">Loading...</span>
          </div>
        )}
        <div className="divide-y">
          {logs.length? logs.map((l:any)=> {
            const ch = l.changes||{};
            const before = ch.before||{}; const after = ch.after||{};
            const bMin = typeof before.minutes==='number'? (before.minutes/60).toFixed(2): null;
            const aMin = typeof after.minutes==='number'? (after.minutes/60).toFixed(2): null;
            
            // Extract attendance information
            const attendanceType = ch.attendance_type;
            const workerName = ch.worker_name;
            const performedBy = ch.performed_by;
            const timeSelected = ch.time_selected;
            const timeEntered = ch.time_entered;
            const reasonText = ch.reason_text;
            const status = ch.status;
            const insideGeofence = ch.inside_geofence;
            const gpsAccuracy = ch.gps_accuracy_m;
            
            // Determine if this is an attendance log
            const isAttendanceLog = !!attendanceType;
            
            return (
              <div key={l.id} className="px-3 py-3 text-sm border-b">
                <div className="flex items-start gap-2">
                  {l.user_avatar_file_id? <img src={`/files/${l.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[11px] text-gray-500">
                        {new Date(l.timestamp).toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </div>
                      <span className="text-gray-400">·</span>
                      <div className="text-[11px] text-gray-500 font-medium">{l.user_name||''}</div>
                      {isAttendanceLog && workerName && workerName !== l.user_name && (
                        <>
                          <span className="text-gray-400">·</span>
                          <div className="text-[11px] text-blue-600 font-medium">
                            for {workerName}
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="text-gray-800 font-medium capitalize mb-2">
                      {isAttendanceLog ? `${attendanceType === 'clock-in' ? 'Clock-In' : 'Clock-Out'}` : l.action}
                    </div>
                    
                    {/* Attendance-specific information */}
                    {isAttendanceLog && (
                      <div className="mt-2 space-y-2 bg-gray-50 p-3 rounded border">
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Time Selected</div>
                            <div className="text-gray-800">
                              {timeSelected ? new Date(timeSelected).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Time Entered</div>
                            <div className="text-gray-800">
                              {timeEntered ? new Date(timeEntered).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Status</div>
                            <div className="text-gray-800">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                status === 'approved' ? 'bg-green-100 text-green-800' :
                                status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {status || '-'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Location</div>
                            <div className="text-gray-800">
                              {insideGeofence === true ? (
                                <span className="text-green-600">✓ Inside geofence</span>
                              ) : insideGeofence === false ? (
                                <span className="text-red-600">✗ Outside geofence</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                              {gpsAccuracy && (
                                <span className="text-gray-500 ml-1">({gpsAccuracy.toFixed(0)}m accuracy)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Hours worked */}
                        {(before.minutes !== undefined || after.minutes !== undefined || ch.minutes !== undefined) && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-gray-500 font-medium mb-0.5 text-[11px]">Hours Worked</div>
                            <div className="text-gray-800 text-sm font-medium">
                              {l.action === 'update' ? (
                                <>{bMin ?? '-'} → {aMin ?? '-'}h</>
                              ) : (
                                <>{ch.minutes !== undefined ? (Number(ch.minutes)/60).toFixed(2) : '-'}h</>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Reason text */}
                        {reasonText && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-gray-500 font-medium mb-1 text-[11px]">Reason</div>
                            <div className="text-gray-800 text-xs bg-white p-2 rounded border">
                              {reasonText}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Regular timesheet entry changes (non-attendance) */}
                    {!isAttendanceLog && (
                      <>
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
                            {(before.start_time || after.start_time) && (
                              <div>
                                <div className="text-gray-500">Start Time</div>
                                <div>{formatTime12h(before.start_time || null) || '-'} → {formatTime12h(after.start_time || null) || '-'}</div>
                              </div>
                            )}
                            {(before.end_time || after.end_time) && (
                              <div>
                                <div className="text-gray-500">End Time</div>
                                <div>{formatTime12h(before.end_time || null) || '-'} → {formatTime12h(after.end_time || null) || '-'}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {(l.action!=='update' && l.changes) && (
                          <div className="mt-1 text-[11px] text-gray-700">
                            {(() => {
                              // Try to format the changes in a more readable way
                              if (typeof l.changes === 'object' && l.changes !== null) {
                                const formatted: string[] = [];
                                if (l.changes.work_date) formatted.push(`Date: ${String(l.changes.work_date).slice(0,10)}`);
                                if (l.changes.minutes !== undefined) formatted.push(`Hours: ${(Number(l.changes.minutes)/60).toFixed(2)}h`);
                                if (l.changes.start_time) formatted.push(`Start: ${formatTime12h(l.changes.start_time)}`);
                                if (l.changes.end_time) formatted.push(`End: ${formatTime12h(l.changes.end_time)}`);
                                if (l.changes.notes) formatted.push(`Notes: ${l.changes.notes}`);
                                if (formatted.length > 0) {
                                  return formatted.join(' • ');
                                }
                              }
                              return JSON.stringify(l.changes);
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : <div className="p-3 text-sm text-gray-600">No changes yet</div>}
        </div>
        <div className="p-3 text-right bg-gray-50">
          <button onClick={()=>{ setOffset(o=> Math.max(0, o - limit)); refetch(); }} disabled={offset<=0} className="px-2 py-1 rounded bg-gray-100 text-sm mr-2 disabled:opacity-50">Prev</button>
          <button onClick={()=>{ setOffset(o=> o + limit); refetch(); }} className="px-2 py-1 rounded bg-gray-100 text-sm">Load more</button>
        </div>
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

function ProjectGeneralInfoCard({ projectId, proj }:{ projectId:string, proj:any }){
  const queryClient = useQueryClient();
  const [description, setDescription] = useState<string>(proj?.description || '');
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    setDescription(proj?.description || '');
  }, [proj?.description]);

  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, { description: description?.trim()? description : null });
      toast.success('Description saved');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    }catch(_e){
      toast.error('Failed to save description');
    }finally{
      setSaving(false);
    }
  }, [projectId, description]);

  const city = proj?.address_city || proj?.site_city || '—';
  const province = proj?.address_province || proj?.site_province || proj?.site_state || '—';
  const country = proj?.address_country || proj?.site_country || '—';
  const postal = proj?.address_postal_code || proj?.postal_code || proj?.site_postal_code || proj?.site_zip || '—';

  const fields = useMemo(()=>[
    { label: 'Project Name', value: proj?.name || proj?.site_name || '—' },
    { label: 'City', value: city },
    { label: 'Province / State', value: province },
    { label: 'Country', value: country },
    { label: 'Postal Code', value: postal },
  ], [proj?.name, proj?.site_name, city, province, country, postal]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-2">General Information</h4>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((item)=> (
            <div key={item.label}>
              <div className="text-xs text-gray-600">{item.label}</div>
              <div className="mt-1 text-gray-800">{item.value}</div>
            </div>
          ))}
        </div>
        <div>
          <label className="text-xs text-gray-600">Description</label>
          <textarea
            className="mt-1 w-full border rounded px-3 py-2 text-sm min-h-[120px] resize-y"
            placeholder="Add notes or general information about this project..."
            value={description}
            onChange={e=>setDescription(e.target.value)}
          />
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectContactCard({ projectId, proj, clientId, clientFiles }:{ projectId:string, proj:any, clientId?:string, clientFiles:any[] }){
  const [contactId, setContactId] = useState<string>(proj?.contact_id || '');
  const { data:contacts } = useQuery({
    queryKey:['project-contact-options', clientId||''],
    queryFn: ()=> clientId ? api<any[]>('GET', `/clients/${encodeURIComponent(String(clientId))}/contacts`) : Promise.resolve([]),
    enabled: !!clientId
  });
  useEffect(()=>{
    setContactId(proj?.contact_id || '');
  }, [proj?.contact_id]);
  const currentContact = useMemo(()=> (contacts||[]).find((c:any)=> String(c.id) === String(contactId)) || null, [contacts, contactId]);
  const photoUrl = useMemo(()=>{
    if(!contactId) return '';
    const rec = (clientFiles||[]).find((f:any)=> String(f.category||'').toLowerCase() === `contact-photo-${String(contactId)}`.toLowerCase());
    return rec ? `/files/${rec.file_object_id}/thumbnail?w=160` : '';
  }, [clientFiles, contactId]);
  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, { contact_id: contactId || null });
      toast.success('Contact updated');
    }catch(_e){
      toast.error('Failed to update contact');
    }finally{
      setSaving(false);
    }
  }, [projectId, contactId]);
  const displayName = currentContact?.name || proj?.contact_name || '—';
  const displayEmail = currentContact?.email || proj?.contact_email || '';
  const displayPhone = currentContact?.phone || proj?.contact_phone || '';
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-2">Contact</h4>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img className="w-12 h-12 rounded border object-cover" src={photoUrl} alt="Contact" />
          ) : (
            <span className="w-12 h-12 rounded bg-gray-200 inline-block" />
          )}
          <div>
            <div className="text-sm text-gray-700">{displayName}</div>
            {(displayEmail || displayPhone) ? (
              <div className="text-xs text-gray-600">
                {displayEmail}
                {displayEmail && displayPhone ? ' · ' : ''}
                {displayPhone}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No contact details</div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-600">Customer contact</label>
          <select
            className="w-full border rounded px-2 py-1.5 mt-1"
            value={contactId}
            onChange={e=>setContactId(e.target.value)}
            disabled={!contacts?.length}
          >
            <option value="">No contact</option>
            {(contacts||[]).map((c:any)=> (
              <option key={c.id} value={c.id}>{c.name || c.email || c.phone || c.id}</option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectEtaEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const [isEditing, setIsEditing] = useState(false);
  const [eta, setEta] = useState<string>((proj?.date_eta||'').slice(0,10));
  const { data:projUpdated, refetch } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<Project>('GET', `/projects/${projectId}`) });
  const queryClient = useQueryClient();
  
  useEffect(()=>{
    if(projUpdated?.date_eta) setEta((projUpdated.date_eta||'').slice(0,10));
  }, [projUpdated?.date_eta]);
  
  const canEdit = useMemo(()=>{
    if (!proj?.status_label) return true;
    const statusLabelStr = String(proj.status_label).trim();
    const statusConfig = ((settings?.project_statuses||[]) as any[]).find((s:any)=> s.label === statusLabelStr);
    if (statusLabelStr.toLowerCase() === 'estimating') return true;
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    return allowEdit === true || allowEdit === 'true' || allowEdit === 1;
  }, [proj?.status_label, settings]);
  
  if(!isEditing){
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-gray-700 flex-1">{(proj?.date_eta||'').slice(0,10)||'-'}</div>
        {canEdit && (
          <button onClick={()=>setIsEditing(true)} className="text-gray-500 hover:text-gray-700" title="Edit ETA">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="flex-1 border rounded px-2 py-1 text-sm" value={eta} onChange={e=>setEta(e.target.value)} />
      <button onClick={async()=>{
        try{
          await api('PATCH', `/projects/${projectId}`, { date_eta: eta||null });
          queryClient.invalidateQueries({ queryKey:['project', projectId] });
          toast.success('ETA updated');
          setIsEditing(false);
        }catch(_e){ toast.error('Failed to update'); }
      }} className="px-2 py-1 rounded bg-brand-red text-white text-xs">Save</button>
      <button onClick={()=>{ setIsEditing(false); setEta((proj?.date_eta||'').slice(0,10)); }} className="px-2 py-1 rounded bg-gray-100 text-xs">Cancel</button>
    </div>
  );
}

function ProjectCostsSummary({ projectId, estimates }:{ projectId:string, estimates:any[] }){
  const { data:estimateData } = useQuery({ 
    queryKey: ['estimate', estimates[0]?.id], 
    queryFn: () => estimates[0]?.id ? api<any>('GET', `/estimate/estimates/${estimates[0].id}`) : Promise.resolve(null),
    enabled: !!estimates[0]?.id,
    refetchInterval: 2000 // Refetch every 2 seconds to update in real-time
  });
  
  // Extract data from estimateData (always extract, even if empty)
  const items = estimateData?.items || [];
  const markup = estimateData?.estimate?.markup || estimateData?.markup || 0;
  const pstRate = estimateData?.pst_rate ?? 0;
  const gstRate = estimateData?.gst_rate ?? 0;
  const profitRate = estimateData?.profit_rate ?? 20; // Default to 20%
  const sectionOrder = estimateData?.section_order || [];
  
  // Parse UI state for item extras
  const itemExtrasMap = useMemo(() => {
    const notes = estimateData?.estimate?.notes || estimateData?.notes;
    if (!notes) return {};
    try {
      const uiState = JSON.parse(notes);
      return uiState.item_extras || {};
    } catch {
      return {};
    }
  }, [estimateData]);
  
  // Group items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    items.forEach((it:any) => {
      const section = it.section || 'Miscellaneous';
      if(!groups[section]) groups[section] = [];
      groups[section].push(it);
    });
    return groups;
  }, [items]);
  
  // Helper function to calculate section subtotal (same as EstimateBuilder)
  const calculateSectionSubtotal = useCallback((sectionName: string): number => {
    const sectionItems = groupedItems[sectionName] || [];
    const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(sectionName) || 
                          sectionName.startsWith('Labour Section') || 
                          sectionName.startsWith('Sub-Contractor Section') || 
                          sectionName.startsWith('Shop Section') || 
                          sectionName.startsWith('Miscellaneous Section');
    return sectionItems.reduce((sum, it) => {
      const m = itemExtrasMap[`item_${it.id}`]?.markup !== undefined && itemExtrasMap[`item_${it.id}`].markup !== null ? itemExtrasMap[`item_${it.id}`].markup : markup;
      let itemTotal = 0;
      if (!isLabourSection) {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      } else {
        if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
          const extras = itemExtrasMap[`item_${it.id}`];
          if (extras.labour_journey_type === 'contract') {
            itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
          } else {
            itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
          }
        } else {
          itemTotal = (it.quantity || 0) * (it.unit_price || 0);
        }
      }
      return sum + (itemTotal * (1 + (m/100)));
    }, 0);
  }, [groupedItems, markup, itemExtrasMap]);
  
  // Calculate specific section costs (same as EstimateBuilder)
  const totalProductsCosts = useMemo(() => sectionOrder
    .filter(section => !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) && 
                      !section.startsWith('Labour Section') && 
                      !section.startsWith('Sub-Contractor Section') && 
                      !section.startsWith('Shop Section') && 
                      !section.startsWith('Miscellaneous Section'))
    .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalLabourCosts = useMemo(() => calculateSectionSubtotal('Labour') + 
           sectionOrder
             .filter(s => s.startsWith('Labour Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalSubContractorsCosts = useMemo(() => calculateSectionSubtotal('Sub-Contractors') + 
           sectionOrder
             .filter(s => s.startsWith('Sub-Contractor Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalShopCosts = useMemo(() => calculateSectionSubtotal('Shop') + 
           sectionOrder
             .filter(s => s.startsWith('Shop Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalMiscellaneousCosts = useMemo(() => calculateSectionSubtotal('Miscellaneous') + 
           sectionOrder
             .filter(s => s.startsWith('Miscellaneous Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  // Total Direct Project Costs (sum of all specific costs)
  const totalDirectProjectCosts = useMemo(() => totalProductsCosts + totalLabourCosts + totalSubContractorsCosts + totalShopCosts + totalMiscellaneousCosts, [totalProductsCosts, totalLabourCosts, totalSubContractorsCosts, totalShopCosts, totalMiscellaneousCosts]);
  
  // Calculate total without markup for all items
  const totalWithoutMarkup = useMemo(() => items.reduce((acc, it) => {
    const m = itemExtrasMap[`item_${it.id}`]?.markup !== undefined && itemExtrasMap[`item_${it.id}`].markup !== null ? itemExtrasMap[`item_${it.id}`].markup : markup;
    let itemTotal = 0;
    const section = it.section || 'Miscellaneous';
    const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
    
    if (!isLabourSection) {
      itemTotal = (it.quantity || 0) * (it.unit_price || 0);
    } else {
      if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
        const extras = itemExtrasMap[`item_${it.id}`];
        if (extras.labour_journey_type === 'contract') {
          itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
        } else {
          itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
        }
      } else {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      }
    }
    return acc + itemTotal;
  }, 0), [items, markup, itemExtrasMap]);
  
  // Calculate total with markup for all items
  const totalWithMarkupAll = useMemo(() => items.reduce((acc, it) => {
    const m = itemExtrasMap[`item_${it.id}`]?.markup !== undefined && itemExtrasMap[`item_${it.id}`].markup !== null ? itemExtrasMap[`item_${it.id}`].markup : markup;
    let itemTotal = 0;
    const section = it.section || 'Miscellaneous';
    const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
    
    if (!isLabourSection) {
      itemTotal = (it.quantity || 0) * (it.unit_price || 0);
    } else {
      if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
        const extras = itemExtrasMap[`item_${it.id}`];
        if (extras.labour_journey_type === 'contract') {
          itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
        } else {
          itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
        }
      } else {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      }
    }
    return acc + (itemTotal * (1 + (m/100)));
  }, 0), [items, markup, itemExtrasMap]);
  
  // Sections Mark-up (difference between total with markup and total without markup)
  const sectionsMarkup = useMemo(() => totalWithMarkupAll - totalWithoutMarkup, [totalWithMarkupAll, totalWithoutMarkup]);
  
  // Calculate taxable total (only taxable items) with markup
  const taxableTotal = useMemo(() => items.reduce((acc, it) => {
    const extras = itemExtrasMap[`item_${it.id}`];
    if (extras?.taxable === false) return acc;
    const m = extras?.markup !== undefined && extras.markup !== null ? extras.markup : markup;
    let itemTotal = 0;
    const section = it.section || 'Miscellaneous';
    const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
    
    if (!isLabourSection) {
      itemTotal = (it.quantity || 0) * (it.unit_price || 0);
    } else {
      if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
        const extras = itemExtrasMap[`item_${it.id}`];
        if (extras.labour_journey_type === 'contract') {
          itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
        } else {
          itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
        }
      } else {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      }
    }
    return acc + (itemTotal * (1 + (m/100)));
  }, 0), [items, markup, itemExtrasMap]);
  
  const pst = useMemo(() => taxableTotal * (pstRate / 100), [taxableTotal, pstRate]);
  const subtotal = useMemo(() => totalDirectProjectCosts + pst, [totalDirectProjectCosts, pst]);
  const profitValue = useMemo(() => subtotal * (profitRate / 100), [subtotal, profitRate]);
  const finalTotal = useMemo(() => subtotal + profitValue, [subtotal, profitValue]);
  const gst = useMemo(() => finalTotal * (gstRate / 100), [finalTotal, gstRate]);
  const grandTotal = useMemo(() => finalTotal + gst, [finalTotal, gst]);
  
  // Calculate markup percentage (Sections Mark-up / Total Direct Project Costs * 100)
  const markupPercentage = useMemo(() => totalDirectProjectCosts > 0 ? (sectionsMarkup / totalDirectProjectCosts) * 100 : 0, [sectionsMarkup, totalDirectProjectCosts]);
  
  const summaryItems = useMemo(() => [
    { label: 'Subtotal', value: totalDirectProjectCosts },
    { label: `Markup (${markupPercentage.toFixed(1)}%)`, value: sectionsMarkup },
    { label: `PST (${pstRate}%)`, value: pst },
    { label: `Profit (${profitRate}%)`, value: profitValue },
    { label: `GST (${gstRate}%)`, value: gst },
  ], [totalDirectProjectCosts, markupPercentage, sectionsMarkup, pstRate, pst, profitRate, profitValue, gstRate, gst]);
  
  // Early return AFTER all hooks
  if(!estimateData || !estimates.length) {
    return (
      <div className="md:col-span-3 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">Costs Summary</h4>
        <div className="text-sm text-gray-600">No estimate available</div>
      </div>
    );
  }
  
  return (
    <div className="md:col-span-3 rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-3">Costs Summary</h4>
      <div className="grid md:grid-cols-5 gap-4 text-sm">
        {summaryItems.map((item, idx)=> (
          <div key={idx}>
            <div className="text-xs text-gray-600 mb-1">{item.label}</div>
            <div className="text-lg font-semibold">${item.value.toFixed(2)}</div>
          </div>
        ))}
        <div className="md:col-span-5 pt-3 border-t mt-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Grand Total</div>
            <div className="text-2xl font-bold text-brand-red">${grandTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

