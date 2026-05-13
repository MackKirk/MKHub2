import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';
import { useConfirm } from '@/components/ConfirmProvider';
import { SubcontractorWorkerClockModalLayer } from '@/components/SubcontractorWorkerClockModalLayer';
import { ProjectSearchCombobox } from '@/components/ProjectSearchCombobox';
import { formatDateLocal, formatDecimalHoursAsHMin, getTodayLocal } from '@/lib/dateUtils';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400';

const toLocalInputValue = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/** `datetime-local` value for the current moment in the user's local timezone. */
function localDatetimeInputNow(): string {
  const local = new Date();
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  const hh = String(local.getHours()).padStart(2, '0');
  const mm = String(local.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

/** Parse `datetime-local` string as local civil time and return UTC ISO string. */
function toUtcISOString(localValue?: string): string | null {
  if (!localValue) return null;
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const localDate = new Date(year, month - 1, day, hours, minutes || 0, 0, 0);
  return localDate.toISOString();
}

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatHours = formatDecimalHoursAsHMin;

const formatBreak = (breakMinutes?: number | null) => {
  if (breakMinutes === undefined || breakMinutes === null || breakMinutes === 0) return '—';
  const h = Math.floor(breakMinutes / 60);
  const m = breakMinutes % 60;
  if (h > 0) {
    return `${h}h ${m}min`;
  }
  return `${m}min`;
};

function formatDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatDateWithYear(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Parse `GPS:{...}` lines from attendance notes (e.g. session notes from clock-in/out). */
function extractGpsFromSessionNotes(text?: string | null): { lat: number; lng: number; accuracy_m?: number } | null {
  if (!text?.trim()) return null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('GPS:')) continue;
    try {
      const j = JSON.parse(line.slice(4)) as { lat?: number; lng?: number; accuracy_m?: number };
      if (typeof j.lat === 'number' && typeof j.lng === 'number') return j;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-3 gap-y-0.5 py-2 border-b border-gray-100 last:border-0 text-xs">
      <div className="text-gray-500 font-medium shrink-0">{label}</div>
      <div className="text-gray-900 break-words min-w-0">{children}</div>
    </div>
  );
}

function SignaturePreviewBlock({ fileId, label }: { fileId?: string | null; label: string }) {
  if (!fileId?.trim()) {
    return (
      <div className="pt-1">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-xs text-gray-400">None</p>
      </div>
    );
  }
  const fid = encodeURIComponent(fileId.trim());
  const thumb = withFileAccessToken(`/files/${fid}/thumbnail?w=640`);
  const dl = withFileAccessToken(`/files/${fid}/download`);
  return (
    <div className="pt-1 min-w-0">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <a href={dl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
        Open / download
      </a>
      <img
        src={thumb}
        alt=""
        className="mt-1.5 max-w-full h-auto rounded border border-gray-200 bg-white"
      />
    </div>
  );
}

type ScAttendanceRow = {
  id: string;
  worker_id: string;
  worker_name: string;
  type?: string;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  project_name?: string | null;
  project_id?: string;
  project_address?: string | null;
  job_name?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  reason_text?: string | null;
  shift_id?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  subcontractor_company_name?: string | null;
  clock_in_entered_utc?: string | null;
  clock_out_entered_utc?: string | null;
  clock_in_notes?: string | null;
  clock_out_notes?: string | null;
  session_notes?: string | null;
  clock_in_signature_file_id?: string | null;
  clock_out_signature_file_id?: string | null;
  clock_in_confirmed_by?: string | null;
  clock_out_confirmed_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  hr_status?: string | null;
};

type AttendanceEvent = {
  event_id: string;
  worker_id: string;
  worker_name: string;
  job_name?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  job_type?: string | null;
  shift_id?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  clock_in_id?: string | null;
  clock_in_time?: string | null;
  clock_in_status?: string | null;
  clock_in_reason?: string | null;
  clock_out_id?: string | null;
  clock_out_time?: string | null;
  clock_out_status?: string | null;
  clock_out_reason?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  is_hours_worked?: boolean;
  subcontractor_company_name?: string | null;
  clock_in_entered_utc?: string | null;
  clock_out_entered_utc?: string | null;
  clock_in_notes?: string | null;
  clock_out_notes?: string | null;
  session_notes?: string | null;
  clock_in_signature_file_id?: string | null;
  clock_out_signature_file_id?: string | null;
  clock_in_confirmed_by?: string | null;
  clock_out_confirmed_by?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  project_id?: string | null;
  hr_status?: string | null;
};

function scRowsToEvents(rows: ScAttendanceRow[]): AttendanceEvent[] {
  return rows.map((att) => {
    const finalized = !!att.clock_out_time || att.status === 'finalized';
    const hr = (att.hr_status || 'approved').toLowerCase();
    let hoursWorked: number | null = att.hours_worked ?? null;
    if (hoursWorked == null && att.clock_in_time && att.clock_out_time) {
      const diff = new Date(att.clock_out_time).getTime() - new Date(att.clock_in_time).getTime();
      hoursWorked = diff / (1000 * 60 * 60);
      if (att.break_minutes != null && att.break_minutes > 0) {
        hoursWorked = Math.max(0, hoursWorked - att.break_minutes / 60);
      }
    }
    return {
      event_id: att.id,
      worker_id: att.worker_id,
      worker_name: att.worker_name,
      job_name: att.job_name,
      project_name: att.project_name,
      project_address: att.project_address ?? null,
      job_type: undefined,
      shift_id: att.shift_id,
      shift_deleted: !!att.shift_deleted,
      shift_deleted_by: att.shift_deleted_by || null,
      shift_deleted_at: att.shift_deleted_at || null,
      clock_in_id: att.clock_in_time ? att.id : null,
      clock_in_time: att.clock_in_time || null,
      clock_in_status: finalized ? hr : 'pending',
      clock_in_reason: att.reason_text,
      clock_out_id: att.clock_out_time ? att.id : null,
      clock_out_time: att.clock_out_time || null,
      clock_out_status: finalized ? hr : null,
      clock_out_reason: att.clock_out_time ? att.reason_text : null,
      hours_worked: hoursWorked,
      break_minutes: att.break_minutes ?? null,
      is_hours_worked: false,
      subcontractor_company_name: att.subcontractor_company_name ?? null,
      clock_in_entered_utc: att.clock_in_entered_utc ?? null,
      clock_out_entered_utc: att.clock_out_entered_utc ?? null,
      clock_in_notes: att.clock_in_notes ?? null,
      clock_out_notes: att.clock_out_notes ?? null,
      session_notes: att.session_notes ?? null,
      clock_in_signature_file_id: att.clock_in_signature_file_id ?? null,
      clock_out_signature_file_id: att.clock_out_signature_file_id ?? null,
      clock_in_confirmed_by: att.clock_in_confirmed_by ?? null,
      clock_out_confirmed_by: att.clock_out_confirmed_by ?? null,
      approved_at: att.approved_at ?? null,
      approved_by: att.approved_by ?? null,
      project_id: att.project_id ?? null,
      hr_status: att.hr_status ?? null,
    };
  }).sort(
    (a, b) =>
      new Date(b.clock_in_time || b.clock_out_time || '').getTime() -
      new Date(a.clock_in_time || a.clock_out_time || '').getTime(),
  );
}

type OpenAttendance = {
  id: string;
  project_id: string;
  project_name?: string | null;
  clock_in_time?: string | null;
} | null;

type Props = {
  workerId: string;
  openAttendance: OpenAttendance;
  canEdit: boolean;
  onBundleInvalidate: () => void;
};

export default function SubcontractorWorkerTimesheetBlock({
  workerId,
  openAttendance,
  canEdit,
  onBundleInvalidate,
}: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    status: '',
    project_id: '',
  });
  const [projectId, setProjectId] = useState('');
  const [clockActionDate, setClockActionDate] = useState(() => formatDateLocal(new Date()));
  const [clockActionModal, setClockActionModal] = useState<null | 'in' | 'out'>(null);
  const [quickClockBusy, setQuickClockBusy] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formClockIn, setFormClockIn] = useState('');
  const [formClockOut, setFormClockOut] = useState('');
  const [formSigOut, setFormSigOut] = useState<string | null>(null);
  const [formEntryMode, setFormEntryMode] = useState<'time' | 'hours'>('time');
  const [formHoursWorked, setFormHoursWorked] = useState('');
  const [insertBreakTime, setInsertBreakTime] = useState(false);
  const [breakHours, setBreakHours] = useState('0');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [formHrStatus, setFormHrStatus] = useState('approved');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<AttendanceEvent | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set('record_kind', 'subcontractor');
  queryParams.set('worker_id', workerId);
  if (filters.start_date) queryParams.set('start_date', filters.start_date);
  if (filters.end_date) queryParams.set('end_date', filters.end_date);
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.project_id) queryParams.set('project_id', filters.project_id);
  const queryString = queryParams.toString();
  const listUrl = `/settings/attendance/list?${queryString}`;

  const { data: attendances, isLoading, error } = useQuery({
    queryKey: ['sc-worker-attendance', queryString],
    queryFn: async () => {
      const result = await api<ScAttendanceRow[]>('GET', listUrl);
      return Array.isArray(result) ? result : [];
    },
    enabled: !!workerId,
  });

  const attendanceEvents = useMemo(
    () => scRowsToEvents(Array.isArray(attendances) ? attendances : []),
    [attendances],
  );

  const todayStr = useMemo(() => formatDateLocal(new Date()), []);

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    const anyEl = el as unknown as { showPicker?: () => void };
    if (typeof anyEl.showPicker === 'function') {
      anyEl.showPicker();
      return;
    }
    el.focus();
    el.click();
  };

  const sigProjectId = projectId || openAttendance?.project_id || '';

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['sc-worker-attendance'], exact: false });
    await qc.invalidateQueries({ queryKey: ['subcontractor-worker', workerId] });
    onBundleInvalidate();
  };

  const closeClockModal = useCallback(() => {
    setClockActionModal(null);
  }, []);

  const createManualMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('POST', `/subcontractors/workers/${workerId}/attendance/manual`, body),
    onSuccess: async () => {
      toast.success('Attendance created');
      setShowModal(false);
      resetModal();
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api('PATCH', `/subcontractors/attendance/${id}`, body),
    onSuccess: async () => {
      toast.success('Attendance updated');
      setShowModal(false);
      resetModal();
      await invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetModal = () => {
    setEditingEvent(null);
    setFormProjectId('');
    setFormClockIn('');
    setFormClockOut('');
    setFormSigOut(null);
    setFormEntryMode('time');
    setFormHoursWorked('');
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
    setFormHrStatus('approved');
  };

  const closeModal = () => {
    setShowModal(false);
    resetModal();
  };

  useEffect(() => {
    if (!showModal && !clockActionModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showModal) {
        setShowModal(false);
        resetModal();
      }
      if (clockActionModal) closeClockModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, clockActionModal, closeClockModal]);

  const openNewModal = () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance');
      return;
    }
    resetModal();
    setEditingEvent(null);
    setFormClockIn(localDatetimeInputNow());
    setFormClockOut('');
    setFormProjectId(projectId || '');
    setFormEntryMode('time');
    setFormHoursWorked('');
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
    setFormHrStatus('approved');
    setShowModal(true);
  };

  const openEditModal = (event: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance');
      return;
    }
    setEditingEvent(event);
    const att = attendances?.find((a) => a.id === event.event_id);
    setFormProjectId(att?.project_id || '');
    setFormClockIn(toLocalInputValue(event.clock_in_time));
    setFormClockOut(toLocalInputValue(event.clock_out_time));
    setFormSigOut(null);
    setFormEntryMode('time');
    setFormHoursWorked('');
    const br = att?.break_minutes;
    if (br != null && br > 0) {
      setInsertBreakTime(true);
      setBreakHours(String(Math.floor(br / 60)));
      setBreakMinutes(String(br % 60).padStart(2, '0'));
    } else {
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
    }
    setFormHrStatus((att?.hr_status || 'approved').toLowerCase());
    setShowModal(true);
  };

  const submitModal = async () => {
    if (!canEdit) return;
    if (!formProjectId) {
      toast.error('Project is required');
      return;
    }
    if (!formClockIn) {
      toast.error(formEntryMode === 'hours' ? 'Work date is required' : 'Clock-in time is required');
      return;
    }

    let clockInUtc: string | null;
    let clockOutUtc: string | null = null;

    if (formEntryMode === 'hours') {
      const hours = parseFloat(formHoursWorked || '0');
      if (!formHoursWorked || Number.isNaN(hours) || hours <= 0) {
        toast.error('Enter a valid number of hours worked');
        return;
      }
      const datePart = formClockIn.slice(0, 10);
      const midnightLocal = `${datePart}T00:00`;
      clockInUtc = toUtcISOString(midnightLocal);
      if (!clockInUtc) {
        toast.error('Invalid work date');
        return;
      }
      const outMs = new Date(clockInUtc).getTime() + hours * 3600000;
      clockOutUtc = new Date(outMs).toISOString();
    } else {
      clockInUtc = toUtcISOString(formClockIn);
      if (!clockInUtc) {
        toast.error('Invalid clock-in time');
        return;
      }
      clockOutUtc = formClockOut ? toUtcISOString(formClockOut) : null;
      if (formClockOut && !clockOutUtc) {
        toast.error('Invalid clock-out time');
        return;
      }
    }

    if (clockInUtc && clockOutUtc) {
      if (new Date(clockOutUtc) <= new Date(clockInUtc)) {
        toast.error('Clock-out must be after clock-in');
        return;
      }
      if (insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
        const totalMinutes = Math.floor(
          (new Date(clockOutUtc).getTime() - new Date(clockInUtc).getTime()) / (1000 * 60),
        );
        if (breakTotalMinutes >= totalMinutes) {
          toast.error(
            'Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.',
          );
          return;
        }
      }
    }

    if (editingEvent) {
      const body: Record<string, unknown> = {
        project_id: formProjectId,
        clock_in_time: clockInUtc,
        clock_out_time: clockOutUtc,
        hr_status: formHrStatus,
      };
      if (clockOutUtc && formSigOut) body.clock_out_signature_file_id = formSigOut;
      if (clockOutUtc) {
        body.manual_break_minutes = insertBreakTime
          ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
          : 0;
      }
      await patchMut.mutateAsync({ id: editingEvent.event_id, body });
    } else {
      const body: Record<string, unknown> = {
        project_id: formProjectId,
        clock_in_time: clockInUtc,
        hr_status: formHrStatus,
      };
      if (clockOutUtc) {
        body.clock_out_time = clockOutUtc;
        body.manual_break_minutes = insertBreakTime
          ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
          : 0;
        if (formSigOut) body.clock_out_signature_file_id = formSigOut;
      }
      await createManualMut.mutateAsync(body);
    }
  };

  const handleDeleteEvent = async (event: AttendanceEvent) => {
    if (!canEdit) {
      toast.error('You do not have permission to delete attendance records');
      return;
    }
    const result = await confirm({
      title: 'Delete attendance',
      message: 'Are you sure you want to delete this attendance record? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeletingId(event.event_id);
    try {
      await api('DELETE', `/subcontractors/attendance/${event.event_id}`);
      toast.success('Attendance deleted');
      setSelectedEvents((prev) => {
        const n = new Set(prev);
        n.delete(event.event_id);
        return n;
      });
      await invalidateAll();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelect = (eventId: string) => {
    if (!canEdit) return;
    setSelectedEvents((prev) => {
      const n = new Set(prev);
      if (n.has(eventId)) n.delete(eventId);
      else n.add(eventId);
      return n;
    });
  };

  const handleSelectAll = () => {
    if (!canEdit) return;
    if (selectedEvents.size === attendanceEvents.length) setSelectedEvents(new Set());
    else setSelectedEvents(new Set(attendanceEvents.map((e) => e.event_id)));
  };

  const handleDeleteSelected = async () => {
    if (!canEdit || selectedEvents.size === 0) return;
    const result = await confirm({
      title: 'Delete selected',
      message: `Delete ${selectedEvents.size} attendance record(s)? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeletingSelected(true);
    try {
      await Promise.all(
        Array.from(selectedEvents).map((id) =>
          api('DELETE', `/subcontractors/attendance/${id}`).catch(() => null),
        ),
      );
      toast.success('Selected records deleted');
      setSelectedEvents(new Set());
      await invalidateAll();
    } catch {
      toast.error('Some deletes failed');
    } finally {
      setDeletingSelected(false);
    }
  };

  const { submitDisabled, submitDisabledReason } = useMemo(() => {
    if (createManualMut.isPending || patchMut.isPending) {
      return { submitDisabled: true, submitDisabledReason: 'Saving…' as const };
    }
    if (!formProjectId) {
      return { submitDisabled: true, submitDisabledReason: 'Select a project.' };
    }
    if (!formClockIn) {
      return {
        submitDisabled: true,
        submitDisabledReason:
          formEntryMode === 'hours' ? 'Select the work date.' : 'Set clock-in date and time.',
      };
    }
    if (
      formEntryMode === 'hours' &&
      (!formHoursWorked || Number.isNaN(parseFloat(formHoursWorked)) || parseFloat(formHoursWorked) <= 0)
    ) {
      return { submitDisabled: true, submitDisabledReason: 'Enter hours worked (must be greater than zero).' };
    }
    return { submitDisabled: false, submitDisabledReason: null as string | null };
  }, [
    createManualMut.isPending,
    patchMut.isPending,
    formProjectId,
    formClockIn,
    formEntryMode,
    formHoursWorked,
  ]);

  const showManualClockOutSignature =
    formEntryMode === 'hours'
      ? !!formHoursWorked && parseFloat(formHoursWorked || '0') > 0
      : !!formClockOut;

  return (
    <div className="space-y-6 pb-24">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h5 className="text-sm font-semibold text-indigo-900">Timesheet</h5>
        </div>

        {openAttendance && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            Clocked in
            {openAttendance.project_name ? ` @ ${openAttendance.project_name}` : ''}
            {openAttendance.clock_in_time ? ` since ${new Date(openAttendance.clock_in_time).toLocaleString()}` : ''}.
          </div>
        )}

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-gray-900">Clock Actions</div>
            <div className="relative">
              <label htmlFor="sc-worker-clock-actions-date" className="sr-only">
                Date
              </label>
              <div
                className="relative w-[220px] max-w-[60vw] rounded-lg border border-gray-200 bg-white px-3 py-2 hover:border-gray-300 transition-all duration-200 cursor-pointer"
                onClick={openDatePicker}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openDatePicker();
                  }
                }}
                aria-label="Select date"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-gray-500 uppercase tracking-wide leading-tight">
                      {clockActionDate === todayStr ? 'Today' : formatDayName(clockActionDate)}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 leading-tight truncate">
                      {formatDateWithYear(clockActionDate)}
                    </div>
                  </div>
                </div>
                <input
                  ref={dateInputRef}
                  id="sc-worker-clock-actions-date"
                  type="date"
                  value={clockActionDate}
                  onChange={(e) => e.target.value && setClockActionDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-hidden="true"
                  tabIndex={-1}
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setClockActionModal('in');
              }}
              disabled={!!openAttendance || !canEdit || quickClockBusy}
              className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                !openAttendance && canEdit && !quickClockBusy
                  ? 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                  : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
              }`}
              title={openAttendance ? 'Clock out first to start a new session' : !canEdit ? 'View only' : ''}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    !openAttendance && canEdit && !quickClockBusy ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-500'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12h-3m3 0l-2 2m2-2l-2-2" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-base font-semibold mb-1 ${
                      !openAttendance && canEdit && !quickClockBusy ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    Clock In
                  </div>
                  <div
                    className={`text-xs ${
                      !openAttendance && canEdit && !quickClockBusy ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    Start tracking work time for this worker
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setClockActionModal('out')}
              disabled={!openAttendance || !canEdit || quickClockBusy}
              className={`w-full rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                openAttendance && canEdit && !quickClockBusy
                  ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                  : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
              }`}
              title={!openAttendance ? 'No open session' : !canEdit ? 'View only' : ''}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    openAttendance && canEdit && !quickClockBusy ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-500'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3m-3 0l2 2m-2-2l2-2" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-base font-semibold mb-1 ${
                      openAttendance && canEdit && !quickClockBusy ? 'text-gray-900' : 'text-gray-400'
                    }`}
                  >
                    Clock Out
                  </div>
                  <div
                    className={`text-xs ${
                      openAttendance && canEdit && !quickClockBusy ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    End the current work session
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Start date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">End date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <ProjectSearchCombobox
              id="sc-worker-filter-project"
              value={filters.project_id}
              onChange={(id) => setFilters({ ...filters, project_id: id })}
              allowEmpty
              emptyOptionLabel="All projects"
              inputClassName={`${inputClass} pl-9`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className={inputClass}
            >
              <option value="">All statuses</option>
              <option value="open">Open (in progress)</option>
              <option value="finalized">Finalized</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Error loading attendance: {String(error)}
          </div>
        )}

        {canEdit && selectedEvents.size > 0 && (
          <div className="mb-4 rounded-xl border bg-blue-50 p-3 flex items-center justify-between">
            <div className="text-xs font-medium text-blue-900">{selectedEvents.size} record(s) selected</div>
            <button
              type="button"
              onClick={() => void handleDeleteSelected()}
              disabled={deletingSelected}
              className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deletingSelected ? 'Deleting…' : 'Delete selected'}
            </button>
          </div>
        )}

        <div className="rounded-xl border overflow-x-auto">
          <p className="text-[10px] text-gray-500 mb-2 px-0.5">Click a row to view full details, notes, and signatures.</p>
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2.5 text-left w-12">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock In</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Clock Out</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Project</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Hours</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Break</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="p-2.5 text-left text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {canEdit && (
                <tr>
                  <td colSpan={8} className="p-0 align-top">
                    <button
                      type="button"
                      onClick={openNewModal}
                      className="w-full border-2 border-dashed border-gray-300 rounded-t-xl p-2.5 hover:border-brand-red hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[52px] text-gray-600 hover:text-brand-red transition-colors"
                    >
                      <span className="text-lg font-medium">+</span>
                      <span className="text-sm font-medium">New attendance</span>
                    </button>
                  </td>
                </tr>
              )}
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-4">
                    <div className="h-6 bg-gray-100 animate-pulse rounded" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-red-600">
                    Could not load attendance.
                  </td>
                </tr>
              ) : attendanceEvents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-xs text-gray-500">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                attendanceEvents.map((event) => (
                  <tr
                    key={event.event_id}
                    role="button"
                    tabIndex={0}
                    className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setViewingEvent(event)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setViewingEvent(event);
                      }
                    }}
                  >
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(event.event_id)}
                          onChange={() => handleToggleSelect(event.event_id)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.clock_in_time ? formatDateTime(event.clock_in_time) : '—'}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">
                      {event.clock_out_time ? formatDateTime(event.clock_out_time) : '—'}
                    </td>
                    <td className="p-2.5 text-xs text-gray-900">{event.project_name || '—'}</td>
                    <td className="p-2.5 text-xs text-gray-900">{formatHours(event.hours_worked)}</td>
                    <td className="p-2.5 text-xs text-gray-900">{formatBreak(event.break_minutes)}</td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          event.clock_out_time
                            ? event.clock_in_status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : event.clock_in_status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {event.clock_out_time
                          ? `${(event.hr_status || event.clock_in_status || 'approved').charAt(0).toUpperCase()}${(event.hr_status || event.clock_in_status || 'approved').slice(1)}`
                          : 'Open'}
                      </span>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(event)}
                              className="text-blue-600 hover:text-blue-800 text-[10px]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteEvent(event)}
                              disabled={deletingId === event.event_id}
                              className="text-red-600 hover:text-red-800 text-[10px] disabled:opacity-50"
                            >
                              {deletingId === event.event_id ? 'Deleting…' : 'Delete'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-500">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={closeModal}
          >
            <div
              className="max-w-lg w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      {editingEvent ? 'Edit attendance' : 'New attendance'}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {editingEvent
                        ? 'Update times and project.'
                        : 'Add clock-in (and optionally clock-out for a closed session). Optional signature when clock-out is set.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                  <div>
                    <ProjectSearchCombobox
                      id="sc-worker-manual-project"
                      value={formProjectId}
                      onChange={setFormProjectId}
                      disabled={createManualMut.isPending || patchMut.isPending}
                      inputClassName={`${inputClass} pl-9`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Entry type</label>
                    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 overflow-hidden text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setFormEntryMode('time');
                          setFormHoursWorked('');
                        }}
                        className={`px-2.5 py-1.5 ${
                          formEntryMode === 'time' ? 'bg-white text-gray-900' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        Clock in / out
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormEntryMode('hours');
                          const datePart = formClockIn ? formClockIn.slice(0, 10) : getTodayLocal();
                          setFormClockIn(`${datePart}T00:00`);
                          setFormClockOut('');
                        }}
                        className={`px-2.5 py-1.5 border-l border-gray-200 ${
                          formEntryMode === 'hours' ? 'bg-white text-gray-900' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        Hours worked
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">HR status *</label>
                    <select
                      value={formHrStatus}
                      onChange={(e) => setFormHrStatus(e.target.value)}
                      className={inputClass}
                    >
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      {formEntryMode === 'hours' ? 'Work date *' : 'Clock in (local) *'}
                    </label>
                    {formEntryMode === 'hours' ? (
                      <input
                        type="date"
                        value={formClockIn ? formClockIn.slice(0, 10) : ''}
                        onChange={(e) => {
                          const d = e.target.value;
                          setFormClockIn(d ? `${d}T00:00` : '');
                        }}
                        className={inputClass}
                      />
                    ) : (
                      <input
                        type="datetime-local"
                        value={formClockIn}
                        onChange={(e) => setFormClockIn(e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </div>
                  {formEntryMode === 'time' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Clock out (local){editingEvent ? ' — optional' : ''}
                      </label>
                      <input
                        type="datetime-local"
                        value={formClockOut}
                        onChange={(e) => setFormClockOut(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}
                  {formEntryMode === 'hours' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Hours worked *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={formHoursWorked}
                        onChange={(e) => setFormHoursWorked(e.target.value)}
                        className={inputClass}
                        placeholder="e.g. 8"
                      />
                    </div>
                  )}
                  {(formEntryMode === 'hours' ? !!formHoursWorked && parseFloat(formHoursWorked) > 0 : !!formClockOut) && (
                    <div>
                      <label className="flex items-center gap-2 mb-1.5">
                        <input
                          type="checkbox"
                          checked={insertBreakTime}
                          onChange={(e) => setInsertBreakTime(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                        />
                        <span className="text-xs font-medium text-gray-600">Insert break time</span>
                      </label>
                      {insertBreakTime && (
                        <div className="ml-4 flex flex-wrap gap-2 items-center">
                          <label className="text-[10px] text-gray-500">Hours</label>
                          <select
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            className={`${inputClass} w-20`}
                          >
                            {Array.from({ length: 3 }, (_, i) => (
                              <option key={i} value={String(i)}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <label className="text-[10px] text-gray-500">Minutes</label>
                          <select
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            className={`${inputClass} w-24`}
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const m = i * 5;
                              return (
                                <option key={m} value={String(m).padStart(2, '0')}>
                                  {String(m).padStart(2, '0')}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  {showManualClockOutSignature && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">Clock-out signature (optional)</p>
                      {formProjectId ? (
                        <SubcontractorSimpleSignature
                          projectId={formProjectId}
                          disabled={createManualMut.isPending || patchMut.isPending}
                          onUploaded={(fid) => setFormSigOut(fid)}
                          onClear={() => setFormSigOut(null)}
                        />
                      ) : (
                        <p className="text-xs text-amber-700">Select a project to attach a signature file.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex flex-col gap-2 rounded-b-xl">
                {submitDisabledReason ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {submitDisabledReason}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitModal()}
                    title={submitDisabledReason || undefined}
                    disabled={submitDisabled}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingEvent ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {viewingEvent && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
            onClick={() => setViewingEvent(null)}
          >
            <div
              className="max-w-lg w-full min-w-0 max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingEvent(null)}
                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-gray-900">Attendance details</h2>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">Record ID: {viewingEvent.event_id}</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0">
                <div className="rounded-xl border border-gray-200 bg-white p-4 min-w-0">
                  <DetailField label="Worker">{viewingEvent.worker_name}</DetailField>
                  {viewingEvent.subcontractor_company_name ? (
                    <DetailField label="Company">{viewingEvent.subcontractor_company_name}</DetailField>
                  ) : null}
                  <DetailField label="Project">{viewingEvent.project_name || '—'}</DetailField>
                  <DetailField label="Project address">{viewingEvent.project_address || '—'}</DetailField>
                  <DetailField label="Session">{viewingEvent.clock_out_time ? 'Finalized' : 'Open'}</DetailField>
                  <DetailField label="HR status">
                    {(viewingEvent.hr_status || viewingEvent.clock_in_status || 'approved').charAt(0).toUpperCase()}
                    {(viewingEvent.hr_status || viewingEvent.clock_in_status || 'approved').slice(1)}
                  </DetailField>
                  <DetailField label="Break">{formatBreak(viewingEvent.break_minutes)}</DetailField>
                  <DetailField label="Clock in">{formatDateTime(viewingEvent.clock_in_time)}</DetailField>
                  <DetailField label="Clock in by (user)">{viewingEvent.clock_in_confirmed_by || '—'}</DetailField>
                  <DetailField label="Clock out">{formatDateTime(viewingEvent.clock_out_time)}</DetailField>
                  <DetailField label="Clock out by (user)">{viewingEvent.clock_out_confirmed_by || '—'}</DetailField>
                  <DetailField label="Hours worked">{formatHours(viewingEvent.hours_worked)}</DetailField>
                  {viewingEvent.clock_in_notes ? (
                    <DetailField label="Clock-in notes">
                      <pre className="whitespace-pre-wrap font-sans text-xs">{viewingEvent.clock_in_notes}</pre>
                    </DetailField>
                  ) : null}
                  {viewingEvent.clock_out_notes ? (
                    <DetailField label="Clock-out notes">
                      <pre className="whitespace-pre-wrap font-sans text-xs">{viewingEvent.clock_out_notes}</pre>
                    </DetailField>
                  ) : null}
                  {(() => {
                    const gps = extractGpsFromSessionNotes(viewingEvent.session_notes);
                    if (!gps) return null;
                    return (
                      <DetailField label="Location">
                        <span className="text-xs">
                          {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                          {gps.accuracy_m != null ? ` · ±${Math.round(gps.accuracy_m)}m` : ''}
                        </span>
                      </DetailField>
                    );
                  })()}
                  <div className="pt-4 mt-2 border-t border-gray-100">
                    <SignaturePreviewBlock fileId={viewingEvent.clock_out_signature_file_id} label="Signature" />
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setViewingEvent(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}

      {clockActionModal && (
        <SubcontractorWorkerClockModalLayer
          workerId={workerId}
          openAttendance={openAttendance}
          selectedDate={clockActionDate}
          onSelectedDateChange={setClockActionDate}
          clockType={clockActionModal}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          onClose={closeClockModal}
          onBusyChange={setQuickClockBusy}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}
