import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Material = { id:number, name:string, supplier_name?:string, unit?:string, price?:number, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number };
type Item = { material_id?:number, name:string, unit?:string, quantity:number, unit_price:number, section:string, description?:string, item_type?:string };

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

  // Group items by section
  const groupedItems = useMemo(()=>{
    const groups: Record<string, Item[]> = {};
    items.forEach(it=>{
      const section = it.section || 'Miscellaneous';
      if(!groups[section]) groups[section] = [];
      groups[section].push(it);
    });
    return groups;
  }, [items]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <AddProductModal onAdd={(it)=> setItems(prev=> [...prev, it])} />
        <AddLabourModal onAdd={(it)=> setItems(prev=> [...prev, it])} />
        <AddSubContractorModal onAdd={(it)=> setItems(prev=> [...prev, it])} />
        <AddShopModal onAdd={(it)=> setItems(prev=> [...prev, it])} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <label>Markup (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={markup} onChange={e=>setMarkup(Number(e.target.value||0))} />
          <label>PST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={pstRate} onChange={e=>setPstRate(Number(e.target.value||0))} />
          <label>GST (%)</label><input type="number" className="border rounded px-2 py-1 w-20" value={gstRate} onChange={e=>setGstRate(Number(e.target.value||0))} />
        </div>
      </div>

      {/* Sections grouped display */}
      <div className="space-y-4">
        {Object.keys(groupedItems).length > 0 ? (
          Object.keys(groupedItems).map(section=> (
            <div key={section} className="rounded-xl border overflow-hidden bg-white">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <h3 className="font-semibold text-gray-900">{section}</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  <th className="p-2 text-left">Product / Item</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit</th>
                  <th className="p-2 text-right">Unit Price</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2"></th>
                </tr></thead>
                <tbody>
                  {groupedItems[section].map((it, idx)=> {
                    const originalIdx = items.indexOf(it);
                    return (
                      <tr key={`${section}-${originalIdx}`} className="border-b hover:bg-gray-50">
                        <td className="p-2">{it.name}</td>
                        <td className="p-2 text-right">{it.quantity}</td>
                        <td className="p-2 text-right">{it.unit||''}</td>
                        <td className="p-2 text-right">${it.unit_price.toFixed(2)}</td>
                        <td className="p-2 text-right">${(it.quantity*it.unit_price).toFixed(2)}</td>
                        <td className="p-2 text-right"><button onClick={()=> setItems(prev=> prev.filter((_,i)=> i!==originalIdx))} className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200">Remove</button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={4} className="p-2 text-right font-semibold">Section Subtotal:</td>
                    <td className="p-2 text-right font-bold">${groupedItems[section].reduce((acc, it)=> acc + (it.quantity*it.unit_price), 0).toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))
        ) : (
          <div className="rounded-xl border bg-white p-6 text-center text-gray-600">
            No items yet. Add products, labour, sub-contractors or shop items to build your estimate.
          </div>
        )}
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
                const payload = { project_id: projectId, markup, items: items.map(it=> ({ material_id: it.material_id, quantity: it.quantity, unit_price: it.unit_price, section: it.section, description: it.description, item_type: it.item_type })) };
                await api('POST','/estimate/estimates', payload);
                toast.success('Estimate saved');
              }catch(_e){ toast.error('Failed to save'); }
            }} className="px-3 py-2 rounded bg-brand-red text-white">Save Estimate</button>
          </div>
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
  const [unit, setUnit] = useState<string>('');
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
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Product</div>
              <button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input className="border rounded px-3 py-2 flex-1" placeholder="Search products..." value={q} onChange={e=>setQ(e.target.value)} />
                <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-gray-100">{isFetching? 'Searching...' : 'Search'}</button>
              </div>
              <div className="max-h-64 overflow-auto rounded border divide-y">
                {list.length? list.map(p=> (
                  <button key={p.id} onClick={()=> { setSelection(p); setUnit(p.unit||'each'); }} className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id===p.id? 'ring-2 ring-brand-red':''}`}>
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
                      onAdd({ material_id: selection.id, name: selection.name, unit: selection.unit, quantity: qn, unit_price: Number(selection.price||0), section, item_type: 'product' });
                      setOpen(false); setQ(''); setSelection(null); setQty('1'); setUnit('');
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

function AddLabourModal({ onAdd }:{ onAdd:(it: Item)=>void }){
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [section, setSection] = useState('Roof System');
  const [qty, setQty] = useState<string>('1');
  const [unit, setUnit] = useState<string>('hr');
  const [price, setPrice] = useState<string>('0');
  const [journeyType, setJourneyType] = useState<'days'|'hours'|'contract'>('days');

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100">+ Add Labour</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Labour</div>
              <button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button>
            </div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-gray-600">Labour Description</label><input className="w-full border rounded px-3 py-2" placeholder="e.g., Roof installation, Site prep..." value={description} onChange={e=>setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-600">Section</label>
                  <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                    {['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'].map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Journey Type</label>
                  <select className="w-full border rounded px-3 py-2" value={journeyType} onChange={e=>setJourneyType(e.target.value as any)}>
                    <option value="days">Days</option>
                    <option value="hours">Hours</option>
                    <option value="contract">Contract</option>
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Quantity</label><input className="w-full border rounded px-3 py-2" value={qty} onChange={e=>setQty(e.target.value)} /></div>
                <div><label className="text-xs text-gray-600">Unit</label><input className="w-full border rounded px-3 py-2" value={unit} onChange={e=>setUnit(e.target.value)} placeholder={journeyType} /></div>
                <div className="col-span-2"><label className="text-xs text-gray-600">Price per Unit ($)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={price} onChange={e=>setPrice(e.target.value)} /></div>
              </div>
              <div className="bg-gray-100 p-3 rounded text-sm">
                <strong>Total Preview:</strong> {qty} {unit} × ${Number(price||0).toFixed(2)} = ${(Number(qty||0)*Number(price||0)).toFixed(2)}
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  const qn = Number(qty||'0'); const pr = Number(price||'0');
                  if(!description.trim() || !qn){ toast.error('Description and quantity required'); return; }
                  onAdd({ name: description, unit: unit, quantity: qn, unit_price: pr, section, description: description, item_type: 'labour' });
                  setOpen(false); setDescription(''); setQty('1'); setUnit('hr'); setPrice('0'); setJourneyType('days');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Item</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddSubContractorModal({ onAdd }:{ onAdd:(it: Item)=>void }){
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [section, setSection] = useState('Roof System');
  const [qty, setQty] = useState<string>('1');
  const [unit, setUnit] = useState<string>('item');
  const [price, setPrice] = useState<string>('0');
  const [type, setType] = useState<'debris-cartage'|'portable-washroom'|'other'>('other');

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100">+ Add Sub-Contractor</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Sub-Contractors</div>
              <button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button>
            </div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-gray-600">Sub-Contractor Type</label>
                <select className="w-full border rounded px-3 py-2" value={type} onChange={e=>setType(e.target.value as any)}>
                  <option value="debris-cartage">Debris Cartage</option>
                  <option value="portable-washroom">Portable Washroom</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div><label className="text-xs text-gray-600">Description</label><input className="w-full border rounded px-3 py-2" placeholder="Enter description..." value={description} onChange={e=>setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-600">Section</label>
                  <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                    {['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'].map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Quantity</label><input className="w-full border rounded px-3 py-2" value={qty} onChange={e=>setQty(e.target.value)} /></div>
                <div><label className="text-xs text-gray-600">Unit</label><input className="w-full border rounded px-3 py-2" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
                <div><label className="text-xs text-gray-600">Price per Unit ($)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={price} onChange={e=>setPrice(e.target.value)} /></div>
              </div>
              <div className="bg-gray-100 p-3 rounded text-sm">
                <strong>Total Preview:</strong> {qty} {unit} × ${Number(price||0).toFixed(2)} = ${(Number(qty||0)*Number(price||0)).toFixed(2)}
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  const qn = Number(qty||'0'); const pr = Number(price||'0');
                  if(!description.trim() || !qn){ toast.error('Description and quantity required'); return; }
                  onAdd({ name: description, unit: unit, quantity: qn, unit_price: pr, section, description: description, item_type: 'subcontractor' });
                  setOpen(false); setDescription(''); setQty('1'); setUnit('item'); setPrice('0'); setType('other');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Item</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddShopModal({ onAdd }:{ onAdd:(it: Item)=>void }){
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [section, setSection] = useState('Roof System');
  const [qty, setQty] = useState<string>('1');
  const [unit, setUnit] = useState<string>('item');
  const [price, setPrice] = useState<string>('0');

  return (
    <>
      <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-gray-100">+ Add Shop</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Add Shop</div>
              <button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button>
            </div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-gray-600">Name/Description</label><input className="w-full border rounded px-3 py-2" placeholder="e.g., Tools, Equipment rental..." value={description} onChange={e=>setDescription(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-600">Section</label>
                  <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                    {['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'].map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-600">Quantity</label><input className="w-full border rounded px-3 py-2" value={qty} onChange={e=>setQty(e.target.value)} /></div>
                <div><label className="text-xs text-gray-600">Unit</label><input className="w-full border rounded px-3 py-2" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
                <div><label className="text-xs text-gray-600">Price per Unit ($)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={price} onChange={e=>setPrice(e.target.value)} /></div>
              </div>
              <div className="bg-gray-100 p-3 rounded text-sm">
                <strong>Total Preview:</strong> {qty} {unit} × ${Number(price||0).toFixed(2)} = ${(Number(qty||0)*Number(price||0)).toFixed(2)}
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  const qn = Number(qty||'0'); const pr = Number(price||'0');
                  if(!description.trim() || !qn){ toast.error('Description and quantity required'); return; }
                  onAdd({ name: description, unit: unit, quantity: qn, unit_price: pr, section, description: description, item_type: 'shop' });
                  setOpen(false); setDescription(''); setQty('1'); setUnit('item'); setPrice('0');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Item</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


