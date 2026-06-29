import { useCallback, useEffect, useMemo, useState, type ReactNode, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import DynamicSafetyForm from '@/components/DynamicSafetyForm';
import { normalizeDefinition, type SafetyFormDefinition } from '@/types/safetyFormTemplate';
import { fieldLabelFromDefinition, SUPERVISOR_COMMENT_KEY_SUFFIX } from '@/lib/employeeReviewForm';
import {
  employeeLegacyReviewImportQuickInfo,
  employeeReviewSubmissionQuickInfo,
  USER_REVIEWS_IMPORT_FIELD_HINTS,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  AppUserSelect,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

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

export type UserEmployeeReviewsTabProps = {
  userId: string;
  /** When false, skips API requests (e.g. tab not visible). */
  enabled?: boolean;
  /** HR: show legacy import from previous platform (JSON). */
  canImportLegacy?: boolean;
};

type ReviewBadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function reviewStatusVariant(status: string): ReviewBadgeVariant {
  if (status === 'submitted') return 'success';
  return 'warning';
}

function ReviewDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className={uiCx(
        'grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5',
      )}
    >
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

export function UserEmployeeReviewsSection({
  userId,
  enabled = true,
  canImportLegacy = false,
}: UserEmployeeReviewsTabProps) {
  const queryClient = useQueryClient();
  const [reviewViewId, setReviewViewId] = useState('');
  const [reviewViewPayload, setReviewViewPayload] = useState<Record<string, unknown>>({});

  const [importKind, setImportKind] = useState<null | 'self' | 'supervisor'>(null);
  const [importCycleId, setImportCycleId] = useState('');
  const [importJsonText, setImportJsonText] = useState('');
  const [importSupervisorId, setImportSupervisorId] = useState('');
  const [preview, setPreview] = useState<LegacyPreviewResponse | null>(null);

  const { data: userReviewAssignments, isLoading: userReviewsLoading } = useQuery({
    queryKey: ['user-reviewee-assignments', userId],
    queryFn: () =>
      api<RevieweeAssignmentRow[]>(
        'GET',
        `/reviews/users/${encodeURIComponent(String(userId))}/reviewee-assignments`,
      ),
    enabled: !!userId && enabled,
  });

  const { data: reviewCycles = [] } = useQuery({
    queryKey: ['review-cycles'],
    queryFn: () => api<CycleOption[]>('GET', '/reviews/cycles'),
    enabled: !!importKind && canImportLegacy && enabled,
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
      typeof u === 'function' ? (u as (p: Record<string, unknown>) => Record<string, unknown>)(prev) : u,
    );
  }, []);

  const reviewModalDefinition = useMemo(
    () => normalizeDefinition(reviewSubmission?.definition ?? {}),
    [reviewSubmission?.definition],
  );

  const viewingAssignmentRow = useMemo(
    () => userReviewAssignments?.find((r) => r.assignment_id === reviewViewId),
    [userReviewAssignments, reviewViewId],
  );
  const hidePerFieldSideCommentsOnView = viewingAssignmentRow?.is_self_review === true;

  type ReviewSortColumn = 'cycle' | 'type' | 'reviewer' | 'period' | 'due' | 'status';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<ReviewSortColumn>('cycle', 'desc');

  const sortedAssignments = useMemo(
    () =>
      sortListByAppColumn(userReviewAssignments ?? [], sortBy, sortDir, {
        cycle: (r) => r.cycle_name,
        type: (r) => (r.is_self_review ? 'Self-review' : 'Supervisor review'),
        reviewer: (r) => r.reviewer_username,
        period: (r) => (r.period_start ? Date.parse(r.period_start) : null),
        due: (r) => (r.due_date ? Date.parse(r.due_date) : null),
        status: (r) => r.status,
      }),
    [userReviewAssignments, sortBy, sortDir],
  );

  const closeImportModal = useCallback(() => {
    setImportKind(null);
    setImportCycleId('');
    setImportJsonText('');
    setImportSupervisorId('');
    setPreview(null);
  }, []);

  const openImportModal = useCallback((kind: 'self' | 'supervisor') => {
    setImportKind(kind);
    setImportCycleId('');
    setImportJsonText('');
    setImportSupervisorId('');
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
        body,
      );
    },
    onSuccess: (data) => {
      setPreview(data);
      toast.success('Preview ready — check unmapped questions and warnings.');
    },
    onError: (e: unknown) => {
      setPreview(null);
      const msg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Preview failed';
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
        body,
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
      const msg =
        e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Import failed';
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
    if (importKind === 'supervisor' && String(importSupervisorId) === String(userId)) {
      toast.error('Supervisor cannot be the same as the reviewee.');
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

  const cycleOptions = useMemo(
    () => reviewCycles.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` })),
    [reviewCycles],
  );

  const openReviewView = (assignmentId: string) => {
    setReviewViewId(assignmentId);
  };

  const closeReviewView = () => {
    setReviewViewId('');
  };

  return (
    <>
      <div className="space-y-6 pb-24">
        <AppCard>
          <AppSectionHeader
            title="Reviews"
            description="Employee review assignments for this user (self-review and supervisor evaluations). Submitted forms appear here after completion."
            {...appSectionPresetProps('description')}
          />

          {canImportLegacy ? (
            <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => openImportModal('self')}>
                Import legacy self-review
              </AppButton>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => openImportModal('supervisor')}>
                Import legacy supervisor review
              </AppButton>
            </div>
          ) : null}

          <div className={uiCx('mt-4 rounded-xl border bg-white', uiSpacing.cardPadding)}>
            <p className={uiCx(uiTypography.helper, 'mb-3')}>Click a row to view the submitted review form.</p>
            <div className="flex flex-col gap-2 overflow-x-auto">
              {userReviewsLoading ? (
                <div
                  className={uiCx(
                    resolveAppSortableListPreset('employeeReviews').minWidth,
                    'px-4 py-4',
                  )}
                >
                  <div className="h-6 animate-pulse rounded bg-gray-100" />
                </div>
              ) : !userReviewAssignments?.length ? (
                <AppEmptyState
                  title="No review assignments yet"
                  description="Assignments appear here when this employee is included in a review cycle."
                  className="border-0 bg-transparent p-0 py-6 shadow-none"
                />
              ) : (
                <AppSortableEntityList layout="flat">
                  <AppSortableEntityListHeader preset="employeeReviews" variant="flat">
                    <AppSortableEntityListSortColumn
                      label="Cycle"
                      column="cycle"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Type"
                      column="type"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Reviewer"
                      column="reviewer"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Period"
                      column="period"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Due"
                      column="due"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                    <AppSortableEntityListSortColumn
                      label="Status"
                      column="status"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={setSort}
                    />
                  </AppSortableEntityListHeader>
                  <AppSortableEntityListFlatBody preset="employeeReviews">
                    {sortedAssignments.map((row) => (
                      <AppSortableEntityListRow
                        key={row.assignment_id}
                        as="div"
                        variant="flat"
                        preset="employeeReviews"
                        className="group"
                        role="button"
                        tabIndex={0}
                        onClick={() => openReviewView(row.assignment_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openReviewView(row.assignment_id);
                          }
                        }}
                      >
                        <div className="min-w-0">
                          <div
                            className={uiCx(
                              'truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010]',
                            )}
                          >
                            {row.cycle_name}
                          </div>
                          <div className={uiCx(uiTypography.helper, 'truncate')}>{row.cycle_status}</div>
                        </div>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {row.is_self_review ? 'Self-review' : 'Supervisor review'}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                          {row.reviewer_username || '—'}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-600')}>
                          {formatPeriod(row.period_start, row.period_end)}
                        </span>
                        <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-600')}>
                          {formatDate(row.due_date)}
                        </span>
                        <div className="min-w-0">
                          <AppBadge variant={reviewStatusVariant(row.status)}>{row.status}</AppBadge>
                        </div>
                      </AppSortableEntityListRow>
                    ))}
                  </AppSortableEntityListFlatBody>
                </AppSortableEntityList>
              )}
            </div>
          </div>
        </AppCard>
      </div>

      {importKind && canImportLegacy ? (
        <AppFormModal
          open
          onClose={closeImportModal}
          title={importKind === 'self' ? 'Import legacy self-review' : 'Import legacy supervisor review'}
          description="Map legacy JSON export questions to a review cycle form template."
          quickInfo={employeeLegacyReviewImportQuickInfo(importKind)}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0 space-y-4')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end flex-wrap')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeImportModal}>
                Cancel
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={previewMutation.isPending}
                onClick={runPreview}
              >
                {previewMutation.isPending ? 'Preview…' : 'Preview'}
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                disabled={applyMutation.isPending || !preview?.dry_run}
                onClick={runApply}
              >
                {applyMutation.isPending ? 'Applying…' : 'Apply import'}
              </AppButton>
            </div>
          }
        >
          <AppSelect
            label="Review cycle"
            value={importCycleId}
            onChange={(e) => {
              setImportCycleId(e.target.value);
              setPreview(null);
            }}
            placeholder="Select cycle…"
            options={cycleOptions}
            fieldHint={USER_REVIEWS_IMPORT_FIELD_HINTS.cycle}
          />

          {importKind === 'supervisor' ? (
            <AppUserSelect
              label="Supervisor"
              value={importSupervisorId}
              onChange={(id) => {
                setImportSupervisorId(id);
                setPreview(null);
              }}
              placeholder="Search by name or username…"
              fieldHint={USER_REVIEWS_IMPORT_FIELD_HINTS.supervisor}
              users={undefined}
            />
          ) : null}

          <AppTextarea
            label="Legacy JSON"
            value={importJsonText}
            onChange={(e) => {
              setImportJsonText(e.target.value);
              setPreview(null);
            }}
            placeholder='[ { "type": "scale", "question": "…", "value": 5 }, … ]'
            rows={8}
            className="font-mono text-xs"
            fieldHint={USER_REVIEWS_IMPORT_FIELD_HINTS.legacy_json}
          />

          <AppFileUpload
            mode="single"
            label="Upload JSON file"
            accept=".json,application/json"
            value={null}
            onChange={(file) => {
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setImportJsonText(String(reader.result || ''));
                setPreview(null);
              };
              reader.readAsText(file);
            }}
          />

          {preview?.dry_run ? (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <AppSectionHeader title="Preview" description="Mapping results before applying the import." />
              <div className={uiCx(uiTypography.helper, 'mt-3 space-y-3')}>
                <p>
                  Mapped <span className="font-semibold tabular-nums text-gray-900">{preview.mapped_field_count}</span>{' '}
                  fields from{' '}
                  <span className="font-semibold tabular-nums text-gray-900">{preview.total_legacy_rows}</span> legacy
                  rows.
                  {typeof preview.supervisor_comment_field_count === 'number' ? (
                    <>
                      {' '}
                      Supervisor comment keys:{' '}
                      <span className="font-semibold tabular-nums text-gray-900">
                        {preview.supervisor_comment_field_count}
                      </span>
                      .
                    </>
                  ) : null}
                </p>
                {preview.unmapped_questions.length > 0 ? (
                  <div>
                    <div className="font-medium text-amber-900">
                      Unmapped questions ({preview.unmapped_questions.length})
                    </div>
                    <ul className="mt-1 max-h-24 list-inside list-disc overflow-y-auto text-amber-950/90">
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
                    <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto text-gray-700">
                      {preview.warnings.slice(0, 30).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </AppCard>
          ) : null}
        </AppFormModal>
      ) : null}

      {reviewViewId && enabled ? (
        <AppFormModal
          open
          onClose={closeReviewView}
          layout="detail"
          size="md"
          title="Review submission"
          description={reviewSubmission?.cycle_name || viewingAssignmentRow?.cycle_name || 'Employee review'}
          quickInfo={employeeReviewSubmissionQuickInfo}
          dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
          dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeReviewView}>
                Close
              </AppButton>
            </div>
          }
        >
          {viewingAssignmentRow?.cycle_id ? (
            <p className={uiCx(uiTypography.helper, 'mb-4')}>
              <Link
                to={`/reviews/compare?cycle=${encodeURIComponent(viewingAssignmentRow.cycle_id)}&reviewee=${encodeURIComponent(String(userId))}`}
                className="font-medium text-[#7f1010] hover:underline"
              >
                Open compare for this cycle
              </Link>
            </p>
          ) : null}

          {reviewSubmission?.status ? (
            <div className="mb-4">
              <AppBadge variant={reviewStatusVariant(reviewSubmission.status)}>{reviewSubmission.status}</AppBadge>
            </div>
          ) : null}

          {!reviewSubmission ? (
            <p className={uiCx(uiTypography.helper, 'py-8 text-center')}>Loading…</p>
          ) : reviewSubmission.status !== 'submitted' ? (
            <p className={uiCx(uiTypography.body, 'py-6 text-gray-600')}>
              This assignment is not submitted yet. There are no answers to display.
            </p>
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
                <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'mt-6 min-w-0')} className="mt-6">
                  <AppSectionHeader
                    title="Supervisor comments"
                    description="Per-question comments from the supervisor review."
                  />
                  <dl className="mt-3 min-w-0">
                    {Object.entries(reviewViewPayload)
                      .filter(([k]) => k.endsWith(SUPERVISOR_COMMENT_KEY_SUFFIX))
                      .map(([k, v]) => {
                        const base = k.slice(0, -SUPERVISOR_COMMENT_KEY_SUFFIX.length);
                        const lab = fieldLabelFromDefinition(reviewModalDefinition, base);
                        return (
                          <ReviewDetailField key={k} label={lab}>
                            <span className="whitespace-pre-wrap font-normal">
                              {v != null && v !== '' ? String(v) : '—'}
                            </span>
                          </ReviewDetailField>
                        );
                      })}
                  </dl>
                </AppCard>
              ) : null}
            </>
          )}
        </AppFormModal>
      ) : null}
    </>
  );
}

export default UserEmployeeReviewsSection;
