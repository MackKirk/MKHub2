import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useConfirm } from '@/components/ConfirmProvider';
import { useNavigate } from 'react-router-dom';
import GeoSelect from '@/components/GeoSelect';

export default function CustomerNew(){
  const confirm = useConfirm();
  const nav = useNavigate();
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const statuses = (settings?.client_statuses||[]) as any[];
  const types = (settings?.client_types||[]) as any[];
  const paymentTerms = (settings?.payment_terms||[]) as any[];
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });
  const leadSources = (settings?.lead_sources||[]) as any[];
  const [form, setForm] = useState<any>({
    display_name:'', legal_name:'', name:'', client_status:'Active', client_type:'Customer',
    email:'', phone:'', address_line1:'', address_line2:'', city:'', province:'', country:'', postal_code:'',
    payment_terms_id:'', po_required:false, tax_number:'', lead_source:'', estimator_id:'', description:''
  });
  useEffect(()=>{ setForm((s:any)=> ({ ...s, name: s.display_name })); }, [form.display_name]);
  const canSubmit = useMemo(()=> String(form.display_name||'').trim().length>1, [form.display_name]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cRole, setCRole] = useState('');
  const [cDept, setCDept] = useState('');
  const [cPrimary, setCPrimary] = useState<'true'|'false'>('false');
  const [step, setStep] = useState<number>(1);
  const next = ()=> setStep(s=> Math.min(2, s+1));
  const prev = ()=> setStep(s=> Math.max(1, s-1));
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };

  useEffect(() => {
    if (!contactModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContactModalOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactModalOpen]);
  return (
    <div className="max-w-4xl">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">New Customer</div>
          <div className="text-sm opacity-90">Create a customer with required details</div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2 text-sm">
          {[1,2].map(i=> (
            <div key={i} className={`flex-1 h-2 rounded ${step>=i?'bg-brand-red':'bg-gray-200'}`} title={`Step ${i}`}></div>
          ))}
        </div>
        {step===1 && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2"><h4 className="font-semibold">Company</h4></div>
              <div className="text-xs text-gray-500 mt-0.5 mb-2">Core company identity details.</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><label className="text-xs text-gray-600">Display name <span className="text-red-600">*</span></label><input className="w-full border rounded px-3 py-2" value={form.display_name} onChange={e=>setForm((s:any)=>({...s, display_name: e.target.value}))} /></div>
                <div><label className="text-xs text-gray-600">Legal name <span className="text-red-600">*</span></label><input className="w-full border rounded px-3 py-2" value={form.legal_name} onChange={e=>setForm((s:any)=>({...s, legal_name: e.target.value}))} /></div>
                <div>
                  <label className="text-xs text-gray-600">Status</label>
                  <select className="w-full border rounded px-3 py-2" value={form.client_status} onChange={e=>setForm((s:any)=>({...s, client_status: e.target.value}))}>
                    {statuses.map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <select className="w-full border rounded px-3 py-2" value={form.client_type} onChange={e=>setForm((s:any)=>({...s, client_type: e.target.value}))}>
                    {types.map((t:any)=> <option key={t.label} value={t.label}>{t.label}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Email</label><input className="w-full border rounded px-3 py-2" value={form.email} onChange={e=>setForm((s:any)=>({...s, email: e.target.value}))} /></div>
                <div><label className="text-xs text-gray-600">Phone</label><input className="w-full border rounded px-3 py-2" value={form.phone} onChange={e=>setForm((s:any)=>({...s, phone: formatPhone(e.target.value)}))} /></div>
                <div>
                  <label className="text-xs text-gray-600">Lead source</label>
                  <select className="w-full border rounded px-3 py-2" value={form.lead_source||''} onChange={e=>setForm((s:any)=>({...s, lead_source: e.target.value}))}>
                    <option value="">Select...</option>
                    {leadSources.map((ls:any)=>{ const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls); const label = ls?.label ?? ls?.name ?? String(ls); return <option key={String(val)} value={String(val)}>{label}</option>; })}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Estimator</label>
                  <select className="w-full border rounded px-3 py-2" value={form.estimator_id||''} onChange={e=> setForm((s:any)=> ({...s, estimator_id: e.target.value||null}))}>
                    <option value="">Select...</option>
                    {(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Tax number</label><input className="w-full border rounded px-3 py-2" value={form.tax_number} onChange={e=>setForm((s:any)=>({...s, tax_number: e.target.value}))} /></div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2"><h4 className="font-semibold">Address</h4></div>
              <div className="text-xs text-gray-500 mt-0.5 mb-2">Primary mailing and location address.</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><label className="text-xs text-gray-600">Address line 1</label><input className="w-full border rounded px-3 py-2" value={form.address_line1} onChange={e=>setForm((s:any)=>({...s, address_line1: e.target.value}))} /></div>
                <div className="md:col-span-2"><label className="text-xs text-gray-600">Address line 2</label><input className="w-full border rounded px-3 py-2" value={form.address_line2} onChange={e=>setForm((s:any)=>({...s, address_line2: e.target.value}))} /></div>
                <div className="md:col-span-2">
                  <GeoSelect
                    country={form.country||''}
                    state={form.province||''}
                    city={form.city||''}
                    onChange={(v)=> setForm((s:any)=> ({...s, country: v.country??s.country, province: v.state??s.province, city: v.city??s.city }))}
                    labels={{ country:'Country', state:'Province/State', city:'City' }}
                  />
                </div>
                <div><label className="text-xs text-gray-600">Postal code</label><input className="w-full border rounded px-3 py-2" value={form.postal_code} onChange={e=>setForm((s:any)=>({...s, postal_code: e.target.value}))} /></div>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2"><h4 className="font-semibold">Billing</h4></div>
              <div className="text-xs text-gray-500 mt-0.5 mb-2">Preferences used for invoices and payments.</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-600">Billing email</label><input className="w-full border rounded px-3 py-2" value={form.billing_email||''} onChange={e=>setForm((s:any)=>({...s, billing_email: e.target.value}))} /></div>
                <div>
                  <label className="text-xs text-gray-600">PO required</label>
                  <select className="w-full border rounded px-3 py-2" value={form.po_required?'true':'false'} onChange={e=>setForm((s:any)=>({...s, po_required: e.target.value==='true'}))}><option value="false">No</option><option value="true">Yes</option></select>
                </div>
                <div className="md:col-span-2 text-sm">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!form.use_diff_billing} onChange={e=> setForm((s:any)=> ({...s, use_diff_billing: !!e.target.checked}))} /> Use different address for Billing address</label>
                </div>
                {form.use_diff_billing && (
                  <>
                    <div className="md:col-span-2"><label className="text-xs text-gray-600">Billing Address 1</label><input className="w-full border rounded px-3 py-2" value={form.billing_address_line1||''} onChange={e=>setForm((s:any)=>({...s, billing_address_line1: e.target.value}))} /></div>
                    <div className="md:col-span-2"><label className="text-xs text-gray-600">Billing Address 2</label><input className="w-full border rounded px-3 py-2" value={form.billing_address_line2||''} onChange={e=>setForm((s:any)=>({...s, billing_address_line2: e.target.value}))} /></div>
                    <div className="md:col-span-2">
                      <GeoSelect
                        country={form.billing_country||''}
                        state={form.billing_province||''}
                        city={form.billing_city||''}
                        onChange={(v)=> setForm((s:any)=> ({...s, billing_country: v.country??s.billing_country, billing_province: v.state??s.billing_province, billing_city: v.city??s.billing_city }))}
                        labels={{ country:'Billing Country', state:'Billing Province/State', city:'Billing City' }}
                      />
                    </div>
                    <div><label className="text-xs text-gray-600">Billing Postal code</label><input className="w-full border rounded px-3 py-2" value={form.billing_postal_code||''} onChange={e=>setForm((s:any)=>({...s, billing_postal_code: e.target.value}))} /></div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {step===2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">Contacts</div>
                <div className="text-xs text-gray-600">Add one or more contacts now (optional)</div>
              </div>
              <button onClick={()=>setContactModalOpen(true)} className="px-3 py-1.5 rounded bg-brand-red text-white">Add Contact</button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {(contacts||[]).map((c, i)=> (
                <div key={i} className="rounded border p-3 text-sm flex items-start justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">{c.name||'(No name)'} {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}</div>
                    <div className="text-gray-600">{c.role_title||''} {c.department? `· ${c.department}`:''}</div>
                    <div className="text-gray-700 mt-1">{[c.email, c.phone].filter(Boolean).join(' · ')||'-'}</div>
                  </div>
                  <div className="space-x-2">
                    {!c.is_primary && <button onClick={()=>{
                      setContacts(arr=> arr.map((x,idx)=> ({...x, is_primary: idx===i})));
                    }} className="px-2 py-1 rounded bg-gray-100">Set Primary</button>}
                    <button onClick={()=> setContacts(arr=> arr.filter((_,idx)=> idx!==i))} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                  </div>
                </div>
              ))}
              {(!contacts || !contacts.length) && <div className="text-sm text-gray-600">No contacts added yet.</div>}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <button onClick={async()=>{
            const ok = await confirm({ title:'Cancel', message:'Discard this customer draft and go back?' });
            if (!ok) return; history.back();
          }} className="px-4 py-2 rounded bg-gray-100">Cancel</button>
          <div className="space-x-2">
            {step>1 && <button className="px-4 py-2 rounded bg-gray-100" onClick={prev}>Back</button>}
            {step===1 && <button className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50" disabled={!canSubmit} onClick={next}>Next</button>}
            {step===2 && (
              <button onClick={async()=>{
                if(!canSubmit){ toast.error('Missing required fields'); return; }
                if (!contacts.length){
                  const ok = await confirm({ title: 'No contacts added', message: 'It is recommended to add at least one contact. Continue without contacts?' });
                  if (!ok) return;
                }
                try{
                  const payload:any = { ...form, name: form.display_name };
                  const created:any = await api('POST','/clients', payload);
                  if (!created?.id){ toast.error('Create failed'); return; }
                  if (contacts.length){
                    for (const c of contacts){
                      try{ await api('POST', `/clients/${encodeURIComponent(created.id)}/contacts`, { name: c.name||'Contact', email: c.email||null, phone: c.phone||null, role_title: c.role_title||null, department: c.department||null, is_primary: !!c.is_primary }); }catch(_e){}
                    }
                  }
                  toast.success('Customer created');
                  nav(`/customers/${encodeURIComponent(String(created.id))}`);
                }catch(_e){ toast.error('Failed to create'); }
              }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
            )}
        </div>
      </div>
      </div>
      {contactModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[800px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">New Contact</div>
              <button onClick={()=>{ setContactModalOpen(false); }} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
            </div>
            <div className="p-4 grid md:grid-cols-5 gap-3 items-start">
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Name</label>
                  <input className="border rounded px-3 py-2 col-span-2 w-full" value={cName} onChange={e=>setCName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Role/Title</label>
                  <input className="border rounded px-3 py-2 w-full" value={cRole} onChange={e=>setCRole(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Department</label>
                  <input className="border rounded px-3 py-2 w-full" value={cDept} onChange={e=>setCDept(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Email</label>
                  <input className="border rounded px-3 py-2 w-full" value={cEmail} onChange={e=>setCEmail(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Phone</label>
                  <input className="border rounded px-3 py-2 w-full" value={cPhone} onChange={e=>setCPhone(formatPhone(e.target.value))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Primary</label>
                  <select className="border rounded px-3 py-2 w-full" value={cPrimary} onChange={e=>setCPrimary(e.target.value as any)}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
                <div className="col-span-2 text-right">
                  <button onClick={()=>{
                    const norm = { name: cName, email: cEmail, phone: cPhone, role_title: cRole, department: cDept, is_primary: cPrimary==='true' };
                    setContacts(arr=> {
                      let updated = [...arr];
                      if (norm.is_primary){ updated = updated.map(x=> ({...x, is_primary:false})); }
                      updated.push(norm);
                      return updated;
                    });
                    setCName(''); setCEmail(''); setCPhone(''); setCRole(''); setCDept(''); setCPrimary('false'); setContactModalOpen(false);
                  }} className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold">Add</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



