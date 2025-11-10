import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function MyReviews(){
  const { data:assignments, refetch } = useQuery({ queryKey:['my-assignments'], queryFn: ()=> api<any[]>('GET','/reviews/my/assignments') });
  const [openId, setOpenId] = useState<string>('');
  const { data:questions } = useQuery({ queryKey:['assignment-questions', openId], queryFn: ()=> openId? api<any[]>('GET', `/reviews/assignments/${openId}/questions`) : Promise.resolve([]) });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showNotes, setShowNotes] = useState(false);

  const submit = async()=>{
    try{
      const payload = { answers: Object.entries(answers).map(([key, value])=> ({ key, value })) };
      await api('POST', `/reviews/assignments/${openId}/answers`, payload);
      toast.success('Submitted');
      setOpenId(''); setAnswers({}); setShowNotes(false); await refetch();
    }catch(_e){ toast.error('Failed'); }
  };

  // Check if any question has notes/hints
  const hasNotes = (questions||[]).some((q:any)=> {
    const notes = q.options?.notes || q.options?.hint || q.notes || q.hint;
    return !!notes;
  });

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
        <>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" style={{ touchAction: 'none' }}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ touchAction: 'auto' }}>
              <div className="flex-shrink-0 p-4 border-b">
                <div className="text-lg font-semibold">Fill Review</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="space-y-3">
                  {(questions||[]).map((q:any)=> {
                    const notes = q.options?.notes || q.options?.hint || q.notes || q.hint;
                    return (
                      <div key={q.key} className="relative">
                        <div className="text-sm font-medium">{q.label}</div>
                        {notes && (
                          <div className={`text-xs text-gray-600 mt-1 mb-2 p-2 bg-gray-50 rounded border ${showNotes ? 'block' : 'hidden md:block'}`} style={{ transform: 'none' }}>
                            {notes}
                          </div>
                        )}
                        <textarea 
                          className="w-full border rounded px-3 py-2" 
                          value={answers[q.key]||''} 
                          onChange={e=> setAnswers(s=> ({...s, [q.key]: e.target.value}))}
                          style={{ transform: 'none' }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex-shrink-0 mt-4 p-4 border-t flex justify-end gap-2">
                <button onClick={()=> { setOpenId(''); setShowNotes(false); }} className="px-3 py-2 rounded border">Cancel</button>
                <button onClick={submit} className="px-3 py-2 rounded bg-brand-red text-white">Submit</button>
              </div>
            </div>
          </div>
          {hasNotes && (
            <button
              onClick={()=> setShowNotes(!showNotes)}
              className="md:hidden fixed bottom-4 right-4 z-[60] w-12 h-12 rounded-full bg-brand-red text-white shadow-lg flex items-center justify-center text-lg font-semibold touch-manipulation"
              style={{ WebkitTapHighlightColor: 'transparent', transform: 'none', position: 'fixed' }}
              title={showNotes ? 'Hide Notes' : 'Show Notes'}
            >
              {showNotes ? '✕' : 'ℹ'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

















