import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import GeoSelect from '@/components/GeoSelect';
import ImagePicker from '@/components/ImagePicker';

type Client = { id:string, display_name?:string, name?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, site_address_line2?:string, site_notes?:string };

export default function ProjectNew(){
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const initialClientId = sp.get('client_id')||'';

  const [clientId, setClientId] = useState<string>(initialClientId);
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [createSite, setCreateSite] = useState<boolean>(false);
  const [siteForm, setSiteForm] = useState<any>({ site_name:'', site_address_line1:'', site_address_line2:'', site_city:'', site_province:'', site_country:'', site_postal_code:'', site_notes:'' });
  const setSiteField = (k:string, v:any)=> setSiteForm((s:any)=> ({ ...s, [k]: v }));
  const [step, setStep] = useState<number>(1);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [estimatorId, setEstimatorId] = useState<string>('');
  const [leadId, setLeadId] = useState<string>('');
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState<boolean>(false);
  const nameValid = useMemo(()=> String(name||'').trim().length>0, [name]);
  const clientValid = useMemo(()=> String(clientId||'').trim().length>0, [clientId]);
  const siteValid = useMemo(()=>{
    if(!clientValid) return false;
    if(createSite){ return !!String(siteForm.site_name||siteForm.site_address_line1||'').trim(); }
    return !!String(siteId||'').trim();
  }, [clientValid, createSite, siteForm, siteId]);

  const { data:clients } = useQuery({ queryKey:['clients-mini'], queryFn: ()=> api<Client[]>('GET','/clients'), staleTime: 60_000 });
  const { data:sites } = useQuery({ queryKey:['clientSites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${encodeURIComponent(clientId)}/sites`) : Promise.resolve([]), enabled: !!clientId });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });

  useEffect(()=>{ if(initialClientId) setClientId(initialClientId); }, [initialClientId]);
  useEffect(()=>{ if(!clientId){ setSiteId(''); setCreateSite(false); } }, [clientId]);

  // ESC to close
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{ if (e.key==='Escape'){ nav(-1); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [nav]);

  const canSubmit = useMemo(()=>{
    if(!String(name||'').trim()) return false;
    if(!String(clientId||'').trim()) return false;
    if(createSite){ return !!String(siteForm.site_name||siteForm.site_address_line1||'').trim(); }
    return !!String(siteId||'').trim();
  }, [name, clientId, siteId, createSite, siteForm]);

  const submit = async()=>{
    if(!canSubmit) return;
    try{
      let newSiteId = siteId;
      if(createSite){
        const created:any = await api('POST', `/clients/${encodeURIComponent(clientId)}/sites`, siteForm);
        newSiteId = String(created?.id||'');
      }
      const payload:any = { name, code: code||null, description: desc||null, client_id: clientId, site_id: newSiteId||null, status_label: statusLabel||null, division_ids: divisionIds, estimator_id: estimatorId||null, onsite_lead_id: leadId||null };
      const proj:any = await api('POST','/projects', payload);
      if(coverBlob){
        try{
          const up:any = await api('POST','/files/upload',{ project_id: proj?.id||null, client_id: clientId, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: coverBlob });
          const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: coverBlob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/projects/${encodeURIComponent(String(proj?.id||''))}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
        }catch(_e){ /* silent */ }
      }
      toast.success('Project created');
      nav(`/projects/${encodeURIComponent(String(proj?.id||''))}`);
    }catch(_e){ toast.error('Failed to create project'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 relative">
          <button onClick={()=> nav(-1)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10" title="Close">×</button>
          <div className="text-2xl font-extrabold text-white">New Project</div>
          <div className="text-sm text-white/80 mt-1">{step===1? 'Provide basic details and site' : 'Setup options and cover'}</div>
        </div>
        <div className="overflow-y-auto">
          <div className="p-6 grid md:grid-cols-2 gap-4 items-start">
            <div className="md:col-span-2 mb-2">
              <div className="inline-flex items-center gap-2 text-xs text-gray-600">
                <span className={step===1? 'px-2 py-0.5 rounded-full bg-brand-red text-white' : 'px-2 py-0.5 rounded-full bg-gray-100'}>Step 1</span>
                <span>→</span>
                <span className={step===2? 'px-2 py-0.5 rounded-full bg-brand-red text-white' : 'px-2 py-0.5 rounded-full bg-gray-100'}>Step 2</span>
              </div>
            </div>
            {step===1 ? ( <>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Name *</label>
              <input className={`w-full border rounded px-3 py-2 ${!nameValid? 'border-red-500':''}`} value={name} onChange={e=>setName(e.target.value)} />
              {!nameValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
            </div>
            <div><label className="text-xs text-gray-600">Code</label><input className="w-full border rounded px-3 py-2" value={code} onChange={e=>setCode(e.target.value)} /></div>
            <div>
              <label className="text-xs text-gray-600">Client *</label>
              <select className={`w-full border rounded px-3 py-2 ${!clientValid? 'border-red-500':''}`} value={clientId} onChange={e=> setClientId(e.target.value)}>
                <option value="">Select...</option>
                {(clients||[]).map(c=> <option key={c.id} value={c.id}>{c.display_name||c.name||c.id}</option>)}
              </select>
              {!clientValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
            </div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Description</label><textarea className="w-full border rounded px-3 py-2" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} /></div>

            {!!clientId && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-700">Site</label>
                  <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={createSite} onChange={e=> setCreateSite(e.target.checked)} /> Create new site</label>
                </div>
                {!createSite ? (
                  <select className={`w-full border rounded px-3 py-2 ${clientValid && !siteValid? 'border-red-500':''}`} value={siteId} onChange={e=> setSiteId(e.target.value)}>
                    <option value="">Select site...</option>
                    {(sites||[]).map(s=> <option key={String(s.id)} value={String(s.id)}>{s.site_name||s.site_address_line1||String(s.id)}</option>)}
                  </select>
                  ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Site name</label>
                      <input className={`w-full border rounded px-3 py-2 ${clientValid && !siteValid? 'border-red-500':''}`} value={siteForm.site_name||''} onChange={e=>setSiteField('site_name', e.target.value)} />
                      {clientValid && !siteValid && <div className="text-[11px] text-red-600 mt-1">Provide at least a name or address</div>}
                    </div>
                    <div><label className="text-xs text-gray-600">Address 1</label><input className="w-full border rounded px-3 py-2" value={siteForm.site_address_line1||''} onChange={e=>setSiteField('site_address_line1', e.target.value)} /></div>
                    <div><label className="text-xs text-gray-600">Address 2</label><input className="w-full border rounded px-3 py-2" value={siteForm.site_address_line2||''} onChange={e=>setSiteField('site_address_line2', e.target.value)} /></div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-600">Location</label>
                      <div className="mt-1">
                        <GeoSelect country={siteForm.site_country||''} state={siteForm.site_province||''} city={siteForm.site_city||''} onChange={(v)=>{
                          if('country' in v) setSiteField('site_country', v.country||'');
                          if('state' in v) setSiteField('site_province', v.state||'');
                          if('city' in v) setSiteField('site_city', v.city||'');
                        }} labels={{ country:'Country', state:'Province/State', city:'City' }} />
                      </div>
                    </div>
                    <div><label className="text-xs text-gray-600">Postal code</label><input className="w-full border rounded px-3 py-2" value={siteForm.site_postal_code||''} onChange={e=>setSiteField('site_postal_code', e.target.value)} /></div>
                    <div className="md:col-span-2"><label className="text-xs text-gray-600">Notes</label><textarea rows={3} className="w-full border rounded px-3 py-2" value={siteForm.site_notes||''} onChange={e=>setSiteField('site_notes', e.target.value)} /></div>
                  </div>
                )}
              </div>
            )}
            </>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-600">Status</label>
                  <select className="w-full border rounded px-3 py-2" value={statusLabel} onChange={e=> setStatusLabel(e.target.value)}>
                    <option value="">Select...</option>
                    {(settings?.project_statuses||[]).map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Divisions</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {(settings?.divisions||[]).map((d:any)=>{
                      const id = String(d.id||d.label||d.value);
                      const selected = divisionIds.includes(id);
                      const bg = d.meta?.color || '#eef2f7';
                      const ab = d.meta?.abbr || d.label || id;
                      return (
                        <button key={id} onClick={()=> setDivisionIds(prev=> prev.includes(id)? prev.filter(x=>x!==id) : [...prev, id])} className={`px-2 py-1 rounded-full border text-xs ${selected? 'ring-2 ring-brand-red':''}`} style={{ backgroundColor: bg }}>{ab}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Estimator</label>
                  <select className="w-full border rounded px-3 py-2" value={estimatorId} onChange={e=> setEstimatorId(e.target.value)}>
                    <option value="">Select...</option>
                    {(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">On-site lead</label>
                  <select className="w-full border rounded px-3 py-2" value={leadId} onChange={e=> setLeadId(e.target.value)}>
                    <option value="">Select...</option>
                    {(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Cover <span className="opacity-60">(optional)</span></label>
                  <div className="mt-1 flex items-center gap-3">
                    <button onClick={()=> setHiddenPickerOpen(true)} className="px-3 py-2 rounded bg-black text-white">Select Cover</button>
                    {coverPreview && <img src={coverPreview} className="w-20 h-20 rounded border object-cover" />}
                    {coverPreview && <button onClick={()=>{ setCoverBlob(null); setCoverPreview(''); }} className="px-3 py-2 rounded bg-gray-100">Skip cover</button>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-between gap-2">
          <div className="text-[12px] text-gray-600">{step===1? 'Step 1 of 2' : 'Step 2 of 2'}</div>
          <div className="flex items-center gap-2">
            <button onClick={()=> nav(-1)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
            {step===1 ? (
              <button disabled={!canSubmit} onClick={()=> setStep(2)} className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50">Next</button>
            ) : (
              <>
                <button onClick={()=> setStep(1)} className="px-4 py-2 rounded bg-gray-100">Back</button>
                <button onClick={submit} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    {hiddenPickerOpen && (
      <ImagePicker isOpen={true} onClose={()=> setHiddenPickerOpen(false)} clientId={String(clientId||'')} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
        try{ setCoverBlob(blob); setCoverPreview(URL.createObjectURL(blob)); }catch(_e){} finally{ setHiddenPickerOpen(false); }
      }} />
    )}
  );
}


