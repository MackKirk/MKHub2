import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useConfirm } from '@/components/ConfirmProvider';
import { useNavigate } from 'react-router-dom';

export default function CustomerNew(){
  const confirm = useConfirm();
  const nav = useNavigate();
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=> api<any>('GET','/settings') });
  const statuses = (settings?.client_statuses||[]) as any[];
  const types = (settings?.client_types||[]) as any[];
  const paymentTerms = (settings?.payment_terms||[]) as any[];
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });
  const [form, setForm] = useState<any>({
    display_name:'', legal_name:'', name:'', client_status:'Active', client_type:'Customer',
    email:'', phone:'', address_line1:'', address_line2:'', city:'', province:'', country:'', postal_code:'',
    payment_terms_id:'', po_required:false, tax_number:'', lead_source:'', estimator_id:'', description:''
  });
  useEffect(()=>{ setForm((s:any)=> ({ ...s, name: s.display_name })); }, [form.display_name]);
  const canSubmit = useMemo(()=> String(form.display_name||'').trim().length>1, [form.display_name]);
  const [contact, setContact] = useState<any>({ name:'', email:'', phone:'', is_primary:true });
  const contactValid = useMemo(()=> !!(String(contact.name||'').trim() || String(contact.email||'').trim() || String(contact.phone||'').trim()), [contact]);
  const [step, setStep] = useState<number>(1);
  const next = ()=> setStep(s=> Math.min(4, s+1));
  const prev = ()=> setStep(s=> Math.max(1, s-1));
  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
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
          {[1,2,3,4].map(i=> (
            <div key={i} className={`flex-1 h-2 rounded ${step>=i?'bg-brand-red':'bg-gray-200'}`} title={`Step ${i}`}></div>
          ))}
        </div>
        {step===1 && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Display name</label><input className="w-full border rounded px-3 py-2" value={form.display_name} onChange={e=>setForm((s:any)=>({...s, display_name: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Legal name</label><input className="w-full border rounded px-3 py-2" value={form.legal_name} onChange={e=>setForm((s:any)=>({...s, legal_name: e.target.value}))} /></div>
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
              <label className="text-xs text-gray-600">Estimator</label>
              <select className="w-full border rounded px-3 py-2" value={form.estimator_id||''} onChange={e=> setForm((s:any)=> ({...s, estimator_id: e.target.value||null}))}>
                <option value="">Select...</option>
                {(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2"><input id="po" type="checkbox" checked={!!form.po_required} onChange={e=> setForm((s:any)=> ({...s, po_required: !!e.target.checked}))} /><label htmlFor="po" className="text-xs text-gray-600">PO Required</label></div>
          </div>
        )}
        {step===2 && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Address line 1</label><input className="w-full border rounded px-3 py-2" value={form.address_line1} onChange={e=>setForm((s:any)=>({...s, address_line1: e.target.value}))} /></div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Address line 2</label><input className="w-full border rounded px-3 py-2" value={form.address_line2} onChange={e=>setForm((s:any)=>({...s, address_line2: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">City</label><input className="w-full border rounded px-3 py-2" value={form.city} onChange={e=>setForm((s:any)=>({...s, city: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Province/State</label><input className="w-full border rounded px-3 py-2" value={form.province} onChange={e=>setForm((s:any)=>({...s, province: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Country</label><input className="w-full border rounded px-3 py-2" value={form.country} onChange={e=>setForm((s:any)=>({...s, country: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Postal code</label><input className="w-full border rounded px-3 py-2" value={form.postal_code} onChange={e=>setForm((s:any)=>({...s, postal_code: e.target.value}))} /></div>
            <div>
              <label className="text-xs text-gray-600">Payment terms</label>
              <select className="w-full border rounded px-3 py-2" value={form.payment_terms_id} onChange={e=>setForm((s:any)=>({...s, payment_terms_id: e.target.value}))}>
                <option value="">Select...</option>
                {paymentTerms.map((t:any)=> <option key={t.id||t.label} value={t.id||t.value}>{t.label}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-600">Tax number</label><input className="w-full border rounded px-3 py-2" value={form.tax_number} onChange={e=>setForm((s:any)=>({...s, tax_number: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Lead source</label><input className="w-full border rounded px-3 py-2" value={form.lead_source} onChange={e=>setForm((s:any)=>({...s, lead_source: e.target.value}))} /></div>
          </div>
        )}
        {step===3 && (
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2 text-sm text-gray-700">Primary Contact (required)</div>
            <div className="md:col-span-2"><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={contact.name} onChange={e=>setContact((s:any)=>({...s, name: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Email</label><input className="w-full border rounded px-3 py-2" value={contact.email} onChange={e=>setContact((s:any)=>({...s, email: e.target.value}))} /></div>
            <div><label className="text-xs text-gray-600">Phone</label><input className="w-full border rounded px-3 py-2" value={contact.phone} onChange={e=>setContact((s:any)=>({...s, phone: formatPhone(e.target.value)}))} /></div>
          </div>
        )}
        {step===4 && (
          <div className="space-y-3 text-sm text-gray-800">
            <div className="font-semibold">Review</div>
            <div className="rounded border p-3">
              <div className="text-gray-600 mb-1">Company</div>
              <div><strong>{form.display_name||'-'}</strong> · {form.client_type||'-'} · {form.client_status||'-'}</div>
              <div>{form.email||''} {form.phone? ` · ${form.phone}`:''}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-gray-600 mb-1">Address</div>
              <div>{[form.address_line1, form.address_line2].filter(Boolean).join(', ')}</div>
              <div>{[form.city, form.province, form.country, form.postal_code].filter(Boolean).join(', ')}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-gray-600 mb-1">Primary Contact</div>
              <div><strong>{contact.name||'-'}</strong></div>
              <div>{[contact.email, contact.phone].filter(Boolean).join(' · ')}</div>
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
            {step<4 && <button className="px-4 py-2 rounded bg-brand-red text-white disabled:opacity-50" disabled={(step===1 && !canSubmit) || (step===3 && !contactValid)} onClick={next}>Next</button>}
            {step===4 && (
              <button disabled={!(canSubmit && contactValid)} onClick={async()=>{
                if(!(canSubmit && contactValid)){ toast.error('Missing required fields'); return; }
                try{
                  const payload:any = { ...form, name: form.display_name };
                  const created:any = await api('POST','/clients', payload);
                  if (!created?.id){ toast.error('Create failed'); return; }
                  try{ await api('POST', `/clients/${encodeURIComponent(created.id)}/contacts`, { name: contact.name||'Primary', email: contact.email||null, phone: contact.phone||null, is_primary: true }); }catch(_e){}
                  toast.success('Customer created');
                  nav(`/customers/${encodeURIComponent(String(created.id))}`);
                }catch(_e){ toast.error('Failed to create'); }
              }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


