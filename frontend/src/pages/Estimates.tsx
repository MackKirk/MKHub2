import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Estimate = { 
  id:number, 
  project_id:string, 
  project_name?:string,
  client_name?:string,
  total_cost?:number, 
  grand_total?:number,
  markup?:number, 
  created_at?:string 
};

export default function Estimates(){
  const { data, isLoading } = useQuery({ queryKey:['estimates-all'], queryFn: ()=> api<Estimate[]>('GET','/estimate/estimates') });
  const rows = data||[];
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Estimates</div>
        <div className="text-sm opacity-90">Project estimates and pricing summaries.</div>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-2 text-left">Project</th>
            <th className="p-2 text-left">Customer</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Created</th>
            <th className="p-2 text-left">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={5} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : rows.map(e=> (
              <tr key={e.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{e.project_name || String(e.project_id).slice(0,8)}</td>
                <td className="p-2">{e.client_name || '-'}</td>
                <td className="p-2">
                  {typeof e.grand_total==='number'? `$${e.grand_total.toFixed(2)}` : 
                   typeof e.total_cost==='number'? `$${e.total_cost.toFixed(2)}` : '-'}
                </td>
                <td className="p-2">{(e.created_at||'').slice(0,10)}</td>
                <td className="p-2">
                  <Link to={`/projects/${encodeURIComponent(e.project_id)}?tab=estimate`} className="underline">Open</Link>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length===0 && <tr><td colSpan={5} className="p-3 text-gray-600">No estimates yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
