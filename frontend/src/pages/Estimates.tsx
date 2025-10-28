import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Estimate = { id:number, project_id:string, total_cost?:number, markup?:number, created_at?:string };

export default function Estimates(){
  const { data, isLoading } = useQuery({ queryKey:['estimates-all'], queryFn: ()=> api<Estimate[]>('GET','/estimate/estimates') });
  const rows = data||[];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Estimates</h1>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Project</th>
            <th className="p-2 text-left">Total</th>
            <th className="p-2 text-left">Markup</th>
            <th className="p-2 text-left">Created</th>
          </tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={5} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : rows.map(e=> (
              <tr key={e.id} className="border-t">
                <td className="p-2">{e.id}</td>
                <td className="p-2"><a className="underline" href={`/projects/${encodeURIComponent(String(e.project_id))}`}>{String(e.project_id).slice(0,8)}</a></td>
                <td className="p-2">{typeof e.total_cost==='number'? `$${e.total_cost.toFixed(2)}` : '-'}</td>
                <td className="p-2">{typeof e.markup==='number'? `${e.markup}%` : '-'}</td>
                <td className="p-2">{(e.created_at||'').slice(0,19).replace('T',' ')}</td>
              </tr>
            ))}
            {!isLoading && rows.length===0 && <tr><td colSpan={5} className="p-3 text-gray-600">No estimates yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}


