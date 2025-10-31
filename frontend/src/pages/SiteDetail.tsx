import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function SiteDetail(){
  const { customerId, siteId } = useParams();
  const nav = useNavigate();
  const { data:sites } = useQuery({ queryKey:['clientSites', customerId], queryFn: ()=>api<Site[]>('GET', `/clients/${customerId}/sites`) });
  const s = (sites||[]).find(x=> String(x.id)===String(siteId)) || {} as Site;
  const [form, setForm] = useState<any>({ ...s });
  const setField = (k:string, v:any)=> setForm((prev:any)=> ({ ...prev, [k]: v }));

  // ESC to close
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{ if (e.key==='Escape'){ nav(-1); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <div>
            <div className="text-xl font-extrabold">Site</div>
            <div className="text-sm text-gray-600">Quick details for this customer site</div>
          </div>
          <button onClick={()=> nav(-1)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
        </div>
        <div className="p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Site name"><input className="w-full border rounded px-3 py-2" value={form.site_name||''} onChange={e=>setField('site_name', e.target.value)} /></Field>
            <Field label="Address 1"><input className="w-full border rounded px-3 py-2" value={form.site_address_line1||''} onChange={e=>setField('site_address_line1', e.target.value)} /></Field>
            <Field label="City"><input className="w-full border rounded px-3 py-2" value={form.site_city||''} onChange={e=>setField('site_city', e.target.value)} /></Field>
            <Field label="Province/State"><input className="w-full border rounded px-3 py-2" value={form.site_province||''} onChange={e=>setField('site_province', e.target.value)} /></Field>
            <Field label="Country"><input className="w-full border rounded px-3 py-2" value={form.site_country||''} onChange={e=>setField('site_country', e.target.value)} /></Field>
          </div>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={()=> nav(-1)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Close</button>
          <button onClick={async()=>{
            try{
              await api('PATCH', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`, form);
              toast.success('Saved');
              nav(-1);
            }catch(_e){ toast.error('Save failed'); }
          }} className="px-4 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({label, children}:{label:string, children:any}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600">{label}</label>
      {children}
    </div>
  );
}

