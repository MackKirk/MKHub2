import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import AddressAutocomplete from '@/components/AddressAutocomplete';

type Client = { id:string, display_name?:string, name?:string, city?:string, province?:string, address_line1?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, site_address_line2?:string, site_lat?:number, site_lng?:number, site_notes?:string };

export default function ProjectNew(){
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const initialClientId = sp.get('client_id')||'';
  const initialIsBidding = sp.get('is_bidding') === 'true';

  const [clientId, setClientId] = useState<string>(initialClientId);
  const [name, setName] = useState<string>('');
  const [desc, setDesc] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('');
  const [createSite, setCreateSite] = useState<boolean>(false);
  const [siteForm, setSiteForm] = useState<any>({ site_name:'', site_address_line1:'', site_address_line2:'', site_city:'', site_province:'', site_country:'', site_postal_code:'', site_lat:null, site_lng:null, site_notes:'' });
  const setSiteField = (k:string, v:any)=> setSiteForm((s:any)=> ({ ...s, [k]: v }));
  const [step, setStep] = useState<number>(1);
  const [statusLabel, setStatusLabel] = useState<string>('');
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [estimatorId, setEstimatorId] = useState<string>('');
  const [leadId, setLeadId] = useState<string>('');
  const [contactId, setContactId] = useState<string>('');
  const [coverBlob, setCoverBlob] = useState<Blob|null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [hiddenPickerOpen, setHiddenPickerOpen] = useState<boolean>(false);
  const [isBidding, setIsBidding] = useState<boolean>(initialIsBidding);
  const [createAsProject, setCreateAsProject] = useState<boolean>(false);
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientModalOpen, setClientModalOpen] = useState<boolean>(false);
  const [showClientDropdown, setShowClientDropdown] = useState<boolean>(false);
  const nameValid = useMemo(()=> String(name||'').trim().length>0, [name]);
  const clientValid = useMemo(()=> String(clientId||'').trim().length>0, [clientId]);
  const siteValid = useMemo(()=>{
    if(!clientValid) return false;
    if(createSite){ return !!String(siteForm.site_name||siteForm.site_address_line1||'').trim(); }
    return !!String(siteId||'').trim();
  }, [clientValid, createSite, siteForm, siteId]);

  const { data:clients } = useQuery({ queryKey:['clients-mini'], queryFn: ()=> api<Client[]>('GET','/clients'), staleTime: 60_000 });
  const { data:clientSearchResults } = useQuery({ 
    queryKey:['clients-search', clientSearch], 
    queryFn: async()=>{
      if (!clientSearch.trim()) return [];
      const params = new URLSearchParams();
      params.set('q', clientSearch);
      return await api<Client[]>('GET', `/clients?${params.toString()}`);
    },
    enabled: !!clientSearch.trim() && !initialClientId
  });
  const { data:sites } = useQuery({ queryKey:['clientSites', clientId], queryFn: ()=> clientId? api<Site[]>('GET', `/clients/${encodeURIComponent(clientId)}/sites`) : Promise.resolve([]), enabled: !!clientId });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });
  const { data:contacts } = useQuery({ queryKey:['clientContacts-mini', clientId], queryFn: ()=> clientId? api<any[]>('GET', `/clients/${encodeURIComponent(clientId)}/contacts`) : Promise.resolve([]), enabled: !!clientId });
  
  const selectedClient = useMemo(() => {
    if (!clientId) return null;
    return (clients||[]).find(c => c.id === clientId);
  }, [clientId, clients]);
  
  const filteredClients = useMemo(() => {
    if (initialClientId) return [];
    if (!clientSearch.trim()) return [];
    return clientSearchResults || [];
  }, [clientSearch, clientSearchResults, initialClientId]);

  useEffect(()=>{ 
    if(initialClientId) {
      setClientId(initialClientId);
      const client = (clients||[]).find(c => c.id === initialClientId);
      if (client) {
        setClientSearch(client.display_name||client.name||client.id);
      }
    }
  }, [initialClientId, clients]);
  
  useEffect(() => {
    if (clientId && selectedClient) {
      setClientSearch(selectedClient.display_name||selectedClient.name||selectedClient.id);
      setShowClientDropdown(false);
    }
  }, [clientId, selectedClient]);
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
      // For opportunities, automatically set status to "Prospecting" if not creating as project
      const finalStatusLabel = (isBidding && !createAsProject) ? 'Prospecting' : (statusLabel || null);
      const payload:any = { name, description: desc||null, client_id: clientId, site_id: newSiteId||null, status_label: finalStatusLabel, division_ids: divisionIds, estimator_id: estimatorId||null, onsite_lead_id: leadId||null, contact_id: contactId||null, is_bidding: isBidding && !createAsProject };
      const proj:any = await api('POST','/projects', payload);
      if(coverBlob){
        try{
          const up:any = await api('POST','/files/upload',{ project_id: proj?.id||null, client_id: clientId, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: coverBlob });
          const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: coverBlob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/projects/${encodeURIComponent(String(proj?.id||''))}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
        }catch(_e){ /* silent */ }
      }
      toast.success(isBidding && !createAsProject ? 'Opportunity created' : 'Project created');
      if (isBidding && !createAsProject) {
        nav(`/opportunities/${encodeURIComponent(String(proj?.id||''))}`);
      } else {
        nav(`/projects/${encodeURIComponent(String(proj?.id||''))}`);
      }
    }catch(_e){ toast.error('Failed to create project'); }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 relative">
          <button onClick={()=> nav(-1)} className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10" title="Close">×</button>
          <div className="text-2xl font-extrabold text-white">{isBidding ? 'New Opportunity' : 'New Project'}</div>
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
            {isBidding && (
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600 flex items-center gap-2">
                  <input type="checkbox" checked={createAsProject} onChange={e=>setCreateAsProject(e.target.checked)} />
                  <span>Create as active project (skip opportunity stage)</span>
                </label>
                <div className="text-[11px] text-gray-500 mt-1 ml-6">If checked, this will be created as a full project with all features enabled. Otherwise, it will be created as an opportunity.</div>
              </div>
            )}
            <div className="md:col-span-2">
              <label className="text-xs text-gray-600">Name *</label>
              <input className={`w-full border rounded px-3 py-2 ${!nameValid? 'border-red-500':''}`} value={name} onChange={e=>setName(e.target.value)} />
              {!nameValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
            </div>
                
            <div>
              <label className="text-xs text-gray-600">Customer *</label>
              {initialClientId ? (
                <div className="relative">
                  <input 
                    className={`w-full border rounded px-3 py-2 bg-gray-50 ${!clientValid? 'border-red-500':''}`} 
                    value={selectedClient ? (selectedClient.display_name||selectedClient.name||selectedClient.id) : ''} 
                    readOnly
                    disabled
                  />
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input 
                        className={`w-full border rounded px-3 py-2 ${!clientValid? 'border-red-500':''}`} 
                        placeholder="Search customer..." 
                        value={clientSearch} 
                        onChange={e=> {
                          const value = e.target.value;
                          setClientSearch(value);
                          if (!value.trim()) {
                            setClientId('');
                            setShowClientDropdown(false);
                          } else {
                            // Se o valor não corresponde ao cliente selecionado, limpar seleção
                            if (selectedClient && value !== (selectedClient.display_name||selectedClient.name||selectedClient.id)) {
                              setClientId('');
                              setShowClientDropdown(true);
                            } else if (!selectedClient) {
                              setShowClientDropdown(true);
                            }
                          }
                        }}
                        onFocus={() => {
                          if (clientSearch.trim() && !selectedClient) {
                            setShowClientDropdown(true);
                          }
                        }}
                        onBlur={() => {
                          // Pequeno delay para permitir o clique no dropdown antes de fechar
                          setTimeout(() => {
                            setShowClientDropdown(false);
                            if (selectedClient) {
                              setClientSearch(selectedClient.display_name||selectedClient.name||selectedClient.id);
                            }
                          }, 200);
                        }}
                      />
                      {showClientDropdown && clientSearch.trim() && !selectedClient && filteredClients.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                          {filteredClients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClientId(c.id);
                                setClientSearch(c.display_name||c.name||c.id);
                                setShowClientDropdown(false);
                              }}
                              onMouseDown={(e) => {
                                // Prevenir que o onBlur feche o dropdown antes do clique
                                e.preventDefault();
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
                            >
                              <div className="font-medium">{c.display_name||c.name||c.id}</div>
                              {c.city && <div className="text-xs text-gray-500">{c.city}{c.province ? `, ${c.province}` : ''}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                      {showClientDropdown && clientSearch.trim() && !selectedClient && filteredClients.length === 0 && clientSearchResults && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg p-3 text-sm text-gray-500">
                          No customers found
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setClientModalOpen(true)}
                      className="px-3 py-2 rounded border text-gray-600 hover:bg-gray-50 flex-shrink-0"
                      title="Browse all customers"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {!clientValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
            </div>
            {!!clientId && (
              <div className="md:col-span-2">
                <label className="text-xs text-gray-600">Customer contact</label>
                <select className="w-full border rounded px-3 py-2" value={contactId} onChange={e=> setContactId(e.target.value)}>
                  <option value="">Select...</option>
                  {(contacts||[]).map((c:any)=> <option key={c.id} value={c.id}>{c.name||c.email||c.phone||c.id}</option>)}
                </select>
              </div>
            )}
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
                    <div>
                      <label className="text-xs text-gray-600">Address 1</label>
                      <AddressAutocomplete
                        value={siteForm.site_address_line1||''}
                        onChange={(value) => setSiteField('site_address_line1', value)}
                        onAddressSelect={(address) => {
                          console.log('onAddressSelect called with:', address);
                          // Update all address fields at once
                          setSiteForm((prev: any) => ({
                            ...prev,
                            site_address_line1: address.address_line1 || prev.site_address_line1,
                            site_address_line2: address.address_line2 !== undefined ? address.address_line2 : prev.site_address_line2,
                            site_city: address.city !== undefined ? address.city : prev.site_city,
                            site_province: address.province !== undefined ? address.province : prev.site_province,
                            site_country: address.country !== undefined ? address.country : prev.site_country,
                            site_postal_code: address.postal_code !== undefined ? address.postal_code : prev.site_postal_code,
                            site_lat: address.lat !== undefined ? address.lat : prev.site_lat,
                            site_lng: address.lng !== undefined ? address.lng : prev.site_lng,
                          }));
                        }}
                        placeholder="Start typing an address..."
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Address 2</label>
                      <input
                        className="w-full border rounded px-3 py-2"
                        value={siteForm.site_address_line2||''}
                        onChange={e=>setSiteField('site_address_line2', e.target.value)}
                        placeholder="Apartment, suite, unit, etc. (optional)"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Country</label>
                      <input 
                        className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                        value={siteForm.site_country||''} 
                        readOnly
                        placeholder="Auto-filled from address"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Province/State</label>
                      <input 
                        className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                        value={siteForm.site_province||''} 
                        readOnly
                        placeholder="Auto-filled from address"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">City</label>
                      <input 
                        className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                        value={siteForm.site_city||''} 
                        readOnly
                        placeholder="Auto-filled from address"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Postal code</label>
                      <input 
                        className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                        value={siteForm.site_postal_code||''} 
                        readOnly
                        placeholder="Auto-filled from address"
                      />
                    </div>
                    <div className="md:col-span-2"><label className="text-xs text-gray-600">Notes</label><textarea rows={3} className="w-full border rounded px-3 py-2" value={siteForm.site_notes||''} onChange={e=>setSiteField('site_notes', e.target.value)} /></div>
                  </div>
                )}
              </div>
            )}
            </>
            ) : (
              <>
                {!(isBidding && !createAsProject) && (
                  <div>
                    <label className="text-xs text-gray-600">Status</label>
                    <select className="w-full border rounded px-3 py-2" value={statusLabel} onChange={e=> setStatusLabel(e.target.value)}>
                      <option value="">Select...</option>
                      {(settings?.project_statuses||[]).map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
                    </select>
                  </div>
                )}
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
                {!(isBidding && !createAsProject) && (
                  <div>
                    <label className="text-xs text-gray-600">On-site lead</label>
                    <select className="w-full border rounded px-3 py-2" value={leadId} onChange={e=> setLeadId(e.target.value)}>
                      <option value="">Select...</option>
                      {(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}
                    </select>
                  </div>
                )}
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
    {clientModalOpen && (
      <ClientSelectModal
        open={clientModalOpen}
        onClose={() => setClientModalOpen(false)}
        onSelect={(client) => {
          setClientId(client.id);
          setClientSearch(client.display_name||client.name||client.id);
          setClientModalOpen(false);
        }}
      />
    )}
    </>
  );
}

function ClientSelectModal({ open, onClose, onSelect }: { open: boolean, onClose: ()=>void, onSelect: (client: Client)=>void }){
  const [q, setQ] = useState('');
  const [displayedCount, setDisplayedCount] = useState(20);
  const { data: allClients = [] } = useQuery<Client[]>({
    queryKey: ['clients-all', q],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) {
        params.set('q', q);
      }
      return await api<Client[]>('GET', `/clients?${params.toString()}`);
    },
    enabled: open,
    staleTime: 30_000
  });

  const filteredClients = useMemo(() => {
    if (!q.trim()) return allClients;
    const searchLower = q.toLowerCase();
    return allClients.filter(c => 
      (c.display_name||c.name||'').toLowerCase().includes(searchLower) ||
      (c.city||'').toLowerCase().includes(searchLower) ||
      (c.address_line1||'').toLowerCase().includes(searchLower)
    );
  }, [allClients, q]);

  const list = filteredClients.slice(0, displayedCount);
  const hasMore = filteredClients.length > displayedCount;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setDisplayedCount(20);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center">
      <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative flex-shrink-0">
          <div className="font-semibold text-lg text-white">Select Customer</div>
          <button onClick={onClose} className="ml-auto text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/20" title="Close">×</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Search Customer:</label>
            <input 
              className="w-full border rounded px-3 py-2" 
              placeholder="Type customer name, city, or address..." 
              value={q} 
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          {list.length > 0 && (
            <div className="max-h-96 overflow-auto rounded border divide-y">
              {list.map(c => (
                <button 
                  key={c.id} 
                  onClick={() => onSelect(c)} 
                  className="w-full text-left px-3 py-2 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="font-medium">{c.display_name||c.name||c.id}</div>
                  <div className="text-xs text-gray-500">
                    {[c.address_line1, c.city, c.province].filter(Boolean).join(', ') || 'No address'}
                  </div>
                </button>
              ))}
              {hasMore && (
                <button
                  onClick={() => setDisplayedCount(prev => prev + 20)}
                  className="w-full text-center px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-600 border-t">
                  Load more ({filteredClients.length - displayedCount} remaining)
                </button>
              )}
            </div>
          )}
          {q.trim() && list.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No customers found matching "{q}"
            </div>
          )}
          {!q.trim() && list.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No customers available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


