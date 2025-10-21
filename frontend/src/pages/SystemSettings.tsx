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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">System Settings</h1>
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


