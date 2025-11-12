import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import { useConfirm } from '@/components/ConfirmProvider';
import AddressAutocomplete from '@/components/AddressAutocomplete';

type Site = {
  id:string,
  site_name?:string,
  site_address_line1?:string,
  site_address_line2?:string,
  site_city?:string,
  site_province?:string,
  site_postal_code?:string,
  site_country?:string,
  site_lat?:number,
  site_lng?:number,
  site_notes?:string
};
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, uploaded_at?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function SiteDetail(){
  const { customerId, siteId } = useParams();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { data:sites } = useQuery({ queryKey:['clientSites', customerId], queryFn: ()=>api<Site[]>('GET', `/clients/${customerId}/sites`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForSiteHeader', customerId], queryFn: ()=> api<ClientFile[]>('GET', `/clients/${customerId}/files`), enabled: !!customerId });
  const s = useMemo(()=> (sites||[]).find(x=> String(x.id)===String(siteId)) || null, [sites, siteId]);
  const [form, setForm] = useState<any>(()=> s? { ...s } : { site_name:'', site_address_line1:'', site_address_line2:'', site_city:'', site_province:'', site_postal_code:'', site_country:'', site_lat:null, site_lng:null, site_notes:'' });
  const setField = (k:string, v:any)=> setForm((prev:any)=> ({ ...prev, [k]: v }));
  const qc = useQueryClient();
  const isNew = String(siteId||'') === 'new' || !(s && (s as any).id);

  // keep form in sync only when an existing site loads/changes
  useEffect(()=>{ if(s && (s as any).id){ setForm({ ...s }); } }, [s && (s as any).id]);

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

  const [coverPickerOpen, setCoverPickerOpen] = useState(false);

  return (
    <>
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
          <div className="w-24 h-24 rounded-xl border-4 border-white shadow-lg overflow-hidden bg-white flex items-center justify-center relative">
            <img src={previewSrc} className="w-full h-full object-cover" alt={form.site_name||'Site'} />
            {!isNew && (
              <button
                onClick={()=> setCoverPickerOpen(true)}
                className="absolute bottom-1 right-1 text-[11px] px-2 py-0.5 rounded bg-black/60 text-white hover:bg-black/70"
                title="Change cover"
              >
                Change
              </button>
            )}
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
            <Field label="Address 1">
              <AddressAutocomplete
                value={form.site_address_line1||''}
                onChange={(value) => setField('site_address_line1', value)}
                onAddressSelect={(address) => {
                  console.log('onAddressSelect called with:', address);
                  // Update all address fields at once using setForm directly
                  setForm((prev: any) => ({
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
            </Field>
            <Field label="Address 2">
              <input
                className="w-full border rounded px-3 py-2"
                value={form.site_address_line2||''}
                onChange={e=>setField('site_address_line2', e.target.value)}
                placeholder="Apartment, suite, unit, etc. (optional)"
              />
            </Field>
            <Field label="Country">
              <input 
                className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                value={form.site_country||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="Province/State">
              <input 
                className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                value={form.site_province||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="City">
              <input 
                className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                value={form.site_city||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <Field label="Postal code">
              <input 
                className="w-full border rounded px-3 py-2 bg-gray-50 cursor-not-allowed" 
                value={form.site_postal_code||''} 
                readOnly
                placeholder="Auto-filled from address"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Notes"><textarea rows={4} className="w-full border rounded px-3 py-2" value={form.site_notes||''} onChange={e=>setField('site_notes', e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-between gap-2">
          <div>
            {!isNew && (
              <button onClick={async()=>{
                const ok = await confirm({ 
                  title: 'Delete Site', 
                  message: `Are you sure you want to delete "${form.site_name||'this site'}"? This action cannot be undone.`,
                  confirmText: 'Delete',
                  cancelText: 'Cancel'
                });
                if (!ok) return;
                try{
                  await api('DELETE', `/clients/${encodeURIComponent(String(customerId||''))}/sites/${encodeURIComponent(String(siteId||''))}`);
                  toast.success('Site deleted');
                  try{ await qc.invalidateQueries({ queryKey:['clientSites', customerId] }); }catch(_e){}
                  nav(-1);
                }catch(_e){ toast.error('Failed to delete site'); }
              }} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white">Delete Site</button>
            )}
          </div>
          <div className="flex items-center gap-2">
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
    </div>
    {coverPickerOpen && (
      <ImagePicker isOpen={true} onClose={()=>setCoverPickerOpen(false)} clientId={String(customerId)} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
        try{
          const up:any = await api('POST','/files/upload',{ project_id:null, client_id:customerId, employee_id:null, category_id:'site-cover-derived', original_name:'site-cover.jpg', content_type:'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
          const conf:any = await api('POST','/files/confirm',{ key:up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/clients/${customerId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=site-cover.jpg&site_id=${encodeURIComponent(String(siteId||''))}`);
          toast.success('Cover updated');
          setCoverPickerOpen(false);
        }catch(e){ toast.error('Failed to update cover'); setCoverPickerOpen(false); }
      }} />
    )}
    </>
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

