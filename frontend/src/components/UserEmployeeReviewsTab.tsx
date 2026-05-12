import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import OverlayPortal from '@/components/OverlayPortal';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import { normalizeDefinition, type SafetyFormDefinition } from '@/types/safetyFormTemplate';
import { fieldLabelFromDefinition, SUPERVISOR_COMMENT_KEY_SUFFIX } from '@/lib/employeeReviewForm';

type RevieweeAssignmentRow = {
  assignment_id: string;
  cycle_id: string;
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

type CycleOption = {
  id: string;
  name: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
};

type LegacyPreviewResponse = {
  dry_run: boolean;
  mapped_field_count: number;
  supervisor_comment_field_count?: number;
  unmapped_questions: string[];
  warnings: string[];
  total_legacy_rows: number;
  assignment_id?: string;
  status?: string;
};

type Props = {
  userId: string;
  /** When false, skips API requests (e.g. tab not visible). */
  enabled?: boolean;
  /** HR: show legacy import from previous platform (JSON). */
  canImportLegacy?: boolean;
};

export default function UserEmployeeReviewsTab({ userId, enabled = true, canImportLegacy = false }: Props) {
  const queryClient = useQueryClient();
  const [reviewViewId, setReviewViewId] = useState('');
  const [reviewViewPayload, setReviewViewPayload] = useState<Record<string, unknown>>({});

  const [importKind, setImportKind] = useState<null | 'self' | 'supervisor'>(null);
  const [importCycleId, setImportCycleId] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [importSupervisorId, setImportSupervisorId] = useState('');
  const [importSupervisorLabel, setImportSupervisorLabel] = useState('');
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [preview, setPreview] = useState<LegacyPreviewResponse | null>(null);

  const { data: userReviewAssignments, isLoading: userReviewsLoading } = useQuery({
    queryKey: ['user-reviewee-assignments', userId],
    queryFn: () =>
      api<RevieweeAssignmentRow[]>(
        'GET',
        `/reviews/users/${encodeURIComponent(String(userId))}/reviewee-assignments`
      ),
    enabled: !!userId && enabled,
  });

  const { data: reviewCycles = [] } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<CycleOption[]>('GET', '/reviews/cycles'),
    enabled: !!importKind && canImportLegacy && enabled,
  });

  const { data: supervisorOptions = [] } = useQuery({
    queryKey: ['users-options-legacy-supervisor', supervisorSearch],
    queryFn: () =>
      api<{ id: string; username?: string; name?: string }[]>(
        'GET',
        `/auth/users/options?q=${encodeURIComponent(supervisorSearch.trim())}&limit=40`
      ),
    enabled:
      importKind === 'supervisor' &&
      canImportLegacy &&
      enabled &&
      supervisorSearch.trim().length >= 1,
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

  const closeImportModal = useCallback(() => {
    setImportKind(null);
    setImportCycleId('');
    setImportJsonText('');
    setImportSupervisorId('');
    setImportSupervisorLabel('');
    setSupervisorSearch('');
    setPreview(null);
  }, []);

  const openImportModal = useCallback((kind: 'self' | 'supervisor') => {
    setImportKind(kind);
    setImportCycleId('');
    setImportJsonText('');
    setImportSupervisorId('');
    setImportSupervisorLabel('');
    setSupervisorSearch('');
    setPreview(null);
  }, []);

  const parseLegacyJson = useCallback((): unknown[] => {
    const t = importJsonText.trim();
    if (!t) throw new Error('Paste the JSON array from the legacy export.');
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array of question objects.');
    return parsed;
  }, [importJsonText]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const legacy_json = parseLegacyJson();
      const body: Record<string, unknown> = {
        cycle_id: importCycleId,
        kind: importKind,
        legacy_json,
      };
      if (importKind === 'supervisor') body.supervisor_user_id = importSupervisorId;
      return api<LegacyPreviewResponse>(
        'POST',
        `/reviews/users/${encodeURIComponent(String(userId))}/legacy-import/preview`,
        body
      );
    },
    onSuccess: (data) => {
      setPreview(data);
      toast.success('Preview ready — check unmapped questions and warnings.');
    },
    onError: (e: unknown) => {
      setPreview(null);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Preview failed';
      toast.error(msg);
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const legacy_json = parseLegacyJson();
      const body: Record<string, unknown> = {
        cycle_id: importCycleId,
        kind: importKind,
        legacy_json,
      };
      if (importKind === 'supervisor') body.supervisor_user_id = importSupervisorId;
      return api<LegacyPreviewResponse>(
        'POST',
        `/reviews/users/${encodeURIComponent(String(userId))}/legacy-import/apply`,
        body
      );
    },
    onSuccess: (data) => {
      toast.success('Legacy review imported.');
      queryClient.invalidateQueries({ queryKey: ['user-reviewee-assignments', userId] });
      if (data.assignment_id) {
        queryClient.invalidateQueries({ queryKey: ['assignment-submission', data.assignment_id] });
      }
      closeImportModal();
    },
    onError: (e: unknown) => {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Import failed';
      toast.error(msg);
    },
  });

  const runPreview = () => {
    if (!importCycleId) {
      toast.error('Choose a review cycle.');
      return;
    }
    if (importKind === 'supervisor' && !importSupervisorId) {
      toast.error('Search and select the supervisor who completed the legacy review.');
      return;
    }
    try {
      parseLegacyJson();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid JSON');
      return;
    }
    previewMutation.mutate();
  };

  const runApply = () => {
    if (!preview || preview.dry_run !== true) {
      toast.error('Run preview first.');
      return;
    }
    applyMutation.mutate();
  };

  const onPickSupervisor = (id: string, label: string) => {
    setImportSupervisorId(id);
    setImportSupervisorLabel(label);
    setSupervisorSearch('');
    setPreview(null);
  };

  return (
    <>
      <div className="space-y-3 pb-6">
        <p className="text-sm text-gray-600">
          Employee review assignments for this user (self-review and supervisor evaluations). Submitted forms
          appear here after completion.
        </p>
        {canImportLegacy ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openImportModal('self')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Import legacy self-review
            </button>
            <button
              type="button"
              onClick={() => openImportModal('supervisor')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Import legacy supervisor review
            </button>
          </div>
        ) : null}
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

      {importKind && canImportLegacy ? (
        <OverlayPortal>
          <div
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4"
            style={{ touchAction: 'none' }}
            onClick={closeImportModal}
          >
            <div
              className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-lg border border-gray-200"
              style={{ touchAction: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 p-4 border-b border-gray-100 flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-gray-900">
                    {importKind === 'self' ? 'Import legacy self-review' : 'Import legacy supervisor review'}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Use a review cycle whose form template labels match the legacy{' '}
                    <code className="text-[11px] bg-gray-100 px-1 rounded">question</code> text (or duplicate the
                    template first). Paste the JSON array, preview, then apply.
                  </p>
                </div>
                <button type="button" onClick={closeImportModal} className="px-2 py-1 rounded border text-sm text-gray-700 shrink-0">
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Review cycle</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900"
                    value={importCycleId}
                    onChange={(e) => {
                      setImportCycleId(e.target.value);
                      setPreview(null);
                    }}
                  >
                    <option value="">Select cycle…</option>
                    {reviewCycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
                {importKind === 'supervisor' ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Supervisor (who signed the legacy review)</label>
                    {importSupervisorId ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs">
                        <span className="text-gray-900 font-medium truncate">{importSupervisorLabel || importSupervisorId}</span>
                        <button
                          type="button"
                          className="text-brand-red font-medium shrink-0"
                          onClick={() => {
                            setImportSupervisorId('');
                            setImportSupervisorLabel('');
                            setPreview(null);
                          }}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
                          placeholder="Search by name or username…"
                          value={supervisorSearch}
                          onChange={(e) => setSupervisorSearch(e.target.value)}
                        />
                        {supervisorSearch.trim().length > 0 ? (
                          <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
                            {supervisorOptions
                              .filter((u) => String(u.id) !== String(userId))
                              .map((u) => {
                              const lab = u.name || u.username || u.id;
                              return (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-50"
                                    onClick={() => onPickSupervisor(u.id, lab)}
                                  >
                                    {lab}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Legacy JSON</label>
                  <textarea
                    className="w-full min-h-[140px] rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-mono text-gray-900"
                    placeholder='[ { "type": "scale", "question": "…", "value": 5 }, … ]'
                    value={importJsonText}
                    onChange={(e) => {
                      setImportJsonText(e.target.value);
                      setPreview(null);
                    }}
                  />
                  <div className="mt-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                      <span className="font-medium">Upload file</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        className="text-xs"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0];
                          if (!f) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setImportJsonText(String(reader.result || ''));
                            setPreview(null);
                          };
                          reader.readAsText(f);
                          ev.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
                {preview?.dry_run ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 text-xs space-y-2">
                    <div className="font-semibold text-gray-800">Preview</div>
                    <div className="text-gray-700">
                      Mapped <span className="font-semibold tabular-nums">{preview.mapped_field_count}</span> fields from{' '}
                      <span className="font-semibold tabular-nums">{preview.total_legacy_rows}</span> legacy rows.
                      {typeof preview.supervisor_comment_field_count === 'number' ? (
                        <>
                          {' '}
                          Supervisor comment keys:{' '}
                          <span className="font-semibold tabular-nums">{preview.supervisor_comment_field_count}</span>.
                        </>
                      ) : null}
                    </div>
                    {preview.unmapped_questions.length > 0 ? (
                      <div>
                        <div className="font-medium text-amber-900">Unmapped questions ({preview.unmapped_questions.length})</div>
                        <ul className="mt-1 max-h-24 overflow-y-auto list-disc list-inside text-amber-950/90">
                          {preview.unmapped_questions.slice(0, 40).map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                          {preview.unmapped_questions.length > 40 ? <li>…</li> : null}
                        </ul>
                      </div>
                    ) : null}
                    {preview.warnings.length > 0 ? (
                      <div>
                        <div className="font-medium text-gray-800">Warnings</div>
                        <ul className="mt-1 max-h-28 overflow-y-auto list-disc list-inside text-gray-700">
                          {preview.warnings.slice(0, 30).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex-shrink-0 p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
                <button type="button" onClick={closeImportModal} className="px-3 py-1.5 rounded-lg border text-xs text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={previewMutation.isPending}
                  onClick={runPreview}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {previewMutation.isPending ? 'Preview…' : 'Preview'}
                </button>
                <button
                  type="button"
                  disabled={applyMutation.isPending || !preview?.dry_run}
                  onClick={runApply}
                  className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-xs font-medium hover:bg-[#aa1212] disabled:opacity-50"
                >
                  {applyMutation.isPending ? 'Applying…' : 'Apply import'}
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      ) : null}

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
                  {viewingAssignmentRow?.cycle_id ? (
                    <div className="mt-2">
                      <Link
                        to={`/reviews/compare?cycle=${encodeURIComponent(viewingAssignmentRow.cycle_id)}&reviewee=${encodeURIComponent(String(userId))}`}
                        className="text-xs font-medium text-brand-red hover:underline"
                      >
                        Open compare for this cycle
                      </Link>
                    </div>
                  ) : null}
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
