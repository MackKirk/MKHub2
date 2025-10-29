import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
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
  const heroItem = brandingList.find(i=> (i.label||'').toLowerCase()==='hero_background_url');
  const [heroUrlDraft, setHeroUrlDraft] = useState<string>('');
  const [heroFile, setHeroFile] = useState<File|null>(null);
  const saveHeroUrl = async(url:string)=>{
    try{
      if(heroItem){
        await api('PUT', `/settings/branding/${encodeURIComponent(heroItem.id)}?label=hero_background_url&value=${encodeURIComponent(url)}`);
      } else {
        await api('POST', `/settings/branding?label=hero_background_url&value=${encodeURIComponent(url)}`);
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
      const up = await api('POST','/files/upload',{ original_name: heroFile.name, content_type: type });
      await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': type, 'x-ms-blob-type':'BlockBlob' }, body: heroFile });
      const conf = await api('POST','/files/confirm',{ key: up.key, size_bytes: heroFile.size, checksum_sha256: 'na', content_type: type });
      const url = `/files/${conf.id}/download`;
      await saveHeroUrl(url);
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
            <div className="text-xs text-gray-600">Hero background image for user pages and banners.</div>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3 items-start">
          <div className="md:col-span-2">
            <div className="text-xs text-gray-600 mb-1">Current image</div>
            <div className="rounded-lg border overflow-hidden bg-gray-50">
              <img src={(heroItem?.value)||'/ui/assets/login/background.jpg'} className="w-full h-40 object-cover" />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Set by URL</div>
              <div className="flex gap-2">
                <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="https://..." value={heroUrlDraft} onChange={e=>setHeroUrlDraft(e.target.value)} />
                <button onClick={()=> heroUrlDraft.trim() && saveHeroUrl(heroUrlDraft.trim())} className="px-3 py-1.5 rounded bg-brand-red text-white">Save</button>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Or upload image</div>
              <input type="file" accept="image/*" onChange={e=> setHeroFile(e.target.files?.[0]||null)} />
              <div className="mt-2 text-right">
                <button onClick={uploadHero} className="px-3 py-1.5 rounded border">Upload</button>
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
                      </>
                    ) : (
                      <input className="border rounded px-2 py-1 text-sm w-40" placeholder="Value" value={e.value||''} onChange={ev=> setEdits(s=>({ ...s, [it.id]: { ...(s[it.id]||it), value: ev.target.value } }))} />
                    )}
                    {/* sort index is now auto-assigned and not user-editable */}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={async()=>{ try{ let url = `/settings/${encodeURIComponent(sel)}/${encodeURIComponent(it.id)}?label=${encodeURIComponent(e.label||'')}`; if (isDivisionList){ url += `&abbr=${encodeURIComponent(e.meta?.abbr||'')}&color=${encodeURIComponent(e.meta?.color||'')}`; } else if (isColorList){ url += `&value=${encodeURIComponent(e.value||'')}`; } else { url += `&value=${encodeURIComponent(e.value||'')}`; } await api('PUT', url); await refetch(); toast.success('Saved'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-black text-white">Save</button>
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


