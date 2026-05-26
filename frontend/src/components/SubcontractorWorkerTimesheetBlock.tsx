import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';
import { useConfirm } from '@/components/ConfirmProvider';
import { SubcontractorWorkerClockModalLayer } from '@/components/SubcontractorWorkerClockModalLayer';
import { ProjectSearchCombobox } from '@/components/ProjectSearchCombobox';
import { ClockActionTile } from '@/components/ClockActionTile';
import { formatDateLocal, formatDecimalHoursAsHMin, getTodayLocal } from '@/lib/dateUtils';
import { parseHhmm } from '@/lib/timePickerUtils';
import {
  scWorkerAttendanceDetailQuickInfo,
  scWorkerManualAttendanceQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCard,
  AppCheckbox,
  AppControlLabelRow,
  AppDatePicker,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppProjectSelect,
  AppSectionHeader,
  AppSelect,
  AppTimePicker,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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

/** Date selected, time not yet chosen (shows Hour / Min / AM placeholders). */
function localDatetimeDateOnly(): string {
  return `${getTodayLocal()}T`;
}

function isCompleteLocalDatetime(value: string): boolean {
  if (!value?.includes('T')) return false;
  const [datePart, timePart = ''] = value.split('T');
  const { hour12, minute, amPm } = parseHhmm(timePart.slice(0, 5));
  return Boolean(datePart && hour12 && minute && amPm);
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

const HR_STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
];

const FILTER_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open (in progress)' },
  { value: 'finalized', label: 'Finalized' },
];

const BREAK_HOUR_OPTIONS = Array.from({ length: 3 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

const BREAK_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  const v = String(m).padStart(2, '0');
  return { value: v, label: v };
});

function localDatePart(value: string): string {
  if (!value?.includes('T')) return value?.trim() || '';
  return value.split('T')[0] || '';
}

function localTimePart(value: string): string {
  if (!value?.includes('T')) return '';
  const timePart = value.split('T')[1] || '';
  return /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : '';
}

function LocalDateTimeFields({
  label,
  value,
  onChange,
  required,
  dateFieldHint,
  timeFieldHint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  dateFieldHint?: string;
  timeFieldHint?: string;
}) {
  const date = localDatePart(value);
  const time = localTimePart(value);
  const dateLabel = required ? `${label} *` : label;
  const timeLabel = required ? 'Time *' : 'Time';

  return (
    <div className={uiSpacing.sectionStack}>
      <AppDatePicker
        label={dateLabel}
        fieldHint={dateFieldHint ? <AppFieldHint hint={dateFieldHint} /> : undefined}
        value={date}
        onChange={(e) => {
          const d = e.target.value;
          if (!d) {
            onChange('');
            return;
          }
          onChange(time ? `${d}T${time}` : `${d}T`);
        }}
        required={required}
      />
      <AppTimePicker
        label={timeLabel}
        fieldHint={timeFieldHint ? <AppFieldHint hint={timeFieldHint} /> : undefined}
        value={time}
        onChange={(e) => {
          const t = e.target.value;
          if (!date) return;
          onChange(t ? `${date}T${t}` : `${date}T`);
        }}
        required={required}
      />
    </div>
  );
}

/** Parse `GPS:{...}` lines from attendance notes (e.g. session notes from clock-in/out). */
function extractGpsFromSessionNotes(text?: string | null): { lat: number; lng: number; accuracy_m?: number } | null {
  if (!text?.trim()) return null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('GPS:')) continue;
    try {
      const j = JSON.parse(line.slice(4)) as { lat?: number; lng?: number; accuracy_m?: number };
      if (typeof j.lat === 'number' && typeof j.lng === 'number') {
        return { lat: j.lat, lng: j.lng, accuracy_m: j.accuracy_m };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
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

type AttendanceEventView = {
  event_id: string;
  worker_name: string;
  subcontractor_company_name?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  clock_in_status?: string | null;
  hr_status?: string | null;
  break_minutes?: number | null;
  clock_in_confirmed_by?: string | null;
  clock_out_confirmed_by?: string | null;
  hours_worked?: number | null;
  clock_in_notes?: string | null;
  clock_out_notes?: string | null;
  session_notes?: string | null;
  clock_out_signature_file_id?: string | null;
};

function AttendanceDetailsBody({ event }: { event: AttendanceEventView }) {
  const hrLabel = (event.hr_status || event.clock_in_status || 'approved');
  const hrDisplay = `${hrLabel.charAt(0).toUpperCase()}${hrLabel.slice(1)}`;
  const gps = extractGpsFromSessionNotes(event.session_notes);
  const signatureId = event.clock_out_signature_file_id?.trim();

  return (
    <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
      <dl className="min-w-0">
        <DetailField label="Record ID">
          <span className="break-all font-mono text-[11px] font-normal text-gray-700">{event.event_id}</span>
        </DetailField>
        <DetailField label="Worker">{event.worker_name || '—'}</DetailField>
        {event.subcontractor_company_name ? (
          <DetailField label="Company">{event.subcontractor_company_name}</DetailField>
        ) : null}
        <DetailField label="Project">{event.project_name || '—'}</DetailField>
        <DetailField label="Project address">{event.project_address || '—'}</DetailField>
        <DetailField label="Session">{event.clock_out_time ? 'Finalized' : 'Open'}</DetailField>
        <DetailField label="HR status">{hrDisplay}</DetailField>
        <DetailField label="Break">{formatBreak(event.break_minutes)}</DetailField>
        <DetailField label="Clock in">{formatDateTime(event.clock_in_time)}</DetailField>
        <DetailField label="Clock in by">{event.clock_in_confirmed_by || '—'}</DetailField>
        <DetailField label="Clock out">{formatDateTime(event.clock_out_time)}</DetailField>
        <DetailField label="Clock out by">{event.clock_out_confirmed_by || '—'}</DetailField>
        <DetailField label="Hours worked">{formatHours(event.hours_worked)}</DetailField>
        {event.clock_in_notes ? (
          <DetailField label="Clock-in notes">
            <pre className="whitespace-pre-wrap font-sans font-normal text-gray-700">{event.clock_in_notes}</pre>
          </DetailField>
        ) : null}
        {event.clock_out_notes ? (
          <DetailField label="Clock-out notes">
            <pre className="whitespace-pre-wrap font-sans font-normal text-gray-700">{event.clock_out_notes}</pre>
          </DetailField>
        ) : null}
        {gps ? (
          <DetailField label="Location">
            {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
            {gps.accuracy_m != null ? ` · ±${Math.round(gps.accuracy_m)}m` : ''}
          </DetailField>
        ) : null}
        <DetailField label="Signature">
          {signatureId ? (
            <div className="space-y-2">
              <a
                href={withFileAccessToken(`/files/${encodeURIComponent(signatureId)}/download`)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-brand-red hover:underline"
              >
                Open / download
              </a>
              <img
                src={withFileAccessToken(`/files/${encodeURIComponent(signatureId)}/thumbnail?w=640`)}
                alt="Clock-out signature"
                className={uiCx('max-h-40 max-w-full rounded border bg-white', uiBorders.subtle)}
              />
            </div>
          ) : (
            '—'
          )}
        </DetailField>
      </dl>
    </AppCard>
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

  const openNewModal = () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit attendance');
      return;
    }
    resetModal();
    setEditingEvent(null);
    setFormClockIn(localDatetimeDateOnly());
    setFormClockOut(localDatetimeDateOnly());
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
    if (formEntryMode === 'hours' && !formClockIn) {
      toast.error('Work date is required');
      return;
    }
    if (formEntryMode === 'time' && !isCompleteLocalDatetime(formClockIn)) {
      toast.error('Clock-in date and time are required');
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
      if (!isCompleteLocalDatetime(formClockOut)) {
        toast.error('Clock-out date and time are required');
        return;
      }
      clockInUtc = toUtcISOString(formClockIn);
      if (!clockInUtc) {
        toast.error('Invalid clock-in time');
        return;
      }
      clockOutUtc = toUtcISOString(formClockOut);
      if (!clockOutUtc) {
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
    if (formEntryMode === 'time') {
      if (!isCompleteLocalDatetime(formClockIn)) {
        return { submitDisabled: true, submitDisabledReason: 'Set clock-in date, hour, minute, and AM/PM.' };
      }
      if (!isCompleteLocalDatetime(formClockOut)) {
        return { submitDisabled: true, submitDisabledReason: 'Set clock-out date, hour, minute, and AM/PM.' };
      }
    } else if (!formClockIn) {
      return { submitDisabled: true, submitDisabledReason: 'Select the work date.' };
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
    formClockOut,
    formEntryMode,
    formHoursWorked,
  ]);

  const showManualClockOutSignature =
    formEntryMode === 'hours'
      ? !!formHoursWorked && parseFloat(formHoursWorked || '0') > 0
      : isCompleteLocalDatetime(formClockOut);

  return (
    <div className="space-y-6 pb-24">
      <AppCard>
        <AppSectionHeader
          title="Timesheet"
          description="Site clock-in/out history and manual attendance entries."
          {...appSectionPresetProps('employment')}
        />
        <div className="mt-4">
        {openAttendance && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
            Clocked in
            {openAttendance.project_name ? ` @ ${openAttendance.project_name}` : ''}
            {openAttendance.clock_in_time ? ` since ${new Date(openAttendance.clock_in_time).toLocaleString()}` : ''}.
          </div>
        )}

        <AppCard
          className="mb-6"
          title="Clock Actions"
          actions={
            <AppDatePicker
              id="sc-worker-clock-actions-date"
              value={clockActionDate}
              onChange={(e) => e.target.value && setClockActionDate(e.target.value)}
              triggerVariant="card"
              triggerClassName="w-[220px] max-w-[60vw] shrink-0"
              aria-label="Select date"
            />
          }
        >
          <div className={uiSpacing.sectionStack}>
            <ClockActionTile
              kind="in"
              enabled={!openAttendance && canEdit}
              disabled={quickClockBusy}
              onClick={() => setClockActionModal('in')}
              title={openAttendance ? 'Clock out first to start a new session' : !canEdit ? 'View only' : undefined}
              subtitle="Start tracking work time for this worker"
            />
            <ClockActionTile
              kind="out"
              enabled={!!openAttendance && canEdit}
              disabled={quickClockBusy}
              onClick={() => setClockActionModal('out')}
              title={!openAttendance ? 'No open session' : !canEdit ? 'View only' : undefined}
              subtitle="End the current work session"
            />
          </div>
        </AppCard>

        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AppDatePicker
            label="Start date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          <AppDatePicker
            label="End date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
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
          <AppSelect
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={FILTER_STATUS_OPTIONS}
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Error loading attendance: {String(error)}
          </div>
        )}

        {canEdit && selectedEvents.size > 0 && (
          <div className="mb-4 rounded-xl border bg-blue-50 p-3 flex items-center justify-between">
            <div className="text-xs font-medium text-blue-900">{selectedEvents.size} record(s) selected</div>
            <AppButton
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleDeleteSelected()}
              disabled={deletingSelected}
              loading={deletingSelected}
            >
              Delete selected
            </AppButton>
          </div>
        )}

        <div className={uiCx('rounded-xl border bg-white', uiSpacing.cardPadding)}>
          <p className={uiCx(uiTypography.helper, 'mb-3')}>
            Click a row to view full details, notes, and signatures.
          </p>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left w-12">
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Clock In</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Clock Out</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Project</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Hours</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Break</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="p-3 text-left text-xs font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {canEdit && (
                <tr>
                  <td colSpan={8} className="p-0 align-top">
                    <button
                      type="button"
                      onClick={openNewModal}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-brand-red hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[52px] text-gray-600 hover:text-brand-red transition-colors"
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
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <input
                          type="checkbox"
                          checked={selectedEvents.has(event.event_id)}
                          onChange={() => handleToggleSelect(event.event_id)}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      )}
                    </td>
                    <td className="p-3 text-xs text-gray-900">
                      {event.clock_in_time ? formatDateTime(event.clock_in_time) : '—'}
                    </td>
                    <td className="p-3 text-xs text-gray-900">
                      {event.clock_out_time ? formatDateTime(event.clock_out_time) : '—'}
                    </td>
                    <td className="p-3 text-xs text-gray-900">{event.project_name || '—'}</td>
                    <td className="p-3 text-xs text-gray-900">{formatHours(event.hours_worked)}</td>
                    <td className="p-3 text-xs text-gray-900">{formatBreak(event.break_minutes)}</td>
                    <td className="p-3">
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
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
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
        </div>
      </AppCard>

      <AppFormModal
        open={showModal}
        onClose={closeModal}
        title={editingEvent ? 'Edit attendance' : 'New attendance'}
        description={
          editingEvent
            ? 'Update times and project.'
            : 'Add clock-in/out.'
        }
        quickInfo={scWorkerManualAttendanceQuickInfo(!!editingEvent)}
        footer={
          <div className="flex w-full flex-col gap-2">
            {submitDisabledReason ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {submitDisabledReason}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <AppButton type="button" variant="secondary" onClick={closeModal}>
                Cancel
              </AppButton>
              <AppButton
                type="button"
                onClick={() => void submitModal()}
                title={submitDisabledReason || undefined}
                disabled={submitDisabled}
                loading={createManualMut.isPending || patchMut.isPending}
              >
                {editingEvent ? 'Update' : 'Create'}
              </AppButton>
            </div>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppProjectSelect
            id="sc-worker-manual-project"
            label="Project *"
            fieldHint="Project\n\nJob site where this worker was on site for this attendance row."
            value={formProjectId}
            onChange={setFormProjectId}
            disabled={createManualMut.isPending || patchMut.isPending}
          />
          <div>
            <AppControlLabelRow
              label="Entry type"
              fieldHint={
                <AppFieldHint hint="Entry type\n\nClock in / out — enter start and end times. Hours worked — enter total hours for one work date." />
              }
            />
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-xs">
              <AppButton
                type="button"
                variant={formEntryMode === 'time' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0 shadow-none"
                onClick={() => {
                  setFormEntryMode('time');
                  setFormHoursWorked('');
                }}
              >
                Clock in / out
              </AppButton>
              <AppButton
                type="button"
                variant={formEntryMode === 'hours' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-gray-200 shadow-none"
                onClick={() => {
                  setFormEntryMode('hours');
                  const datePart = formClockIn ? formClockIn.slice(0, 10) : getTodayLocal();
                  setFormClockIn(`${datePart}T00:00`);
                  setFormClockOut('');
                }}
              >
                Hours worked
              </AppButton>
            </div>
          </div>
          <AppSelect
            label="HR status *"
            fieldHint="HR status\n\nApproval state for this row (approved, pending, or rejected)."
            value={formHrStatus}
            onChange={(e) => setFormHrStatus(e.target.value)}
            options={HR_STATUS_OPTIONS}
            required
          />
          {formEntryMode === 'hours' ? (
            <AppDatePicker
              label="Work date *"
              fieldHint={<AppFieldHint hint="Work date\n\nCalendar day when the hours were worked." />}
              value={formClockIn ? formClockIn.slice(0, 10) : ''}
              onChange={(e) => {
                const d = e.target.value;
                setFormClockIn(d ? `${d}T00:00` : '');
              }}
              required
            />
          ) : (
            <LocalDateTimeFields
              key={`clock-in-${editingEvent?.event_id ?? 'new'}`}
              label="Clock in"
              value={formClockIn}
              onChange={setFormClockIn}
              required
              dateFieldHint="Clock-in date\n\nDay the worker started on site."
              timeFieldHint="Clock-in time\n\nLocal time when the worker clocked in (5-minute steps)."
            />
          )}
          {formEntryMode === 'time' && (
            <LocalDateTimeFields
              key={`clock-out-${editingEvent?.event_id ?? 'new'}`}
              label="Clock out"
              value={formClockOut}
              onChange={setFormClockOut}
              required
              dateFieldHint="Clock-out date\n\nDay the worker finished on site."
              timeFieldHint="Clock-out time\n\nLocal time when the worker clocked out. Must be after clock-in."
            />
          )}
          {formEntryMode === 'hours' && (
            <AppInput
              label="Hours worked *"
              fieldHint="Hours worked\n\nTotal hours for the work date (e.g. 8 for a full day)."
              type="number"
              min={0}
              step={0.25}
              value={formHoursWorked}
              onChange={(e) => setFormHoursWorked(e.target.value)}
              placeholder="e.g. 8"
              required
            />
          )}
          {(formEntryMode === 'hours' ? !!formHoursWorked && parseFloat(formHoursWorked) > 0 : !!formClockOut) && (
            <div className={uiSpacing.sectionStack}>
              <AppCheckbox
                label="Insert break time"
                fieldHint="Insert break time\n\nSubtract unpaid break minutes from the total session time."
                checked={insertBreakTime}
                onChange={setInsertBreakTime}
              />
              {insertBreakTime && (
                <div className="flex flex-wrap items-end gap-3 pl-8">
                  <AppSelect
                    label="Hours"
                    fieldHint="Break hours\n\nWhole hours of break time."
                    value={breakHours}
                    onChange={(e) => setBreakHours(e.target.value)}
                    options={BREAK_HOUR_OPTIONS}
                    className="min-w-[100px] flex-1"
                  />
                  <AppSelect
                    label="Minutes"
                    fieldHint="Break minutes\n\nAdditional break minutes in 5-minute steps."
                    value={breakMinutes}
                    onChange={(e) => setBreakMinutes(e.target.value)}
                    options={BREAK_MINUTE_OPTIONS}
                    className="min-w-[100px] flex-1"
                  />
                </div>
              )}
            </div>
          )}
          {showManualClockOutSignature && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600">Clock-out signature (optional)</p>
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
      </AppFormModal>

      <AppFormModal
        open={!!viewingEvent}
        onClose={() => setViewingEvent(null)}
        layout="detail"
        size="md"
        title="Attendance details"
        description="Session times, project, and signature for this row."
        quickInfo={scWorkerAttendanceDetailQuickInfo}
        bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" onClick={() => setViewingEvent(null)}>
              Close
            </AppButton>
          </div>
        }
      >
        {viewingEvent ? <AttendanceDetailsBody event={viewingEvent} /> : null}
      </AppFormModal>

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
