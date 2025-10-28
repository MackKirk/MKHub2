import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string };

export default function InventoryProducts(){
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const { data, refetch, isLoading, isFetching } = useQuery({
    queryKey:['estimateProducts', q, supplier, category],
    queryFn: async ()=>{
      const params = new URLSearchParams(); if(q) params.set('q', q); if(supplier) params.set('supplier', supplier); if(category) params.set('category', category);
      const path = params.toString()? `/estimate/products/search?${params.toString()}` : '/estimate/products';
      return await api<Material[]>('GET', path);
    }
  });
  const rows = data||[];
  const suppliers = useMemo(()=> Array.from(new Set(rows.map(r=> r.supplier_name||'').filter(Boolean))), [rows]);
  const categories = useMemo(()=> Array.from(new Set(rows.map(r=> r.category||'').filter(Boolean))), [rows]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material|null>(null);
  const [name, setName] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('');
  const [desc, setDesc] = useState('');
  const [unitType, setUnitType] = useState<'unitary'|'multiple'|'coverage'>('unitary');
  const [unitsPerPackage, setUnitsPerPackage] = useState<string>('');
  const [covSqs, setCovSqs] = useState<string>('');
  const [covFt2, setCovFt2] = useState<string>('');
  const [covM2, setCovM2] = useState<string>('');
  const [imageDataUrl, setImageDataUrl] = useState<string>('');

  const [viewRelated, setViewRelated] = useState<number|null>(null);
  const [relatedList, setRelatedList] = useState<any[]>([]);
  const [addRelatedOpen, setAddRelatedOpen] = useState(false);
  const [addRelatedTarget, setAddRelatedTarget] = useState<number|null>(null);
  const [addRelatedSearch, setAddRelatedSearch] = useState('');
  const [addRelatedResults, setAddRelatedResults] = useState<any[]>([]);
  const [relatedCounts, setRelatedCounts] = useState<Record<number, number>>({});

  const { data: supplierOptions } = useQuery({ queryKey:['invSuppliersOptions'], queryFn: ()=> api<any[]>('GET','/inventory/suppliers') });

  const qc = useQueryClient();
  const productIds = useMemo(()=> rows.map(p=> p.id).join(','), [rows]);
  const { data: relCounts } = useQuery({ queryKey:['related-counts', productIds], queryFn: async()=> productIds? await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`) : {}, enabled: !!productIds });
  useEffect(()=> { if(relCounts) setRelatedCounts(relCounts); }, [relCounts]);

  const onCoverageChange = (which: 'sqs'|'ft2'|'m2', val: string)=>{
    if(!val){ setCovSqs(''); setCovFt2(''); setCovM2(''); return; }
    const num = Number(val);
    if(Number.isNaN(num)){ return; }
    const SQS_TO_FT2 = 100;
    const FT2_TO_M2 = 0.09290304;
    if(which==='sqs'){
      const ft2 = num * SQS_TO_FT2;
      const m2 = ft2 * FT2_TO_M2;
      setCovSqs(String(num)); setCovFt2(String(Number(ft2.toFixed(3)))); setCovM2(String(Number(m2.toFixed(3))));
    }else if(which==='ft2'){
      const sqs = num / SQS_TO_FT2;
      const m2 = num * FT2_TO_M2;
      setCovSqs(String(Number(sqs.toFixed(3)))); setCovFt2(String(num)); setCovM2(String(Number(m2.toFixed(3))));
    }else{
      const ft2 = num / FT2_TO_M2;
      const sqs = ft2 / SQS_TO_FT2;
      setCovSqs(String(Number(sqs.toFixed(3)))); setCovFt2(String(Number(ft2.toFixed(3)))); setCovM2(String(num));
    }
  };

  const onFileChange = async (f: File|null)=>{
    if(!f){ setImageDataUrl(''); return; }
    const reader = new FileReader();
    reader.onload = ()=> setImageDataUrl(String(reader.result||''));
    reader.readAsDataURL(f);
  };

  const handleEdit = (p: Material)=>{
    setEditing(p);
    setName(p.name);
    setNewSupplier(p.supplier_name||'');
    setNewCategory(p.category||'');
    setUnit(p.unit||'');
    setPrice(p.price?.toString()||'');
    setDesc(p.description||'');
    setUnitType((p.unit_type as any)||'unitary');
    setUnitsPerPackage(p.units_per_package?.toString()||'');
    setCovSqs(p.coverage_sqs?.toString()||'');
    setCovFt2(p.coverage_ft2?.toString()||'');
    setCovM2(p.coverage_m2?.toString()||'');
    setImageDataUrl(p.image_base64||'');
    setOpen(true);
  };

  const handleDelete = async (id: number)=>{
    if(!confirm('Delete this product?')) return;
    try{
      await api('DELETE', `/estimate/products/${id}`);
      toast.success('Deleted');
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  const handleViewRelated = async (id: number)=>{
    try{
      const rels = await api<any[]>('GET', `/estimate/related/${id}`);
      setRelatedList(rels);
      setViewRelated(id);
    }catch(_e){ toast.error('Failed to load related'); }
  };

  const handleAddRelated = async (targetId: number)=>{
    setAddRelatedTarget(targetId);
    setAddRelatedOpen(true);
    setAddRelatedSearch('');
    setAddRelatedResults([]);
  };

  const resetModal = ()=>{
    setEditing(null);
    setOpen(false);
    setName(''); setNewSupplier(''); setNewCategory(''); setUnit(''); setPrice(''); setDesc('');
    setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); setUnitType('unitary'); setImageDataUrl('');
  };

  const searchRelatedProducts = async (txt: string)=>{
    setAddRelatedSearch(txt);
    if(!txt.trim()){ setAddRelatedResults([]); return; }
    try{
      const params = new URLSearchParams(); params.set('q', txt);
      const results = await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
      setAddRelatedResults(results.filter(r=> r.id !== addRelatedTarget));
    }catch(_e){ }
  };

  const createRelation = async (productA: number, productB: number)=>{
    try{
      await api('POST', `/estimate/related/${productA}`, { related_id: productB });
      toast.success('Relation created');
      setAddRelatedOpen(false);
      await refetch();
      if(viewRelated) handleViewRelated(viewRelated);
    }catch(_e){ toast.error('Failed'); }
  };

  const deleteRelation = async (a: number, b: number)=>{
    if(!confirm('Remove this relation?')) return;
    try{
      await api('DELETE', `/estimate/related/${a}/${b}`);
      toast.success('Relation removed');
      if(viewRelated) handleViewRelated(viewRelated);
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <button onClick={()=>{ resetModal(); setOpen(true); }} className="px-3 py-2 rounded bg-brand-red text-white">New Product</button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="border rounded px-3 py-2" placeholder="Search products..." value={q} onChange={e=>setQ(e.target.value)} />
        <select className="border rounded px-3 py-2" value={supplier} onChange={e=>setSupplier(e.target.value)}>
          <option value="">All suppliers</option>
          {suppliers.map(s=> <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="border rounded px-3 py-2" value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c=> <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-gray-100">{isFetching? 'Searching...' : 'Search'}</button>
        {(q||supplier||category) && <button onClick={()=>{ setQ(''); setSupplier(''); setCategory(''); refetch(); }} className="px-3 py-2 rounded bg-gray-100">Clear</button>}
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Supplier</th>
            <th className="p-2 text-left">Category</th>
            <th className="p-2 text-left">Unit</th>
            <th className="p-2 text-left">Price</th>
            <th className="p-2 text-left">Updated</th>
            <th className="p-2 text-left">Related</th>
            <th className="p-2 text-left">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={9} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : rows.map(p=> (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.id}</td>
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.supplier_name||''}</td>
                <td className="p-2">{p.category||''}</td>
                <td className="p-2">{p.unit||''}</td>
                <td className="p-2">{typeof p.price==='number'? `$${p.price.toFixed(2)}`: ''}</td>
                <td className="p-2">{(p.last_updated||'').slice(0,10)}</td>
                <td className="p-2"><button onClick={()=> handleViewRelated(p.id)} className="text-brand-red underline">{relatedCounts[p.id]||0} related</button></td>
                <td className="p-2">
                  <button onClick={()=> handleEdit(p)} className="px-2 py-1 rounded bg-gray-100 text-xs mr-1">Edit</button>
                  <button onClick={()=> handleDelete(p.id)} className="px-2 py-1 rounded bg-red-100 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length===0 && <tr><td colSpan={9} className="p-3 text-gray-600">No products found</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">{editing? 'Edit Product' : 'New Product'}</div><button onClick={resetModal} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4 grid grid-cols-2 gap-3 max-h-[85vh] overflow-y-auto">
              <div className="col-span-2"><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} /></div>
              <div>
                <label className="text-xs text-gray-600">Supplier</label>
                <input list="supplier-list" className="w-full border rounded px-3 py-2" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} />
                <datalist id="supplier-list">
                  {Array.isArray(supplierOptions) && supplierOptions.map((s:any)=> (<option key={s.id} value={s.name}></option>))}
                </datalist>
              </div>
              <div><label className="text-xs text-gray-600">Category</label><input className="w-full border rounded px-3 py-2" value={newCategory} onChange={e=>setNewCategory(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Sell Unit</label><input className="w-full border rounded px-3 py-2" placeholder="e.g., Roll, Pail (20L), Box" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Price ($)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={price} onChange={e=>setPrice(e.target.value)} /></div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Unit Type</label>
                <div className="flex items-center gap-6 mt-1">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='unitary'} onChange={()=>{ setUnitType('unitary'); setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Unitary</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='multiple'} onChange={()=>{ setUnitType('multiple'); setCovSqs(''); setCovFt2(''); setCovM2(''); }} /> Multiple</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="unit-type" checked={unitType==='coverage'} onChange={()=>{ setUnitType('coverage'); setUnitsPerPackage(''); }} /> Coverage</label>
                </div>
              </div>
              {unitType==='multiple' && (
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Units per Package</label>
                  <input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={unitsPerPackage} onChange={e=>setUnitsPerPackage(e.target.value)} />
                </div>
              )}
              {unitType==='coverage' && (
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">Coverage Area</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div><input className="w-full border rounded px-3 py-2" placeholder="SQS" value={covSqs} onChange={e=> onCoverageChange('sqs', e.target.value)} /></div>
                    <div><input className="w-full border rounded px-3 py-2" placeholder="ft²" value={covFt2} onChange={e=> onCoverageChange('ft2', e.target.value)} /></div>
                    <div><input className="w-full border rounded px-3 py-2" placeholder="m²" value={covM2} onChange={e=> onCoverageChange('m2', e.target.value)} /></div>
                  </div>
                </div>
              )}
              <div className="col-span-2"><label className="text-xs text-gray-600">Description / Notes</label><textarea className="w-full border rounded px-3 py-2" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} /></div>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Product Image</label>
                <input type="file" accept="image/*" onChange={e=> onFileChange(e.target.files?.[0]||null)} />
                {imageDataUrl && <img src={imageDataUrl} className="mt-2 w-32 border rounded" alt="Preview" />}
              </div>
              <div className="col-span-2 text-right">
                <button onClick={async()=>{
                  if(!name.trim()){ toast.error('Name required'); return; }
                  try{
                    const payload = {
                      name,
                      supplier_name: newSupplier||null,
                      category: newCategory||null,
                      unit: unit||null,
                      price: price? Number(price) : 0,
                      description: desc||null,
                      unit_type: unitType,
                      units_per_package: unitType==='multiple'? (unitsPerPackage? Number(unitsPerPackage): null) : null,
                      coverage_sqs: unitType==='coverage'? (covSqs? Number(covSqs): null) : null,
                      coverage_ft2: unitType==='coverage'? (covFt2? Number(covFt2): null) : null,
                      coverage_m2: unitType==='coverage'? (covM2? Number(covM2): null) : null,
                      image_base64: imageDataUrl || null,
                    };
                    if(editing){ await api('PUT', `/estimate/products/${editing.id}`, payload); toast.success('Updated'); }
                    else{ await api('POST','/estimate/products', payload); toast.success('Created'); }
                    resetModal();
                    await refetch();
                  }catch(_e){ toast.error('Failed'); }
                }} className="px-4 py-2 rounded bg-brand-red text-white">{editing? 'Update' : 'Create'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewRelated!==null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">Related Products</div><button onClick={()=> setViewRelated(null)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4">
              <div className="mb-3 text-right"><button onClick={()=> handleAddRelated(viewRelated)} className="px-3 py-2 rounded bg-brand-red text-white">Add Related</button></div>
              <div className="border rounded divide-y">
                {relatedList.length? relatedList.map((r:any,i:number)=> (
                  <div key={i} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.supplier_name||''} · ${Number(r.price||0).toFixed(2)}</div>
                    </div>
                    <button onClick={()=> deleteRelation(viewRelated, r.id)} className="px-2 py-1 rounded bg-red-100 text-xs">Remove</button>
                  </div>
                )): <div className="p-3 text-gray-600">No related products</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {addRelatedOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">Add Related Product</div><button onClick={()=> setAddRelatedOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4">
              <div className="mb-3"><input className="w-full border rounded px-3 py-2" placeholder="Search products..." value={addRelatedSearch} onChange={e=> searchRelatedProducts(e.target.value)} /></div>
              <div className="border rounded divide-y max-h-64 overflow-y-auto">
                {addRelatedResults.map(r=> (
                  <div key={r.id} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onClick={()=> createRelation(addRelatedTarget!, r.id)}>
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.supplier_name||''} · ${Number(r.price||0).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {!addRelatedSearch && <div className="p-3 text-gray-600">Start typing to search</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
