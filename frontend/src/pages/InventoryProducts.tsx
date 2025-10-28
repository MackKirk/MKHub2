import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

type Material = { id:number, name:string, supplier_name?:string, category?:string, unit?:string, price?:number, last_updated?:string };

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
  const [name, setName] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState<string>('');
  const [desc, setDesc] = useState('');

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-brand-red text-white">New Product</button>
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
          </tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={7} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : rows.map(p=> (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.id}</td>
                <td className="p-2">{p.name}</td>
                <td className="p-2">{p.supplier_name||''}</td>
                <td className="p-2">{p.category||''}</td>
                <td className="p-2">{p.unit||''}</td>
                <td className="p-2">{typeof p.price==='number'? `$${p.price.toFixed(2)}`: ''}</td>
                <td className="p-2">{(p.last_updated||'').slice(0,10)}</td>
              </tr>
            ))}
            {!isLoading && rows.length===0 && <tr><td colSpan={7} className="p-3 text-gray-600">No products found</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[700px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">New Product</div><button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Supplier</label><input className="w-full border rounded px-3 py-2" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Category</label><input className="w-full border rounded px-3 py-2" value={newCategory} onChange={e=>setNewCategory(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Unit</label><input className="w-full border rounded px-3 py-2" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Price ($)</label><input type="number" step="0.01" className="w-full border rounded px-3 py-2" value={price} onChange={e=>setPrice(e.target.value)} /></div>
              <div className="col-span-2"><label className="text-xs text-gray-600">Description / Notes</label><textarea className="w-full border rounded px-3 py-2" rows={3} value={desc} onChange={e=>setDesc(e.target.value)} /></div>
              <div className="col-span-2 text-right">
                <button onClick={async()=>{
                  if(!name.trim()){ toast.error('Name required'); return; }
                  try{
                    await api('POST','/estimate/products', {
                      name,
                      supplier_name: newSupplier||null,
                      category: newCategory||null,
                      unit: unit||null,
                      price: price? Number(price) : 0,
                      description: desc||null,
                    });
                    toast.success('Product created');
                    setOpen(false); setName(''); setNewSupplier(''); setNewCategory(''); setUnit(''); setPrice(''); setDesc('');
                    await refetch();
                  }catch(_e){ toast.error('Failed'); }
                }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

