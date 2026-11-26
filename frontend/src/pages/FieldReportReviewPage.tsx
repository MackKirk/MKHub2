import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  FileDown,
  History,
  MessageSquareWarning,
  Pencil,
  Save,
} from 'lucide-react';
import DynamicForm from '@/components/DynamicForm';
import {
  FieldworkSupervisorReportView,
  SUPERVISOR_COMMENTS_KEY,
} from '@/components/fieldwork/FieldworkSupervisorReportView';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppFormModal,
  AppPageHeader,
  AppStickyActionBar,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { ApiError, api, fetchAuthorizedBinary, formatApiErrorDetail } from '@/lib/api';
import { createQuoteFromFieldReport } from '@/lib/createQuoteFromFieldReport';
import { formatDateLocal } from '@/lib/dateUtils';
import { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import { hasFieldworkReviewPermission, isAdminRole } from '@/lib/projectLinePermissionKeys';
import { normalizeDefinition } from '@/types/safetyFormTemplate';
import type { FieldworkRecord } from '@/types/fieldwork';

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

export default function FieldReportReviewPage() {
  const { projectId = '', recordId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [quoteBusy, setQuoteBusy] = useState(false);
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: unknown[]; permissions?: string[] }>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = useMemo(() => new Set(me?.permissions || []), [me?.permissions]);

  const [reviewNote, setReviewNote] = useState('');
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [reviewerEditing, setReviewerEditing] = useState(false);
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [finalComments, setFinalComments] = useState('');
  const [editBaseline, setEditBaseline] = useState<{
    payload: string;
    comments: string;
    rowVersion: number;
  } | null>(null);
  const [supervisorComments, setSupervisorComments] = useState<Record<string, string>>({});
  const supervisorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisorDraftRef = useRef<Record<string, string>>({});

  const { data: record, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['fieldwork-record', projectId, recordId],
    queryFn: () =>
      api<FieldworkRecord>('GET', `/projects/${projectId}/fieldwork-records/${recordId}`),
    enabled: !!projectId && !!recordId,
  });

  const { data: projectMeta } = useQuery({
    queryKey: ['project-lite', projectId],
    queryFn: () =>
      api<{
        id: string;
        name?: string;
        code?: string;
        address?: string;
        is_bidding?: boolean;
        business_line?: string;
      }>('GET', `/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const projectBusinessLine = projectMeta?.business_line;
  const canReview = hasFieldworkReviewPermission(
    permissions,
    projectBusinessLine,
    isAdmin
  );

  const status = (record?.status || '').toLowerCase();
  const showReviewActions = canReview && status === 'submitted';
  const canReviewerAmend = showReviewActions;
  const canEditSupervisorComments =
    canReview &&
    !reviewerEditing &&
    (status === 'submitted' || status === 'changes_requested' || status === 'approved');
  const definition = useMemo(
    () => normalizeDefinition(record?.form_definition_snapshot || { sections: [] }),
    [record?.form_definition_snapshot]
  );
  const editDirty = useMemo(() => {
    if (!editBaseline || !reviewerEditing) return false;
    return (
      JSON.stringify(formPayload) !== editBaseline.payload || finalComments !== editBaseline.comments
    );
  }, [editBaseline, finalComments, formPayload, reviewerEditing]);

  useEffect(() => {
    if (status !== 'submitted') setReviewerEditing(false);
  }, [status]);

  useEffect(() => {
    if (!record || reviewerEditing) return;
    const payload =
      record.form_payload && typeof record.form_payload === 'object'
        ? { ...record.form_payload }
        : {};
    const comments = record.final_comments || '';
    setFormPayload(payload);
    setFinalComments(comments);
    setEditBaseline({
      payload: JSON.stringify(payload),
      comments,
      rowVersion: Number(record.row_version || 1),
    });
  }, [record, reviewerEditing]);

  useEffect(() => {
    const payload = (record?.form_payload || {}) as Record<string, unknown>;
    const bag = payload[SUPERVISOR_COMMENTS_KEY];
    const next: Record<string, string> = {};
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) {
      for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
        if (typeof v === 'string') next[k] = v;
        else if (v && typeof v === 'object' && !Array.isArray(v)) {
          const t = (v as { text?: unknown }).text;
          if (typeof t === 'string') next[k] = t;
        }
      }
    }
    setSupervisorComments(next);
    supervisorDraftRef.current = next;
  }, [record?.id, record?.row_version, record?.form_payload]);

  useEffect(() => {
    return () => {
      if (supervisorSaveTimer.current) clearTimeout(supervisorSaveTimer.current);
    };
  }, []);

  const isRm = projectBusinessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE;
  const projectHref = projectMeta?.is_bidding
    ? `${isRm ? '/rm-opportunities' : '/opportunities'}/${projectId}?tab=fieldwork&fieldwork_record=${recordId}`
    : `${isRm ? '/rm-projects' : '/projects'}/${projectId}?tab=fieldwork&fieldwork_record=${recordId}`;

  const navigateBack = useNavigateBack(
    projectBusinessLine === BUSINESS_LINE_CONSTRUCTION ? '/field-reports' : '/rm-field-reports'
  );

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['fieldwork-record', projectId, recordId] });
    await qc.invalidateQueries({ queryKey: ['fieldwork-inbox'] });
  };

  const approveMut = useMutation({
    mutationFn: () =>
      api<FieldworkRecord>(
        'POST',
        `/projects/${projectId}/fieldwork-records/${recordId}/approve`,
        { expected_row_version: record?.row_version }
      ),
    onSuccess: async () => {
      toast.success('Report approved');
      await invalidate();
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Approve failed');
    },
  });

  const requestChangesMut = useMutation({
    mutationFn: () =>
      api<FieldworkRecord>(
        'POST',
        `/projects/${projectId}/fieldwork-records/${recordId}/request-changes`,
        {
          review_note: reviewNote.trim(),
          expected_row_version: record?.row_version,
        }
      ),
    onSuccess: async () => {
      toast.success('Report returned for changes');
      setRequestChangesOpen(false);
      setReviewNote('');
      await invalidate();
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Request failed');
    },
  });

  const saveSupervisorCommentsMut = useMutation({
    mutationFn: (comments: Record<string, string>) =>
      api<FieldworkRecord>(
        'PATCH',
        `/projects/${projectId}/fieldwork-records/${recordId}/supervisor-comments`,
        {
          comments,
          expected_row_version: record?.row_version,
        }
      ),
    onSuccess: async (saved) => {
      qc.setQueryData(['fieldwork-record', projectId, recordId], saved);
      await qc.invalidateQueries({ queryKey: ['fieldwork-inbox'] });
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not save supervisor notes');
    },
  });

  const saveReportMut = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error('No record');
      return api<FieldworkRecord>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`,
        {
          form_payload: formPayload,
          final_comments: finalComments,
          expected_row_version: editBaseline?.rowVersion ?? record.row_version,
        }
      );
    },
    onSuccess: async (saved) => {
      qc.setQueryData(['fieldwork-record', projectId, recordId], saved);
      const payload =
        saved.form_payload && typeof saved.form_payload === 'object' ? { ...saved.form_payload } : {};
      const comments = saved.final_comments || '';
      setFormPayload(payload);
      setFinalComments(comments);
      setEditBaseline({
        payload: JSON.stringify(payload),
        comments,
        rowVersion: Number(saved.row_version || 1),
      });
      toast.success('Changes saved');
      await qc.invalidateQueries({ queryKey: ['fieldwork-inbox'] });
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not save changes');
    },
  });

  const finishReviewerEditing = async () => {
    if (editDirty) {
      try {
        await saveReportMut.mutateAsync();
      } catch {
        return;
      }
    }
    setReviewerEditing(false);
  };

  const handleSupervisorCommentChange = (fieldKey: string, text: string) => {
    setSupervisorComments((prev) => {
      const next = { ...prev, [fieldKey]: text };
      supervisorDraftRef.current = next;
      return next;
    });
    if (supervisorSaveTimer.current) clearTimeout(supervisorSaveTimer.current);
    supervisorSaveTimer.current = setTimeout(() => {
      saveSupervisorCommentsMut.mutate(supervisorDraftRef.current);
    }, 600);
  };

  const events = Array.isArray(record?.events) ? record!.events! : [];
  const title = useMemo(() => kindLabel(record?.kind), [record?.kind]);

  if (isLoading) {
    return (
      <div className={uiCx(uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader title="Field report" onBack={navigateBack} />
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className={uiCx(uiTypography.helper, 'text-center py-8')}>Loading report…</p>
        </AppCard>
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className={uiCx(uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader title="Field report" onBack={navigateBack} />
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <p className="text-sm text-red-700">
            Could not load this report.
            {error instanceof Error ? ` ${error.message}` : ''}
          </p>
          <AppButton type="button" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </AppButton>
        </AppCard>
      </div>
    );
  }

  const downloadPdf = async () => {
    try {
      setPdfBusy(true);
      const buf = await fetchAuthorizedBinary(
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/pdf`
      );
      const blob = new Blob([buf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-').toLowerCase()}-${recordId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title={title}
        subtitle={
          [
            projectMeta?.name || 'Project',
            projectMeta?.code,
            projectMeta?.address,
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        onBack={navigateBack}
        actions={
          <Link
            to={projectHref}
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open in project
          </Link>
        }
      />

      <AppCard bodyClassName="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(record.status, record.pending_review)}
          {record.version > 1 ? <span className={uiTypography.helper}>Version {record.version}</span> : null}
          <span className={uiTypography.helper}>
            Submitted {fmtWhen(record.submitted_at)} by {record.submitted_by_name || record.created_by_name || '—'}
          </span>
          {Number(record.photo_count || 0) > 0 ? (
            <span className={uiTypography.helper}>
              · {record.photo_count} photo{record.photo_count === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {status === 'changes_requested' ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
              Returned for changes
            </p>
            <p className="mt-1 text-sm text-red-950 whitespace-pre-wrap">
              {(record.review_note || '').trim() ||
                'The supervisor asked for corrections. Open the project report to revise and resubmit.'}
            </p>
          </div>
        ) : null}
        {status === 'approved' && record.approved_by_name ? (
          <p className={uiCx(uiTypography.helper, 'mt-2')}>
            Approved {fmtWhen(record.approved_at)} by {record.approved_by_name}
          </p>
        ) : null}
      </AppCard>

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

      {reviewerEditing ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-950">
              Editing submitted report — fix answers or photo captions, then save from the bar below.
              You can still approve or return for changes after.
            </p>
          </div>
          <DynamicForm
            definition={definition}
            formPayload={formPayload}
            setFormPayload={setFormPayload}
            canWrite
            projectId={projectId}
            enableFieldworkPhraseInsert
            fieldworkRecordId={record.id}
            fieldworkRowVersion={editBaseline?.rowVersion ?? record.row_version}
            onFieldworkPhotosSynced={async (info) => {
              const nextRv =
                typeof info.recordRowVersion === 'number'
                  ? info.recordRowVersion
                  : Number(editBaseline?.rowVersion || record.row_version || 1);
              setEditBaseline((prev) => (prev ? { ...prev, rowVersion: nextRv } : prev));
              qc.setQueryData(
                ['fieldwork-record', projectId, recordId],
                (old: FieldworkRecord | undefined) =>
                  old ? { ...old, row_version: nextRv } : old
              );
              await qc.invalidateQueries({ queryKey: ['fieldwork-inbox'] });
            }}
            onFieldworkPhotoRemoved={async (fileObjectId) => {
              try {
                const photos = await api<{ id: string; file_object_id?: string | null }[]>(
                  'GET',
                  `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos`
                );
                const match = (photos || []).find(
                  (p) => String(p.file_object_id || '') === String(fileObjectId)
                );
                if (!match?.id) return;
                await api(
                  'DELETE',
                  `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}/photos/${encodeURIComponent(match.id)}`
                );
                setEditBaseline((prev) =>
                  prev ? { ...prev, rowVersion: prev.rowVersion + 1 } : prev
                );
                qc.setQueryData(
                  ['fieldwork-record', projectId, recordId],
                  (old: FieldworkRecord | undefined) =>
                    old
                      ? {
                          ...old,
                          row_version: Number(old.row_version || 1) + 1,
                          photo_count: Math.max(0, Number(old.photo_count || 0) - 1),
                        }
                      : old
                );
              } catch {
                throw new Error('unlink failed');
              }
            }}
          />
          <div className="mt-4">
            <AppTextarea
              id="fw-review-final-comments"
              label="Additional comments"
              value={finalComments}
              onChange={(e) => setFinalComments(e.target.value)}
              rows={3}
            />
          </div>
        </AppCard>
      ) : (
        <FieldworkSupervisorReportView
          record={record}
          supervisorComments={supervisorComments}
          showSupervisorNotes={canReview}
          canEditSupervisorComments={canEditSupervisorComments}
          onSupervisorCommentChange={
            canEditSupervisorComments ? handleSupervisorCommentChange : undefined
          }
        />
      )}

      <AppFormModal
        open={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        title="Deny / request changes"
        description="Tell the technician why this report is being returned. They will see this message at the top when they revise it."
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
              Return for changes
            </AppButton>
          </div>
        }
      >
        <AppTextarea
          id="fw-review-note-page"
          label="Why is this being returned?"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Required — explain what must be corrected"
          rows={4}
        />
      </AppFormModal>

      <AppStickyActionBar status={reviewerEditing ? (editDirty ? 'dirty' : 'saved') : 'idle'}>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<History className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? 'Hide history' : 'History'}
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          size="sm"
          loading={pdfBusy}
          leftIcon={<FileDown className="h-3.5 w-3.5" aria-hidden />}
          onClick={() => void downloadPdf()}
        >
          PDF
        </AppButton>
        {status === 'approved' ? (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            loading={quoteBusy}
            onClick={async () => {
              try {
                setQuoteBusy(true);
                const { path } = await createQuoteFromFieldReport({
                  project: {
                    id: projectId,
                    business_line: projectBusinessLine,
                    is_bidding: projectMeta?.is_bidding,
                  },
                  recordId,
                  recordKind: record.kind,
                  projectName: projectMeta?.name,
                });
                toast.success('Quote document created — pick photos to insert');
                navigate(path);
              } catch (err) {
                toast.error(
                  err instanceof ApiError
                    ? formatApiErrorDetail(err) || err.message
                    : err instanceof Error
                      ? err.message
                      : 'Could not create quote'
                );
              } finally {
                setQuoteBusy(false);
              }
            }}
          >
            Create quote
          </AppButton>
        ) : null}
        {canReviewerAmend && !reviewerEditing ? (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => setReviewerEditing(true)}
          >
            Edit
          </AppButton>
        ) : null}
        {showReviewActions && !reviewerEditing ? (
          <>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => {
                setReviewNote('');
                setRequestChangesOpen(true);
              }}
            >
              Deny / request changes
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={approveMut.isPending}
              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
              onClick={async () => {
                const res = await confirm({
                  title: 'Approve this report?',
                  message:
                    'The report becomes locked evidence. Create a revision later if something must change.',
                  confirmText: 'Approve',
                  cancelText: 'Cancel',
                });
                if (res !== 'confirm') return;
                approveMut.mutate();
              }}
            >
              Approve
            </AppButton>
          </>
        ) : null}
        {canReviewerAmend && reviewerEditing ? (
          <>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={saveReportMut.isPending}
              onClick={() => void finishReviewerEditing()}
            >
              Done
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={saveReportMut.isPending}
              disabled={!editDirty || saveReportMut.isPending}
              leftIcon={<Save className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => saveReportMut.mutate()}
            >
              Save changes
            </AppButton>
          </>
        ) : null}
      </AppStickyActionBar>
    </div>
  );
}
