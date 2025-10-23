import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

type Proposal = { id:string, title:string, order_number?:string, created_at?:string };

export default function Proposals(){
  const { data, isLoading } = useQuery({ queryKey:['proposals'], queryFn: ()=>api<Proposal[]>('GET','/proposals') });
  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Proposals</h1>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Title</th><th className="p-2 text-left">Order</th><th className="p-2 text-left">Created</th><th className="p-2 text-left">Actions</th></tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : (data||[]).map(p=> (
              <tr key={p.id} className="border-t"><td className="p-2">{p.title||'Proposal'}</td><td className="p-2">{p.order_number||''}</td><td className="p-2">{(p.created_at||'').slice(0,10)}</td><td className="p-2"><Link to={`/proposals/${encodeURIComponent(p.id)}`} className="underline">Open</Link></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


