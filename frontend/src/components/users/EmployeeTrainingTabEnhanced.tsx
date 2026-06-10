import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  employeeTrainingDetailQuickInfo,
  employeeTrainingRecordQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFieldHint,
  AppFileUpload,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppSectionHeader,
  AppSelect,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTextarea,
  AppTimePicker,
  FORM_MODAL_WIDE_DIALOG_COLLAPSED,
  FORM_MODAL_WIDE_DIALOG_EXPANDED,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

const TRAINING_CATEGORIES = ['', 'Safety', 'Compliance', 'Technical skills', 'Soft skills', 'Leadership', 'Other'];
const TRAINING_FORMATS = ['', 'in_person', 'online', 'hybrid'];
const TRAINING_STATUSES = ['completed', 'in_progress', 'scheduled', 'expired'];

/** Docs tab folder for certificate files uploaded from Training & courses modal. */
const TRAINING_CERTIFICATES_FOLDER_NAME = 'Training certificates';

async function getOrCreateTrainingCertificatesFolderId(userId: string): Promise<string> {
  const folders = await api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
  const match = (folders || []).find(
    (f: any) => !f.parent_id && String(f.name || '').trim() === TRAINING_CERTIFICATES_FOLDER_NAME,
  );
  if (match?.id) return String(match.id);
  try {
    const res = await api<{ id: string }>('POST', `/auth/users/${encodeURIComponent(userId)}/folders`, {
      name: TRAINING_CERTIFICATES_FOLDER_NAME,
    });
    return String(res.id);
  } catch {
    const again = await api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/folders`);
    const m2 = (again || []).find(
      (f: any) => !f.parent_id && String(f.name || '').trim() === TRAINING_CERTIFICATES_FOLDER_NAME,
    );
    if (m2?.id) return String(m2.id);
    throw new Error('Could not resolve Training certificates folder');
  }
}

async function uploadTrainingCertificateToDocs(
  userId: string,
  file: File,
  meta: { docTitle?: string; issuedDate?: string; expiryDate?: string; trainingTitle: string },
) {
  const name = file.name;
  const contentType = file.type || 'application/octet-stream';
  const folderId = await getOrCreateTrainingCertificatesFolderId(userId);
  const up = await api<any>('POST', '/files/upload', {
    original_name: name,
    content_type: contentType,
    employee_id: userId,
    project_id: null,
    client_id: null,
    category_id: userId,
  });
  const putResp = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`);
  }
  const conf = await api<{ id: string }>('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  const title =
    (meta.docTitle && meta.docTitle.trim()) || `${meta.trainingTitle} — ${name}`;
  await api('POST', `/auth/users/${encodeURIComponent(userId)}/documents`, {
    folder_id: folderId,
    title,
    file_id: conf.id,
    issued_date: meta.issuedDate?.trim() || undefined,
    expiry_date: meta.expiryDate?.trim() || undefined,
    notes: 'Uploaded from Training & courses (employee HR record).',
  });
}

async function uploadTrainingCertificateToWorkerFiles(
  workerId: string,
  file: File,
  meta: { docTitle?: string; trainingTitle: string },
) {
  const name = file.name;
  const contentType = file.type || 'application/octet-stream';
  const up = await api<any>('POST', '/files/upload', {
    original_name: name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id: 'files',
  });
  const putResp = await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  if (!putResp.ok) {
    throw new Error(`Upload failed (${putResp.status})`);
  }
  const conf = await api<{ id: string }>('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  const title = (meta.docTitle && meta.docTitle.trim()) || `${meta.trainingTitle} — ${name}`;
  const q = new URLSearchParams({
    file_object_id: conf.id,
    category: 'Training certificates',
    original_name: title,
  });
  await api<{ id: string }>('POST', `/subcontractors/workers/${encodeURIComponent(workerId)}/files?${q.toString()}`);
}

function trainingStatusBadge(status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return <AppBadge variant="success">Completed</AppBadge>;
  if (s === 'expired') return <AppBadge variant="neutral">Expired</AppBadge>;
  if (s === 'scheduled') return <AppBadge variant="info">Scheduled</AppBadge>;
  if (s === 'in_progress') return <AppBadge variant="warning">In progress</AppBadge>;
  return <AppBadge variant="neutral">{status || '—'}</AppBadge>;
}

function TrainingDetailField({ label, children }: { label: string; children: ReactNode }) {
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

function _parseYmdLocal(iso: string): Date | null {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function _calendarInclusiveDays(startIso: string, endIso: string): number {
  const a = _parseYmdLocal(startIso);
  const b = _parseYmdLocal(endIso || startIso);
  if (!a || !b) return 0;
  if (b < a) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** Inclusive range; skips Sat/Sun when includeWeekends is false. Falls back to at least 1 calendar day if no weekdays match. */
function _workdaysInclusive(startIso: string, endIso: string, includeWeekends: boolean): number {
  const a = _parseYmdLocal(startIso);
  const b = _parseYmdLocal(endIso || startIso);
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (includeWeekends || (w !== 0 && w !== 6)) n++;
  }
  if (n === 0) return Math.max(1, _calendarInclusiveDays(startIso, endIso || startIso));
  return n;
}

/** Expects HTML time values "HH:mm". If end <= start, assumes same session past midnight. */
function _dailyHoursFromTimes(timeStart: string, timeEnd: string): number | null {
  const ts = String(timeStart || '').trim();
  const te = String(timeEnd || '').trim();
  if (!ts || !te) return null;
  const [sh, sm] = ts.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = te.split(':').map((x) => parseInt(x, 10));
  if ([sh, sm, eh, em].some((x) => Number.isNaN(x))) return null;
  let startM = sh * 60 + sm;
  let endM = eh * 60 + em;
  let diff = endM - startM;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
}

function _parseSessionTimeToHHmm(sessionTime: string): { time_start: string; time_end: string } {
  const s = String(sessionTime || '').trim();
  const m = s.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
  if (!m) return { time_start: '', time_end: '' };
  const pad = (t: string) => {
    const [h, mi] = t.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(mi)) return '';
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  };
  return { time_start: pad(m[1]), time_end: pad(m[2]) };
}

export function EmployeeTrainingSection(
  props:
    | { variant: 'user'; userId: string; canEdit: boolean }
    | { variant: 'worker'; workerId: string; canEdit: boolean },
) {
  const isWorker = props.variant === 'worker';
  const subjectId = isWorker ? props.workerId : props.userId;
  const { canEdit } = props;
  const trainingRecordsBase = isWorker
    ? `/subcontractors/workers/${encodeURIComponent(subjectId)}/training-records`
    : `/auth/users/${encodeURIComponent(subjectId)}/training-records`;
  const trainingMatrixBase = isWorker
    ? `/subcontractors/workers/${encodeURIComponent(subjectId)}/training-matrix`
    : `/auth/users/${encodeURIComponent(subjectId)}/training-matrix`;
  const trainingQueryScope = isWorker ? ('worker' as const) : ('user' as const);

  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: rows = [], refetch, isLoading } = useQuery({
    queryKey: ['employee-training-records', trainingQueryScope, subjectId],
    queryFn: () => api<any[]>('GET', trainingRecordsBase),
    enabled: !!subjectId,
  });
  const { data: matrixSnap, isLoading: matrixLoading } = useQuery({
    queryKey: ['user-training-matrix', trainingQueryScope, subjectId],
    queryFn: () =>
      api<{ items: Array<{ id: string; label: string; cell_kind: string; display: string; record: any | null }> }>(
        'GET',
        trainingMatrixBase,
      ),
    enabled: !!subjectId,
  });
  const { data: matrixCatalog } = useQuery({
    queryKey: ['training-matrix-catalog'],
    queryFn: () => api<{ items: Array<{ id: string; label: string; cell_kind: string }> }>('GET', '/auth/training-records/matrix-catalog'),
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificateDocTitle, setCertificateDocTitle] = useState('');
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [differentCompletionDate, setDifferentCompletionDate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    provider: '',
    category: '',
    delivery_format: '',
    start_date: '',
    end_date: '',
    completion_date: '',
    status: 'completed',
    certificate_number: '',
    expiry_date: '',
    notes: '',
    crew: '',
    location: '',
    session_time: '',
    time_start: '',
    time_end: '',
    matrix_training_id: '',
  });

  const resetForm = (defaults?: Partial<typeof form>) => {
    setIncludeWeekends(false);
    setDifferentCompletionDate(false);
    setForm({
      title: '',
      provider: '',
      category: '',
      delivery_format: '',
      start_date: '',
      end_date: '',
      completion_date: '',
      status: 'completed',
      certificate_number: '',
      expiry_date: '',
      notes: '',
      crew: '',
      location: '',
      session_time: '',
      time_start: '',
      time_end: '',
      matrix_training_id: '',
      ...defaults,
    });
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setCertificateFile(null);
    setCertificateDocTitle('');
    setModalOpen(true);
  };

  const openAddForMatrix = (slot: { id: string; label: string }) => {
    setEditing(null);
    resetForm({ title: slot.label, matrix_training_id: slot.id });
    setCertificateFile(null);
    setCertificateDocTitle('');
    setModalOpen(true);
  };

  const openView = (r: any) => {
    setViewingRecord(r);
  };

  const closeView = () => {
    setViewingRecord(null);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    const st = r.session_time != null ? String(r.session_time) : '';
    const parsed = _parseSessionTimeToHHmm(st);
    const endD = r.end_date ? String(r.end_date).slice(0, 10) : '';
    const compD = r.completion_date ? String(r.completion_date).slice(0, 10) : '';
    const useDifferentComp = compD !== '' && compD !== endD;
    setDifferentCompletionDate(useDifferentComp);
    setForm({
      title: r.title || '',
      provider: r.provider || '',
      category: r.category || '',
      delivery_format: r.delivery_format || '',
      start_date: r.start_date ? String(r.start_date).slice(0, 10) : '',
      end_date: endD,
      completion_date: compD,
      status: r.status || 'completed',
      certificate_number: r.certificate_number || '',
      expiry_date: r.expiry_date ? String(r.expiry_date).slice(0, 10) : '',
      notes: r.notes || '',
      crew: r.crew != null ? String(r.crew) : '',
      location: r.location != null ? String(r.location) : '',
      session_time: st,
      time_start: parsed.time_start,
      time_end: parsed.time_end,
      matrix_training_id: r.matrix_training_id != null ? String(r.matrix_training_id) : '',
    });
    setCertificateFile(null);
    setCertificateDocTitle('');
    setIncludeWeekends(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setCertificateFile(null);
    setCertificateDocTitle('');
    setIncludeWeekends(false);
    setDifferentCompletionDate(false);
  };

  /** Matrix slots without a linked HR record yet — shortcuts only; filled slots live in Training & courses above. */
  const matrixShortcutItems = useMemo(
    () => (matrixSnap?.items || []).filter((row) => !row.record),
    [matrixSnap?.items],
  );

  const trainingDurationHint = useMemo(() => {
    const startD = form.start_date.trim();
    const endD = form.end_date.trim() || startD;
    const ts = form.time_start.trim();
    const te = form.time_end.trim();
    if (!startD || !ts || !te) return null;
    const perDay = _dailyHoursFromTimes(ts, te);
    if (perDay == null) return null;
    const days = _workdaysInclusive(startD, endD, includeWeekends);
    if (days <= 0) return null;
    return { days, perDay };
  }, [form.start_date, form.end_date, form.time_start, form.time_end, includeWeekends]);

  const computedDurationHours = useMemo(() => {
    if (!trainingDurationHint) return null;
    return Math.round(trainingDurationHint.perDay * trainingDurationHint.days * 100) / 100;
  }, [trainingDurationHint]);

  const effectiveCompletionDate = (): string => {
    if (differentCompletionDate) return form.completion_date.trim();
    return form.end_date.trim() || form.start_date.trim();
  };

  const buildPayload = () => {
    const needsCompletion = form.status === 'completed' || form.status === 'expired';
    const cdTrim = effectiveCompletionDate();
    const duration_hours =
      computedDurationHours != null
        ? computedDurationHours
        : editing?.duration_hours != null && !Number.isNaN(Number(editing.duration_hours))
          ? Number(editing.duration_hours)
          : undefined;
    const ts = form.time_start.trim();
    const te = form.time_end.trim();
    const session_time =
      ts && te ? `${ts}–${te}` : form.session_time.trim() || undefined;
    return {
      title: form.title.trim(),
      provider: form.provider.trim() || undefined,
      category: form.category.trim() || undefined,
      delivery_format: form.delivery_format.trim() || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      completion_date: (needsCompletion ? cdTrim : cdTrim || null) as string | null,
      duration_hours,
      status: form.status || 'completed',
      certificate_number: form.certificate_number.trim() || undefined,
      expiry_date: form.expiry_date || undefined,
      notes: form.notes.trim() || undefined,
      crew: form.crew.trim() || undefined,
      location: form.location.trim() || undefined,
      session_time,
      matrix_training_id: form.matrix_training_id.trim() ? form.matrix_training_id.trim() : null,
    };
  };

  const submitTrainingRecord = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    const needsCompletion = form.status === 'completed' || form.status === 'expired';
    if (needsCompletion && !effectiveCompletionDate()) {
      toast.error(
        differentCompletionDate
          ? 'Completion date is required when using a different completion date'
          : 'End date (or start date) is required for completed or expired records',
      );
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = buildPayload();
    } catch (err: any) {
      toast.error(err?.message || 'Invalid form');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api('PATCH', `${trainingRecordsBase}/${encodeURIComponent(editing.id)}`, payload);
      } else {
        await api('POST', trainingRecordsBase, payload);
      }
      if (certificateFile && canEdit) {
        try {
          if (isWorker) {
            await uploadTrainingCertificateToWorkerFiles(subjectId, certificateFile, {
              docTitle: certificateDocTitle,
              trainingTitle: form.title.trim(),
            });
            toast.success(
              editing
                ? 'Record updated; certificate saved to worker Documents.'
                : 'Record added; certificate saved to worker Documents.',
            );
          } else {
            await uploadTrainingCertificateToDocs(subjectId, certificateFile, {
              docTitle: certificateDocTitle,
              issuedDate: effectiveCompletionDate(),
              expiryDate: form.expiry_date,
              trainingTitle: form.title.trim(),
            });
            toast.success(
              editing ? 'Record updated; certificate saved to Docs.' : 'Record added; certificate saved to Docs.',
            );
          }
        } catch (upErr: any) {
          console.error(upErr);
          toast.error(
            editing
              ? 'Record updated, but certificate upload failed. Try again from the Docs tab.'
              : 'Record added, but certificate upload failed. Try again from the Docs tab.',
          );
        }
      } else {
        toast.success(editing ? 'Record updated' : 'Record added');
      }
      if (!isWorker) {
        queryClient.invalidateQueries({ queryKey: ['user-docs', subjectId] });
        queryClient.invalidateQueries({ queryKey: ['user-folders', subjectId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['subcontractor-worker-files', subjectId] });
      }
      queryClient.invalidateQueries({ queryKey: ['user-training-matrix', trainingQueryScope, subjectId] });
      closeModal();
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: any) => {
    const res = await confirm({
      title: 'Delete training record?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (res !== 'confirm') return;
    try {
      await api('DELETE', `${trainingRecordsBase}/${encodeURIComponent(r.id)}`);
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['user-training-matrix', trainingQueryScope, subjectId] });
      refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  const fmtDate = (s: string | null | undefined) => {
    if (!s) return '—';
    return String(s).slice(0, 10);
  };

  const formatLabel = (v: string) => {
    if (v === 'in_person') return 'In person';
    if (v === 'online') return 'Online';
    if (v === 'hybrid') return 'Hybrid';
    return v || '—';
  };

  const trainingTitle = isWorker ? 'Training' : 'Training & courses';
  const trainingDescription = isWorker
    ? 'Training matrix records required for site access.'
    : 'HR training history, including optional sync from completed internal LMS courses. Use Start date for scheduled or in-progress rows so they show on the team training calendar.';

  const matrixSelectOptions = useMemo(
    () => (matrixCatalog?.items ?? []).map((opt) => ({ value: opt.id, label: opt.label })),
    [matrixCatalog?.items],
  );

  const categorySelectOptions = useMemo(
    () => TRAINING_CATEGORIES.filter(Boolean).map((c) => ({ value: c, label: c })),
    [],
  );

  const formatSelectOptions = useMemo(
    () =>
      TRAINING_FORMATS.filter(Boolean).map((c) => ({
        value: c,
        label: formatLabel(c),
      })),
    [],
  );

  const statusSelectOptions = useMemo(
    () =>
      TRAINING_STATUSES.map((s) => ({
        value: s,
        label: s.replace('_', ' '),
      })),
    [],
  );

  const needsCompletionDate = form.status === 'completed' || form.status === 'expired';
  const endDateLabel =
    needsCompletionDate && !differentCompletionDate ? 'End date *' : 'End date';

  const trainingListPreset = canEdit ? 'workerTraining' : 'workerTrainingReadOnly';

  type TrainingSortColumn =
    | 'type'
    | 'title'
    | 'provider'
    | 'category'
    | 'crew'
    | 'start'
    | 'completed'
    | 'hours'
    | 'status'
    | 'expires';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<TrainingSortColumn>('title', 'asc');

  const sortedTrainingRows = useMemo(
    () =>
      sortListByAppColumn(rows as any[], sortBy, sortDir, {
        type: (r) => r.item_type_label || '',
        title: (r) => r.title || '',
        provider: (r) => r.provider || '',
        category: (r) => r.category || '',
        crew: (r) => r.crew || '',
        start: (r) => r.start_date || '',
        completed: (r) => r.completion_date || '',
        hours: (r) => r.duration_hours ?? null,
        status: (r) => r.status || '',
        expires: (r) => r.expiry_date || '',
      }),
    [rows, sortBy, sortDir],
  );

  const certificateUploadHint = isWorker
    ? "Certificate file\n\nOptional. Saves to this worker's Documents tab under Training certificates when you save."
    : `Certificate file\n\nOptional. Saves to Docs → ${TRAINING_CERTIFICATES_FOLDER_NAME} (folder is created automatically if missing).`;

  return (
    <div className="space-y-6 pb-24">
    <AppCard>
      <AppSectionHeader
        title={trainingTitle}
        description={trainingDescription}
        {...appSectionPresetProps('education')}
      />

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
        ) : (
          <div className={uiCx('flex flex-col gap-2 overflow-x-auto rounded-xl border bg-white', uiSpacing.cardPadding)}>
            {(rows as any[]).length > 0 ? (
              <p className={uiCx(uiTypography.helper, 'mb-1')}>
                Click a row to view full details.
              </p>
            ) : null}
            {canEdit && (
              <AppListCreateItem
                label="Add record"
                layout="row"
                className={uiCx('w-full', resolveAppSortableListPreset(trainingListPreset).minWidth)}
                onClick={openAdd}
              />
            )}
            {!(rows as any[]).length ? (
              <AppEmptyState
                title="No training records yet"
                description={
                  canEdit
                    ? 'Add courses, certifications, or renewals using “Add record” above.'
                    : undefined
                }
                className="border-0 bg-transparent p-0 py-6 shadow-none"
              />
            ) : (
              <AppSortableEntityList layout="flat">
                <AppSortableEntityListHeader preset={trainingListPreset} variant="flat">
                  <AppSortableEntityListSortColumn
                    label="Type"
                    column="type"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Title"
                    column="title"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Provider"
                    column="provider"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Category"
                    column="category"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Crew"
                    column="crew"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Start"
                    column="start"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Completed"
                    column="completed"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  <AppSortableEntityListSortColumn
                    label="Hrs"
                    column="hours"
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
                  <AppSortableEntityListSortColumn
                    label="Expires"
                    column="expires"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={setSort}
                  />
                  {canEdit ? <div className="min-w-0 w-24" aria-hidden /> : null}
                </AppSortableEntityListHeader>
                <AppSortableEntityListFlatBody preset={trainingListPreset}>
                  {sortedTrainingRows.map((r) => (
                    <AppSortableEntityListRow
                      key={r.id}
                      as="div"
                      variant="flat"
                      preset={trainingListPreset}
                      className="group cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => openView(r)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openView(r);
                        }
                      }}
                    >
                      <span
                        className={uiCx(uiTypography.helper, 'min-w-0 truncate text-slate-600')}
                        title={r.item_type_label || ''}
                      >
                        {r.item_type_label || '—'}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#7f1010]">
                            {r.title}
                          </span>
                          {r.training_source === 'lms' ? (
                            <AppBadge variant="info">Internal LMS</AppBadge>
                          ) : null}
                        </div>
                      </div>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                        {r.provider || '—'}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}>
                        {r.category || '—'}
                      </span>
                      <span
                        className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-700')}
                        title={r.crew || ''}
                      >
                        {r.crew || '—'}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.start_date)}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.completion_date)}
                      </span>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 text-gray-700')}>
                        {r.duration_hours != null ? r.duration_hours : '—'}
                      </span>
                      <div className="min-w-0">{trainingStatusBadge(r.status)}</div>
                      <span className={uiCx(uiTypography.helper, 'min-w-0 whitespace-nowrap text-gray-700')}>
                        {fmtDate(r.expiry_date)}
                      </span>
                      {canEdit ? (
                        <div
                          className="flex w-24 shrink-0 items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <AppListRowIconButton
                            preset="edit"
                            label="Edit training record"
                            onClick={() => openEdit(r)}
                          />
                          <AppListRowIconButton
                            preset="delete"
                            label="Delete training record"
                            onClick={() => void handleDelete(r)}
                          />
                        </div>
                      ) : null}
                    </AppSortableEntityListRow>
                  ))}
                </AppSortableEntityListFlatBody>
              </AppSortableEntityList>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-gray-200 pt-6">
        <AppSectionHeader
          title="Standard training matrix"
          description={
            <>
              Shortcuts to add a linked record for a checklist slot. After you save, it appears in{' '}
              <span className="font-medium text-gray-700">{trainingTitle}</span> above and leaves this list.
            </>
          }
          {...appSectionPresetProps('workload')}
        />
        <div className="mt-4">
          {matrixLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ) : matrixShortcutItems.length === 0 ? (
            <div
              className={uiCx(
                uiRadius.card,
                'border border-emerald-100 bg-emerald-50/50 px-4 py-3',
                uiTypography.body,
                'text-emerald-900',
              )}
            >
              All standard matrix slots are covered in <span className="font-semibold">{trainingTitle}</span> above.
            </div>
          ) : canEdit ? (
            <div className={uiCx(uiLayout.actionsRow, 'gap-2')}>
              {matrixShortcutItems.map((row) => (
                <AppButton
                  key={row.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Plus className="h-3.5 w-3.5 text-brand-red" aria-hidden />}
                  onClick={() => openAddForMatrix({ id: row.id, label: row.label })}
                >
                  {row.label}
                </AppButton>
              ))}
            </div>
          ) : (
            <p
              className={uiCx(
                uiRadius.card,
                'border border-dashed border-gray-200 bg-slate-50/60 px-4 py-3',
                uiTypography.helper,
              )}
            >
              Not yet linked in {trainingTitle}:{' '}
              <span className="font-medium text-gray-800">{matrixShortcutItems.map((r) => r.label).join(', ')}</span>
            </p>
          )}
        </div>
      </div>

      {viewingRecord ? (
        <AppFormModal
          open
          onClose={closeView}
          layout="detail"
          size="md"
          title="Training record details"
          description={viewingRecord.title || 'Training record'}
          quickInfo={employeeTrainingDetailQuickInfo({ isWorker, canEdit })}
          bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeView}>
                Close
              </AppButton>
              {canEdit ? (
                <AppButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    const r = viewingRecord;
                    closeView();
                    openEdit(r);
                  }}
                >
                  Edit
                </AppButton>
              ) : null}
            </div>
          }
        >
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <TrainingDetailField label="Type">{viewingRecord.item_type_label || '—'}</TrainingDetailField>
              <TrainingDetailField label="Title">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{viewingRecord.title || '—'}</span>
                  {viewingRecord.training_source === 'lms' ? (
                    <AppBadge variant="info">Internal LMS</AppBadge>
                  ) : null}
                </div>
              </TrainingDetailField>
              <TrainingDetailField label="Status">{trainingStatusBadge(viewingRecord.status)}</TrainingDetailField>
              <TrainingDetailField label="Provider">{viewingRecord.provider || '—'}</TrainingDetailField>
              <TrainingDetailField label="Category">{viewingRecord.category || '—'}</TrainingDetailField>
              <TrainingDetailField label="Format">
                {viewingRecord.delivery_format ? formatLabel(viewingRecord.delivery_format) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Crew">{viewingRecord.crew || '—'}</TrainingDetailField>
              <TrainingDetailField label="Location">{viewingRecord.location || '—'}</TrainingDetailField>
              <TrainingDetailField label="Start date">
                {viewingRecord.start_date ? String(viewingRecord.start_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="End date">
                {viewingRecord.end_date ? String(viewingRecord.end_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Completed">
                {viewingRecord.completion_date ? String(viewingRecord.completion_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Session time">{viewingRecord.session_time || '—'}</TrainingDetailField>
              <TrainingDetailField label="Duration (hours)">
                {viewingRecord.duration_hours != null ? viewingRecord.duration_hours : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Certificate / reference #">
                {viewingRecord.certificate_number || '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Expires">
                {viewingRecord.expiry_date ? String(viewingRecord.expiry_date).slice(0, 10) : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Matrix slot">
                {viewingRecord.matrix_training_id
                  ? matrixCatalog?.items?.find((x) => x.id === String(viewingRecord.matrix_training_id))?.label ||
                    viewingRecord.matrix_training_id
                  : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Notes">
                {viewingRecord.notes ? (
                  <span className="whitespace-pre-wrap font-normal text-gray-700">{viewingRecord.notes}</span>
                ) : (
                  '—'
                )}
              </TrainingDetailField>
            </dl>
          </AppCard>
        </AppFormModal>
      ) : null}

      <AppFormModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit training record' : 'Add training record'}
        description="For completed or expired, the end date counts as completion unless you choose a different completion date."
        formWidth="wide"
        quickInfo={employeeTrainingRecordQuickInfo({
          isWorker,
          editing: !!editing,
          hasCertificateFile: !!certificateFile,
        })}
        dialogClassName={FORM_MODAL_WIDE_DIALOG_COLLAPSED}
        dialogClassNameExpanded={FORM_MODAL_WIDE_DIALOG_EXPANDED}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={closeModal} disabled={saving}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              size="sm"
              loading={saving}
              disabled={saving}
              onClick={() => void submitTrainingRecord()}
            >
              {saving ? 'Saving…' : 'Save'}
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Title *"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          required
          fieldHint="Title\n\nCourse, certification, or matrix training name shown in the list."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          <AppSelect
            label="Matrix slot (optional)"
            value={form.matrix_training_id}
            options={matrixSelectOptions}
            placeholder="Select matrix slot…"
            onChange={(e) => {
              const v = e.target.value;
              const slotLabel =
                matrixCatalog?.items?.find((x) => x.id === v)?.label?.trim() || '';
              setForm((f) => ({
                ...f,
                matrix_training_id: v,
                ...(!editing && slotLabel ? { title: slotLabel } : {}),
              }));
            }}
            fieldHint="Matrix slot\n\nLinks this record to a standard training matrix item."
          />
          <AppSelect
            label="Status"
            value={form.status}
            options={statusSelectOptions}
            onChange={(e) => {
              const ns = e.target.value;
              setForm((f) => {
                let cd = f.completion_date;
                if (
                  (ns === 'completed' || ns === 'expired') &&
                  differentCompletionDate &&
                  !cd.trim()
                ) {
                  cd =
                    f.end_date.trim() ||
                    f.start_date.trim() ||
                    new Date().toISOString().slice(0, 10);
                }
                return { ...f, status: ns, completion_date: cd };
              });
            }}
            fieldHint="Status\n\nCompleted or expired require an end date (or separate completion date)."
          />
        </div>
        <AppInput
          label="Provider"
          value={form.provider}
          onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
          placeholder="Organization or trainer"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start">
          <AppSelect
            label="Category"
            value={form.category}
            options={categorySelectOptions}
            placeholder="Select category…"
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <AppSelect
            label="Format"
            value={form.delivery_format}
            options={formatSelectOptions}
            placeholder="Select format…"
            onChange={(e) => setForm((f) => ({ ...f, delivery_format: e.target.value }))}
          />
          <AppInput
            label="Crew"
            value={form.crew}
            onChange={(e) => setForm((f) => ({ ...f, crew: e.target.value }))}
            placeholder="e.g. Repairs, Metal, Office"
          />
          <AppInput
            label="Location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="Address or room"
          />
          <AppDatePicker
            label="Start date"
            value={form.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          />
          <AppDatePicker
            label={endDateLabel}
            value={form.end_date}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            helperText={
              !differentCompletionDate && needsCompletionDate
                ? 'Also used as completion date.'
                : undefined
            }
          />
          <AppTimePicker
            label="Start time"
            value={form.time_start}
            onChange={(e) =>
              setForm((f) => ({ ...f, time_start: e.target.value, session_time: '' }))
            }
            fieldHint="Start time\n\nDaily session start; used with end time to calculate duration."
          />
          <AppTimePicker
            label="End time"
            value={form.time_end}
            onChange={(e) =>
              setForm((f) => ({ ...f, time_end: e.target.value, session_time: '' }))
            }
            fieldHint="End time\n\nDaily session end; must be after start time for duration."
          />
          <AppInput
            label="Certificate / reference #"
            value={form.certificate_number}
            onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))}
          />
          <AppDatePicker
            label="Expiry / renewal date"
            value={form.expiry_date}
            onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))}
          />
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppCheckbox
            label="Use different completion date"
            checked={differentCompletionDate}
            onChange={(on) => {
              setDifferentCompletionDate(on);
              if (on) {
                setForm((f) => ({
                  ...f,
                  completion_date:
                    f.completion_date.trim() ||
                    f.end_date.trim() ||
                    f.start_date.trim() ||
                    new Date().toISOString().slice(0, 10),
                }));
              }
            }}
          />
          {differentCompletionDate ? (
            <AppDatePicker
              label={needsCompletionDate ? 'Completion date *' : 'Completion date'}
              value={form.completion_date}
              onChange={(e) => setForm((f) => ({ ...f, completion_date: e.target.value }))}
              className="max-w-xs"
            />
          ) : null}
          <AppCheckbox
            label="Include weekends"
            checked={includeWeekends}
            onChange={setIncludeWeekends}
          />
        </div>
        <div className={uiSpacing.sectionStack}>
          <AppControlLabelRow
            label="Duration (hours)"
            fieldHint={
              <AppFieldHint hint="Duration\n\nCalculated from dates and daily start/end times." />
            }
          />
          {computedDurationHours != null && trainingDurationHint ? (
            <p
              className={uiCx(
                uiRadius.control,
                uiBorders.subtle,
                'bg-gray-50/80 px-3 py-2',
                uiTypography.body,
              )}
            >
              <span className="font-semibold tabular-nums">{computedDurationHours}</span>
              <span className="text-gray-600">
                {' '}
                ({trainingDurationHint.days} day(s) × {trainingDurationHint.perDay.toFixed(2)} h/day)
              </span>
            </p>
          ) : (
            <p
              className={uiCx(
                uiRadius.control,
                'border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2',
                uiTypography.helper,
              )}
            >
              Set start and end dates plus daily start and end times to calculate hours
              {includeWeekends ? ' (all days)' : ' (weekdays only unless weekends are included)'}.
              {editing?.duration_hours != null
                ? ` Saved value: ${editing.duration_hours} h (unchanged until recalculated).`
                : ''}
            </p>
          )}
        </div>
        {canEdit ? (
          <div
            className={uiCx(
              uiSpacing.sectionStack,
              uiRadius.card,
              uiBorders.subtle,
              uiSpacing.compactCardPadding,
              'bg-gray-50/40',
            )}
          >
            <AppFileUpload
              mode="single"
              value={certificateFile}
              onChange={setCertificateFile}
              label="Certificate file (optional)"
              fieldHint={certificateUploadHint}
              helperText="PDF, image, or other — one file per save."
            />
            <AppInput
              label={isWorker ? 'Document title (optional)' : 'Document title in Docs (optional)'}
              value={certificateDocTitle}
              onChange={(e) => setCertificateDocTitle(e.target.value)}
              placeholder={
                form.title.trim()
                  ? `Default: “${form.title.trim()} — file name”`
                  : 'Default: training title — file name'
              }
            />
          </div>
        ) : null}
        <AppTextarea
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={5}
          fieldHint="Notes\n\nInternal comments or renewal reminders."
        />
      </AppFormModal>
    </AppCard>
    </div>
  );
}

export default EmployeeTrainingSection;
