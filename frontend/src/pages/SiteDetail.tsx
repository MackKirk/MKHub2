import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string };

export default function SiteDetail(){
  const { customerId, siteId } = useParams();
  const [tab, setTab] = useState<'overview'|'general'|'projects'|'files'>('overview');
  const { data:sites } = useQuery({ queryKey:['clientSites', customerId], queryFn: ()=>api<Site[]>('GET', `/clients/${customerId}/sites`) });
  const s = (sites||[]).find(x=> String(x.id)===String(siteId)) || {} as Site;
  const { data:files } = useQuery({ queryKey:['siteFiles', customerId, siteId], queryFn: ()=>api<ClientFile[]>('GET', `/clients/${customerId}/files?site_id=${encodeURIComponent(String(siteId||''))}`) });
  const { data:proposals } = useQuery({ queryKey:['siteProposals', customerId, siteId], queryFn: ()=>api<Proposal[]>('GET', `/proposals?client_id=${encodeURIComponent(String(customerId||''))}&site_id=${encodeURIComponent(String(siteId||''))}`) });
  const pics = useMemo(()=> (files||[]).filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/')), [files]);
  const docs = useMemo(()=> (files||[]).filter(f=> !(f.is_image===true) && !String(f.content_type||'').startsWith('image/')), [files]);

  const [file, setFile] = useState<File|null>(null);

  // derive a cover image
  const cover = pics[0];
  const coverUrl = cover ? `/files/${cover.file_object_id}/thumbnail?w=800` : '/ui/assets/login/logo-light.svg';

  return (
    <div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] rounded-t-xl p-5 text-white">
          <div className="flex gap-4 items-stretch min-h-[220px]">
            <div className="w-[260px] relative group">
              <img src={coverUrl} className="w-full h-full object-cover rounded-xl border-2 border-brand-red" />
              <button onClick={()=>document.getElementById('site-file-input')?.click()} className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">✏️ Change</button>
              <input id="site-file-input" type="file" className="hidden" onChange={async(e)=>{
                const f = e.target.files?.[0]; if(!f) return; try{
                  const up:any = await api('POST','/files/upload',{ project_id:null, client_id:customerId, employee_id:null, category_id:'site-cover', original_name:f.name, content_type: f.type||'image/jpeg' });
                  const put = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': f.type||'image/jpeg', 'x-ms-blob-type': 'BlockBlob' }, body: f }); if(!put.ok) throw new Error('upload failed');
                  const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: f.size, checksum_sha256: 'na', content_type: f.type||'image/jpeg' });
                  await api('POST', `/clients/${customerId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=${encodeURIComponent(f.name)}&site_id=${encodeURIComponent(String(siteId||''))}`);
                  toast.success('Cover updated'); location.reload();
                }catch(_e){ toast.error('Failed to update cover'); }
              }} />
            </div>
            <div className="flex-1 flex flex-col justify-start">
              <div className="text-3xl font-extrabold">{s.site_name||siteId}</div>
              <div className="text-sm opacity-90 mt-1">{s.site_address_line1||''} {s.site_city||''} {s.site_province||''} {s.site_country||''}</div>
              <div className="mt-auto flex gap-3">
                {(['overview','general','projects','files'] as const).map(k=> (
                  <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-full ${tab===k?'bg-black text-white':'bg-white text-black'}`}>{k[0].toUpperCase()+k.slice(1)}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5">
          {tab==='overview' && (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <Field label="Address"><div className="border rounded px-3 py-2 bg-gray-50">{s.site_address_line1||'-'}</div></Field>
              <Field label="City/Province"><div className="border rounded px-3 py-2 bg-gray-50">{s.site_city||''} {s.site_province||''}</div></Field>
              <Field label="Country"><div className="border rounded px-3 py-2 bg-gray-50">{s.site_country||''}</div></Field>
            </div>
          )}
          {tab==='general' && (
            <SiteGeneralForm customerId={String(customerId||'')} site={s} />
          )}
          {tab==='projects' && (
            <SiteProjects customerId={String(customerId||'')} siteId={String(siteId||'')} proposals={proposals||[]} />
          )}
          {tab==='files' && (
            <div>
              <div className="mb-3 flex items-center gap-2"><input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} /><button onClick={async()=>{
                if(!file) return; try{
                  const up:any = await api('POST','/files/upload',{ project_id:null, client_id:customerId, employee_id:null, category_id:'site-docs', original_name:file.name, content_type: file.type||'application/octet-stream' });
                  const put = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, body: file });
                  if (!put.ok) throw new Error('upload failed');
                  const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256: 'na', content_type: file.type||'application/octet-stream' });
                  await api('POST', `/clients/${customerId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-docs&original_name=${encodeURIComponent(file.name)}&site_id=${encodeURIComponent(String(siteId||''))}`);
                  toast.success('Uploaded');
                  location.reload();
                }catch(e){ toast.error('Upload failed'); }
              }} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button></div>
              <div className="mb-3 flex items-center gap-2">
                <button onClick={async()=>{
                  for (const p of pics){
                    try{ const resp = await fetch(`/files/${p.file_object_id}/download`); const j = await resp.json(); if (j && j.download_url) window.open(j.download_url, '_blank'); }catch(e){}
                  }
                }} className="px-3 py-2 rounded bg-black text-white">Download all pictures</button>
              </div>
              <h4 className="font-semibold mb-2">Pictures</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                {pics.map(f=> (
                  <div key={f.id} className="relative group">
                    <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=300`} />
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                      <a href={`/files/${f.file_object_id}/download`} target="_blank" className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</a>
                      <button onClick={async(e)=>{ e.stopPropagation(); if(!confirm('Delete this picture?')) return; try{ await api('DELETE', `/clients/${customerId}/files/${encodeURIComponent(String(f.id))}`); toast.success('Deleted'); location.reload(); }catch(_e){ toast.error('Delete failed'); } }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Delete">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
              <h4 className="font-semibold mb-2">Documents</h4>
              <div className="rounded border">
                {(docs||[]).length? (docs||[]).map(f=> (
                  <div key={f.id} className="flex items-center justify-between border-b px-3 py-2 text-sm">
                    <div className="truncate max-w-[60%]">{f.file_object_id}</div>
                    <div className="space-x-2">
                      <a className="underline" href={`/files/${f.file_object_id}/download`} target="_blank">Open</a>
                      <button onClick={async()=>{ if(!confirm('Delete this file?')) return; try{ await api('DELETE', `/clients/${customerId}/files/${encodeURIComponent(String(f.id))}`); toast.success('Deleted'); location.reload(); }catch(_e){ toast.error('Delete failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                    </div>
                  </div>
                )) : <div className="p-3 text-sm text-gray-600">No documents</div>}
              </div>
            </div>
          )}
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

function SiteGeneralForm({ customerId, site }:{ customerId:string, site: Site }){
  const [form, setForm] = useState<any>({ ...site });
  const set = (k:string, v:any)=> setForm((s:any)=>({ ...s, [k]: v }));
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Site name"><input className="w-full border rounded px-3 py-2" value={form.site_name||''} onChange={e=>set('site_name', e.target.value)} /></Field>
      <Field label="Address 1"><input className="w-full border rounded px-3 py-2" value={form.site_address_line1||''} onChange={e=>set('site_address_line1', e.target.value)} /></Field>
      <Field label="City"><input className="w-full border rounded px-3 py-2" value={form.site_city||''} onChange={e=>set('site_city', e.target.value)} /></Field>
      <Field label="Province/State"><input className="w-full border rounded px-3 py-2" value={form.site_province||''} onChange={e=>set('site_province', e.target.value)} /></Field>
      <Field label="Country"><input className="w-full border rounded px-3 py-2" value={form.site_country||''} onChange={e=>set('site_country', e.target.value)} /></Field>
      <div className="md:col-span-2 text-right">
        <button onClick={async()=>{ try{ await api('PATCH', `/clients/${encodeURIComponent(customerId)}/sites/${encodeURIComponent(String(site.id))}`, form); toast.success('Saved'); location.reload(); }catch(_e){ toast.error('Save failed'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Save</button>
      </div>
    </div>
  );
}

function SiteProjects({ customerId, siteId, proposals }:{ customerId:string, siteId:string, proposals: Proposal[] }){
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="p-3 flex justify-end">
        <button onClick={()=>{ window.location.href = `/ui/proposal-auto.html?client_id=${encodeURIComponent(customerId)}&site_id=${encodeURIComponent(siteId)}`; }} className="px-3 py-2 rounded bg-brand-red text-white">New Proposal</button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr><th className="text-left p-2">Title</th><th className="text-left p-2">Order</th><th className="text-left p-2">Created</th></tr></thead>
        <tbody>
          {(proposals||[]).map(p=> (<tr key={p.id} className="border-t"><td className="p-2">{p.title||'Proposal'}</td><td className="p-2">{p.order_number||''}</td><td className="p-2">{(p.created_at||'').slice(0,10)}</td></tr>))}
          {(!proposals||!proposals.length) && <tr><td colSpan={3} className="p-3 text-gray-600">No proposals</td></tr>}
        </tbody>
      </table>
    </div>
  );
}


