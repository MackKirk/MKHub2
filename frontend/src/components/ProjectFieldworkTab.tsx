import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, ClipboardList } from 'lucide-react';
import { ApiError, api, formatApiErrorDetail, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import DynamicForm from '@/components/DynamicForm';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { FileImagePreviewModal } from '@/components/files';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  normalizeDefinition,
  validateDynamicFormMissing,
  type SafetyFormDefinition,
} from '@/types/safetyFormTemplate';
import type {
  FieldworkPhotoObservation,
  FieldworkRecord,
  FieldworkRecordKind,
  FieldworkTemplatePick,
} from '@/types/fieldwork';

type Props = {
  projectId: string;
  isOpportunity: boolean;
  canRead: boolean;
  canWrite: boolean;
  canReview: boolean;
  flushSaveRef?: MutableRefObject<(() => Promise<void>) | undefined>;
};

function kindLabel(kind: string | null | undefined): string {
  const k = (kind || '').toLowerCase();
  if (k === 'site_assessment') return 'Site Assessment';
  if (k === 'work_report') return 'Work Report';
  return kind || 'Field report';
}

function statusBadge(status: string | null | undefined, pendingReview?: boolean) {
  const st = (status || '').toLowerCase();
  if (st === 'approved') return <AppBadge variant="success">Approved</AppBadge>;
  if (st === 'submitted' || pendingReview) return <AppBadge variant="warning">Pending review</AppBadge>;
  if (st === 'changes_requested') return <AppBadge variant="danger">Changes requested</AppBadge>;
  if (st === 'superseded') return <AppBadge variant="neutral">Superseded</AppBadge>;
  return <AppBadge variant="neutral">Draft</AppBadge>;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDateLocal(new Date(iso));
  } catch {
    return '—';
  }
}

function isEditableStatus(status: string | null | undefined): boolean {
  const st = (status || '').toLowerCase();
  return st === 'draft' || st === 'changes_requested';
}

function isFieldworkConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

export default function ProjectFieldworkTab({
  projectId,
  isOpportunity,
  canRead,
  canWrite,
  canReview,
  flushSaveRef,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const recordFromUrl = (searchParams.get('fieldwork_record') || '').trim() || null;

  const preferredKind: FieldworkRecordKind = isOpportunity ? 'site_assessment' : 'work_report';
  const [selectedId, setSelectedId] = useState<string | null>(recordFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<FieldworkRecordKind>(preferredKind);
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [finalComments, setFinalComments] = useState('');
  const [baseline, setBaseline] = useState<{ payload: string; comments: string; rowVersion: number } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  /** When true, detail refetch must not overwrite local form/comments (409 conflict). */
  const [conflictHold, setConflictHold] = useState<{
    localPayload: Record<string, unknown>;
    localComments: string;
    serverRowVersion: number | null;
  } | null>(null);
  const [photoPreviewIndex, setPhotoPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    setSelectedId(recordFromUrl);
  }, [recordFromUrl]);

  useEffect(() => {
    setCreateKind(preferredKind);
  }, [preferredKind]);

  const openRecord = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const next = new URLSearchParams(searchParams);
      if (id) next.set('fieldwork_record', id);
      else next.delete('fieldwork_record');
      if (!next.get('tab')) next.set('tab', 'fieldwork');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const {
    data: list = [],
    isLoading: listLoading,
    isError: listError,
    error: listErrorObj,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['fieldworkRecords', projectId],
    queryFn: () =>
      api<FieldworkRecord[]>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records`
      ),
    enabled: canRead && !!projectId,
  });

  const {
    data: detail,
    isLoading: detailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['fieldworkRecord', projectId, selectedId],
    queryFn: () =>
      api<FieldworkRecord>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(selectedId!)}`
      ),
    enabled: canRead && !!projectId && !!selectedId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['formTemplates', 'fieldwork', 'active'],
    queryFn: () =>
      api<FieldworkTemplatePick[]>('GET', '/form-templates?domain=fieldwork&status=active&sort=name&sort_dir=asc'),
    enabled: canWrite && createOpen,
  });

  const templatesForKind = useMemo(
    () => templates.filter((t) => (t.category || '').toLowerCase() === createKind),
    [templates, createKind]
  );

  useEffect(() => {
    if (!detail) return;
    // Preserve in-progress edits during a concurrency conflict; only refresh baseline row_version.
    if (conflictHold && conflictHold.localPayload) {
      setFormPayload(conflictHold.localPayload);
      setFinalComments(conflictHold.localComments);
      const serverRv =
        conflictHold.serverRowVersion != null
          ? conflictHold.serverRowVersion
          : Number(detail.row_version || 1);
      setBaseline((prev) => ({
        payload: prev?.payload ?? JSON.stringify(conflictHold.localPayload),
        comments: prev?.comments ?? conflictHold.localComments,
        rowVersion: serverRv,
      }));
      return;
    }
    const payload = detail.form_payload && typeof detail.form_payload === 'object' ? { ...detail.form_payload } : {};
    const comments = detail.final_comments || '';
    setFormPayload(payload);
    setFinalComments(comments);
    setBaseline({
      payload: JSON.stringify(payload),
      comments,
      rowVersion: Number(detail.row_version || 1),
    });
    setFieldErrors([]);
    setReviewNote('');
  }, [detail?.id, detail?.row_version, detail?.updated_at, conflictHold]);

  const definition: SafetyFormDefinition = useMemo(
    () => normalizeDefinition(detail?.form_definition_snapshot || { sections: [] }),
    [detail?.form_definition_snapshot]
  );

  const settings = useMemo(() => {
    const s = detail?.settings_snapshot && typeof detail.settings_snapshot === 'object' ? detail.settings_snapshot : {};
    return {
      require_final_comments: Boolean((s as { require_final_comments?: boolean }).require_final_comments),
      require_min_photos: Number((s as { require_min_photos?: number }).require_min_photos || 0),
      default_pictures_folder: String((s as { default_pictures_folder?: string }).default_pictures_folder || ''),
    };
  }, [detail?.settings_snapshot]);

  const editable = !!detail && isEditableStatus(detail.status) && canWrite;
  const readOnly = !editable;
  const dirty = useMemo(() => {
    if (!baseline || !detail) return false;
    if (!editable) return false;
    return JSON.stringify(formPayload) !== baseline.payload || finalComments !== baseline.comments;
  }, [baseline, detail, editable, formPayload, finalComments]);

  const extractConflictRowVersion = (err: unknown): number | null => {
    if (!(err instanceof ApiError)) return null;
    const d = err.detail;
    if (d && typeof d === 'object' && !Array.isArray(d) && 'row_version' in d) {
      const n = Number((d as { row_version: unknown }).row_version);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const handleConflict = useCallback(
    async (err: unknown) => {
      if (!isFieldworkConflict(err)) return false;
      const serverRv = extractConflictRowVersion(err);
      // Hold local edits so refetchDetail does not wipe the form.
      setConflictHold({
        localPayload: { ...formPayload },
        localComments: finalComments,
        serverRowVersion: serverRv,
      });
      toast.error(
        'This report was changed elsewhere. Your unsaved edits are still on screen — save again to retry, or discard to load the server version.'
      );
      await refetchDetail();
      await qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      return true;
    },
    [finalComments, formPayload, projectId, qc, refetchDetail]
  );

  const discardLocalAndReload = useCallback(async () => {
    setConflictHold(null);
    const res = await refetchDetail();
    const row = res.data;
    if (row) {
      const payload = row.form_payload && typeof row.form_payload === 'object' ? { ...row.form_payload } : {};
      const comments = row.final_comments || '';
      setFormPayload(payload);
      setFinalComments(comments);
      setBaseline({
        payload: JSON.stringify(payload),
        comments,
        rowVersion: Number(row.row_version || 1),
      });
    }
    toast.success('Loaded the latest server version');
  }, [refetchDetail]);

  const clearConflictHoldAfterSuccessfulSave = useCallback(() => {
    setConflictHold(null);
  }, []);

  const createMut = useMutation({
    mutationFn: () =>
      api<FieldworkRecord>('POST', `/projects/${encodeURIComponent(projectId)}/fieldwork-records`, {
        kind: createKind,
        form_template_id: pickedTemplateId,
        form_payload: {},
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      setCreateOpen(false);
      setPickedTemplateId('');
      toast.success('Field report created');
      openRecord(row.id);
    },
    onError: (err: unknown) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not create report');
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error('No record');
      return api<FieldworkRecord>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}`,
        {
          form_payload: formPayload,
          final_comments: finalComments,
          expected_row_version: baseline?.rowVersion ?? detail.row_version,
        }
      );
    },
    onSuccess: (row) => {
      clearConflictHoldAfterSuccessfulSave();
      qc.setQueryData(['fieldworkRecord', projectId, row.id], row);
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      setBaseline({
        payload: JSON.stringify(row.form_payload || {}),
        comments: row.final_comments || '',
        rowVersion: Number(row.row_version || 1),
      });
      setFormPayload(row.form_payload && typeof row.form_payload === 'object' ? { ...row.form_payload } : {});
      setFinalComments(row.final_comments || '');
      toast.success('Draft saved');
    },
    onError: async (err: unknown) => {
      if (await handleConflict(err)) return;
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not save');
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!detail) throw new Error('No record');
      // Persist latest edits before submit when dirty
      let rowVersion = baseline?.rowVersion ?? detail.row_version;
      if (dirty) {
        const saved = await api<FieldworkRecord>(
          'PATCH',
          `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}`,
          {
            form_payload: formPayload,
            final_comments: finalComments,
            expected_row_version: rowVersion,
          }
        );
        rowVersion = Number(saved.row_version || rowVersion);
      }
      return api<FieldworkRecord>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/submit`,
        {
          final_comments: finalComments,
          expected_row_version: rowVersion,
        }
      );
    },
    onSuccess: (row) => {
      clearConflictHoldAfterSuccessfulSave();
      qc.setQueryData(['fieldworkRecord', projectId, row.id], row);
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      toast.success('Report submitted for review');
    },
    onError: async (err: unknown) => {
      if (await handleConflict(err)) return;
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not submit');
    },
  });

  const approveMut = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error('No record');
      return api<FieldworkRecord>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/approve`,
        {
          review_note: reviewNote.trim() || null,
          expected_row_version: baseline?.rowVersion ?? detail.row_version,
        }
      );
    },
    onSuccess: (row) => {
      qc.setQueryData(['fieldworkRecord', projectId, row.id], row);
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      toast.success('Report approved');
    },
    onError: async (err: unknown) => {
      if (await handleConflict(err)) return;
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not approve');
    },
  });

  const requestChangesMut = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error('No record');
      return api<FieldworkRecord>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/request-changes`,
        {
          review_note: reviewNote.trim(),
          expected_row_version: baseline?.rowVersion ?? detail.row_version,
        }
      );
    },
    onSuccess: (row) => {
      setRequestChangesOpen(false);
      qc.setQueryData(['fieldworkRecord', projectId, row.id], row);
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      toast.success('Changes requested');
    },
    onError: async (err: unknown) => {
      if (await handleConflict(err)) return;
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not request changes');
    },
  });

  const revisionMut = useMutation({
    mutationFn: () => {
      if (!detail) throw new Error('No record');
      return api<FieldworkRecord>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/revisions`
      );
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      toast.success('Editable revision created');
      openRecord(row.id);
    },
    onError: (err: unknown) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not create revision');
    },
  });

  const flushSave = useCallback(async () => {
    if (!dirty || !editable) return;
    await saveMut.mutateAsync();
  }, [dirty, editable, saveMut]);

  useEffect(() => {
    if (!flushSaveRef) return;
    flushSaveRef.current = flushSave;
    return () => {
      flushSaveRef.current = undefined;
    };
  }, [flushSave, flushSaveRef]);

  useUnsavedChangesGuard(dirty, flushSave, () => {
    if (!baseline) return;
    try {
      setFormPayload(JSON.parse(baseline.payload));
    } catch {
      setFormPayload({});
    }
    setFinalComments(baseline.comments);
  });

  const askSubmit = async () => {
    if (!detail) return;
    const missing = validateDynamicFormMissing(definition, formPayload).map(
      (m) => `${m.label || m.key} is required`
    );
    const errs = [...missing];
    if (settings.require_final_comments && !finalComments.trim()) {
      errs.push('Final comments are required for this template.');
    }
    if (settings.require_min_photos > 0 && Number(detail.photo_count || 0) < settings.require_min_photos) {
      errs.push(`At least ${settings.require_min_photos} photo(s) are required before submit.`);
    }
    setFieldErrors(errs);
    if (errs.length) {
      toast.error('Please complete required fields before submitting');
      return;
    }
    const res = await confirm({
      title: 'Submit for review?',
      message: 'The report will be locked for editing until a reviewer responds.',
      confirmText: 'Submit',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    submitMut.mutate();
  };

  if (!canRead) {
    return (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <p className={uiCx(uiTypography.body, 'text-gray-600')}>
          You do not have permission to view Fieldwork reports.
        </p>
      </AppCard>
    );
  }

  if (!selectedId) {
    return (
      <>
        <div className={uiCx(uiSpacing.pageStack)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className={uiTypography.sectionTitle}>Field reports</h2>
              <p className={uiCx(uiTypography.helper, 'mt-1')}>
                {isOpportunity
                  ? 'Site Assessments for quoting. Existing reports stay available after award.'
                  : 'Work Reports for execution, plus any Site Assessments from the opportunity.'}
              </p>
            </div>
            {list.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900 ring-1 ring-amber-200">
                  Pending review:{' '}
                  {list.filter((r) => (r.status || '').toLowerCase() === 'submitted' || r.pending_review).length}
                </span>
                <span className="rounded-md bg-red-50 px-2 py-1 text-red-800 ring-1 ring-red-200">
                  Changes requested:{' '}
                  {list.filter((r) => (r.status || '').toLowerCase() === 'changes_requested').length}
                </span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-900 ring-1 ring-emerald-200">
                  Approved: {list.filter((r) => (r.status || '').toLowerCase() === 'approved').length}
                </span>
              </div>
            ) : null}
          </div>

          <AppCard bodyClassName="!p-0 overflow-hidden">
            {canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setCreateKind(preferredKind);
                  setPickedTemplateId('');
                  setCreateOpen(true);
                }}
                className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px]"
              >
                <span className="font-semibold text-sm text-gray-700">+ New field report</span>
              </button>
            ) : null}

            {listLoading ? (
              <div className={uiCx(uiTypography.helper, 'p-8 text-center', canWrite && 'border-t border-gray-100')}>
                Loading…
              </div>
            ) : listError ? (
              <div className={uiCx(uiSpacing.cardPadding, canWrite && 'border-t border-gray-100', 'space-y-3')}>
                <p className="text-sm text-red-700">
                  Could not load field reports.{' '}
                  {formatApiErrorDetail((listErrorObj as ApiError)?.detail) ||
                    (listErrorObj instanceof Error ? listErrorObj.message : '')}
                </p>
                <AppButton type="button" size="sm" variant="secondary" onClick={() => void refetchList()}>
                  Retry
                </AppButton>
              </div>
            ) : list.length === 0 ? (
              <div className={uiCx(uiSpacing.cardPadding, canWrite && 'border-t border-gray-100')}>
                <AppEmptyState
                  title="No field reports yet"
                  description={
                    canWrite
                      ? `Create a ${kindLabel(preferredKind)} to get started.`
                      : 'Reports will appear here once created.'
                  }
                  className="border-0 bg-transparent p-0 shadow-none"
                />
              </div>
            ) : (
              <ul className={uiCx('divide-y divide-gray-100 list-none', canWrite && 'border-t border-gray-100')}>
                {list.map((row) => {
                  const owner = row.created_by_name || row.updated_by_name || '—';
                  const photos = Number(row.photo_count || 0);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openRecord(row.id)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{kindLabel(row.kind)}</span>
                            {statusBadge(row.status, row.pending_review)}
                            {row.pending_review ? (
                              <span className="text-xs font-medium text-amber-800">Review pending</span>
                            ) : null}
                          </div>
                          <div className={uiCx(uiTypography.helper, 'mt-1')}>
                            Created {fmtWhen(row.created_at)} · Updated {fmtWhen(row.updated_at)} · {owner}
                            {photos > 0 ? ` · ${photos} photo${photos === 1 ? '' : 's'}` : ''}
                            {row.version > 1 ? ` · v${row.version}` : ''}
                          </div>
                        </div>
                        <ClipboardList className="h-4 w-4 text-gray-400 shrink-0 mt-1" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </AppCard>
        </div>

        <AppFormModal
          open={createOpen && canWrite}
          onClose={() => setCreateOpen(false)}
          title="New field report"
          description="Choose the report type and an active Fieldwork template."
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                disabled={!pickedTemplateId}
                loading={createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                Create
              </AppButton>
            </div>
          }
        >
          <div className="space-y-3">
            <AppSelect
              label="Report type"
              value={createKind}
              onChange={(e) => {
                const next = e.target.value === 'work_report' ? 'work_report' : 'site_assessment';
                setCreateKind(next);
                setPickedTemplateId('');
              }}
              options={[
                { value: 'site_assessment', label: 'Site Assessment' },
                { value: 'work_report', label: 'Work Report' },
              ]}
            />
            <AppSelect
              label="Template"
              value={pickedTemplateId}
              onChange={(e) => setPickedTemplateId(e.target.value)}
              placeholder={templatesForKind.length ? 'Select template…' : 'No active templates for this type'}
              options={templatesForKind.map((t) => ({
                value: t.id,
                label: `${t.name}${t.version_label ? ` (${t.version_label})` : ''}`,
              }))}
            />
          </div>
        </AppFormModal>
      </>
    );
  }

  if (detailLoading || !detail) {
    return (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <p className={uiCx(uiTypography.helper, 'text-center py-6')}>Loading report…</p>
      </AppCard>
    );
  }

  const photos: FieldworkPhotoObservation[] = Array.isArray(detail.photos) ? detail.photos : [];
  const events = Array.isArray(detail.events) ? detail.events : [];
  const status = (detail.status || '').toLowerCase();
  const showReviewActions = canReview && status === 'submitted';
  const showRevision = canWrite && status === 'approved';

  return (
    <div className={uiCx(uiSpacing.pageStack)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => openRecord(null)}
            className="text-sm text-brand-red hover:underline mb-1"
          >
            ← Field reports
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={uiTypography.sectionTitle}>{kindLabel(detail.kind)}</h2>
            {statusBadge(detail.status, detail.pending_review)}
            {detail.version > 1 ? (
              <span className={uiCx(uiTypography.helper)}>v{detail.version}</span>
            ) : null}
          </div>
          <p className={uiCx(uiTypography.helper, 'mt-1')}>
            Created {fmtWhen(detail.created_at)} by {detail.created_by_name || '—'} · Updated{' '}
            {fmtWhen(detail.updated_at)}
          </p>
        </div>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : 'Status history'}
          </AppButton>
          {editable ? (
            <>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                loading={saveMut.isPending}
                disabled={!dirty || saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                Save draft
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                loading={submitMut.isPending}
                disabled={submitMut.isPending}
                onClick={() => void askSubmit()}
              >
                Submit for review
              </AppButton>
            </>
          ) : null}
          {showReviewActions ? (
            <>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReviewNote('');
                  setRequestChangesOpen(true);
                }}
              >
                Request changes
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                loading={approveMut.isPending}
                onClick={() => approveMut.mutate()}
              >
                Approve
              </AppButton>
            </>
          ) : null}
          {showRevision ? (
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              loading={revisionMut.isPending}
              onClick={() => revisionMut.mutate()}
            >
              Create revision
            </AppButton>
          ) : null}
        </div>
      </div>

      {conflictHold ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className="text-sm font-semibold text-amber-900">Edit conflict</p>
          <p className={uiCx(uiTypography.body, 'mt-1')}>
            Another save changed this report. Your unsaved edits are still on this screen. Save again to retry with your
            text, or discard your edits and load the server version.
          </p>
          <div className={uiCx(uiLayout.actionsRow, 'mt-3 flex-wrap')}>
            <AppButton
              type="button"
              size="sm"
              loading={saveMut.isPending}
              onClick={async () => {
                const res = await confirm({
                  title: 'Overwrite the other save?',
                  message:
                    'Keeping your edits will replace the other user’s most recent saved form fields and final comments with what is on your screen. Photo observations already on the server are unchanged. Continue only if you intend to win this conflict.',
                  confirmText: 'Overwrite with my edits',
                  cancelText: 'Cancel',
                });
                if (res !== 'confirm') return;
                saveMut.mutate();
              }}
            >
              Keep my edits and save
            </AppButton>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => void discardLocalAndReload()}>
              Discard mine and reload
            </AppButton>
          </div>
        </AppCard>
      ) : null}

      {status === 'changes_requested' && detail.review_note ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className="text-sm font-semibold text-amber-900">Reviewer requested changes</p>
          <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap')}>{detail.review_note}</p>
        </AppCard>
      ) : null}

      {fieldErrors.length > 0 ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className="text-sm font-semibold text-red-800">Before submit</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-red-700 space-y-1">
            {fieldErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </AppCard>
      ) : null}

      {showHistory ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <h3 className={uiTypography.sectionTitle}>Status history</h3>
          {events.length === 0 ? (
            <p className={uiCx(uiTypography.helper, 'mt-2')}>No events recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {events.map((ev) => (
                <li key={ev.id} className="text-sm text-gray-700 border-b border-gray-100 pb-2 last:border-0">
                  <div className="font-medium text-gray-900">
                    {ev.event_type}
                    {ev.from_status || ev.to_status
                      ? ` · ${(ev.from_status || '—')} → ${(ev.to_status || '—')}`
                      : ''}
                  </div>
                  <div className={uiTypography.helper}>
                    {fmtWhen(ev.created_at)} · {ev.created_by_name || '—'}
                  </div>
                  {ev.message ? <p className="mt-1 whitespace-pre-wrap">{ev.message}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      ) : null}

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <DynamicForm
          definition={definition}
          formPayload={formPayload}
          setFormPayload={setFormPayload}
          canWrite={editable}
          readOnly={readOnly}
          projectId={projectId}
        />
      </AppCard>

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <label htmlFor="fw-final-comments" className="text-sm font-semibold text-gray-900">
          Final comments
          {settings.require_final_comments ? <span className="text-red-600"> *</span> : null}
        </label>
        <textarea
          id="fw-final-comments"
          className="mt-2 w-full min-h-[96px] rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400/35 disabled:bg-gray-50 disabled:text-gray-600"
          value={finalComments}
          onChange={(e) => setFinalComments(e.target.value)}
          disabled={!editable}
          placeholder={editable ? 'Summary comments for reviewers…' : undefined}
        />
      </AppCard>

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-gray-500" aria-hidden />
          <h3 className={uiTypography.sectionTitle}>Photo observations</h3>
          <span className={uiCx(uiTypography.helper)}>
            {photos.length} photo{photos.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className={uiCx(uiTypography.helper, 'mt-1')}>
          Same FileObject as Project Files · phrase snapshots from PhotoObservation
          {settings.default_pictures_folder
            ? ` · folder: ${settings.default_pictures_folder}`
            : ''}
          .
        </p>
        {photos.length === 0 ? (
          <div className="mt-4">
            <AppEmptyState
              title="No photographs linked yet"
              description="Photos uploaded from mobile or classified from Files appear here for review."
              className="border-0 bg-transparent p-0 shadow-none"
            />
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 list-none">
            {photos.map((p, idx) => (
              <li key={p.id} className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                <button
                  type="button"
                  className="aspect-[4/3] w-full bg-gray-100 block"
                  onClick={() => setPhotoPreviewIndex(idx)}
                  title="Open full preview"
                >
                  <img
                    src={withFileAccessToken(`/files/${p.file_object_id}/thumbnail?w=480`)}
                    alt={p.phrase_text_snapshot || 'Field photo'}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
                <div className="p-3 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {(p.entry_type || '').replace('_', ' ') || 'Unclassified'}
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {p.phrase_text_snapshot || 'Needs classification'}
                  </div>
                  {p.classification_snapshot ? (
                    <div className={uiCx(uiTypography.helper)}>{p.classification_snapshot}</div>
                  ) : null}
                  {p.extra_notes ? (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.extra_notes}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <FileImagePreviewModal
        open={photoPreviewIndex != null}
        items={photos.map((p) => ({
          id: p.id,
          name: p.phrase_text_snapshot || p.classification_snapshot || 'Field photo',
          url: withFileAccessToken(`/files/${p.file_object_id}/thumbnail?w=1600`),
          fileObjectId: p.file_object_id,
        }))}
        index={photoPreviewIndex ?? 0}
        onClose={() => setPhotoPreviewIndex(null)}
        onPrev={() =>
          setPhotoPreviewIndex((i) => {
            if (i == null || photos.length === 0) return i;
            return (i - 1 + photos.length) % photos.length;
          })
        }
        onNext={() =>
          setPhotoPreviewIndex((i) => {
            if (i == null || photos.length === 0) return i;
            return (i + 1) % photos.length;
          })
        }
        variant="modal"
      />

      <AppFormModal
        open={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        title="Request changes"
        description="Explain what the technician must correct. The report returns to editable status."
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setRequestChangesOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              disabled={!reviewNote.trim()}
              loading={requestChangesMut.isPending}
              onClick={() => requestChangesMut.mutate()}
            >
              Send request
            </AppButton>
          </div>
        }
      >
        <AppInput
          id="fw-review-note"
          label="Review note"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Required comment for the technician"
        />
      </AppFormModal>
    </div>
  );
}
