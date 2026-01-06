import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useMemo } from 'react';

type Proposal = { id:string, title:string, order_number?:string, created_at?:string };

export default function Proposals(){
  const { data, isLoading } = useQuery({ queryKey:['proposals'], queryFn: ()=>api<Proposal[]>('GET','/proposals') });
  
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Proposals</div>
          <div className="text-sm text-gray-500 font-medium">Create, edit and track proposals.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="p-2 text-left">Title</th><th className="p-2 text-left">Order</th><th className="p-2 text-left">Created</th><th className="p-2 text-left">Actions</th></tr></thead>
          <tbody>
            {isLoading? <tr><td colSpan={4} className="p-4"><div className="h-6 bg-gray-100 animate-pulse rounded"/></td></tr> : (data||[]).map(p=> (
              <tr key={p.id} className="border-t"><td className="p-2">{p.title||'Proposal'}</td><td className="p-2">{p.order_number||''}</td><td className="p-2">{(p.created_at||'').slice(0,10)}</td><td className="p-2"><Link to={`/proposals/${encodeURIComponent(p.id)}/edit`} className="underline">Open</Link></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


