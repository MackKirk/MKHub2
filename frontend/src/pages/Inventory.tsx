import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Product = { id:string, name:string, stock_quantity?:number, reorder_point?:number, unit?:string };
type Supplier = { id:string, name:string, email?:string };

export default function Inventory(){
  const { data:products, isLoading:loadingProducts } = useQuery({ queryKey:['invProducts'], queryFn: ()=>api<Product[]>('GET','/inventory/products') });
  const { data:suppliers } = useQuery({ queryKey:['suppliers'], queryFn: ()=>api<Supplier[]>('GET','/inventory/suppliers') });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Inventory</h1>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Product</th><th className="p-2 text-left">Stock</th><th className="p-2 text-left">Reorder</th><th className="p-2 text-left">Unit</th></tr></thead>
          <tbody>
            {loadingProducts? <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : (products||[]).map(p=> (
              <tr key={p.id} className="border-t"><td className="p-2">{p.name}</td><td className="p-2">{p.stock_quantity}</td><td className="p-2">{p.reorder_point}</td><td className="p-2">{p.unit}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-2">Suppliers</h3>
        <ul className="list-disc pl-5 text-sm text-gray-700">
          {(suppliers||[]).map(s=> <li key={s.id}>{s.name} <span className="text-gray-500">{s.email||''}</span></li>)}
        </ul>
      </div>
    </div>
  );
}


