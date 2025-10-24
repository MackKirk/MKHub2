import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function ProposalView(){
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey:['proposal', id], queryFn: ()=> api<any>('GET', `/proposals/${id}`) });
  const p = data||{};
  const coverThumb = p?.data?.cover_file_object_id ? `/files/${p.data.cover_file_object_id}/thumbnail?w=800` : null;
  const page2Thumb = p?.data?.page2_file_object_id ? `/files/${p.data.page2_file_object_id}/thumbnail?w=800` : null;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-3">Proposal</h1>
      {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : (
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="text-sm text-gray-600">Order: {p.order_number||'-'}</div>
          <div className="text-lg font-semibold">{p.title||'Proposal'}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-gray-600 mb-1">Cover</div>
              {coverThumb? <img src={coverThumb} className="w-full max-w-[400px] rounded border" /> : <div className="text-sm text-gray-500">No cover</div>}
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Page 2</div>
              {page2Thumb? <img src={page2Thumb} className="w-full max-w-[400px] rounded border" /> : <div className="text-sm text-gray-500">No image</div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-2 rounded bg-gray-100" onClick={async()=>{
              try{
                const q = new URLSearchParams();
                q.set('proposal_id', String(id));
                const form = new FormData();
                // regenerate directly with stored data
                const r = await fetch('/proposals/generate', { method:'POST', body: form });
                if (!r.ok) throw new Error('fail');
              }catch(_e){ toast.error('Regenerate not wired'); }
            }}>Regenerate (WIP)</button>
          </div>
        </div>
      )}
    </div>
  );
}



