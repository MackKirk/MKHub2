import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function MyReviews(){
  const { data:assignments, refetch } = useQuery({ queryKey:['my-assignments'], queryFn: ()=> api<any[]>('GET','/reviews/my/assignments') });
  const [openId, setOpenId] = useState<string>('');
  const { data:questions } = useQuery({ queryKey:['assignment-questions', openId], queryFn: ()=> openId? api<any[]>('GET', `/reviews/assignments/${openId}/questions`) : Promise.resolve([]) });
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const submit = async()=>{
    try{
      const payload = { answers: Object.entries(answers).map(([key, value])=> ({ key, value })) };
      await api('POST', `/reviews/assignments/${openId}/answers`, payload);
      toast.success('Submitted');
      setOpenId(''); setAnswers({}); await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-3">My Reviews</h1>
      <div className="rounded-xl border bg-white divide-y">
        {(assignments||[]).map((a:any)=> (
          <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
            <div className="flex-1">
              <div className="font-medium">{a.reviewee_username||a.reviewee_user_id}</div>
              <div className="text-xs text-gray-600">Due {a.due_date||'—'} · {a.status}</div>
            </div>
            <button onClick={()=> setOpenId(a.id)} className="px-2 py-1 rounded border text-xs">Open</button>
          </div>
        ))}
      </div>

      {openId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl p-4">
            <div className="text-lg font-semibold mb-2">Fill Review</div>
            <div className="space-y-3">
              {(questions||[]).map((q:any)=> (
                <div key={q.key}>
                  <div className="text-sm font-medium">{q.label}</div>
                  <textarea className="w-full border rounded px-3 py-2" value={answers[q.key]||''} onChange={e=> setAnswers(s=> ({...s, [q.key]: e.target.value}))} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=> setOpenId('')} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={submit} className="px-3 py-2 rounded bg-brand-red text-white">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}














