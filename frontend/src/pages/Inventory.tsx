import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const PRODUCTS_PAGE_SIZE = 100;
const SUPPLIERS_PAGE_SIZE = 100;

type Product = { id:string, name:string, stock_quantity?:number, reorder_point?:number, unit?:string };
type Supplier = { id:string, name:string, email?:string };

export default function Inventory(){
  const [productsPage, setProductsPage] = useState(1);
  const [suppliersPage, setSuppliersPage] = useState(1);

  const { data:products, isLoading:loadingProducts } = useQuery({
    queryKey: ['invProducts', productsPage],
    queryFn: () => api<Product[]>('GET', `/inventory/products?page=${productsPage}&limit=${PRODUCTS_PAGE_SIZE}`),
  });
  const { data:suppliers } = useQuery({
    queryKey: ['suppliers', suppliersPage],
    queryFn: () => api<Supplier[]>('GET', `/inventory/suppliers?page=${suppliersPage}&limit=${SUPPLIERS_PAGE_SIZE}`),
  });

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
        <div className="flex justify-end gap-2 p-2 border-t bg-gray-50">
          <button type="button" onClick={() => setProductsPage(p => Math.max(1, p - 1))} disabled={productsPage <= 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Previous</button>
          <span className="py-1 text-sm text-gray-600">Page {productsPage}</span>
          <button type="button" onClick={() => setProductsPage(p => p + 1)} disabled={(products?.length ?? 0) < PRODUCTS_PAGE_SIZE} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h3 className="font-semibold mb-2">Suppliers</h3>
        <ul className="list-disc pl-5 text-sm text-gray-700">
          {(suppliers||[]).map(s=> <li key={s.id}>{s.name} <span className="text-gray-500">{s.email||''}</span></li>)}
        </ul>
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
          <button type="button" onClick={() => setSuppliersPage(p => Math.max(1, p - 1))} disabled={suppliersPage <= 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Previous</button>
          <span className="py-1 text-sm text-gray-600">Page {suppliersPage}</span>
          <button type="button" onClick={() => setSuppliersPage(p => p + 1)} disabled={(suppliers?.length ?? 0) < SUPPLIERS_PAGE_SIZE} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Next</button>
        </div>
      </div>
    </div>
  );
}


