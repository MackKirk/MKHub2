import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';

export default function MyReviews() {
  const { data: reviewsAvailable } = useQuery({
    queryKey: ['reviews-me-available'],
    queryFn: () => api<{ available?: boolean; is_supervisor?: boolean }>('GET', '/reviews/me/available'),
  });
  const { data: assignments, refetch } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api<any[]>('GET', '/reviews/my/assignments'),
  });
  const [openId, setOpenId] = useState<string>('');
  const { data: questions } = useQuery({
    queryKey: ['assignment-questions', openId],
    queryFn: () => (openId ? api<any[]>('GET', `/reviews/assignments/${openId}/questions`) : Promise.resolve([])),
  });
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showNotes, setShowNotes] = useState(false);

  const isSupervisor = reviewsAvailable?.is_supervisor ?? false;
  const selfAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_self), [assignments]);
  const subordinateAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_subordinate), [assignments]);

  const submit = async () => {
    try {
      const payload = {
        answers: Object.entries(answers).map(([key, value]) => ({
          key,
          value,
          score: typeof value === 'number' ? value : undefined,
        })),
      };
      await api('POST', `/reviews/assignments/${openId}/answers`, payload);
      toast.success('Submitted');
      setOpenId('');
      setAnswers({});
      setShowNotes(false);
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  const hasNotes = (questions || []).some((q: any) => {
    const notes = q.options?.notes || q.options?.hint || q.notes || q.hint;
    return !!notes;
  });

  const renderQuestion = (q: any) => {
    const notes = q.options?.notes || q.options?.hint || q.notes || q.hint;
    const isScale = q.type === 'scale';
    const min = isScale && q.options?.min != null ? Number(q.options.min) : 1;
    const max = isScale && q.options?.max != null ? Number(q.options.max) : 5;

    return (
      <div key={q.key} className="relative">
        <div className="text-sm font-medium">{q.label}</div>
        {notes && (
          <div
            className={`text-xs text-gray-600 mt-1 mb-2 p-2 bg-gray-50 rounded border ${showNotes ? 'block' : 'hidden md:block'}`}
            style={{ transform: 'none' }}
          >
            {notes}
          </div>
        )}
        {isScale ? (
          <div className="flex flex-wrap gap-2 mt-1">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswers((s) => ({ ...s, [q.key]: n }))}
                className={`w-10 h-10 rounded border text-sm font-medium ${
                  answers[q.key] === n ? 'bg-brand-red text-white border-brand-red' : 'bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            className="w-full border rounded px-3 py-2 mt-1"
            value={answers[q.key] ?? ''}
            onChange={(e) => setAnswers((s) => ({ ...s, [q.key]: e.target.value }))}
            style={{ transform: 'none' }}
          />
        )}
      </div>
    );
  };

  if (reviewsAvailable && !reviewsAvailable.available) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-3">Employee Review</h1>
        <div className="rounded-xl border bg-white p-6 text-gray-600">
          No review has been released for you at this time.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-3">Employee Review</h1>

      {isSupervisor && (
        <>
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-2">My review</h2>
            <p className="text-sm text-gray-600 mb-2">Complete your self-review for the current cycle.</p>
            <div className="rounded-xl border bg-white divide-y">
              {selfAssignments.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">No self-review pending.</div>
              ) : (
                selfAssignments.map((a: any) => (
                  <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{a.reviewee_username || 'My self-review'}</div>
                      <div className="text-xs text-gray-600">Due {a.due_date || '—'} · {a.status}</div>
                    </div>
                    <button
                      onClick={() => setOpenId(a.id)}
                      className="px-2 py-1 rounded border text-xs"
                      disabled={a.status === 'submitted'}
                    >
                      {a.status === 'submitted' ? 'Done' : 'Open'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Subordinates&apos; reviews</h2>
            <p className="text-sm text-gray-600 mb-2">Complete the review for each of your direct reports.</p>
            <div className="rounded-xl border bg-white divide-y">
              {subordinateAssignments.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">No subordinate reviews pending.</div>
              ) : (
                subordinateAssignments.map((a: any) => (
                  <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{a.reviewee_username || a.reviewee_user_id}</div>
                      <div className="text-xs text-gray-600">Due {a.due_date || '—'} · {a.status}</div>
                    </div>
                    <button
                      onClick={() => setOpenId(a.id)}
                      className="px-2 py-1 rounded border text-xs"
                      disabled={a.status === 'submitted'}
                    >
                      {a.status === 'submitted' ? 'Done' : 'Open'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      {!isSupervisor && (
        <div className="rounded-xl border bg-white divide-y">
          {(assignments || []).length === 0 ? (
            <div className="px-3 py-6 text-sm text-gray-500">No review pending.</div>
          ) : (
            (assignments || []).map((a: any) => (
              <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">My review</div>
                  <div className="text-xs text-gray-600">Due {a.due_date || '—'} · {a.status}</div>
                </div>
                <button
                  onClick={() => setOpenId(a.id)}
                  className="px-2 py-1 rounded border text-xs"
                  disabled={a.status === 'submitted'}
                >
                  {a.status === 'submitted' ? 'Done' : 'Open'}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {openId && (
        <>
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" style={{ touchAction: 'none' }}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ touchAction: 'auto' }}>
              <div className="flex-shrink-0 p-4 border-b">
                <div className="text-lg font-semibold">Fill Review</div>
              </div>
              <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="space-y-4">{(questions || []).map(renderQuestion)}</div>
              </div>
              <div className="flex-shrink-0 mt-4 p-4 border-t flex justify-end gap-2">
                <button
                  onClick={() => {
                    setOpenId('');
                    setShowNotes(false);
                  }}
                  className="px-3 py-2 rounded border"
                >
                  Cancel
                </button>
                <button onClick={submit} className="px-3 py-2 rounded bg-brand-red text-white">
                  Submit
                </button>
              </div>
            </div>
          </div>
          {hasNotes && (
            <button
              onClick={() => setShowNotes(!showNotes)}
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
