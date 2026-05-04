import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import { normalizeDefinition, type SafetyFormDefinition } from '@/types/safetyFormTemplate';
import { fieldLabelFromDefinition, SUPERVISOR_COMMENT_KEY_SUFFIX } from '@/lib/employeeReviewForm';

type RevieweeAssignmentRow = {
  assignment_id: string;
  cycle_name: string;
  cycle_status: string;
  period_start: string | null;
  period_end: string | null;
  reviewer_username: string | null;
  is_self_review: boolean;
  assignment_kind: string;
  status: string;
  due_date: string | null;
};

type Props = {
  userId: string;
  /** When false, skips API requests (e.g. tab not visible). */
  enabled?: boolean;
};

export default function UserEmployeeReviewsTab({ userId, enabled = true }: Props) {
  const [reviewViewId, setReviewViewId] = useState('');
  const [reviewViewPayload, setReviewViewPayload] = useState<Record<string, unknown>>({});

  const { data: userReviewAssignments, isLoading: userReviewsLoading } = useQuery({
    queryKey: ['user-reviewee-assignments', userId],
    queryFn: () =>
      api<RevieweeAssignmentRow[]>(
        'GET',
        `/reviews/users/${encodeURIComponent(String(userId))}/reviewee-assignments`
      ),
    enabled: !!userId && enabled,
  });

  const { data: reviewSubmission } = useQuery({
    queryKey: ['assignment-submission', reviewViewId],
    queryFn: () =>
      api<{
        definition: SafetyFormDefinition;
        form_payload: Record<string, unknown>;
        status: string;
        cycle_name: string;
      }>('GET', `/reviews/assignments/${encodeURIComponent(reviewViewId)}/submission`),
    enabled: !!reviewViewId && enabled,
  });

  useEffect(() => {
    if (reviewSubmission?.form_payload && typeof reviewSubmission.form_payload === 'object') {
      setReviewViewPayload(reviewSubmission.form_payload as Record<string, unknown>);
    } else {
      setReviewViewPayload({});
    }
  }, [reviewSubmission]);

  const setReviewViewPayloadSafe = useCallback((u: SetStateAction<Record<string, unknown>>) => {
    setReviewViewPayload((prev) =>
      typeof u === 'function' ? (u as (p: Record<string, unknown>) => Record<string, unknown>)(prev) : u
    );
  }, []);

  const reviewModalDefinition = useMemo(
    () => normalizeDefinition(reviewSubmission?.definition ?? {}),
    [reviewSubmission?.definition]
  );

  const viewingAssignmentRow = useMemo(
    () => userReviewAssignments?.find((r) => r.assignment_id === reviewViewId),
    [userReviewAssignments, reviewViewId]
  );
  const hidePerFieldSideCommentsOnView = viewingAssignmentRow?.is_self_review === true;

  return (
    <>
      <div className="space-y-3 pb-6">
        <p className="text-sm text-gray-600">
          Employee review assignments for this user (self-review and supervisor evaluations). Submitted forms
          appear here after completion.
        </p>
        {userReviewsLoading ? (
          <div className="h-24 bg-gray-100 animate-pulse rounded" />
        ) : !userReviewAssignments?.length ? (
          <div className="text-sm text-gray-500 py-6">No review assignments yet for this user.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                  <th className="py-2 px-3 font-medium">Cycle</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 pr-3 font-medium">Reviewer</th>
                  <th className="py-2 pr-3 font-medium">Period</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody>
                {userReviewAssignments.map((row) => (
                  <tr key={row.assignment_id} className="border-b border-gray-100">
                    <td className="py-2 px-3">
                      <div className="font-medium text-gray-900">{row.cycle_name}</div>
                      <div className="text-xs text-gray-500">{row.cycle_status}</div>
                    </td>
                    <td className="py-2 pr-3">{row.is_self_review ? 'Self-review' : 'Supervisor review'}</td>
                    <td className="py-2 pr-3">{row.reviewer_username || '—'}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {row.period_start || '—'} → {row.period_end || '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs">{row.due_date || '—'}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                          row.status === 'submitted' ? 'bg-green-100 text-green-800' : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => setReviewViewId(row.assignment_id)}
                        className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewViewId && enabled ? (
        <OverlayPortal>
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4"
            style={{ touchAction: 'none' }}
          >
            <div
              className="bg-white rounded-xl w-full max-w-[min(1200px,calc(100vw-1.5rem))] max-h-[92vh] flex flex-col"
              style={{ touchAction: 'auto' }}
            >
              <div className="flex-shrink-0 p-4 border-b flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">Review submission</div>
                  {reviewSubmission?.cycle_name && (
                    <div className="text-xs text-gray-600 mt-1">{reviewSubmission.cycle_name}</div>
                  )}
                  {reviewSubmission?.status && (
                    <div className="text-xs mt-1">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full ${
                          reviewSubmission.status === 'submitted'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {reviewSubmission.status}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setReviewViewId('')}
                  className="px-2 py-1 rounded border text-sm text-gray-700"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
                {!reviewSubmission ? (
                  <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
                ) : reviewSubmission.status !== 'submitted' ? (
                  <div className="text-sm text-gray-600 py-6">
                    This assignment is not submitted yet. There are no answers to display.
                  </div>
                ) : (
                  <>
                    <DynamicSafetyForm
                      definition={reviewModalDefinition}
                      formPayload={reviewViewPayload}
                      setFormPayload={setReviewViewPayloadSafe}
                      canWrite={false}
                      readOnly
                      projectId=""
                      signerDisplayName="View only"
                      hideAdditionalCommentsBlock
                      hideWorkerSignatureBlock
                      hidePerFieldSideComments={hidePerFieldSideCommentsOnView}
                      fieldCommentTextOnly={!hidePerFieldSideCommentsOnView}
                    />
                    {Object.keys(reviewViewPayload).some((k) => k.endsWith(SUPERVISOR_COMMENT_KEY_SUFFIX)) ? (
                      <div className="mt-8 pt-6 border-t border-gray-200 space-y-3">
                        <h3 className="text-sm font-semibold text-gray-800">Supervisor comments</h3>
                        {Object.entries(reviewViewPayload)
                          .filter(([k]) => k.endsWith(SUPERVISOR_COMMENT_KEY_SUFFIX))
                          .map(([k, v]) => {
                            const base = k.slice(0, -SUPERVISOR_COMMENT_KEY_SUFFIX.length);
                            const lab = fieldLabelFromDefinition(reviewModalDefinition, base);
                            return (
                              <div key={k} className="text-sm">
                                <div className="text-xs font-medium text-gray-600 mb-0.5">{lab}</div>
                                <div className="text-gray-900 whitespace-pre-wrap">
                                  {v != null && v !== '' ? String(v) : '—'}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </>
  );
}
