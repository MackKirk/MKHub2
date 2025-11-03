import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Estimate = { id:number, project_id:string, total_cost?:number, markup?:number, created_at?:string };

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
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Project</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Markup</th>
            <th className="p-2 text-left">Created</th>
            <th className="p-2 text-left">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={6} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : rows.map(e=> (
              <tr key={e.id} className="border-t hover:bg-gray-50">
                <td className="p-2">{e.id}</td>
                <td className="p-2"><Link className="underline text-blue-600" to={`/projects/${encodeURIComponent(String(e.project_id))}`}>{String(e.project_id).slice(0,8)}</Link></td>
                <td className="p-2">{typeof e.total_cost==='number'? `$${e.total_cost.toFixed(2)}` : '-'}</td>
                <td className="p-2">{typeof e.markup==='number'? `${e.markup}%` : '-'}</td>
                <td className="p-2">{(e.created_at||'').slice(0,19).replace('T',' ')}</td>
                <td className="p-2">
                  <Link to={`/estimates/${e.id}/edit`} className="px-2 py-1 rounded bg-brand-red text-white text-xs hover:bg-red-700">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && rows.length===0 && <tr><td colSpan={6} className="p-3 text-gray-600">No estimates yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


