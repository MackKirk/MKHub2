import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

type Item = { id:string, label:string, value?:string, sort_index?:number, meta?: any };

export default function SystemSettings(){
  const { data, refetch, isLoading } = useQuery({ queryKey:['settings-bundle'], queryFn: ()=>api<Record<string, Item[]>>('GET','/settings') });
  const lists = Object.entries(data||{}).sort(([a],[b])=> a.localeCompare(b));
  const [sel, setSel] = useState<string>('client_statuses');
  const items = (data||{})[sel]||[];
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [edits, setEdits] = useState<Record<string, Item>>({});
  const isColorList = useMemo(()=> sel.toLowerCase().includes('status'), [sel]);
  const isDivisionList = useMemo(()=> sel.toLowerCase().includes('division'), [sel]);
  const getEdit = (it: Item): Item => edits[it.id] || it;
  const brandingList = (data?.branding||[]) as Item[];
  const heroItem = brandingList.find(i=> ['user_hero_background_url','hero_background_url','user hero background','hero background'].includes(String(i.label||'').toLowerCase()));
  const overlayItem = brandingList.find(i=> ['customer_hero_overlay_url','hero_overlay_url','customer hero overlay','hero overlay'].includes(String(i.label||'').toLowerCase()));
  const [heroUrlDraft, setHeroUrlDraft] = useState<string>('');
  const [heroFile, setHeroFile] = useState<File|null>(null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string>('');
  const [heroDims, setHeroDims] = useState<{w:number,h:number}|null>(null);
  const [overlayUrlDraft, setOverlayUrlDraft] = useState<string>('');
  const [overlayFile, setOverlayFile] = useState<File|null>(null);
  const [overlayPreviewUrl, setOverlayPreviewUrl] = useState<string>('');
  // Resolve preview URL: if it's a files endpoint, fetch the signed download_url
  useEffect(()=>{
    const val = heroItem?.value||'';
    (async()=>{
      try{
        if(!val){ setHeroPreviewUrl('/ui/assets/login/background.jpg'); return; }
        if(val.startsWith('/files/')){
          const r:any = await api('GET', val);
          setHeroPreviewUrl(r.download_url||'/ui/assets/login/background.jpg');
        } else {
          setHeroPreviewUrl(val);
        }
      }catch{ setHeroPreviewUrl('/ui/assets/login/background.jpg'); }
    })();
  }, [heroItem?.value]);
  useEffect(()=>{
    const val = overlayItem?.value||'';
    (async()=>{
      try{
        if(!val){ setOverlayPreviewUrl(''); return; }
        if(val.startsWith('/files/')){
          const r:any = await api('GET', val);
          setOverlayPreviewUrl(r.download_url||'');
        } else {
          setOverlayPreviewUrl(val);
        }
      }catch{ setOverlayPreviewUrl(''); }
    })();
  }, [overlayItem?.value]);
  useEffect(()=>{
    if(!heroPreviewUrl){ setHeroDims(null); return; }
    try{
      const im = new Image();
      im.onload = ()=> setHeroDims({ w: im.naturalWidth||0, h: im.naturalHeight||0 });
      im.onerror = ()=> setHeroDims(null);
      im.src = heroPreviewUrl;
    }catch{ setHeroDims(null); }
  }, [heroPreviewUrl]);
  const saveHeroUrl = async(url:string)=>{
    try{
      if(heroItem){
        await api('PUT', `/settings/branding/${encodeURIComponent(heroItem.id)}?label=user_hero_background_url&value=${encodeURIComponent(url)}`);
      } else {
        await api('POST', `/settings/branding?label=user_hero_background_url&value=${encodeURIComponent(url)}`);
      }
      toast.success('Brand image updated');
      setHeroFile(null); setHeroUrlDraft('');
      await refetch();
    }catch(_e){ toast.error('Failed to update'); }
  };
  const uploadHero = async()=>{
    try{
      if(!heroFile){ toast.error('Select an image'); return; }
      const type = heroFile.type || 'image/jpeg';
      const up = await api('POST','/files/upload',{ original_name: heroFile.name, content_type: type, project_id: null, client_id: null, employee_id: null, category_id: 'branding-hero' });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: heroFile });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: heroFile.size, checksum_sha256: 'na', content_type: type });
      const url = `/files/${conf.id}/download`;
      await saveHeroUrl(url);
    }catch(_e){ toast.error('Upload failed'); }
  };
  const saveOverlayUrl = async(url:string)=>{
    try{
      if(overlayItem){
        await api('PUT', `/settings/branding/${encodeURIComponent(overlayItem.id)}?label=customer_hero_overlay_url&value=${encodeURIComponent(url)}`);
      } else {
        await api('POST', `/settings/branding?label=customer_hero_overlay_url&value=${encodeURIComponent(url)}`);
      }
      toast.success('Overlay updated');
      setOverlayFile(null); setOverlayUrlDraft('');
      await refetch();
    }catch(_e){ toast.error('Failed to update'); }
  };
  const uploadOverlay = async()=>{
    try{
      if(!overlayFile){ toast.error('Select an overlay image'); return; }
      const type = overlayFile.type || 'image/png';
      const up = await api('POST','/files/upload',{ original_name: overlayFile.name, content_type: type, project_id: null, client_id: null, employee_id: null, category_id: 'branding-hero-overlay' });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: overlayFile });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: overlayFile.size, checksum_sha256: 'na', content_type: type });
      const url = `/files/${conf.id}/download`;
      await saveOverlayUrl(url);
    }catch(_e){ toast.error('Upload failed'); }
  };
  return (
    <div className="space-y-4">
      <div className="mb-1 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">System Settings</div>
        <div className="text-sm opacity-90">Manage application lists, statuses, and divisions.</div>
      </div>
      <div className="rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="font-semibold">Branding</h4>
            <div className="text-xs text-gray-600">User hero background image for user pages and banners.</div>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 items-start">
          <div className="md:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Current image</div>
            <div className="rounded-lg border overflow-hidden bg-gray-50">
              <img src={heroPreviewUrl||'/ui/assets/login/background.jpg'} className="w-full h-40 object-cover" />
            </div>
            <div className="mt-1 text-[11px] text-gray-600">
              Recommended: at least 2400×1200 px (landscape).{heroDims? ` Current: ${heroDims.w}×${heroDims.h}px.`:''}
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">User hero background (URL)</div>
              <div className="flex gap-2">
                <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="https://..." value={heroUrlDraft} onChange={e=>setHeroUrlDraft(e.target.value)} />
                <button onClick={()=> heroUrlDraft.trim() && saveHeroUrl(heroUrlDraft.trim())} className="px-3 py-1.5 rounded bg-brand-red text-white">Save</button>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Or upload user hero background</div>
              <input type="file" accept="image/*" onChange={e=> setHeroFile(e.target.files?.[0]||null)} />
              <div className="text-[11px] text-gray-500 mt-1">Prefer high-resolution JPG/PNG; avoid small images to prevent pixelation.</div>
              <div className="mt-2 text-right">
                <button onClick={uploadHero} className="px-3 py-1.5 rounded border">Upload</button>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-semibold">Customer hero overlay</h4>
              <div className="text-xs text-gray-600">Optional overlay placed on the right side to blend the client image (Customer page only).</div>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 items-start">
            <div className="md:col-span-2">
              <div className="text-xs text-gray-600 mb-1">Current customer hero overlay</div>
              <div className="rounded-lg border overflow-hidden bg-gray-50">
                {overlayPreviewUrl? <img src={overlayPreviewUrl} className="w-full h-32 object-cover" /> : <div className="h-32 grid place-items-center text-xs text-gray-500">No overlay</div>}
              </div>
              <div className="mt-1 text-[11px] text-gray-600">Suggested: 2400×600 px PNG with transparency/gradient on the left.</div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">Customer hero overlay (URL)</div>
                <div className="flex gap-2">
                  <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="https://..." value={overlayUrlDraft} onChange={e=>setOverlayUrlDraft(e.target.value)} />
                  <button onClick={()=> overlayUrlDraft.trim() && saveOverlayUrl(overlayUrlDraft.trim())} className="px-3 py-1.5 rounded bg-brand-red text-white">Save</button>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Or upload customer hero overlay</div>
                <input type="file" accept="image/*" onChange={e=> setOverlayFile(e.target.files?.[0]||null)} />
                <div className="text-[11px] text-gray-500 mt-1">PNG preferred for transparency.</div>
                <div className="mt-2 text-right">
                  <button onClick={uploadOverlay} className="px-3 py-1.5 rounded border">Upload</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-3">
          <h4 className="font-semibold mb-2">Lists</h4>
          <div className="space-y-1">
            {lists.map(([name])=> (
              <button key={name} onClick={()=>setSel(name)} className={`w-full text-left px-3 py-2 rounded ${sel===name? 'bg-black text-white':'hover:bg-gray-50'}`}>{name}</button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 rounded-xl border bg-white p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{sel}</h4>
            <div className="flex items-center gap-2">
              <input className="border rounded px-2 py-1 text-sm" placeholder="Label" value={label} onChange={e=>setLabel(e.target.value)} />
              {isDivisionList ? (
                <>
                  <input className="border rounded px-2 py-1 text-sm w-28" placeholder="Abbr" value={(value||'').split('|')[0]||''} onChange={e=>{ const parts = (value||'').split('|'); parts[0] = e.target.value; setValue(parts.join('|')); }} />
                  <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={((value||'').split('|')[1]||'#cccccc')} onChange={e=>{ const parts = (value||'').split('|'); parts[1] = e.target.value; setValue(parts.join('|')); }} />
                </>
              ) : isColorList ? (
                <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={value||'#cccccc'} onChange={e=>setValue(e.target.value)} />
              ) : (
                <input className="border rounded px-2 py-1 text-sm" placeholder="Value" value={value} onChange={e=>setValue(e.target.value)} />
              )}
              <button onClick={async()=>{ if(!label){ toast.error('Label required'); return; } try{ await api('POST', `/settings/${encodeURIComponent(sel)}`, undefined, { 'Content-Type':'application/x-www-form-urlencoded' }); }catch{} try{ let url = `/settings/${encodeURIComponent(sel)}?label=${encodeURIComponent(label)}`; if(isDivisionList){ const [abbr, color] = (value||'').split('|'); url += `&abbr=${encodeURIComponent(abbr||'')}&color=${encodeURIComponent(color||'#cccccc')}`; } else if (isColorList){ url += `&value=${encodeURIComponent(value||'#cccccc')}`; } else { url += `&value=${encodeURIComponent(value||'')}`; } await api('POST', url); setLabel(''); setValue(''); await refetch(); toast.success('Added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-1.5 rounded bg-brand-red text-white">Add</button>
            </div>
          </div>
          <div className="rounded border overflow-hidden divide-y">
            {isLoading? <div className="p-3"><div className="h-6 bg-gray-100 animate-pulse rounded"/></div> : items.length? items.map(it=> {
              const e = getEdit(it);
              return (
                <div key={it.id} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input className="border rounded px-2 py-1 text-sm w-48" value={e.label} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), label: ev.target.value } }))} />
                    {isDivisionList ? (
                      <>
                        <input className="border rounded px-2 py-1 text-sm w-24" placeholder="Abbr" value={e.meta?.abbr||''} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), abbr: ev.target.value } } }))} />
                        <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={e.meta?.color||'#cccccc'} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), color: ev.target.value } } }))} />
                      </>
                    ) : isColorList ? (
                      <>
                        <input type="color" title="Color" className="border rounded w-10 h-8 p-0" value={e.value||'#cccccc'} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), value: ev.target.value } }))} />
                        <span className="text-[11px] text-gray-500">{e.value}</span>
                        {sel === 'project_statuses' && (
                          <label className="flex items-center gap-1 text-xs text-gray-700 ml-2">
                            <input type="checkbox" checked={!!e.meta?.allow_edit_proposal} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), meta: { ...(s[it.id]?.meta||it.meta||{}), allow_edit_proposal: ev.target.checked } } }))} />
                            Allow edit proposal/estimate
                          </label>
                        )}
                      </>
                    ) : (
                      <input className="border rounded px-2 py-1 text-sm w-40" placeholder="Value" value={e.value||''} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), value: ev.target.value } }))} />
                    )}
                    {/* sort index is now auto-assigned and not user-editable */}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={async()=>{ try{ let url = `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}?label=${encodeURIComponent(e.label||'')}`; if (isDivisionList){ url += `&abbr=${encodeURIComponent(e.meta?.abbr||'')}&color=${encodeURIComponent(e.meta?.color||'')}`; } else if (isColorList){ url += `&value=${encodeURIComponent(e.value||'')}`; if (sel === 'project_statuses'){ const allowEdit = e.meta?.allow_edit_proposal; url += `&allow_edit_proposal=${(allowEdit === true || allowEdit === 'true' || allowEdit === 1) ? 'true' : 'false'}`; } } else { url += `&value=${encodeURIComponent(e.value||'')}`; } await api('PUT', url); await refetch(); toast.success('Saved'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-black text-white">Save</button>
                    <button onClick={async()=>{ if(!confirm('Delete item?')) return; try{ await api('DELETE', `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}`); await refetch(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
                  </div>
                </div>
              );
            }) : <div className="p-3 text-sm text-gray-600">No items</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


