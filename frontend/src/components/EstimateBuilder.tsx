import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Material = { id:number, name:string, supplier_name?:string, unit?:string, price?:number };
type Item = { material_id:number, name:string, unit?:string, quantity:number, unit_price:number, section:string };

export default function EstimateBuilder({ projectId }:{ projectId:string }){
  const [items, setItems] = useState<Item[]>([]);
  const [markup, setMarkup] = useState<number>(5);
  const [pstRate, setPstRate] = useState<number>(7);
  const [gstRate, setGstRate] = useState<number>(5);
  const sections = ['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'];

  const total = useMemo(()=> items.reduce((acc, it)=> acc + (it.quantity * it.unit_price), 0), [items]);
  const pst = useMemo(()=> (total * (pstRate/100)), [total, pstRate]);
  const subtotal = useMemo(()=> total + pst, [total, pst]);
  const markupValue = useMemo(()=> subtotal * (markup/100), [subtotal, markup]);
  const finalTotal = useMemo(()=> subtotal + markupValue, [subtotal, markupValue]);
  const grandTotal = useMemo(()=> finalTotal * (1 + (gstRate/100)), [finalTotal, gstRate]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <AddProductModal onAdd={(it)=> setItems(prev=> [...prev, it])} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <label>Markup (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={markup} onChange={e=>setMarkup(Number(e.target.value||0))} />
          <label>PST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={pstRate} onChange={e=>setPstRate(Number(e.target.value||0))} />
          <label>GST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={gstRate} onChange={e=>setGstRate(Number(e.target.value||0))} />
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm bg-white">
          <thead className="bg-gray-50"><tr>
            <th className="p-2 text-left">Section</th>
            <th className="p-2 text-left">Product</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Unit</th>
            <th className="p-2 text-right">Unit Price</th>
            <th className="p-2 text-right">Total</th>
            <th className="p-2"></th>
          </tr></thead>
          <tbody>
            {items.length? items.map((it, idx)=> (
              <tr key={idx} className="border-t">
                <td className="p-2">{it.section}</td>
                <td className="p-2">{it.name}</td>
                <td className="p-2 text-right">{it.quantity}</td>
                <td className="p-2 text-right">{it.unit||''}</td>
                <td className="p-2 text-right">${it.unit_price.toFixed(2)}</td>
                <td className="p-2 text-right">${(it.quantity*it.unit_price).toFixed(2)}</td>
                <td className="p-2 text-right"><button onClick={()=> setItems(prev=> prev.filter((_,i)=> i!==idx))} className="px-2 py-1 rounded bg-gray-100">Remove</button></td>
              </tr>
            )) : <tr><td colSpan={7} className="p-3 text-gray-600">No items yet. Add products to build your estimate.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <h4 className="font-semibold mb-2">Summary</h4>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between"><span>Total Direct Project Costs</span><span>${total.toFixed(2)}</span></div>
            <div className="flex items-center justify-between"><span>PST</span><span>${pst.toFixed(2)}</span></div>
            <div className="flex items-center justify-between"><span>Sub-total</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex items-center justify-between"><span>Overhead & Profit (mark-up)</span><span>${markupValue.toFixed(2)}</span></div>
            <div className="flex items-center justify-between font-medium"><span>Total Estimate</span><span>${finalTotal.toFixed(2)}</span></div>
            <div className="flex items-center justify-between"><span>GST</span><span>${(finalTotal*(gstRate/100)).toFixed(2)}</span></div>
            <div className="flex items-center justify-between font-semibold text-lg"><span>Final Total (with GST)</span><span>${grandTotal.toFixed(2)}</span></div>
          </div>
          <div className="mt-3 text-right">
            <button onClick={async()=>{
              try{
                const payload = { project_id: projectId, markup, items: items.map(it=> ({ material_id: it.material_id, quantity: it.quantity, unit_price: it.unit_price, section: it.section })) };
                await api('POST','/estimate/estimates', payload);
                toast.success('Estimate saved');
              }catch(_e){ toast.error('Failed to save'); }
            }} className="px-3 py-2 rounded bg-brand-red text-white">Save Estimate</button>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h4 className="font-semibold mb-2">Notes</h4>
          <div className="text-sm text-gray-600">Add labour, subcontractors and shop costs in a later iteration.</div>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ onAdd }:{ onAdd:(it: Item)=>void }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [section, setSection] = useState('Roof System');
  const [qty, setQty] = useState<string>('1');
  const [selection, setSelection] = useState<Material|null>(null);
  const { data, refetch, isFetching } = useQuery({ queryKey:['mat-search', q], queryFn: async()=>{
    const params = new URLSearchParams(); if(q) params.set('q', q);
    return await api<Material[]>('GET', params.toString()? `/estimate/products/search?${params.toString()}` : '/estimate/products');
  }});
  const list = data||[];

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100">+ Add Product</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[720px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">Add Product</div><button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2"><input className="border rounded px-3 py-2 flex-1" placeholder="Search products..." value={q} onChange={e=>setQ(e.target.value)} /><button onClick={()=>refetch()} className="px-3 py-2 rounded bg-gray-100">{isFetching? 'Searching...' : 'Search'}</button></div>
              <div className="max-h-64 overflow-auto rounded border divide-y">
                {list.length? list.map(p=> (
                  <button key={p.id} onClick={()=> setSelection(p)} className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id===p.id? 'ring-2 ring-brand-red':''}`}>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.supplier_name||''} · {p.unit||''} · ${Number(p.price||0).toFixed(2)}</div>
                  </button>
                )): <div className="p-3 text-sm text-gray-600 bg-white">No results</div>}
              </div>
              {selection && (
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-xs text-gray-600">Section</label>
                    <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                      {['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'].map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs text-gray-600">Quantity</label><input className="w-full border rounded px-3 py-2" value={qty} onChange={e=>setQty(e.target.value)} /></div>
                  <div className="col-span-3 text-right">
                    <button onClick={()=>{
                      const qn = Number(qty||'0'); if(!selection || !qn){ toast.error('Select product and quantity'); return; }
                      onAdd({ material_id: selection.id, name: selection.name, unit: selection.unit, quantity: qn, unit_price: Number(selection.price||0), section });
                      setOpen(false); setQ(''); setSelection(null); setQty('1');
                    }} className="px-3 py-2 rounded bg-brand-red text-white">Add Item</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


