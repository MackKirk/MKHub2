import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string, unit_type?:string, units_per_package?:number, coverage_sqs?:number, coverage_ft2?:number, coverage_m2?:number, description?:string, image_base64?:string };

export default function InventoryProducts(){
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('');
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { data, refetch, isLoading, isFetching } = useQuery({
    queryKey:['estimateProducts', q, supplier, category],
    queryFn: async ()=>{
      const params = new URLSearchParams(); if(q) params.set('q', q); if(supplier) params.set('supplier', supplier); if(category) params.set('category', category);
      const path = params.toString()? `/estimate/products/search?${params.toString()}` : '/estimate/products';
      return await api<Material[]>('GET', path);
    }
  });
  const rawRows = data||[];
  const suppliers = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.supplier_name||'').filter(Boolean))), [rawRows]);
  const categories = useMemo(()=> Array.from(new Set(rawRows.map(r=> r.category||'').filter(Boolean))), [rawRows]);

  const sortedRows = useMemo(() => {
    const sorted = [...rawRows];
    
    sorted.sort((a, b) => {
      let aVal: any = a[sortColumn as keyof Material];
      let bVal: any = b[sortColumn as keyof Material];
      
      // Convert to string for comparison
      aVal = aVal?.toString() || '';
      bVal = bVal?.toString() || '';
      
      // Primary sort
      let comparison = aVal.localeCompare(bVal);
      
      // If equal, secondary sort by name
      if (comparison === 0) {
        const aName = a.name?.toString() || '';
        const bName = b.name?.toString() || '';
        comparison = aName.localeCompare(bName);
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [rawRows, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const rows = sortedRows;

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Material|null>(null);
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

  const openViewModal = (p: Material) => {
    setViewing(p);
    setOpen(true);
  };

  const openEditModal = () => {
    if (!viewing) return;
    setEditing(viewing);
    setName(viewing.name);
    setNewSupplier(viewing.supplier_name||'');
    setNewCategory(viewing.category||'');
    setUnit(viewing.unit||'');
    setPrice(viewing.price?.toString()||'');
    setDesc(viewing.description||'');
    setUnitType((viewing.unit_type as any)||'unitary');
    setUnitsPerPackage(viewing.units_per_package?.toString()||'');
    setCovSqs(viewing.coverage_sqs?.toString()||'');
    setCovFt2(viewing.coverage_ft2?.toString()||'');
    setCovM2(viewing.coverage_m2?.toString()||'');
    setImageDataUrl(viewing.image_base64||'');
    setViewing(null);
  };

  // Legacy handleEdit - not used anymore, keeping for compatibility
  const handleEdit = (p: Material)=>{
    openViewModal(p);
    openEditModal();
  };

  const handleDelete = async (id: number)=>{
    const ok = await confirm({ 
      title: 'Delete product', 
      message: 'Are you sure you want to delete this product? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    try{
      await api('DELETE', `/estimate/products/${id}`);
      toast.success('Deleted');
      resetModal(); // Close modal after deletion
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
    setViewing(null);
    setOpen(false);
    setName(''); setNewSupplier(''); setNewCategory(''); setUnit(''); setPrice(''); setDesc('');
    setUnitsPerPackage(''); setCovSqs(''); setCovFt2(''); setCovM2(''); setUnitType('unitary'); setImageDataUrl('');
  };

  const searchRelatedProducts = async (txt: string)=>{
    setAddRelatedSearch(txt);
    // Auto-complete search as user types
    try{
      const params = new URLSearchParams();
      if(txt.trim()){ params.set('q', txt); }
      const results = await api<any[]>('GET', `/estimate/products/search?${params.toString()}`);
      // Filter out the current product and products already related
      const filtered = results.filter(r=> r.id !== addRelatedTarget && r.id !== viewing?.id);
      setAddRelatedResults(filtered);
    }catch(_e){ setAddRelatedResults([]); }
  };

  const createRelation = async (productA: number, productB: number)=>{
    try{
      await api('POST', `/estimate/related/${productA}`, { related_id: productB });
      toast.success('Relation created');
      setAddRelatedOpen(false);
      // Update the current viewing product's related list
      if(viewing){
        const updatedRels = await api<any[]>('GET', `/estimate/related/${viewing.id}`);
        // Update related counts
        const counts = await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`);
        if(counts) setRelatedCounts(counts);
      }
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  const deleteRelation = async (a: number, b: number)=>{
    const ok = await confirm({ 
      title: 'Remove relation', 
      message: 'Are you sure you want to remove this relation between products?',
      confirmText: 'Remove',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    try{
      await api('DELETE', `/estimate/related/${a}/${b}`);
      toast.success('Relation removed');
      // Update related counts
      const counts = await api<Record<string, number>>('GET', `/estimate/related/count?ids=${productIds}`);
      if(counts) setRelatedCounts(counts);
      // Reload the related list
      if(viewRelated) handleViewRelated(viewRelated);
      await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Products</div>
          <div className="text-sm opacity-90">Catalog of materials and pricing.</div>
        </div>
        <button onClick={()=>{ resetModal(); setOpen(true); }} className="px-3 py-2 rounded bg-black text-white">New Product</button>
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

      <div className="rounded-xl border bg-white">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : !rows.length ? (
          <div className="p-4 text-gray-600 text-center">
            No products found
          </div>
        ) : (
          <div className="divide-y">
            {rows.map(p => (
              <div
                key={p.id}
                className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                onClick={() => openViewModal(p)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={p.image_base64 || '/ui/assets/login/logo-light.svg'}
                    className="w-12 h-12 rounded-lg border object-cover"
                    alt={p.name}
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-base">{p.name}</div>
                    <div className="text-xs text-gray-700">
                      {p.supplier_name && <span className="font-medium">{p.supplier_name}</span>}
                      {p.category && (
                        <>
                          {p.supplier_name && ' · '}
                          <span>{p.category}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      {p.unit && <span>{p.unit}</span>}
                      {typeof p.price === 'number' && (
                        <>
                          {p.unit && ' · '}
                          <span className="font-medium text-brand-red">${p.price.toFixed(2)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleViewRelated(p.id)}
                    className="px-3 py-1.5 rounded bg-brand-red text-white"
                  >
                    {relatedCounts[p.id] || 0} Related
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold">{editing? 'Edit Product' : viewing? 'Product Details' : 'New Product'}</div>
              <button onClick={resetModal} className="px-3 py-1 rounded bg-gray-100">Close</button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 max-h-[85vh] overflow-y-auto">
              {viewing && !editing ? (
                // View mode - display product details (read-only)
                <>
                  <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Name</label><div className="mt-1 text-gray-900">{viewing.name}</div></div>
                  <div><label className="text-xs font-semibold text-gray-700">Supplier</label><div className="mt-1 text-gray-600">{viewing.supplier_name||'-'}</div></div>
                  <div><label className="text-xs font-semibold text-gray-700">Category</label><div className="mt-1 text-gray-600">{viewing.category||'-'}</div></div>
                  <div><label className="text-xs font-semibold text-gray-700">Sell Unit</label><div className="mt-1 text-gray-600">{viewing.unit||'-'}</div></div>
                  <div><label className="text-xs font-semibold text-gray-700">Price</label><div className="mt-1 text-gray-600">{typeof viewing.price==='number'? `$${viewing.price.toFixed(2)}`: '-'}</div></div>
                  <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Unit Type</label><div className="mt-1 text-gray-600">{viewing.unit_type||'-'}</div></div>
                  {viewing.units_per_package && <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Units per Package</label><div className="mt-1 text-gray-600">{viewing.units_per_package}</div></div>}
                  {(viewing.coverage_sqs || viewing.coverage_ft2 || viewing.coverage_m2) && (
                    <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Coverage Area</label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div><div className="text-gray-600">SQS: {viewing.coverage_sqs||'-'}</div></div>
                        <div><div className="text-gray-600">ft²: {viewing.coverage_ft2||'-'}</div></div>
                        <div><div className="text-gray-600">m²: {viewing.coverage_m2||'-'}</div></div>
                      </div>
                    </div>
                  )}
                  <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Description</label><div className="mt-1 text-gray-600 whitespace-pre-wrap">{viewing.description||'-'}</div></div>
                  {viewing.image_base64 && <div className="col-span-2"><label className="text-xs font-semibold text-gray-700">Product Image</label><img src={viewing.image_base64} className="mt-2 w-48 border rounded" alt="Product" /></div>}
                </>
              ) : (
                // Edit/Create mode - form inputs
                <>
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
                </>
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">
              {viewing && !editing ? (
                // View mode buttons
                <>
                  <button onClick={()=> handleDelete(viewing.id)} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">Delete</button>
                  <button onClick={()=> handleAddRelated(viewing.id)} className="px-4 py-2 rounded bg-brand-red text-white">Add Related</button>
                  <button onClick={openEditModal} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Edit</button>
                  <button onClick={resetModal} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Close</button>
                </>
              ) : (
                // Edit/Create mode buttons
                <>
                  <button onClick={resetModal} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {viewRelated!==null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Related Products</div>
              <button onClick={()=> setViewRelated(null)} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300">Close</button>
            </div>
            <div className="p-4">
              <div className="border rounded divide-y">
                {Array.isArray(relatedList) && relatedList.length? relatedList.map((r:any,i:number)=> (
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
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
              <div className="font-semibold text-lg">Add Related Product</div>
              <button onClick={()=> setAddRelatedOpen(false)} className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300">Close</button>
            </div>
            <div className="p-4">
              <input 
                className="w-full border rounded px-3 py-2 mb-3" 
                placeholder="Search products..." 
                value={addRelatedSearch} 
                onChange={e=> searchRelatedProducts(e.target.value)} 
                autoFocus
              />
              <div className="border rounded divide-y max-h-96 overflow-y-auto">
                {Array.isArray(addRelatedResults) && addRelatedResults.length > 0 ? addRelatedResults.map(r=> (
                  <div 
                    key={r.id} 
                    className="px-3 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer" 
                    onClick={()=> createRelation(addRelatedTarget!, r.id)}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.supplier_name||''} · ${Number(r.price||0).toFixed(2)}</div>
                    </div>
                  </div>
                )) : addRelatedResults.length === 0 && !addRelatedSearch && (
                  <div className="p-3 text-gray-600">No products available</div>
                )}
                {addRelatedSearch && addRelatedResults.length === 0 && (
                  <div className="p-3 text-gray-600">No products found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
