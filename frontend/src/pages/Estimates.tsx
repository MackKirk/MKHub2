import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';

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
  const queryClient = useQueryClient();
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
                  <div className="flex items-center gap-2">
                    <Link to={`/estimates/${e.id}/edit`} className="underline">Open</Link>
                    <EstimateDeleteButton estimateId={e.id} projectName={e.project_name} onDeleted={() => {
                      queryClient.invalidateQueries({ queryKey: ['estimates-all'] });
                    }} />
                  </div>
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

function EstimateDeleteButton({ estimateId, projectName, onDeleted }: { estimateId: number, projectName?: string, onDeleted: () => void }) {
  const confirm = useConfirm();
  
  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Estimate',
      message: `Are you sure you want to delete this estimate${projectName ? ` for ${projectName}` : ''}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    
    try {
      await api('DELETE', `/estimate/estimates/${estimateId}`);
      toast.success('Estimate deleted');
      onDeleted();
    } catch (e: any) {
      console.error('Failed to delete estimate:', e);
      toast.error(e?.response?.data?.detail || 'Failed to delete estimate');
    }
  };
  
  return (
    <button
      onClick={handleDelete}
      className="text-red-600 hover:text-red-800 underline text-sm"
      title="Delete estimate"
    >
      Delete
    </button>
  );
}

