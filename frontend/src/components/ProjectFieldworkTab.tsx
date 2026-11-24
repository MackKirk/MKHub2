import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  FileDown,
  FilePlus,
  History,
  MessageSquareWarning,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { ApiError, api, fetchAuthorizedBinary, formatApiErrorDetail } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import DynamicForm from '@/components/DynamicForm';
import { FieldworkSupervisorReportView } from '@/components/fieldwork/FieldworkSupervisorReportView';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListRowIconButton,
  AppSelect,
  AppStickyActionBar,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import { createQuoteFromFieldReport } from '@/lib/createQuoteFromFieldReport';
import { formatDateLocal } from '@/lib/dateUtils';
import {
  collectFieldworkImageClassifications,
  ensureFieldworkPhotosLinked,
} from '@/lib/fieldworkPhotoLink';
import {
  normalizeDefinition,
  validateDynamicFormMissing,
  type SafetyFormDefinition,
} from '@/types/safetyFormTemplate';
import type {
  FieldworkRecord,
  FieldworkRecordKind,
  FieldworkTemplatePick,
} from '@/types/fieldwork';

type Props = {
  projectId: string;
  /** Project business line — scopes which Fieldwork templates appear. */
  businessLine?: string | null;
  isOpportunity: boolean;
  canRead: boolean;
  canWrite: boolean;
  canReview: boolean;
  /** Admins may delete non-draft reports; writers may delete drafts. */
  isAdmin?: boolean;
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

function canDeleteFieldworkRecord(
  status: string | null | undefined,
  canWrite: boolean,
  isAdmin: boolean
): boolean {
  const st = (status || '').toLowerCase();
  if (isAdmin) return true;
  return canWrite && st === 'draft';
}

export default function ProjectFieldworkTab({
  projectId,
  businessLine,
  isOpportunity,
  canRead,
  canWrite,
  canReview,
  isAdmin = false,
  flushSaveRef,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const recordFromUrl = (searchParams.get('fieldwork_record') || '').trim() || null;
  const [quoteBusy, setQuoteBusy] = useState(false);
  const reviewBasePath =
    businessLine === BUSINESS_LINE_CONSTRUCTION ? '/field-reports' : '/rm-field-reports';

  const preferredKind: FieldworkRecordKind = isOpportunity ? 'site_assessment' : 'work_report';
  const [selectedId, setSelectedId] = useState<string | null>(recordFromUrl);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<FieldworkRecordKind>(preferredKind);
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  const [formPayload, setFormPayload] = useState<Record<string, unknown>>({});
  const [finalComments, setFinalComments] = useState('');
  const [baseline, setBaseline] = useState<{ payload: string; comments: string; rowVersion: number } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [requiredFieldHighlightKeys, setRequiredFieldHighlightKeys] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  /** When true, detail refetch must not overwrite local form/comments (409 conflict). */
  const [conflictHold, setConflictHold] = useState<{
    localPayload: Record<string, unknown>;
    localComments: string;
    serverRowVersion: number | null;
  } | null>(null);
  /** Record id whose form was last hydrated from the server (avoid wiping unsaved edits on row_version bumps). */
  const hydratedDetailIdRef = useRef<string | null>(null);
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
    queryKey: ['formTemplates', 'fieldwork', 'active', businessLine || ''],
    queryFn: () => {
      const params = new URLSearchParams({
        domain: 'fieldwork',
        status: 'active',
        sort: 'name',
        sort_dir: 'asc',
      });
      if (businessLine) params.set('business_line', businessLine);
      return api<FieldworkTemplatePick[]>('GET', `/form-templates?${params.toString()}`);
    },
    enabled: canWrite && createOpen,
  });

  const templatesForKind = useMemo(
    () => templates.filter((t) => (t.category || '').toLowerCase() === createKind),
    [templates, createKind]
  );

  useEffect(() => {
    if (!detail) {
      // Only clear when no record is selected — keep id across transient loading flickers.
      if (!selectedId) hydratedDetailIdRef.current = null;
      return;
    }
    const serverRv = Number(detail.row_version || 1);
    // Preserve in-progress edits during a concurrency conflict; only refresh baseline row_version.
    if (conflictHold && conflictHold.localPayload) {
      setFormPayload(conflictHold.localPayload);
      setFinalComments(conflictHold.localComments);
      const holdRv =
        conflictHold.serverRowVersion != null ? conflictHold.serverRowVersion : serverRv;
      setBaseline((prev) => ({
        payload: prev?.payload ?? JSON.stringify(conflictHold.localPayload),
        comments: prev?.comments ?? conflictHold.localComments,
        rowVersion: holdRv,
      }));
      hydratedDetailIdRef.current = detail.id;
      return;
    }

    const payload =
      detail.form_payload && typeof detail.form_payload === 'object' ? { ...detail.form_payload } : {};
    const comments = detail.final_comments || '';
    const sameRecord = hydratedDetailIdRef.current === detail.id;

    // Photo classify / photo delete bump row_version on the server. A detail refetch must NOT
    // replace unsaved checklist answers with the last saved (often empty) form_payload.
    if (sameRecord) {
      setBaseline((prev) => {
        if (!prev) {
          return { payload: JSON.stringify(payload), comments, rowVersion: serverRv };
        }
        if (prev.rowVersion === serverRv) return prev;
        return { ...prev, rowVersion: serverRv };
      });
      return;
    }

    setFormPayload(payload);
    setFinalComments(comments);
    setBaseline({
      payload: JSON.stringify(payload),
      comments,
      rowVersion: serverRv,
    });
    setFieldErrors([]);
    setRequiredFieldHighlightKeys([]);
    setReviewNote('');
    hydratedDetailIdRef.current = detail.id;
  }, [detail, detail?.id, detail?.row_version, detail?.updated_at, conflictHold, selectedId]);

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

  const supervisorComments = useMemo(() => {
    const bag = formPayload[SUPERVISOR_COMMENTS_KEY];
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bag as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const t = (v as { text?: unknown }).text;
        if (typeof t === 'string') out[k] = t;
      }
    }
    return out;
  }, [formPayload]);

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
    hydratedDetailIdRef.current = null; // force next detail effect to hydrate from server
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
      hydratedDetailIdRef.current = row.id;
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

  const deleteMut = useMutation({
    mutationFn: (recordId: string) =>
      api<{ ok: boolean }>(
        'DELETE',
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(recordId)}`
      ),
    onSuccess: (_data, recordId) => {
      qc.removeQueries({ queryKey: ['fieldworkRecord', projectId, recordId] });
      void qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
      void qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
      toast.success('Field report deleted');
      if (selectedId === recordId) openRecord(null);
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not delete field report'
      );
    },
  });

  const askDeleteRecord = async (row: { id: string; status?: string | null; kind?: string | null }) => {
    if (!canDeleteFieldworkRecord(row.status, canWrite, isAdmin)) return;
    const st = (row.status || '').toLowerCase();
    const res = await confirm({
      title: st === 'draft' ? 'Delete draft report?' : 'Delete field report?',
      message:
        st === 'draft'
          ? `Delete this ${kindLabel(row.kind)} draft? This cannot be undone.`
          : `Delete this ${kindLabel(row.kind)} (${st || 'report'})? Only admins can delete non-draft reports. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    deleteMut.mutate(row.id);
  };

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

  useEffect(() => {
    if (requiredFieldHighlightKeys.length === 0) return;
    const stillMissing = new Set(validateDynamicFormMissing(definition, formPayload).map((m) => m.key));
    const unclassifiedKeys = new Set(
      collectFieldworkImageClassifications(formPayload)
        .filter((g) => g.fileObjectIds.length && !g.classify)
        .map((g) => g.fieldKey)
    );
    setRequiredFieldHighlightKeys((prev) => {
      const next = prev.filter((k) => stillMissing.has(k) || unclassifiedKeys.has(k));
      return next.length === prev.length ? prev : next;
    });
    setFieldErrors((prev) => {
      if (!prev.length) return prev;
      const labels = validateDynamicFormMissing(definition, formPayload).map(
        (m) => `${m.label || m.key} is required`
      );
      const photoErr =
        unclassifiedKeys.size > 0
          ? 'Some photos still need catalog phrases. Open Images on those fields, pick phrase(s), then Done.'
          : null;
      const next = photoErr ? [...labels, photoErr] : labels;
      return next.length === prev.length && next.every((x, i) => x === prev[i]) ? prev : next;
    });
  }, [definition, formPayload, requiredFieldHighlightKeys]);

  const askSubmit = async () => {
    if (!detail) return;
    const missingFields = validateDynamicFormMissing(definition, formPayload);
    const errs = missingFields.map((m) => `${m.label || m.key} is required`);

    // Link any checklist photos that still need PhotoObservations (photo first / phrase later).
    const groups = collectFieldworkImageClassifications(formPayload);
    const unclassified = groups.filter((g) => g.fileObjectIds.length && !g.classify);
    if (unclassified.length) {
      errs.push(
        'Some photos still need catalog phrases. Open Images on those fields, pick phrase(s), then Done.'
      );
    }
    const highlightKeys = [
      ...new Set([
        ...missingFields.map((m) => m.key),
        ...unclassified.map((g) => g.fieldKey).filter(Boolean),
      ]),
    ];
    setFieldErrors(errs);
    setRequiredFieldHighlightKeys(highlightKeys);
    if (errs.length) {
      toast.error(
        highlightKeys.length
          ? 'Please complete the highlighted required fields before submitting'
          : 'Please complete required fields before submitting'
      );
      return;
    }
    setFieldErrors([]);
    setRequiredFieldHighlightKeys([]);

    let rowVersion = Number(baseline?.rowVersion || detail.row_version || 1);
    try {
      for (const group of groups) {
        if (!group.classify || !group.fileObjectIds.length) continue;
        const result = await ensureFieldworkPhotosLinked({
          projectId,
          recordId: detail.id,
          fileObjectIds: group.fileObjectIds,
          classify: group.classify,
          expectedRowVersion: rowVersion,
        });
        if (typeof result.recordRowVersion === 'number') rowVersion = result.recordRowVersion;
      }
      const refreshed = await refetchDetail();
      if (refreshed.data) {
        qc.setQueryData(['fieldworkRecord', projectId, refreshed.data.id], refreshed.data);
        void qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
        void qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
        if (baseline) {
          setBaseline((prev) =>
            prev
              ? { ...prev, rowVersion: Number(refreshed.data!.row_version || prev.rowVersion) }
              : prev
          );
        }
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? formatApiErrorDetail(err) || err.message
          : 'Could not classify photos before submit'
      );
      return;
    }

    const photoCount = Number(
      (await refetchDetail()).data?.photo_count ?? detail.photo_count ?? 0
    );
    if (settings.require_min_photos > 0 && photoCount < settings.require_min_photos) {
      toast.error(`At least ${settings.require_min_photos} classified photo(s) are required before submit.`);
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
                  const showDelete = canDeleteFieldworkRecord(row.status, canWrite, isAdmin);
                  return (
                    <li key={row.id} className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => openRecord(row.id)}
                        className="min-w-0 flex-1 text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between gap-3"
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
                      {showDelete ? (
                        <div className="flex items-center pr-3">
                          <AppListRowIconButton
                            preset="delete"
                            label={`Delete ${kindLabel(row.kind)}`}
                            icon={<Trash2 className="h-4 w-4" />}
                            disabled={deleteMut.isPending}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void askDeleteRecord(row);
                            }}
                          />
                        </div>
                      ) : null}
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

  const events = Array.isArray(detail.events) ? detail.events : [];
  const status = (detail.status || '').toLowerCase();
  const showReviewActions = canReview && status === 'submitted';
  const showRevision = canWrite && status === 'approved';
  const showCreateQuote = status === 'approved';

  const downloadPdf = async () => {
    try {
      setPdfBusy(true);
      const buf = await fetchAuthorizedBinary(
        `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/pdf`
      );
      const blob = new Blob([buf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kindLabel(detail.kind).replace(/\s+/g, '-').toLowerCase()}-${detail.id.slice(0, 8)}.pdf`;
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
    <div className={uiCx(uiSpacing.pageStack)}>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => openRecord(null)}
          className="mb-1 text-sm text-brand-red hover:underline"
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

      {status === 'changes_requested' ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-900">Returned for changes</p>
          <p className={uiCx(uiTypography.body, 'mt-1 whitespace-pre-wrap text-red-950')}>
            {(detail.review_note || '').trim() ||
              'Your supervisor asked you to revise this report. Update it below and submit again.'}
          </p>
        </div>
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

      {editable ? (
        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <DynamicForm
            definition={definition}
            formPayload={formPayload}
            setFormPayload={setFormPayload}
            canWrite={editable}
            readOnly={readOnly}
            projectId={projectId}
            highlightRequiredFieldKeys={requiredFieldHighlightKeys}
            enableFieldworkPhraseInsert={editable}
            fieldworkRecordId={detail.id}
            fieldworkRowVersion={Number(baseline?.rowVersion || detail.row_version || 1)}
            onFieldworkPhotosSynced={async (info) => {
              // Only bump concurrency token / photo count — never reload form_payload over unsaved edits.
              const nextRv =
                typeof info.recordRowVersion === 'number'
                  ? info.recordRowVersion
                  : Number(baseline?.rowVersion || detail.row_version || 1);
              setBaseline((prev) => (prev ? { ...prev, rowVersion: nextRv } : prev));
              qc.setQueryData(
                ['fieldworkRecord', projectId, detail.id],
                (old: FieldworkRecord | undefined) =>
                  old
                    ? {
                        ...old,
                        row_version: nextRv,
                        photo_count: Math.max(Number(old.photo_count || 0), Number(old.photo_count || 0)),
                      }
                    : old
              );
              void qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
              void qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
            }}
            onFieldworkPhotoRemoved={async (fileObjectId) => {
              if (!detail?.id) return;
              try {
                const photos = await api<
                  { id: string; file_object_id?: string | null }[]
                >(
                  'GET',
                  `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/photos`
                );
                const match = (photos || []).find(
                  (p) => String(p.file_object_id || '') === String(fileObjectId)
                );
                if (!match?.id) return;
                await api(
                  'DELETE',
                  `/projects/${encodeURIComponent(projectId)}/fieldwork-records/${encodeURIComponent(detail.id)}/photos/${encodeURIComponent(match.id)}`
                );
                // Keep local checklist; bump version via a light list invalidate only.
                setBaseline((prev) =>
                  prev ? { ...prev, rowVersion: prev.rowVersion + 1 } : prev
                );
                qc.setQueryData(
                  ['fieldworkRecord', projectId, detail.id],
                  (old: FieldworkRecord | undefined) =>
                    old
                      ? {
                          ...old,
                          row_version: Number(old.row_version || 1) + 1,
                          photo_count: Math.max(0, Number(old.photo_count || 0) - 1),
                        }
                      : old
                );
                void qc.invalidateQueries({ queryKey: ['fieldworkRecords', projectId] });
                void qc.invalidateQueries({ queryKey: ['projectFiles', projectId] });
              } catch {
                // Thumbnail already removed from form; toast handled by modal on throw
                throw new Error('unlink failed');
              }
            }}
          />
        </AppCard>
      ) : (
        <FieldworkSupervisorReportView
          record={detail}
          supervisorComments={{}}
          showSupervisorNotes={false}
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
          id="fw-review-note"
          label="Why is this being returned?"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          placeholder="Required — explain what must be corrected"
          rows={4}
        />
      </AppFormModal>

      <AppStickyActionBar status={editable ? (dirty ? 'dirty' : 'saved') : 'idle'}>
        {canDeleteFieldworkRecord(detail.status, canWrite, isAdmin) ? (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            className="text-red-700 hover:bg-red-50"
            loading={deleteMut.isPending}
            leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => void askDeleteRecord(detail)}
          >
            Delete
          </AppButton>
        ) : null}
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
        {!editable ? (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => navigate(`${reviewBasePath}/${projectId}/${detail.id}`)}
          >
            Review report
          </AppButton>
        ) : null}
        {showCreateQuote ? (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            loading={quoteBusy}
            leftIcon={<FilePlus className="h-3.5 w-3.5" aria-hidden />}
            onClick={async () => {
              try {
                setQuoteBusy(true);
                const { path } = await createQuoteFromFieldReport({
                  project: {
                    id: projectId,
                    business_line: businessLine || BUSINESS_LINE_REPAIRS_MAINTENANCE,
                    is_bidding: isOpportunity,
                  },
                  recordId: detail.id,
                  recordKind: detail.kind,
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
        {showRevision ? (
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            loading={revisionMut.isPending}
            leftIcon={<Copy className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => revisionMut.mutate()}
          >
            Create revision
          </AppButton>
        ) : null}
        {showReviewActions ? (
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
              onClick={() => approveMut.mutate()}
            >
              Approve
            </AppButton>
          </>
        ) : null}
        {editable ? (
          <>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              loading={saveMut.isPending}
              disabled={!dirty || saveMut.isPending}
              leftIcon={<Save className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => saveMut.mutate()}
            >
              Save draft
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={submitMut.isPending}
              disabled={submitMut.isPending}
              leftIcon={<Send className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => void askSubmit()}
            >
              Submit for review
            </AppButton>
          </>
        ) : null}
      </AppStickyActionBar>
    </div>
  );
}
