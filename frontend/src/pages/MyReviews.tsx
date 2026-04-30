import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import { normalizeDefinition, type SafetyFormDefinition } from '@/types/safetyFormTemplate';
import {
  collectEmployeeReviewFieldRows,
  SUPERVISOR_COMMENT_KEY_SUFFIX,
} from '@/lib/employeeReviewForm';

type AssignmentQuestionsResponse = {
  definition: SafetyFormDefinition;
  form_template_id: string;
  assignment_id: string;
};

export default function MyReviews() {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const { data: reviewsAvailable } = useQuery({
    queryKey: ['reviews-me-available'],
    queryFn: () => api<{ available?: boolean; is_supervisor?: boolean }>('GET', '/reviews/me/available'),
  });
  const { data: assignments, refetch } = useQuery({
    queryKey: ['my-assignments'],
    queryFn: () => api<any[]>('GET', '/reviews/my/assignments'),
  });
  const [openId, setOpenId] = useState<string>('');
  const { data: questionBundle } = useQuery({
    queryKey: ['assignment-questions', openId],
    queryFn: () =>
      openId ? api<AssignmentQuestionsResponse>('GET', `/reviews/assignments/${openId}/questions`) : Promise.resolve(null),
    enabled: !!openId,
  });
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});

  const definition = questionBundle?.definition;
  const normalizedDef = useMemo(() => (definition ? normalizeDefinition(definition) : normalizeDefinition({})), [definition]);

  const openAssignment = useMemo(
    () => (assignments || []).find((a: any) => String(a.id) === String(openId)),
    [assignments, openId]
  );
  const showSupervisorCommentFields = !!(
    openAssignment &&
    me &&
    String(openAssignment.reviewer_user_id) === String(me.id) &&
    String(openAssignment.reviewee_user_id) !== String(me.id)
  );
  const supervisorFieldRows = useMemo(
    () => (showSupervisorCommentFields ? collectEmployeeReviewFieldRows(normalizedDef) : []),
    [showSupervisorCommentFields, normalizedDef]
  );

  useEffect(() => {
    setFormPayload({});
  }, [openId]);

  const isSupervisor = reviewsAvailable?.is_supervisor ?? false;
  const selfAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_self), [assignments]);
  const subordinateAssignments = useMemo(() => (assignments || []).filter((a: any) => a.is_subordinate), [assignments]);

  const submit = async () => {
    try {
      await api('POST', `/reviews/assignments/${openId}/answers`, { form_payload: formPayload });
      toast.success('Submitted');
      setOpenId('');
      setFormPayload({});
      await refetch();
    } catch (_e) {
      toast.error('Failed');
    }
  };

  if (reviewsAvailable && !reviewsAvailable.available) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold mb-3">Employee review</h1>
        <p className="text-sm text-gray-600 mb-4">
          HR runs review cycles and assigns the right questionnaire by team (for example field staff vs office). When a
          cycle is active and you are included, your review will show up here.
        </p>
        <div className="rounded-xl border bg-white p-6 text-gray-600">
          There is no employee review available for you at this time.
        </div>
      </div>
    );
  }

  const modalTitle = showSupervisorCommentFields
    ? `Review — ${openAssignment?.reviewee_username || 'direct report'}`
    : 'My review';

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Employee review</h1>
      <p className="text-sm text-gray-600 mb-4">
        Complete your own review when it appears below. If you supervise people in the same cycle, you will also complete
        their reviews here using the same form, with an optional supervisor comment on each question.
      </p>

      {isSupervisor && (
        <>
          <section className="mb-6">
            <h2 className="text-lg font-semibold mb-2">My review</h2>
            <p className="text-sm text-gray-600 mb-2">Your self-review for the current cycle.</p>
            <div className="rounded-xl border bg-white divide-y">
              {selfAssignments.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">No self-review in this cycle.</div>
              ) : (
                selfAssignments.map((a: any) => (
                  <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{a.reviewee_username || 'My self-review'}</div>
                      <div className="text-xs text-gray-600">
                        Due {a.due_date || '—'} · {a.status}
                      </div>
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
            <h2 className="text-lg font-semibold mb-2">My team&apos;s reviews</h2>
            <p className="text-sm text-gray-600 mb-2">
              Complete the review for each direct report. The questionnaire matches theirs; add supervisor comments under
              each question as needed.
            </p>
            <div className="rounded-xl border bg-white divide-y">
              {subordinateAssignments.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500">No direct-report reviews in this cycle.</div>
              ) : (
                subordinateAssignments.map((a: any) => (
                  <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-medium">{a.reviewee_username || a.reviewee_user_id}</div>
                      <div className="text-xs text-gray-600">
                        Due {a.due_date || '—'} · {a.status}
                      </div>
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
            <div className="px-3 py-6 text-sm text-gray-500">No review assigned to you in the active cycle.</div>
          ) : (
            (assignments || []).map((a: any) => (
              <div key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">My review</div>
                  <div className="text-xs text-gray-600">
                    Due {a.due_date || '—'} · {a.status}
                  </div>
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
          <OverlayPortal>
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" style={{ touchAction: 'none' }}>
              <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col" style={{ touchAction: 'auto' }}>
                <div className="flex-shrink-0 p-4 border-b">
                  <div className="text-lg font-semibold">{modalTitle}</div>
                  {showSupervisorCommentFields && (
                    <p className="text-xs text-gray-600 mt-1">
                      Answer each question for this employee, then add optional supervisor comments below each item.
                    </p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {!definition ? (
                    <div className="text-sm text-gray-500 py-8 text-center">Loading form…</div>
                  ) : (
                    <>
                      <DynamicSafetyForm
                        definition={normalizedDef}
                        formPayload={formPayload}
                        setFormPayload={setFormPayload}
                        canWrite
                        readOnly={false}
                        projectId=""
                        signerDisplayName="Reviewer"
                      />
                      {showSupervisorCommentFields && supervisorFieldRows.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
                          <h3 className="text-sm font-semibold text-gray-800">Supervisor comments (optional)</h3>
                          <p className="text-xs text-gray-600">
                            Short notes per question for HR and development records. Leave blank if not needed.
                          </p>
                          {supervisorFieldRows.map(({ key, label }) => {
                            const ck = `${key}${SUPERVISOR_COMMENT_KEY_SUFFIX}`;
                            const val =
                              typeof formPayload[ck] === 'string'
                                ? (formPayload[ck] as string)
                                : formPayload[ck] != null
                                  ? String(formPayload[ck])
                                  : '';
                            return (
                              <div key={ck} className="space-y-1">
                                <label className="block text-xs font-medium text-gray-700" htmlFor={ck}>
                                  Comment — {label}
                                </label>
                                <textarea
                                  id={ck}
                                  rows={2}
                                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                  value={val}
                                  onChange={(e) =>
                                    setFormPayload((prev) => ({
                                      ...prev,
                                      [ck]: e.target.value,
                                    }))
                                  }
                                  placeholder="Supervisor comment…"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex-shrink-0 mt-4 p-4 border-t flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setOpenId('');
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
          </OverlayPortal>
        </>
      )}
    </div>
  );
}
