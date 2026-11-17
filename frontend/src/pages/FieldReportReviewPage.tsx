import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
  AppInput,
  AppPageHeader,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { ApiError, api, fetchAuthorizedBinary, formatApiErrorDetail } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
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

function readSupervisorMap(payload: Record<string, unknown> | undefined): Record<string, string> {
  const bag = payload?.[SUPERVISOR_COMMENTS_KEY];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const t = (v as { text?: unknown }).text;
      if (typeof t === 'string') out[k] = t;
    }
  }
  return out;
}

export default function FieldReportReviewPage() {
  const { projectId = '', recordId = '' } = useParams();
  const navigateBack = useNavigateBack('/rm-field-reports');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: unknown[]; permissions?: string[] }>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = useMemo(() => new Set(me?.permissions || []), [me?.permissions]);
  const canReview = isAdmin || permissions.has('business:rm:projects:fieldwork:review');

  const [supervisorComments, setSupervisorComments] = useState<Record<string, string>>({});
  const [supervisorBaseline, setSupervisorBaseline] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

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
      }>('GET', `/projects/${projectId}`),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!record) return;
    const map = readSupervisorMap(record.form_payload);
    setSupervisorComments(map);
    setSupervisorBaseline(JSON.stringify(map));
    // Only re-sync when the server version changes (not on every payload identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, record?.row_version]);

  const supervisorDirty = JSON.stringify(supervisorComments) !== supervisorBaseline;
  const status = (record?.status || '').toLowerCase();
  const showReviewActions = canReview && status === 'submitted';
  const canEditSupervisor =
    canReview && (status === 'submitted' || status === 'changes_requested' || status === 'approved');

  const projectHref = projectMeta?.is_bidding
    ? `/rm-opportunities/${projectId}?tab=fieldwork&fieldwork_record=${recordId}`
    : `/rm-projects/${projectId}?tab=fieldwork&fieldwork_record=${recordId}`;

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['fieldwork-record', projectId, recordId] });
    await qc.invalidateQueries({ queryKey: ['fieldwork-inbox'] });
  };

  const saveSupervisorMut = useMutation({
    mutationFn: () => {
      const comments: Record<string, { text: string }> = {};
      for (const [k, v] of Object.entries(supervisorComments)) {
        if (v.trim()) comments[k] = { text: v.trim() };
      }
      return api<FieldworkRecord>(
        'PATCH',
        `/projects/${projectId}/fieldwork-records/${recordId}/supervisor-comments`,
        {
          comments,
          expected_row_version: record?.row_version,
        }
      );
    },
    onSuccess: async () => {
      toast.success('Supervisor notes saved');
      await invalidate();
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Could not save notes');
    },
  });

  const approveMut = useMutation({
    mutationFn: async () => {
      if (supervisorDirty) {
        const comments: Record<string, { text: string }> = {};
        for (const [k, v] of Object.entries(supervisorComments)) {
          if (v.trim()) comments[k] = { text: v.trim() };
        }
        await api(
          'PATCH',
          `/projects/${projectId}/fieldwork-records/${recordId}/supervisor-comments`,
          { comments, expected_row_version: record?.row_version }
        );
        const fresh = await api<FieldworkRecord>(
          'GET',
          `/projects/${projectId}/fieldwork-records/${recordId}`
        );
        return api<FieldworkRecord>(
          'POST',
          `/projects/${projectId}/fieldwork-records/${recordId}/approve`,
          { expected_row_version: fresh.row_version }
        );
      }
      return api<FieldworkRecord>(
        'POST',
        `/projects/${projectId}/fieldwork-records/${recordId}/approve`,
        { expected_row_version: record?.row_version }
      );
    },
    onSuccess: async () => {
      toast.success('Report approved');
      await invalidate();
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Approve failed');
    },
  });

  const requestChangesMut = useMutation({
    mutationFn: async () => {
      if (supervisorDirty) {
        const comments: Record<string, { text: string }> = {};
        for (const [k, v] of Object.entries(supervisorComments)) {
          if (v.trim()) comments[k] = { text: v.trim() };
        }
        await api(
          'PATCH',
          `/projects/${projectId}/fieldwork-records/${recordId}/supervisor-comments`,
          { comments, expected_row_version: record?.row_version }
        );
        const fresh = await api<FieldworkRecord>(
          'GET',
          `/projects/${projectId}/fieldwork-records/${recordId}`
        );
        return api<FieldworkRecord>(
          'POST',
          `/projects/${projectId}/fieldwork-records/${recordId}/request-changes`,
          {
            review_note: reviewNote.trim(),
            expected_row_version: fresh.row_version,
          }
        );
      }
      return api<FieldworkRecord>(
        'POST',
        `/projects/${projectId}/fieldwork-records/${recordId}/request-changes`,
        {
          review_note: reviewNote.trim(),
          expected_row_version: record?.row_version,
        }
      );
    },
    onSuccess: async () => {
      toast.success('Changes requested');
      setRequestChangesOpen(false);
      setReviewNote('');
      await invalidate();
    },
    onError: (err) => {
      toast.error(formatApiErrorDetail((err as ApiError)?.detail) || 'Request failed');
    },
  });

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

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-full bg-gray-50 pb-10')}>
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
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-end')}>
            <Link
              to={projectHref}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Open in project
            </Link>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              loading={pdfBusy}
              onClick={async () => {
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
              }}
            >
              Download PDF
            </AppButton>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Hide history' : 'History'}
            </AppButton>
            {canEditSupervisor ? (
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={!supervisorDirty}
                loading={saveSupervisorMut.isPending}
                onClick={() => saveSupervisorMut.mutate()}
              >
                Save notes
              </AppButton>
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
          </div>
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
        {status === 'changes_requested' && record.review_note ? (
          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Changes requested</p>
            <p className="mt-1 text-sm text-red-950 whitespace-pre-wrap">{record.review_note}</p>
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

      <FieldworkSupervisorReportView
        record={record}
        supervisorComments={supervisorComments}
        canEditSupervisorComments={canEditSupervisor}
        onSupervisorCommentChange={(key, text) =>
          setSupervisorComments((prev) => ({ ...prev, [key]: text }))
        }
      />

      <AppFormModal
        open={requestChangesOpen}
        onClose={() => setRequestChangesOpen(false)}
        title="Request changes"
        description="Explain what the technician must correct. Supervisor notes on each item are saved with this action."
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
          id="fw-review-note-page"
          label="Review note"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Required comment for the technician"
        />
      </AppFormModal>
    </div>
  );
}
