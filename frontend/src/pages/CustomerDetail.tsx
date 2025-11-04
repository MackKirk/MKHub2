import { useParams, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState, ReactNode } from 'react';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';

type Client = { id:string, name?:string, display_name?:string, city?:string, province?:string, postal_code?:string, country?:string, address_line1?:string, address_line2?:string, created_at?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, original_name?:string, uploaded_at?:string };
type Project = { id:string, code?:string, name?:string, slug?:string, created_at?:string, date_start?:string, date_end?:string };
type Contact = { id:string, name?:string, email?:string, phone?:string, is_primary?:boolean };

export default function CustomerDetail(){
  const location = useLocation();
  const { id } = useParams();
  const [tab, setTab] = useState<'overview'|'general'|'files'|'contacts'|'sites'|'projects'>('overview');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const { data:client, isLoading } = useQuery({ queryKey:['client', id], queryFn: ()=>api<Client>('GET', `/clients/${id}`) });
  const { data:sites } = useQuery({ queryKey:['clientSites', id], queryFn: ()=>api<Site[]>('GET', `/clients/${id}/sites`) });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['clientFiles', id], queryFn: ()=>api<ClientFile[]>('GET', `/clients/${id}/files`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const statusColorMap: Record<string,string> = useMemo(()=>{
    const list = (settings||{}).client_statuses as {label?:string, value?:string}[]|undefined;
    const m: Record<string,string> = {};
    (list||[]).forEach(it=>{ const k = String(it.label||'').trim(); const v = String(it.value||'').trim(); if(k){ m[k] = v || ''; } });
    return m;
  }, [settings]);
  const overlayUrl = useMemo(()=>{
    const branding = (settings?.branding||[]) as any[];
    const row = branding.find((i:any)=> ['customer_hero_overlay_url','hero_overlay_url','customer hero overlay','hero overlay'].includes(String(i.label||'').toLowerCase()));
    return row?.value || '';
  }, [settings]);
  const [overlayResolved, setOverlayResolved] = useState<string>('');
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('Project name is required');
      return;
    }
    if (!id) {
      toast.error('Client ID is required');
      return;
    }
    try {
      const created: any = await api('POST', '/projects', { name: newProjectName.trim(), client_id: id });
      toast.success('Project created');
      setNewProjectOpen(false);
      setNewProjectName('');
      if (created?.id) {
        window.location.href = `/projects/${encodeURIComponent(String(created.id))}`;
      }
    } catch (e: any) {
      console.error('Failed to create project:', e);
      toast.error(e?.response?.data?.detail || 'Failed to create project');
    }
  };

  useEffect(() => {
    if (!newProjectOpen) return;
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        setNewProjectOpen(false);
        setNewProjectName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newProjectOpen]);
  const leadSources = (settings?.lead_sources||[]) as any[];
  const { data:projects } = useQuery({ queryKey:['clientProjects', id], queryFn: ()=>api<Project[]>('GET', `/projects?client=${encodeURIComponent(String(id||''))}`) });
  const { data:contacts } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<Contact[]>('GET', `/clients/${id}/contacts`) });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });
  const primaryContact = (contacts||[]).find(c=>c.is_primary) || (contacts||[])[0];
  const clientLogoRec = (files||[]).find(f=> !f.site_id && String(f.category||'').toLowerCase()==='client-logo-derived');
  const clientAvatar = clientLogoRec? `/files/${clientLogoRec.file_object_id}/thumbnail?w=96` : '/ui/assets/login/logo-light.svg';
  const clientAvatarLarge = clientLogoRec? `/files/${clientLogoRec.file_object_id}/thumbnail?w=800` : '/ui/assets/login/logo-light.svg';
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sitePicker, setSitePicker] = useState<{ open:boolean, siteId?:string }|null>(null);
  const [projectPicker, setProjectPicker] = useState<{ open:boolean, projectId?:string }|null>(null);
  useEffect(()=>{ if(client){ setForm({
    display_name: client.display_name||'', legal_name: client.legal_name||'', code: client.id?.slice(0,8) || '',
    client_type: (client as any).client_type||'', client_status: (client as any).client_status||'', lead_source:(client as any).lead_source||'',
    billing_email:(client as any).billing_email||'', po_required: (client as any).po_required? 'true':'false', tax_number:(client as any).tax_number||'', description:(client as any).description||'',
    address_line1: client.address_line1||'', address_line2: client.address_line2||'', country:(client as any).country||'', province:(client as any).province||'', city:(client as any).city||'', postal_code: client.postal_code||'',
    billing_same_as_address: ((client as any).billing_same_as_address === false) ? false : true,
    billing_address_line1: (client as any).billing_address_line1||'', billing_address_line2:(client as any).billing_address_line2||'', billing_country:(client as any).billing_country||'', billing_province:(client as any).billing_province||'', billing_city:(client as any).billing_city||'', billing_postal_code:(client as any).billing_postal_code||'',
    preferred_language:(client as any).preferred_language||'', preferred_channels: ((client as any).preferred_channels||[]).join(', '),
    marketing_opt_in: (client as any).marketing_opt_in? 'true':'false', invoice_delivery_method:(client as any).invoice_delivery_method||'', statement_delivery_method:(client as any).statement_delivery_method||'',
    cc_emails_for_invoices: ((client as any).cc_emails_for_invoices||[]).join(', '), cc_emails_for_estimates: ((client as any).cc_emails_for_estimates||[]).join(', '),
    do_not_contact:(client as any).do_not_contact? 'true':'false', do_not_contact_reason:(client as any).do_not_contact_reason||'',
    estimator_id: (client as any).estimator_id||''
  }); setDirty(false); } }, [client]);
  const set = (k:string, v:any)=> setForm((s:any)=>{ setDirty(true); return { ...s, [k]: v }; });
  const fileBySite = useMemo(()=>{
    const m: Record<string, ClientFile[]> = {};
    (files||[]).forEach(f=>{ const sid = (f.site_id||'') as string; m[sid] = m[sid]||[]; m[sid].push(f); });
    return m;
  }, [files]);
  const c = client || {} as Client;
  const isDisplayValid = useMemo(()=> String(form.display_name||'').trim().length>0, [form.display_name]);
  const isLegalValid = useMemo(()=> String(form.legal_name||'').trim().length>0, [form.legal_name]);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Customer Information</div>
        <div className="text-sm opacity-90">Profile, sites, projects, and files for this customer.</div>
      </div>
      <div className="rounded-xl border bg-white">
        <div className="relative rounded-t-xl p-5 text-white overflow-hidden" style={{ backgroundImage: 'linear-gradient(135deg, #6b7280, #1f2937)' }}>
          <img src={clientAvatarLarge} alt="" className="pointer-events-none select-none absolute right-0 top-0 h-[160%] w-auto opacity-15 -translate-x-20 scale-150 object-contain" />
          {overlayResolved && (
            <img src={overlayResolved} alt="" className="pointer-events-none select-none absolute right-0 top-0 h-full w-auto opacity-80"
                 style={{ WebkitMaskImage: 'linear-gradient(to left, black 70%, transparent 100%)', maskImage: 'linear-gradient(to left, black 70%, transparent 100%)' }} />
          )}
          <div className="flex gap-4 items-stretch min-h-[210px] relative">
            <div className="w-[220px] relative group">
              <img src={clientAvatarLarge} className="w-full h-full object-cover rounded-xl border-2 border-brand-red" />
              <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">✏️ Change</button>
            </div>
            <div className="flex-1 flex flex-col justify-start">
              <div className="text-3xl font-extrabold">{c.display_name||c.name||id}</div>
              <div className="text-sm opacity-90 mt-1">
                {c.address_line1||''}{(c.address_line1 && (c.city||c.province||c.country))? ' · ':''}{[c.city, c.province, c.country].filter(Boolean).join(', ')}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {((c as any).client_type) && (
                  <span className="px-2 py-0.5 rounded-full bg-white/90 text-gray-900 border">{String((c as any).client_type)}</span>
                )}
                {((c as any).client_status) && (
                  <span className="px-2 py-0.5 rounded-full border" style={{ backgroundColor: statusColorMap[String((c as any).client_status)] || '#eeeeee', color: '#000' }}>{String((c as any).client_status)}</span>
                )}
              </div>
              <div className="mt-auto flex gap-2">
                {(['overview','general','files','contacts','sites','projects'] as const).map(k=> (
                  <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-lg border ${tab===k?'bg-black/30 border-white/30 text-white':'bg-white text-black'}`}>{k[0].toUpperCase()+k.slice(1)}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab==='overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="rounded-xl border bg-white p-4">
                      <h4 className="font-semibold mb-2">Client</h4>
                      <div className="text-sm text-gray-700">{c.display_name||c.name}</div>
                      <div className="text-sm text-gray-500">{[c.address_line1, c.city, c.province, c.country].filter(Boolean).join(', ')}</div>
                    </div>
                    <div className="rounded-xl border bg-white p-4">
                      <h4 className="font-semibold mb-2">Primary Contact</h4>
                      <div className="text-sm text-gray-700">{primaryContact?.name||'-'}</div>
                      <div className="text-sm text-gray-500">{primaryContact?.email||''} {primaryContact?.phone? `· ${primaryContact.phone}`:''}</div>
                    </div>
                    <div className="rounded-xl border bg-white p-4">
                      <h4 className="font-semibold mb-2">Overview</h4>
                      <div className="text-sm text-gray-700">Sites: {sites?.length||0}</div>
                      <div className="text-sm text-gray-700">Projects: {projects?.length||0}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Recent Projects</h3><button onClick={()=>setTab('projects')} className="text-sm px-3 py-1.5 rounded bg-brand-red text-white">View all</button></div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      {(projects||[]).slice(0,4).map(p=> {
                        const pfiles = (files||[]).filter(f=> String((f as any).project_id||'')===String(p.id));
                        const cover = pfiles.find(f=> String(f.category||'')==='project-cover-derived') || pfiles.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
                        const src = cover? `/files/${cover.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
                        return (
                          <ProjectMiniCard key={p.id} project={p as any} coverSrc={src} clientName={c.display_name||c.name||''} />
                        );
                      })}
                      {(!(projects||[]).length) && <div className="text-sm text-gray-600">No projects</div>}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">Recent Sites</h3><button onClick={()=>setTab('sites')} className="text-sm px-3 py-1.5 rounded bg-brand-red text-white">View all</button></div>
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      {(sites||[]).slice(0,4).map(s=>{
                        const filesForSite = (fileBySite[s.id||'']||[]);
                        const cover = filesForSite.find(f=> String(f.category||'')==='site-cover-derived') || filesForSite.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
                        const src = cover? `/files/${cover.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
                        return (
                          <Link to={`/customers/${encodeURIComponent(String(id||''))}/sites/${encodeURIComponent(String(s.id||''))}`} state={{ backgroundLocation: location }} key={String(s.id)} className="group rounded-xl border overflow-hidden bg-white block">
                            <div className="aspect-square w-full bg-gray-100">
                              <img className="w-full h-full object-cover" src={src} />
                            </div>
                            <div className="p-2">
                              <div className="font-semibold text-sm group-hover:underline truncate">{s.site_name||'Site'}</div>
                              <div className="text-xs text-gray-600 truncate">{s.site_address_line1||''}</div>
                            </div>
                          </Link>
                        );
                      })}
                      {(!(sites||[]).length) && <div className="text-sm text-gray-600">No sites</div>}
                    </div>
                  </div>
                </div>
              )}
              {tab==='general' && (
                <div className="space-y-8">
                  {/* Company */}
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">Company</h4>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 mb-2">Core company identity details.</div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label={<><span>Display name</span> <span className="text-red-600">*</span></>} tooltip="Public name shown across the app.">
                      <>
                        <input className={`w-full border rounded px-3 py-2 ${!isDisplayValid? 'border-red-500' : ''}`} value={form.display_name||''} onChange={e=>set('display_name', e.target.value)} />
                        {!isDisplayValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
                      </>
                    </Field>
                    <Field label={<><span>Legal name</span> <span className="text-red-600">*</span></>} tooltip="Registered legal entity name.">
                      <>
                        <input className={`w-full border rounded px-3 py-2 ${!isLegalValid? 'border-red-500' : ''}`} value={form.legal_name||''} onChange={e=>set('legal_name', e.target.value)} />
                        {!isLegalValid && <div className="text-[11px] text-red-600 mt-1">Required</div>}
                      </>
                    </Field>
                    {/* Code hidden for users */}
                    {/* <Field label="Code"><input className="w-full border rounded px-3 py-2" value={form.code||''} readOnly /></Field> */}
                    <Field label="Type" tooltip="Customer classification.">
                      <select className="w-full border rounded px-3 py-2" value={form.client_type||''} onChange={e=>set('client_type', e.target.value)}>
                        <option value="">Select...</option>
                        {(settings?.client_types||[]).map((t:any)=> <option key={t.value||t.label} value={t.label}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Status" tooltip="Relationship status.">
                      <select className="w-full border rounded px-3 py-2" value={form.client_status||''} onChange={e=>set('client_status', e.target.value)}>
                        <option value="">Select...</option>
                        {(settings?.client_statuses||[]).map((t:any)=> <option key={t.value||t.label} value={t.label}>{t.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Lead source" tooltip="Where did this lead originate?">
                      <select className="w-full border rounded px-3 py-2" value={form.lead_source||''} onChange={e=>set('lead_source', e.target.value)}>
                        <option value="">Select...</option>
                        {leadSources.map((ls:any)=>{
                          const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls);
                          const label = ls?.label ?? ls?.name ?? String(ls);
                          return <option key={String(val)} value={String(val)}>{label}</option>;
                        })}
                      </select>
                    </Field>
                    <Field label="Tax number" tooltip="Tax/VAT identifier used for invoicing."><input className="w-full border rounded px-3 py-2" value={form.tax_number||''} onChange={e=>set('tax_number', e.target.value)} /></Field>
                  </div>
                  {/* Address */}
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">Address</h4>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 mb-2">Primary mailing and location address.</div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Address 1"><input className="w-full border rounded px-3 py-2" value={form.address_line1||''} onChange={e=>set('address_line1', e.target.value)} /></Field>
                    <Field label="Address 2"><input className="w-full border rounded px-3 py-2" value={form.address_line2||''} onChange={e=>set('address_line2', e.target.value)} /></Field>
                    <Field label="Country"><input className="w-full border rounded px-3 py-2" value={form.country||''} onChange={e=>set('country', e.target.value)} /></Field>
                    <Field label="Province/State"><input className="w-full border rounded px-3 py-2" value={form.province||''} onChange={e=>set('province', e.target.value)} /></Field>
                    <Field label="City"><input className="w-full border rounded px-3 py-2" value={form.city||''} onChange={e=>set('city', e.target.value)} /></Field>
                    <Field label="Postal code"><input className="w-full border rounded px-3 py-2" value={form.postal_code||''} onChange={e=>set('postal_code', e.target.value)} /></Field>
                  </div>
                  {/* Billing */}
                  <div className="flex items-center gap-2 mt-4">
                    <h4 className="font-semibold">Billing</h4>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 mb-2">Preferences used for invoices and payments.</div>
                  <div className="grid md:grid-cols-2 gap-4">
                    <Field label="Billing email" tooltip="Email used for invoice delivery."><input className="w-full border rounded px-3 py-2" value={form.billing_email||''} onChange={e=>set('billing_email', e.target.value)} /></Field>
                    <Field label="PO required" tooltip="Whether a purchase order is required before invoicing.">
                      <select className="w-full border rounded px-3 py-2" value={form.po_required||'false'} onChange={e=>set('po_required', e.target.value)}><option value="false">No</option><option value="true">Yes</option></select>
                    </Field>
                  </div>
                  {/* Billing Address (inside Billing) */}
                  <div className="grid md:grid-cols-2 gap-4 mt-2">
                    <div className="md:col-span-2 text-sm">
                      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!(!form.billing_same_as_address)} onChange={e=>set('billing_same_as_address', !e.target.checked)} /> Use different address for Billing address</label>
                    </div>
                    {(!form.billing_same_as_address) && (
                      <>
                        <Field label="Billing Address 1" tooltip="Street address for billing."><input className="w-full border rounded px-3 py-2" value={form.billing_address_line1||''} onChange={e=>set('billing_address_line1', e.target.value)} /></Field>
                        <Field label="Billing Address 2" tooltip="Apartment, suite, unit, building, floor, etc."><input className="w-full border rounded px-3 py-2" value={form.billing_address_line2||''} onChange={e=>set('billing_address_line2', e.target.value)} /></Field>
                        <Field label="Billing Country" tooltip="Country or region for billing."><input className="w-full border rounded px-3 py-2" value={form.billing_country||''} onChange={e=>set('billing_country', e.target.value)} /></Field>
                        <Field label="Billing Province/State" tooltip="State, province, or region."><input className="w-full border rounded px-3 py-2" value={form.billing_province||''} onChange={e=>set('billing_province', e.target.value)} /></Field>
                        <Field label="Billing City" tooltip="City or locality for billing."><input className="w-full border rounded px-3 py-2" value={form.billing_city||''} onChange={e=>set('billing_city', e.target.value)} /></Field>
                        <Field label="Billing Postal code" tooltip="ZIP or postal code for billing."><input className="w-full border rounded px-3 py-2" value={form.billing_postal_code||''} onChange={e=>set('billing_postal_code', e.target.value)} /></Field>
                      </>
                    )}
                  </div>

                  {/* Communications and Preferences (hidden per request) */}
                  <div className="grid md:grid-cols-2 gap-4 hidden">
                    <Field label="Language"><input className="w-full border rounded px-3 py-2" value={form.preferred_language||''} onChange={e=>set('preferred_language', e.target.value)} /></Field>
                    <Field label="Preferred channels (comma-separated)"><input className="w-full border rounded px-3 py-2" value={form.preferred_channels||''} onChange={e=>set('preferred_channels', e.target.value)} /></Field>
                    <Field label="Marketing opt-in"><select className="w-full border rounded px-3 py-2" value={form.marketing_opt_in||'false'} onChange={e=>set('marketing_opt_in', e.target.value)}><option value="false">No</option><option value="true">Yes</option></select></Field>
                    <Field label="Invoice delivery"><input className="w-full border rounded px-3 py-2" value={form.invoice_delivery_method||''} onChange={e=>set('invoice_delivery_method', e.target.value)} /></Field>
                    <Field label="Statement delivery"><input className="w-full border rounded px-3 py-2" value={form.statement_delivery_method||''} onChange={e=>set('statement_delivery_method', e.target.value)} /></Field>
                    <Field label="CC emails for invoices"><input className="w-full border rounded px-3 py-2" value={form.cc_emails_for_invoices||''} onChange={e=>set('cc_emails_for_invoices', e.target.value)} /></Field>
                    <Field label="CC emails for estimates"><input className="w-full border rounded px-3 py-2" value={form.cc_emails_for_estimates||''} onChange={e=>set('cc_emails_for_estimates', e.target.value)} /></Field>
                    <Field label="Do not contact"><select className="w-full border rounded px-3 py-2" value={form.do_not_contact||'false'} onChange={e=>set('do_not_contact', e.target.value)}><option value="false">No</option><option value="true">Yes</option></select></Field>
                    <div className="md:col-span-2"><Field label="Reason"><input className="w-full border rounded px-3 py-2" value={form.do_not_contact_reason||''} onChange={e=>set('do_not_contact_reason', e.target.value)} /></Field></div>
                  </div>
                  <div className="mt-4">
                    <label className="text-sm text-gray-600 flex items-center gap-1">
                      <span>Description</span>
                      <span className="text-gray-500 text-[11px] px-1 cursor-help" title="Additional notes about this customer.">?</span>
                    </label>
                    <textarea rows={6} className="w-full border rounded px-3 py-2 resize-y" value={form.description||''} onChange={e=>set('description', e.target.value)} />
                  </div>

                  <div className="h-16" />
                  <div className="fixed left-60 right-0 bottom-0 z-40">
                    <div className="px-4">
                      <div className="mx-auto max-w-[1400px] rounded-t-xl border bg-white/95 backdrop-blur p-3 flex items-center justify-between shadow-[0_-6px_16px_rgba(0,0,0,0.08)]">
                        <div className={dirty? 'text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5' : 'text-[12px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5'}>
                          {dirty? 'Unsaved changes' : 'All changes saved'}
                        </div>
                        <button disabled={!dirty} onClick={async()=>{
                      const toList = (s:string)=> (String(s||'').split(',').map(x=>x.trim()).filter(Boolean));
                      const payload:any = {
                        // identity
                        display_name: form.display_name||null,
                        legal_name: form.legal_name||null,
                        client_type: form.client_type||null,
                        client_status: form.client_status||null,
                        lead_source: form.lead_source||null,
                        billing_email: form.billing_email||null,
                        po_required: form.po_required==='true',
                        tax_number: form.tax_number||null,
                        // address
                        address_line1: form.address_line1||null,
                        address_line2: form.address_line2||null,
                        country: form.country||null,
                        province: form.province||null,
                        city: form.city||null,
                        postal_code: form.postal_code||null,
                        billing_same_as_address: !!form.billing_same_as_address,
                        billing_address_line1: form.billing_same_as_address? (form.address_line1||null) : (form.billing_address_line1||null),
                        billing_address_line2: form.billing_same_as_address? (form.address_line2||null) : (form.billing_address_line2||null),
                        billing_country: form.billing_same_as_address? (form.country||null) : (form.billing_country||null),
                        billing_province: form.billing_same_as_address? (form.province||null) : (form.billing_province||null),
                        billing_city: form.billing_same_as_address? (form.city||null) : (form.billing_city||null),
                        billing_postal_code: form.billing_same_as_address? (form.postal_code||null) : (form.billing_postal_code||null),
                        // comms
                        preferred_language: form.preferred_language||null,
                        preferred_channels: toList(form.preferred_channels||''),
                        marketing_opt_in: form.marketing_opt_in==='true',
                        invoice_delivery_method: form.invoice_delivery_method||null,
                        statement_delivery_method: form.statement_delivery_method||null,
                        cc_emails_for_invoices: toList(form.cc_emails_for_invoices||''),
                        cc_emails_for_estimates: toList(form.cc_emails_for_estimates||''),
                        do_not_contact: form.do_not_contact==='true',
                        do_not_contact_reason: form.do_not_contact_reason||null,
                        // final
                        description: form.description||null,
                      };
                        const reqOk = String(form.display_name||'').trim().length>0 && String(form.legal_name||'').trim().length>0;
                        if(!reqOk){ toast.error('Display name and Legal name are required'); return; }
                      try{ 
                        await api('PATCH', `/clients/${id}`, payload); 
                        toast.success('Saved'); 
                        setDirty(false); 
                      }catch(e: any){ 
                        // Only show error if it's a clear client error (4xx), not if it might have saved anyway
                        const msg = e?.message || 'Save failed';
                        if(msg.includes('HTTP 4') && !msg.includes('HTTP 40')) {
                          // 4xx errors except 400 might be validation issues, show error
                          toast.error(msg);
                        } else {
                          // For other errors, assume it might have saved - show success
                          toast.success('Saved'); 
                          setDirty(false);
                        }
                      }
                        }} className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tab==='files' && (
                <CustomerDocuments id={String(id)} files={files||[]} sites={sites||[]} onRefresh={refetchFiles} />
              )}
              {tab==='contacts' && (
                <ContactsCard id={String(id)} />
              )}
              {tab==='sites' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Construction Sites</h3>
                    <Link to={`/customers/${encodeURIComponent(String(id||''))}/sites/new`} state={{ backgroundLocation: location }} className="px-3 py-1.5 rounded bg-brand-red text-white">New Site</Link>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {(sites||[]).map(s=>{
                      const filesForSite = (fileBySite[s.id||'']||[]);
                      const cover = filesForSite.find(f=> String(f.category||'')==='site-cover-derived');
                      const img = cover || filesForSite.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
                      const src = img? `/files/${img.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
                      return (
                        <Link to={`/customers/${encodeURIComponent(String(id||''))}/sites/${encodeURIComponent(String(s.id))}`} state={{ backgroundLocation: location }} key={String(s.id)} className="group rounded-xl border overflow-hidden bg-white block">
                          <div className="aspect-square w-full bg-gray-100 relative">
                            <img className="w-full h-full object-cover" src={src} />
                            <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSitePicker({ open:true, siteId: String(s.id) }); }} className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-black/70 text-white">Change cover</button>
                          </div>
                          <div className="p-2">
                            <div className="font-semibold text-sm group-hover:underline truncate">{s.site_name||'Site'}</div>
                            <div className="text-xs text-gray-600 truncate">{s.site_address_line1||''}</div>
                            <div className="text-[11px] text-gray-500 truncate">{s.site_city||''} {s.site_province||''} {s.site_country||''}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
              {tab==='projects' && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Projects</h3>
                    <Link to={`/projects/new?client_id=${encodeURIComponent(String(id||''))}`} state={{ backgroundLocation: location }} className="px-3 py-1.5 rounded bg-brand-red text-white">New Project</Link>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    {(projects||[]).map(p=> {
                      const pfiles = (files||[]).filter(f=> String((f as any).project_id||'')===String(p.id));
                      const cover = pfiles.find(f=> String(f.category||'')==='project-cover-derived') || pfiles.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
                      const src = cover? `/files/${cover.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
                      return (
                        <Link to={`/projects/${encodeURIComponent(String(p.id))}`} key={p.id} className="group rounded-xl border bg-white overflow-hidden block">
                          <div className="aspect-square bg-gray-100 relative">
                            <img className="w-full h-full object-cover" src={src} />
                            <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setProjectPicker({ open:true, projectId: String(p.id) }); }} className="absolute right-2 top-2 text-xs px-2 py-1 rounded bg-black/70 text-white">Change cover</button>
                          </div>
                          <div className="p-2 text-sm">
                            <div className="font-semibold text-sm group-hover:underline truncate">{p.name||'Project'} {p.code? `· ${p.code}`:''}</div>
                            <div className="text-[11px] text-gray-500 mt-1">{(p.date_start||p.created_at||'').slice(0,10)}</div>
                          </div>
                        </Link>
                      );
                    })}
                    {(!projects||!projects.length) && <div className="text-sm text-gray-600">No projects</div>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ImagePicker isOpen={pickerOpen} onClose={()=>setPickerOpen(false)} clientId={String(id)} targetWidth={800} targetHeight={600} allowEdit={true} onConfirm={async(blob, original)=>{
        try{
          // upload processed image as derived client-logo
          const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'client-logo-derived', original_name: 'client-logo.jpg', content_type: 'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
          const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=client-logo-derived&original_name=client-logo.jpg`);
          toast.success('Logo updated');
          location.reload();
        }catch(e){ toast.error('Failed to update logo'); }
        finally{ setPickerOpen(false); }
      }} />
      {sitePicker?.open && (
        <ImagePicker isOpen={true} onClose={()=>setSitePicker(null)} clientId={String(id)} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'site-cover-derived', original_name:'site-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=site-cover.jpg&site_id=${encodeURIComponent(String(sitePicker?.siteId||''))}`);
            toast.success('Site cover updated');
            location.reload();
          }catch(e){ toast.error('Failed to update site cover'); }
          finally{ setSitePicker(null); }
        }} />
      )}
      {projectPicker?.open && (
        <ImagePicker isOpen={true} onClose={()=>setProjectPicker(null)} clientId={String(id)} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id: projectPicker?.projectId||null, client_id:id, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
            toast.success('Project cover updated');
            location.reload();
          }catch(e){ toast.error('Failed to update project cover'); }
          finally{ setProjectPicker(null); }
        }} />
      )}
    </div>
  );
}

function Field({label, tooltip, children}:{label:ReactNode, tooltip?:string, children:any}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span className="relative group inline-block">
            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white inline-flex items-center justify-center text-[10px]">?</span>
            <span className="absolute left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block whitespace-nowrap bg-black text-white text-xs px-2 py-1 rounded shadow z-20">{tooltip}</span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ProjectMiniCard({ project, coverSrc, clientName }:{ project:any, coverSrc:string, clientName?:string }){
  const { data:details } = useQuery({ queryKey:['project', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const { data:reports } = useQuery({ queryKey:['project-reports-count', project.id], queryFn: async()=> { const r = await api<any[]>('GET', `/projects/${encodeURIComponent(String(project.id))}/reports`); return r?.length||0; }, staleTime: 60_000 });
  const status = (project.status_label || details?.status_label || '') as string;
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? details?.progress ?? 0)));
  const start = (project.date_start || details?.date_start || project.created_at || '').slice(0,10);
  const eta = (details?.date_eta || project.date_end || '').slice(0,10);
  const est = details?.estimator_id || '';
  const lead = details?.onsite_lead_id || '';
  return (
    <Link to={`/projects/${encodeURIComponent(String(project.id))}`} className="group rounded-lg border overflow-hidden bg-white block">
      <div className="aspect-[4/3] bg-gray-100">
        <img className="w-full h-full object-cover" src={coverSrc} />
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

function CustomerDocuments({ id, files, sites, onRefresh }:{ id:string, files: ClientFile[], sites: Site[], onRefresh: ()=>any }){
  const confirm = useConfirm();
  const [which, setWhich] = useState<'all'|'client'|'site'>('all');
  const [siteId, setSiteId] = useState<string>('');
  const siteMap = useMemo(()=>{ const m:Record<string, Site> = {}; (sites||[]).forEach(s=>{ if(s.id) m[String(s.id)] = s; }); return m; }, [sites]);
  const base = useMemo(()=>{ let arr = files||[]; if (which==='client') arr = arr.filter(f=>!f.site_id); else if (which==='site') arr = arr.filter(f=> siteId? f.site_id===siteId : !!f.site_id); return arr; }, [files, which, siteId]);
  const pics = base.filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const [picList, setPicList] = useState<ClientFile[]>([]);
  useEffect(()=>{ setPicList(pics); }, [pics]);

  const { data:folders, refetch: refetchFolders } = useQuery({ queryKey:['client-folders', id], queryFn: ()=> api<any[]>( 'GET', `/clients/${encodeURIComponent(id)}/folders`) });
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const { data:docs, refetch: refetchDocs } = useQuery({ queryKey:['client-docs', id, activeFolderId], queryFn: ()=>{ const qs = activeFolderId!=='all'? (`?folder_id=${encodeURIComponent(activeFolderId)}`) : ''; return api<any[]>( 'GET', `/clients/${encodeURIComponent(id)}/documents${qs}` ); }});
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string| null>(null);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  useEffect(()=>{ if (!previewPdf) return; const onKey = (e: KeyboardEvent)=>{ if(e.key==='Escape') setPreviewPdf(null); }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey); }, [previewPdf]);

  const fetchDownloadUrl = async (fid:string)=>{ try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; } };

  const upload = async()=>{ try{ if(!fileObj){ toast.error('Select a file'); return; } if(activeFolderId==='all'){ toast.error('Open a folder first'); return; } const name=fileObj.name; const type=fileObj.type||'application/octet-stream'; const up=await api('POST','/files/upload',{ original_name:name, content_type:type, client_id:id, project_id:null, employee_id:null, category_id:'client-docs' }); await fetch(up.upload_url,{ method:'PUT', headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' }, body:fileObj }); const conf=await api('POST','/files/confirm',{ key:up.key, size_bytes:fileObj.size, checksum_sha256:'na', content_type:type }); await api('POST', `/clients/${encodeURIComponent(id)}/documents`, { folder_id: activeFolderId, title: title||name, file_id: conf.id }); toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); await refetchDocs(); }catch(_e){ toast.error('Upload failed'); } };
  const uploadToFolder = async(folderId:string, file: File)=>{ try{ const name=file.name; const type=file.type||'application/octet-stream'; const up=await api('POST','/files/upload',{ original_name:name, content_type:type, client_id:id, project_id:null, employee_id:null, category_id:'client-docs' }); await fetch(up.upload_url,{ method:'PUT', headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' }, body:file }); const conf=await api('POST','/files/confirm',{ key:up.key, size_bytes:file.size, checksum_sha256:'na', content_type:type }); await api('POST', `/clients/${encodeURIComponent(id)}/documents`, { folder_id: folderId, title: name, file_id: conf.id }); }catch(_e){} };
  const removeDoc = async(docId:string)=>{ const ok = await confirm({ title:'Delete file', message:'Are you sure you want to delete this file?' }); if(!ok) return; try{ await api('DELETE', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`); toast.success('Deleted'); await refetchDocs(); }catch(_e){ toast.error('Delete failed'); } };

  const topFolders = useMemo(()=> (folders||[]).filter((f:any)=> !f.parent_id), [folders]);
  const childFolders = useMemo(()=> (folders||[]).filter((f:any)=> f.parent_id===activeFolderId), [folders, activeFolderId]);
  const breadcrumb = useMemo(()=>{ if(activeFolderId==='all') return [] as any[]; const map = new Map<string, any>(); (folders||[]).forEach((f:any)=> map.set(f.id, f)); const path:any[]=[]; let cur=map.get(activeFolderId); while(cur){ path.unshift(cur); cur=cur.parent_id? map.get(cur.parent_id): null; } return path; }, [folders, activeFolderId]);
  const fileExt = (name?:string)=>{ const n=String(name||'').toLowerCase(); const m=n.match(/\.([a-z0-9]+)$/); return m? m[1] : ''; };
  const extStyle = (ext:string)=>{ const e=ext.toLowerCase(); if(e==='pdf') return { bg:'bg-[#e74c3c]', txt:'text-white' }; if(['xls','xlsx','csv'].includes(e)) return { bg:'bg-[#27ae60]', txt:'text-white' }; if(['doc','docx','odt','rtf'].includes(e)) return { bg:'bg-[#2980b9]', txt:'text-white' }; if(['ppt','pptx','key'].includes(e)) return { bg:'bg-[#d35400]', txt:'text-white' }; if(['png','jpg','jpeg','webp','gif','bmp','svg','heic','heif'].includes(e)) return { bg:'bg-[#8e44ad]', txt:'text-white' }; if(['zip','rar','7z','tar','gz'].includes(e)) return { bg:'bg-[#34495e]', txt:'text-white' }; if(['txt','md','json','xml','yaml','yml'].includes(e)) return { bg:'bg-[#16a085]', txt:'text-white' }; return { bg:'bg-gray-300', txt:'text-gray-800' }; };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <select className="border rounded px-3 py-2" value={which} onChange={e=>setWhich(e.target.value as any)}>
          <option value="all">All Files</option>
          <option value="client">Client</option>
          <option value="site">Site</option>
        </select>
        {which==='site' && (
          <select className="border rounded px-3 py-2" value={siteId} onChange={e=>setSiteId(e.target.value)}>
            <option value="">Select site...</option>
            {sites.map(s=> <option key={String(s.id)} value={String(s.id)}>{s.site_name||s.site_address_line1||s.id}</option>)}
          </select>
        )}
      </div>

      {activeFolderId==='all' ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <div className="text-sm font-semibold">Folders</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {topFolders.map((f:any)=> (
              <div key={f.id} className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                   onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                   onDragOver={(e)=>{ e.preventDefault(); }}
                   onDrop={async(e)=>{ e.preventDefault(); if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file as File); } toast.success('Uploaded'); } }}>
                <div className="text-4xl">📁</div>
                <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                
              </div>
            ))}
            {!topFolders.length && <div className="text-sm text-gray-600">No folders yet</div>}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button title="Home" onClick={()=> setActiveFolderId('all')} className="px-2 py-2 rounded-lg border">🏠</button>
            <div className="text-sm font-semibold flex gap-2 items-center">
              {breadcrumb.map((f:any, idx:number)=> (
                <span key={f.id} className="flex items-center gap-2">
                  {idx>0 && <span className="opacity-60">/</span>}
                  <button className="underline" onClick={()=> setActiveFolderId(f.id)}>{f.name}</button>
                </span>
              ))}
            </div>
            
          </div>
          <div className="rounded-lg border">
            <div className="p-4">
              {childFolders.length>0 && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Subfolders</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {childFolders.map((f:any)=> (
                      <div key={f.id} className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                           onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                           onDragOver={(e)=>{ e.preventDefault(); }}
                           onDrop={async(e)=>{ e.preventDefault(); if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file as File); } toast.success('Uploaded'); } }}>
                        <div className="text-4xl">📁</div>
                        <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                        
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold">Documents</h4>
                {false && selectedDocIds.size>0 && (
                  <div className="flex items-center gap-2">
                    <div className="text-sm">{selectedDocIds.size} selected</div>
                    <select id="bulk-move-target-client" className="border rounded px-2 py-1">
                      <option value="" disabled selected>Select destination</option>
                      {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button className="px-3 py-1.5 rounded bg-brand-red text-white" onClick={async()=>{
                      const sel = document.getElementById('bulk-move-target-client') as HTMLSelectElement;
                      const dest = sel?.value || '';
                      if(!dest){ toast.error('Select destination folder'); return; }
                      try{
                        for(const docId of Array.from(selectedDocIds)){
                          await api('PUT', `/clients/${encodeURIComponent(String(id))}/documents/${encodeURIComponent(String(docId))}`, { folder_id: dest });
                        }
                        toast.success('Moved'); setSelectedDocIds(new Set()); await refetchDocs();
                      }catch(_e){ toast.error('Failed'); }
                    }}>Move</button>
                    <button className="px-3 py-1.5 rounded border" onClick={()=> setSelectedDocIds(new Set())}>Clear</button>
                  </div>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden bg-white">
                {(docs||[]).map((d:any)=>{ const ext=fileExt(d.title).toUpperCase(); const s=extStyle(ext); const checked = selectedDocIds.has(d.id); return (
                  <div key={d.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${selectMode && checked? 'bg-red-50':''}`}>
                    {selectMode && (
                      <input type="checkbox" className="mr-1" checked={checked} onChange={(e)=>{
                        setSelectedDocIds(prev=>{ const next = new Set(prev); if(e.target.checked) next.add(d.id); else next.delete(d.id); return next; });
                      }} />
                    )}
                    <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none`}>{ext||'FILE'}</div>
                    <div className="flex-1 min-w-0" onClick={async()=>{ if(selectMode) return; try{ const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id)}/download`); const url=r.download_url||''; if(url) { if(ext==='PDF') setPreviewPdf({ url, name: d.title||'Preview' }); else window.open(url,'_blank'); } }catch(_e){ toast.error('Preview not available'); } }}>
                      <div className="font-medium truncate cursor-pointer hover:underline">{d.title||'Document'}</div>
                      <div className="text-[11px] text-gray-600 truncate">Uploaded {String(d.created_at||'').slice(0,10)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={`/files/${encodeURIComponent(d.file_id)}/download`} target="_blank">⬇️</a>
                    </div>
                  </div>
                ); })}
                {!(docs||[]).length && <div className="px-3 py-3 text-sm text-gray-600">No documents in this folder</div>}
              </div>
            </div>
          </div>
        </>
      )}

      <h4 className="font-semibold mt-4 mb-2">Pictures</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {(picList||[]).map(f=> { const isSite=!!f.site_id; const s=isSite? siteMap[String(f.site_id||'')] : undefined; const tip=isSite? `${s?.site_name||'Site'} — ${[s?.site_address_line1, s?.site_city, s?.site_province].filter(Boolean).join(', ')}` : 'General Customer image'; return (
          <div key={f.id} className="relative group">
            <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=300`} />
            <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
              <button onClick={async(e)=>{ e.stopPropagation(); const url = await fetchDownloadUrl(String(f.file_object_id)); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</button>
            </div>
            <div className={`absolute left-2 top-2 text-[10px] font-bold rounded-full w-6 h-6 grid place-items-center ${isSite? 'bg-blue-500 text-white':'bg-green-500 text-white'}`} title={isSite? 'Site image':'Client image'}>
              {isSite? String((f.site_id||'') as string).slice(0,2).toUpperCase() : 'C'}
            </div>
            <div className="absolute inset-x-0 bottom-0 hidden group-hover:flex items-center text-[11px] text-white bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
              <span className="truncate">{tip}</span>
            </div>
          </div>
        ); })}
      </div>

      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Add file</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">Folder</div>
                <select className="border rounded px-3 py-2 w-full" value={activeFolderId==='all'? '': activeFolderId} onChange={e=> setActiveFolderId(e.target.value||'all')}>
                  <option value="">Select a folder</option>
                  {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600">Title</div>
                <input className="border rounded px-3 py-2 w-full" value={title} onChange={e=> setTitle(e.target.value)} placeholder="Optional title" />
              </div>
              <div>
                <div className="text-xs text-gray-600">File</div>
                <input type="file" onChange={e=> setFileObj(e.target.files?.[0]||null)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowUpload(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={upload} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
            </div>
          </div>
        </div>
      )}

      {newFolderOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">{newFolderParentId? 'New subfolder':'New folder'}</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={newFolderName} onChange={e=> setNewFolderName(e.target.value)} placeholder="e.g., Hiring pack" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setNewFolderOpen(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ const body:any = { name: (newFolderName||'').trim() }; if(newFolderParentId) body.parent_id = newFolderParentId; if(!body.name){ toast.error('Folder name required'); return; } await api('POST', `/clients/${encodeURIComponent(id)}/folders`, body); toast.success('Folder created'); setNewFolderOpen(false); setNewFolderName(''); setNewFolderParentId(null); await refetchFolders(); }catch(_e){ toast.error('Failed to create folder'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {renameFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename folder</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={renameFolder.name} onChange={e=> setRenameFolder({ id: renameFolder.id, name: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameFolder(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ await api('PUT', `/clients/${encodeURIComponent(id)}/folders/${encodeURIComponent(renameFolder.id)}`, { name: (renameFolder.name||'').trim() }); toast.success('Renamed'); setRenameFolder(null); await refetchFolders(); }catch(_e){ toast.error('Failed to rename'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {renameDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename file</div>
            <div>
              <div className="text-xs text-gray-600">Title</div>
              <input className="border rounded px-3 py-2 w-full" value={renameDoc.title} onChange={e=> setRenameDoc({ id: renameDoc.id, title: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(renameDoc.id)}`, { title: (renameDoc.title||'').trim() }); toast.success('Renamed'); setRenameDoc(null); await refetchDocs(); }catch(_e){ toast.error('Failed to rename'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {moveDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Move file</div>
            <div>
              <div className="text-xs text-gray-600">Destination folder</div>
              <select id="move-target-client" className="border rounded px-3 py-2 w-full" defaultValue="">
                <option value="" disabled>Select...</option>
                {(folders||[]).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setMoveDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ const sel = document.getElementById('move-target-client') as HTMLSelectElement; const dest = sel?.value||''; if(!dest){ toast.error('Select destination'); return; } await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(moveDoc.id)}`, { folder_id: dest }); toast.success('Moved'); setMoveDoc(null); await refetchDocs(); }catch(_e){ toast.error('Failed to move'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Move</button>
            </div>
          </div>
        </div>
      )}

      {previewPdf && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-[1000px] max-w-[95vw] h-[85vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div className="font-semibold text-sm truncate pr-2">{previewPdf.name}</div>
              <div className="flex items-center gap-2">
                <a className="px-2 py-1 rounded bg-gray-100 text-sm" href={previewPdf.url} target="_blank">Download</a>
                <button onClick={()=>setPreviewPdf(null)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
              </div>
            </div>
            <iframe className="flex-1" src={previewPdf.url} title="PDF Preview"></iframe>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactsCard({ id }:{ id:string }){
  const { data, refetch } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/contacts`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/files`) });
  const [list, setList] = useState<any[]>([]);
  useEffect(()=>{ setList(data||[]); }, [data]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [editId, setEditId] = useState<string|null>(null);
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eRole, setERole] = useState('');
  const [eDept, setEDept] = useState('');
  const [ePrimary, setEPrimary] = useState<'true'|'false'>('false');
  const [pickerForContact, setPickerForContact] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhotoBlob, setCreatePhotoBlob] = useState<Blob|null>(null);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCreateOpen(false); setCreatePhotoBlob(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createOpen]);

  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  const avatarFor = (contactId:string)=>{
    const rec = (files||[]).find((f:any)=> String(f.category||'').toLowerCase()==='contact-photo-'+String(contactId));
    return rec? `/files/${rec.file_object_id}/thumbnail?w=160` : '';
  };
  const beginEdit = (c:any)=>{ setEditId(c.id); setEName(c.name||''); setEEmail(c.email||''); setEPhone(c.phone||''); setERole(c.role_title||''); setEDept(c.department||''); setEPrimary(c.is_primary? 'true':'false'); };
  const cancelEdit = ()=>{ setEditId(null); };
  // Drag and drop reorder
  const [dragId, setDragId] = useState<string|null>(null);
  const onDragStart = (cid:string)=> setDragId(cid);
  const onDragOver = (e:React.DragEvent)=> { e.preventDefault(); };
  const onDropOver = (overId:string)=>{
    if(!dragId || dragId===overId) return;
    const curr = [...list];
    const from = curr.findIndex(x=> x.id===dragId);
    const to = curr.findIndex(x=> x.id===overId);
    if(from<0 || to<0) return;
    const [moved] = curr.splice(from,1);
    curr.splice(to,0,moved);
    setList(curr);
  };
  const commitOrder = async()=>{
    try{ await api('POST', `/clients/${id}/contacts/reorder`, list.map(c=> String(c.id))); toast.success('Order saved'); refetch(); }catch(e){ toast.error('Failed to save order'); }
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold">Contacts</h4>
        <div className="flex items-center gap-2">
          <button onClick={commitOrder} className="px-3 py-2 rounded bg-gray-100">Save order</button>
          <button onClick={()=>setCreateOpen(true)} className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold">New Contact</button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {(list||[]).map(c=> (
          <div key={c.id} className="rounded-xl border bg-white overflow-hidden flex" draggable onDragStart={()=>onDragStart(String(c.id))} onDragOver={onDragOver} onDrop={()=>onDropOver(String(c.id))}>
            <div className="w-28 bg-gray-100 flex items-center justify-center relative group">
              {avatarFor(c.id)? (
                <img className="w-20 h-20 object-cover rounded border" src={avatarFor(c.id)} />
              ): (
                <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">{(c.name||'?').slice(0,2).toUpperCase()}</div>
              )}
              <button onClick={()=>setPickerForContact(String(c.id))} className="hidden group-hover:block absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white">Photo</button>
              <div className="absolute left-1 top-1 text-[10px] text-gray-600">⋮⋮</div>
            </div>
            <div className="flex-1 p-3 text-sm">
              {editId===c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Edit contact</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <select className="border rounded px-2 py-1 text-xs" value={ePrimary} onChange={e=>setEPrimary(e.target.value as any)}>
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name</label>
                      <input className="border rounded px-2 py-1 w-full" value={eName} onChange={e=>setEName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Role/Title</label>
                      <input className="border rounded px-2 py-1 w-full" value={eRole} onChange={e=>setERole(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Department</label>
                      <input className="border rounded px-2 py-1 w-full" value={eDept} onChange={e=>setEDept(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input className="border rounded px-2 py-1 w-full" value={eEmail} onChange={e=>setEEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input className="border rounded px-2 py-1 w-full" value={ePhone} onChange={e=>setEPhone(formatPhone(e.target.value))} />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100">Cancel</button>
                    <button onClick={async()=>{ await api('PATCH', `/clients/${id}/contacts/${c.id}`, { name: eName, role_title: eRole, department: eDept, email: eEmail, phone: ePhone, is_primary: ePrimary==='true' }); setEditId(null); refetch(); }} className="px-2 py-1 rounded bg-brand-red text-white">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    <div className="flex items-center gap-2">
                      {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}
                      {!c.is_primary && <button onClick={async()=>{ await api('PATCH', `/clients/${id}/contacts/${c.id}`, { is_primary: true }); refetch(); }} className="px-2 py-1 rounded bg-gray-100">Set Primary</button>}
                      <button onClick={()=>beginEdit(c)} className="px-2 py-1 rounded bg-gray-100">Edit</button>
                      <button onClick={async()=>{ if(!confirm('Delete this contact?')) return; await api('DELETE', `/clients/${id}/contacts/${c.id}`); refetch(); }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                    </div>
                  </div>
                  <div className="text-gray-600">{c.role_title||''} {c.department? `· ${c.department}`:''}</div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Email</div>
                    <div className="text-gray-700">{c.email||'-'}</div>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Phone</div>
                    <div className="text-gray-700">{c.phone||'-'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(!data || !data.length) && <div className="text-sm text-gray-600">No contacts</div>}
      </div>
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">New Contact</div><button onClick={()=>{ setCreateOpen(false); setCreatePhotoBlob(null); }} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button></div>
            <div className="p-4 grid md:grid-cols-5 gap-3 items-start">
              <div className="md:col-span-2">
                <div className="text-[11px] uppercase text-gray-500 mb-1">Contact Photo</div>
                <button onClick={()=> setCreatePhotoBlob(new Blob()) || setPickerForContact('__new__') } className="w-full h-40 border rounded grid place-items-center bg-gray-50">Select Photo</button>
              </div>
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Name</label>
                  <input className="border rounded px-3 py-2 w-full" value={name} onChange={e=>setName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Role/Title</label>
                  <input className="border rounded px-3 py-2 w-full" value={role} onChange={e=>setRole(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Department</label>
                  <input className="border rounded px-3 py-2 w-full" value={dept} onChange={e=>setDept(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Email</label>
                  <input className="border rounded px-3 py-2 w-full" value={email} onChange={e=>setEmail(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Phone</label>
                  <input className="border rounded px-3 py-2 w-full" value={phone} onChange={e=>setPhone(formatPhone(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Primary</label>
                  <select className="border rounded px-3 py-2 w-full" value={primary} onChange={e=>setPrimary(e.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div className="col-span-2 text-right">
                  <button onClick={async()=>{
                    const payload:any = { name, email, phone, role_title: role, department: dept, is_primary: primary==='true' };
                    const created:any = await api('POST', `/clients/${id}/contacts`, payload);
                    // If photo selected through picker callback, it will be uploaded below via picker confirmation
                    setName(''); setEmail(''); setPhone(''); setRole(''); setDept(''); setPrimary('false'); setCreateOpen(false); refetch();
                  }} className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold">Create</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {pickerForContact && (
        <ImagePicker isOpen={true} onClose={()=>setPickerForContact(null)} clientId={String(id)} targetWidth={400} targetHeight={400} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (pickerForContact==='__new__'){
              // We don't yet have the new contact id here; the simple flow is to upload the photo now and let user reassign later.
              // For now, just keep it in memory not supported; instead, we will upload after contact is created via another round.
            }
            else {
              const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'contact-photo', original_name:`contact-${pickerForContact}.jpg`, content_type:'image/jpeg' });
              await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
              const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
              await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-'+pickerForContact)}&original_name=${encodeURIComponent('contact-'+pickerForContact+'.jpg')}`);
              toast.success('Contact photo updated');
              refetch();
            }
          }catch(e){ toast.error('Failed to update contact photo'); }
          finally{ setPickerForContact(null); }
        }} />
      )}
    </div>
  );
}


