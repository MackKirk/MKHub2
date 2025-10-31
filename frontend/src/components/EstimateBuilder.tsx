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
  const [selection, setSelection] = useState<Material|null>(null);
  const { data } = useQuery({ queryKey:['mat-search', q], queryFn: async()=>{
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
              <div>
                <label className="text-xs text-gray-600">Search Product:</label>
                <input className="w-full border rounded px-3 py-2" placeholder="Type product name..." value={q} onChange={e=>setQ(e.target.value)} />
              </div>
              {list.length > 0 && (
                <div className="max-h-64 overflow-auto rounded border divide-y">
                  {list.map(p=> (
                    <button key={p.id} onClick={()=>setSelection(p)} className={`w-full text-left px-3 py-2 bg-white hover:bg-gray-50 ${selection?.id===p.id? 'ring-2 ring-brand-red':''}`}>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.supplier_name||''} · {p.unit||''} · ${Number(p.price||0).toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              )}
              {selection && (
                <div className="border rounded p-3 bg-gray-50">
                  <div className="font-medium">{selection.name}</div>
                  <div className="text-sm text-gray-600">Supplier: {selection.supplier_name||'N/A'}</div>
                  <div className="text-sm text-gray-600">Unit: {selection.unit||'-'}</div>
                  <div className="text-sm text-gray-600">Price: ${Number(selection.price||0).toFixed(2)}</div>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-600">Section:</label>
                <select className="w-full border rounded px-3 py-2" value={section} onChange={e=>setSection(e.target.value)}>
                  {['Roof System','Wood Blocking / Accessories','Flashing','Miscellaneous'].map(s=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!selection){ toast.error('Select a product first'); return; }
                  onAdd({ material_id: selection.id, name: selection.name, unit: selection.unit, quantity: 1, unit_price: Number(selection.price||0), section, item_type: 'product' });
                  setOpen(false); setQ(''); setSelection(null);
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Item</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AddLabourModal({ onAdd }:{ onAdd:(it: Item)=>void }){
  const [open, setOpen] = useState(false);
  const [labour, setLabour] = useState('');
  const [men, setMen] = useState<string>('1');
  const [journeyType, setJourneyType] = useState<'days'|'hours'|'contract'>('days');
  const [days, setDays] = useState<string>('1');
  const [hours, setHours] = useState<string>('1');
  const [contractNumber, setContractNumber] = useState<string>('1');
  const [contractUnit, setContractUnit] = useState('');
  const [price, setPrice] = useState<string>('0');
  
  const showDays = journeyType === 'days';
  const showHours = journeyType === 'hours';
  const showContract = journeyType === 'contract';

  const total = useMemo(()=>{
    const p = Number(price||0);
    const m = Number(men||0);
    if(showContract){
      return Number(contractNumber||0) * p;
    }else if(showHours){
      return m * Number(hours||0) * p;
    }else{
      return m * Number(days||0) * p;
    }
  }, [men, days, hours, contractNumber, price, journeyType]);

  const calcText = useMemo(()=>{
    const p = Number(price||0).toFixed(2);
    if(showContract){
      return `${contractNumber} ${contractUnit} × $${p} = $${total.toFixed(2)}`;
    }else if(showHours){
      return `${men} men × ${hours} hours × $${p} = $${total.toFixed(2)}`;
    }else{
      return `${men} men × ${days} days × $${p} = $${total.toFixed(2)}`;
    }
  }, [men, days, hours, contractNumber, contractUnit, price, total, journeyType]);

  const priceLabel = useMemo(()=>{
    if(showContract) return 'Price ($ per unit):';
    if(showHours) return 'Price per Worker ($ per hour):';
    return 'Price per Worker ($ per day):';
  }, [journeyType]);

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
              <div>
                <label className="text-xs text-gray-600">Labour:</label>
                <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter labour function name..." value={labour} onChange={e=>setLabour(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Quantity (Men):</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={men} min={1} step={1} onChange={e=>setMen(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Journey:</label>
                <select className="w-full border rounded px-3 py-2" value={journeyType} onChange={e=>setJourneyType(e.target.value as any)}>
                  <option value="days">Days</option>
                  <option value="hours">Hours</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
              {showDays && (
                <div>
                  <label className="text-xs text-gray-600">Number of Days:</label>
                  <input type="number" className="w-full border rounded px-3 py-2" value={days} min={0} step={0.5} onChange={e=>setDays(e.target.value)} />
                </div>
              )}
              {showHours && (
                <div>
                  <label className="text-xs text-gray-600">Number of Hours:</label>
                  <input type="number" className="w-full border rounded px-3 py-2" value={hours} min={0} step={0.5} onChange={e=>setHours(e.target.value)} />
                </div>
              )}
              {showContract && (
                <div>
                  <label className="text-xs text-gray-600">Number:</label>
                  <div className="flex gap-2 items-center">
                    <input type="number" className="w-24 border rounded px-3 py-2" value={contractNumber} min={0} step={0.01} onChange={e=>setContractNumber(e.target.value)} />
                    <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={contractUnit} onChange={e=>setContractUnit(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs text-gray-600">{priceLabel}</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
              </div>
              <div className="bg-gray-100 p-3 rounded">
                <strong>Total Preview:</strong>
                <div className="mt-1 text-sm text-gray-600">{calcText}</div>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!labour.trim()){ toast.error('Please enter a labour name'); return; }
                  const totalValue = total;
                  let desc, qty, unit;
                  if(showContract){
                    desc = labour;
                    qty = Number(contractNumber||0);
                    unit = contractUnit||'each';
                  }else{
                    desc = `${labour} - ${men} men`;
                    qty = Number(men||0);
                    unit = showHours ? 'hours' : 'days';
                  }
                  onAdd({ name: desc, unit, quantity: qty, unit_price: totalValue, section: 'Labour', description: desc, item_type: 'labour' });
                  setOpen(false); setLabour(''); setMen('1'); setDays('1'); setHours('1'); setContractNumber('1'); setContractUnit(''); setPrice('0'); setJourneyType('days');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Labour</button>
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
  const [type, setType] = useState<'debris-cartage'|'portable-washroom'|'other'|''>('');
  
  // Debris Cartage fields
  const [debrisDesc, setDebrisDesc] = useState('');
  const [debrisSqs, setDebrisSqs] = useState<string>('0');
  const [debrisSqsPerLoad, setDebrisSqsPerLoad] = useState<string>('0');
  const [debrisLoads, setDebrisLoads] = useState<string>('0');
  const [debrisPricePerLoad, setDebrisPricePerLoad] = useState<string>('0');
  
  // Portable Washroom fields
  const [washroomPeriod, setWashroomPeriod] = useState<'days'|'months'>('days');
  const [washroomPeriodCount, setWashroomPeriodCount] = useState<string>('1');
  const [washroomPrice, setWashroomPrice] = useState<string>('0');
  
  // Other fields
  const [otherDesc, setOtherDesc] = useState('');
  const [otherNumber, setOtherNumber] = useState<string>('1');
  const [otherUnit, setOtherUnit] = useState('');
  const [otherPrice, setOtherPrice] = useState<string>('0');

  const showDebris = type === 'debris-cartage';
  const showWashroom = type === 'portable-washroom';
  const showOther = type === 'other';

  const total = useMemo(()=>{
    if(showDebris){
      const loads = Number(debrisLoads||0);
      const finalLoads = loads === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0
        ? Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0))
        : loads;
      return finalLoads * Number(debrisPricePerLoad||0);
    }else if(showWashroom){
      return Number(washroomPeriodCount||0) * Number(washroomPrice||0);
    }else if(showOther){
      return Number(otherNumber||0) * Number(otherPrice||0);
    }
    return 0;
  }, [type, debrisLoads, debrisSqs, debrisSqsPerLoad, debrisPricePerLoad, washroomPeriodCount, washroomPrice, otherNumber, otherPrice]);

  const calcText = useMemo(()=>{
    const p = Number(isNaN(total) ? 0 : total).toFixed(2);
    if(showDebris){
      const loads = Number(debrisLoads||0);
      const finalLoads = loads === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0
        ? Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0))
        : loads;
      const price = Number(debrisPricePerLoad||0).toFixed(2);
      return `${finalLoads} loads × $${price} = $${p}`;
    }else if(showWashroom){
      const count = Number(washroomPeriodCount||0);
      const price = Number(washroomPrice||0).toFixed(2);
      return `${count} ${washroomPeriod} × $${price} = $${p}`;
    }else if(showOther){
      const num = Number(otherNumber||0);
      const price = Number(otherPrice||0).toFixed(2);
      return `${num} ${otherUnit} × $${price} = $${p}`;
    }
    return '';
  }, [total, type, debrisLoads, debrisSqs, debrisSqsPerLoad, debrisPricePerLoad, washroomPeriodCount, washroomPeriod, washroomPrice, otherNumber, otherUnit, otherPrice]);

  const washroomPeriodLabel = useMemo(()=>{
    return washroomPeriod === 'days' ? 'Number of Days:' : 'Number of Months:';
  }, [washroomPeriod]);
  
  const washroomPriceLabel = useMemo(()=>{
    return washroomPeriod === 'days' ? 'Price per Day ($):' : 'Price per Month ($):';
  }, [washroomPeriod]);

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
              <div>
                <label className="text-xs text-gray-600">Sub-Contractor Type:</label>
                <select className="w-full border rounded px-3 py-2" value={type} onChange={e=>setType(e.target.value as any)}>
                  <option value="">Select type...</option>
                  <option value="debris-cartage">Debris Cartage</option>
                  <option value="portable-washroom">Portable Washroom</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {showDebris && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Description:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter description..." value={debrisDesc} onChange={e=>setDebrisDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">SQS:</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={debrisSqs} min={0} step={0.01} onChange={e=>setDebrisSqs(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">SQS/Load:</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={debrisSqsPerLoad} min={0} step={0.01} onChange={e=>setDebrisSqsPerLoad(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">OR Number of Loads (optional):</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={debrisLoads} min={0} step={1} placeholder="Leave 0 to calculate" onChange={e=>setDebrisLoads(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Price per Load ($):</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={debrisPricePerLoad} min={0} step={0.01} onChange={e=>setDebrisPricePerLoad(e.target.value)} />
                  </div>
                </>
              )}

              {showWashroom && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Period:</label>
                    <select className="w-full border rounded px-3 py-2" value={washroomPeriod} onChange={e=>setWashroomPeriod(e.target.value as any)}>
                      <option value="days">Days</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{washroomPeriodLabel}</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={washroomPeriodCount} min={0} step={0.5} onChange={e=>setWashroomPeriodCount(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{washroomPriceLabel}</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={washroomPrice} min={0} step={0.01} onChange={e=>setWashroomPrice(e.target.value)} />
                  </div>
                </>
              )}

              {showOther && (
                <>
                  <div>
                    <label className="text-xs text-gray-600">Description:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter description..." value={otherDesc} onChange={e=>setOtherDesc(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Number:</label>
                    <input type="number" className="w-28 border rounded px-3 py-2" value={otherNumber} min={0} step={0.01} onChange={e=>setOtherNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Unit:</label>
                    <input type="text" className="w-full border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={otherUnit} onChange={e=>setOtherUnit(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Price per Unit ($):</label>
                    <input type="number" className="w-full border rounded px-3 py-2" value={otherPrice} min={0} step={0.01} onChange={e=>setOtherPrice(e.target.value)} />
                  </div>
                </>
              )}

              {type && (
                <div className="bg-gray-100 p-3 rounded">
                  <strong>Total Preview:</strong>
                  <div className="mt-1 text-sm text-gray-600">{calcText}</div>
                </div>
              )}

              <div className="text-right">
                <button onClick={()=>{
                  if(!type){ toast.error('Please select a sub-contractor type'); return; }
                  let desc='', qty=0, unit='', totalValue=0;
                  if(showDebris){
                    desc = debrisDesc.trim() || 'Debris Cartage';
                    qty = Number(debrisLoads||0);
                    if(qty === 0 && Number(debrisSqs||0) > 0 && Number(debrisSqsPerLoad||0) > 0){
                      qty = Math.ceil(Number(debrisSqs||0) / Number(debrisSqsPerLoad||0));
                    }
                    unit = 'loads';
                    totalValue = Number(debrisPricePerLoad||0);
                  }else if(showWashroom){
                    desc = 'Portable Washroom';
                    qty = Number(washroomPeriodCount||0);
                    unit = washroomPeriod;
                    totalValue = Number(washroomPrice||0);
                  }else{
                    desc = otherDesc.trim() || 'Other';
                    qty = Number(otherNumber||0);
                    unit = otherUnit;
                    totalValue = Number(otherPrice||0);
                  }
                  if(!desc){ toast.error('Please fill in the required fields'); return; }
                  onAdd({ name: desc, unit, quantity: qty, unit_price: totalValue, section: 'Sub-Contractors', description: desc, item_type: 'subcontractor' });
                  setOpen(false); setType(''); setDebrisDesc(''); setDebrisSqs('0'); setDebrisSqsPerLoad('0'); setDebrisLoads('0'); setDebrisPricePerLoad('0'); setWashroomPeriod('days'); setWashroomPeriodCount('1'); setWashroomPrice('0'); setOtherDesc(''); setOtherNumber('1'); setOtherUnit(''); setOtherPrice('0');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Sub-Contractors</button>
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
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('0');

  const total = useMemo(()=> Number(quantity||0) * Number(price||0), [quantity, price]);
  const calcText = `${quantity} ${unit} × $${Number(price||0).toFixed(2)} = $${total.toFixed(2)}`;

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
              <div>
                <label className="text-xs text-gray-600">Name/Description:</label>
                <input type="text" className="w-full border rounded px-3 py-2" placeholder="Enter shop name or description..." value={name} onChange={e=>setName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Quantity:</label>
                <div className="flex gap-2 items-center">
                  <input type="number" className="w-28 border rounded px-3 py-2" value={quantity} min={0} step={0.01} onChange={e=>setQuantity(e.target.value)} />
                  <input type="text" className="flex-1 border rounded px-3 py-2" placeholder="Unit (e.g., each, sqs)" value={unit} onChange={e=>setUnit(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Price per Unit ($):</label>
                <input type="number" className="w-full border rounded px-3 py-2" value={price} min={0} step={0.01} onChange={e=>setPrice(e.target.value)} />
              </div>
              <div className="bg-gray-100 p-3 rounded">
                <strong>Total Preview:</strong>
                <div className="mt-1 text-sm text-gray-600">{calcText}</div>
              </div>
              <div className="text-right">
                <button onClick={()=>{
                  if(!name.trim()){ toast.error('Please enter a shop name/description'); return; }
                  onAdd({ name, unit, quantity: Number(quantity||0), unit_price: Number(price||0), section: 'Shop', description: name, item_type: 'shop' });
                  setOpen(false); setName(''); setQuantity('1'); setUnit(''); setPrice('0');
                }} className="px-3 py-2 rounded bg-brand-red text-white">Add Shop</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


