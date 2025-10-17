import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

type Product = { id:string, name:string, unit:string, stock_quantity:number, reorder_point:number };

export default function InventoryProducts(){
  const { data, refetch, isLoading } = useQuery({ queryKey:['invProducts'], queryFn: ()=>api<Product[]>('GET','/inventory/products') });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unit');
  const [stock, setStock] = useState(0);
  const [reorder, setReorder] = useState(0);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <button onClick={()=>setOpen(true)} className="px-3 py-2 rounded bg-brand-red text-white">New Product</button>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Name</th><th className="p-2 text-left">Stock</th><th className="p-2 text-left">Reorder</th><th className="p-2 text-left">Unit</th></tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : (data||[]).map(p=> (
              <tr key={p.id} className="border-t"><td className="p-2">{p.name}</td><td className="p-2">{p.stock_quantity}</td><td className="p-2">{p.reorder_point}</td><td className="p-2">{p.unit}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="w-[600px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between"><div className="font-semibold">New Product</div><button onClick={()=>setOpen(false)} className="px-3 py-1 rounded bg-gray-100">Close</button></div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-gray-600">Name</label><input className="w-full border rounded px-3 py-2" value={name} onChange={e=>setName(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Unit</label><input className="w-full border rounded px-3 py-2" value={unit} onChange={e=>setUnit(e.target.value)} /></div>
              <div><label className="text-xs text-gray-600">Stock</label><input type="number" className="w-full border rounded px-3 py-2" value={stock} onChange={e=>setStock(parseInt(e.target.value||'0',10))} /></div>
              <div><label className="text-xs text-gray-600">Reorder</label><input type="number" className="w-full border rounded px-3 py-2" value={reorder} onChange={e=>setReorder(parseInt(e.target.value||'0',10))} /></div>
              <div className="col-span-2 text-right"><button onClick={async()=>{ if(!name){ toast.error('Name required'); return; } try{ await api('POST','/inventory/products', { name, unit, stock_quantity: stock, reorder_point: reorder }); toast.success('Product created'); setOpen(false); setName(''); setUnit('unit'); setStock(0); setReorder(0); refetch(); }catch(_e){ toast.error('Failed'); } }} className="px-4 py-2 rounded bg-brand-red text-white">Create</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


