import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import GeoSelect from '@/components/GeoSelect';

type Site = {
  id:string,
  site_name?:string,
  site_address_line1?:string,
  site_address_line2?:string,
  site_city?:string,
  site_province?:string,
  site_postal_code?:string,
  site_country?:string,
  site_notes?:string
};
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, uploaded_at?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function SiteDetail(){
  const { customerId, siteId } = useParams();
  const nav = useNavigate();
  const { data:sites } = useQuery({ queryKey:['clientSites', customerId], queryFn: ()=>api<Site[]>('GET', `/clients/${customerId}/sites`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForSiteHeader', customerId], queryFn: ()=> api<ClientFile[]>('GET', `/clients/${customerId}/files`), enabled: !!customerId });
  const s = (sites||[]).find(x=> String(x.id)===String(siteId)) || {} as Site;
  const [form, setForm] = useState<any>({ ...s });
  const setField = (k:string, v:any)=> setForm((prev:any)=> ({ ...prev, [k]: v }));
  const qc = useQueryClient();
  const isNew = String(siteId||'') === 'new' || !s?.id;

  // keep form in sync when data loads
  useEffect(()=>{ setForm({ ...s }); }, [s]);

  // ESC to close
  useEffect(()=>{
    const onKey = (e: KeyboardEvent)=>{ if (e.key==='Escape'){ nav(-1); } };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [nav]);

  const previewSrc = useMemo(()=>{
    const arr = (files||[]).filter(f=> String(f.site_id||'')===String(siteId));
    const cover = arr.find(f=> String(f.category||'')==='site-cover-derived');
    const img = cover || arr.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
    return img? `/files/${img.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
  }, [files, siteId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-white rounded-xl overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center gap-6 relative">
          <button
            onClick={()=> nav(-1)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
            title="Close"
          >
            ×
          </button>
          <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center">
            <img src={previewSrc} className="w-full h-full object-cover" alt={form.site_name||'Site'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-3xl font-extrabold text-white truncate">{form.site_name||'Site'}</div>
            <div className="flex items-center gap-4 mt-3 text-sm text-white">
              {(form.site_address_line1||form.site_city||form.site_province||form.site_country) && (
                <div className="flex items-center gap-2">
                  <span className="text-white/80">📍</span>
                  <span className="truncate">{[form.site_address_line1, form.site_city, form.site_province, form.site_country].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-y-auto">
          <div className="p-6 grid md:grid-cols-2 gap-4 items-start">
            <div className="md:col-span-2">
              <Field label="Site name"><input className="w-full border rounded px-3 py-2" value={form.site_name||''} onChange={e=>setField('site_name', e.target.value)} /></Field>
            </div>
            <Field label="Address 1"><input className="w-full border rounded px-3 py-2" value={form.site_address_line1||''} onChange={e=>setField('site_address_line1', e.target.value)} /></Field>
            <Field label="Address 2"><input className="w-full border rounded px-3 py-2" value={form.site_address_line2||''} onChange={e=>setField('site_address_line2', e.target.value)} /></Field>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-600">Location</label>
              <div className="mt-2">
                <GeoSelect
                  country={form.site_country||''}
                  state={form.site_province||''}
                  city={form.site_city||''}
                  onChange={(v)=>{
                    if('country' in v) setField('site_country', v.country||'');
                    if('state' in v) setField('site_province', v.state||'');
                    if('city' in v) setField('site_city', v.city||'');
                  }}
                  labels={{ country: 'Country', state: 'Province/State', city: 'City' }}
                />
              </div>
            </div>
            <Field label="Postal code"><input className="w-full border rounded px-3 py-2" value={form.site_postal_code||''} onChange={e=>setField('site_postal_code', e.target.value)} /></Field>
            <div className="md:col-span-2">
              <Field label="Notes"><textarea rows={4} className="w-full border rounded px-3 py-2" value={form.site_notes||''} onChange={e=>setField('site_notes', e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={()=> nav(-1)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Close</button>
          <button onClick={async()=>{
            try{
              if(isNew){
                await api('POST', `/clients/${encodeURIComponent(String(customerId||''))}/sites`, form);
                toast.success('Created');
              } else {
                await api('PATCH', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`, form);
                toast.success('Saved');
              }
              try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
              nav(-1);
            }catch(_e){ toast.error('Save failed'); }
          }} className="px-4 py-2 rounded bg-brand-red text-white">{isNew? 'Create':'Save'}</button>
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

