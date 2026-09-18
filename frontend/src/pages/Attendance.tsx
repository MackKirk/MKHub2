import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Clock, TriangleAlert } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { attendanceWorkDate, getTodayLocal } from '@/lib/dateUtils';
import { isCompleteLocalDatetime, LocalDateTimeFields } from '@/components/LocalDateTimeFields';
import { JobSearchCombobox } from '@/components/JobSearchCombobox';
import {
  attendanceManualEntryQuickInfo,
  scWorkerAttendanceDetailQuickInfo,
  scWorkerManualAttendanceQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  employeesDirectoryQueryKey,
  fetchEmployeesDirectory,
} from '@/lib/employeesQuery';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckboxControl,
  AppCombobox,
  AppControlLabelRow,
  AppDatePicker,
  AppEmptyState,
  AppFieldHint,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppListRowIconButton,
  AppPageHeader,
  AppProjectSelect,
  AppReadOnlyField,
  AppSectionHeader,
  AppSelect,
  AppTabs,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTooltip,
  AppUserSelect,
  formatTimeDisplay,
  getAppTabButtonClassName,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
  sortListByAppColumn,
  useLocalAppListSort,
} from '@/components/ui';
import { PREDEFINED_JOBS } from '@/constants/predefinedJobs';
import { resolveAttendanceEventJobLabel } from '@/lib/attendanceJobLabels';
import { AttendanceWeekGrid } from '@/components/AttendanceWeekGrid';
import { AttendanceSageBadge } from '@/components/AttendanceSageBadge';
import { isSagePaid, SAGE_PAID_MESSAGE } from '@/lib/sageAttendance';
import { startOfSundayWeek, weekDateStrings } from '@/lib/weekUtils';


type Attendance = {
  id: string;
  record_kind?: 'internal' | 'subcontractor';
  subcontractor_company_name?: string | null;
  project_id?: string | null;
  worker_id: string;
  worker_name: string;
  type?: 'in' | 'out'; // For backward compatibility, but not used in new model
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null; // For backward compatibility
  time_entered_utc?: string | null; // For backward compatibility
  status: string;
  source: string;
  shift_id?: string | null;
  job_name?: string | null;
  project_name?: string | null;
  hours_worked?: number | null;
  break_minutes?: number | null;
  reason_text?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  created_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  project_address?: string | null;
  clock_in_entered_utc?: string | null;
  clock_out_entered_utc?: string | null;
  clock_in_notes?: string | null;
  clock_out_notes?: string | null;
  session_notes?: string | null;
  clock_in_signature_file_id?: string | null;
  clock_out_signature_file_id?: string | null;
  clock_in_confirmed_by?: string | null;
  clock_out_confirmed_by?: string | null;
  gps_accuracy_m?: number | null;
  hr_status?: string | null;
  sage_state?: string | null;
  sage_locked?: boolean;
  sage_error?: string | null;
  sage_synced_at?: string | null;
  sage_paid_at?: string | null;
};

type AttendanceEvent = {
  event_id: string;
  record_kind?: 'internal' | 'subcontractor';
  subcontractor_company_name?: string | null;
  worker_id: string;
  worker_name: string;
  job_name?: string | null;
  project_name?: string | null;
  job_type?: string | null;
  project_id?: string | null; // project_id from shift when shift_id exists
  shift_id?: string | null;
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
  is_hours_worked?: boolean; // True if this is a "hours worked" entry (no specific clock-in/out times)
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
  project_address?: string | null;
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
  source?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_accuracy_m?: number | null;
  hr_status?: string | null;
  sage_state?: string | null;
  sage_locked?: boolean;
  sage_error?: string | null;
  sage_synced_at?: string | null;
  sage_paid_at?: string | null;
};

type User = {
  id: string;
  username: string;
  name?: string;
  is_active?: boolean;
};

type Project = {
  id: string;
  code?: string;
  name: string;
};

const toLocalInputValue = (iso?: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  // datetime-local input expects YYYY-MM-DDTHH:mm format in local time
  // Get local date components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toUtcISOString = (localValue?: string) => {
  if (!localValue) return null;
  // datetime-local input provides value in local time (YYYY-MM-DDTHH:mm)
  // We need to treat this as local time and convert to UTC
  // The safest way is to create a date in local time and let JavaScript handle the conversion
  const [datePart, timePart] = localValue.split('T');
  if (!datePart || !timePart) return null;
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create date in local timezone (JavaScript Date constructor interprets as local time)
  const localDate = new Date(year, month - 1, day, hours, minutes || 0, 0, 0);
  
  // Convert to UTC ISO string (this automatically handles timezone conversion)
  return localDate.toISOString();
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatHours = (hours?: number | null) => {
  if (hours === undefined || hours === null) return '--';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatBreak = (breakMinutes?: number | null) => {
  if (breakMinutes === undefined || breakMinutes === null || breakMinutes === 0) return '--';
  const h = Math.floor(breakMinutes / 60);
  const m = breakMinutes % 60;
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  return `${m}m`;
};

const BREAK_PRESETS = [
  { minutes: 0, label: 'None' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 hour' },
] as const;

function isBreakPresetMinutes(minutes: number) {
  return BREAK_PRESETS.some((preset) => preset.minutes === minutes);
}

function formatDurationMinutes(total?: number | null) {
  if (total == null || Number.isNaN(total) || total < 0) return '—';
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function AttendanceBreakField({
  minutes,
  custom,
  onChange,
  disabled,
}: {
  minutes: number;
  custom: boolean;
  onChange: (minutes: number, custom: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <AppControlLabelRow
        label="Break"
        fieldHint={
          <AppFieldHint hint="Break\n\nUnpaid break deducted from the logged time. Pick a common length, or Custom to type minutes." />
        }
      />
      <div className="flex flex-wrap gap-2">
        {BREAK_PRESETS.map((preset) => (
          <button
            key={preset.minutes}
            type="button"
            disabled={disabled}
            onClick={() => onChange(preset.minutes, false)}
            className={getAppTabButtonClassName(!custom && minutes === preset.minutes)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(minutes > 0 ? minutes : 30, true);
          }}
          className={getAppTabButtonClassName(custom)}
        >
          Custom
        </button>
      </div>
      {custom ? (
        <AppInput
          label="Minutes"
          type="number"
          min={0}
          step={5}
          value={String(minutes)}
          disabled={disabled}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            onChange(Number.isNaN(next) ? 0 : Math.max(0, next), true);
          }}
          fieldHint="Minutes\n\nTotal unpaid break minutes for this row."
        />
      ) : null}
    </div>
  );
}

const DEFAULT_CLOCK_IN = '08:00';
const DEFAULT_CLOCK_OUT = '16:00';

function localDatePart(value: string): string {
  if (!value?.includes('T')) return value?.trim() || '';
  return value.split('T')[0] || '';
}

function localTimePart(value: string): string {
  if (!value?.includes('T')) return '';
  const timePart = value.split('T')[1] || '';
  return /^\d{2}:\d{2}/.test(timePart) ? timePart.slice(0, 5) : '';
}

function combineLocalDatetime(date: string, time: string): string {
  if (!date) return '';
  return time ? `${date}T${time}` : `${date}T`;
}

function defaultShiftForDate(date: string) {
  return {
    clock_in_time: combineLocalDatetime(date, DEFAULT_CLOCK_IN),
    clock_out_time: combineLocalDatetime(date, DEFAULT_CLOCK_OUT),
  };
}

function addMinutesLocal(value: string, minutes: number): string {
  const utc = toUtcISOString(value);
  if (!utc) return value;
  return toLocalInputValue(new Date(new Date(utc).getTime() + minutes * 60 * 1000).toISOString());
}

function shiftFromWorkedHours(date: string, hours: number) {
  const start = combineLocalDatetime(date, DEFAULT_CLOCK_IN);
  if (!hours || hours <= 0) return defaultShiftForDate(date);
  return {
    clock_in_time: start,
    clock_out_time: addMinutesLocal(start, Math.round(hours * 60)),
  };
}

function applyClockInKeepingLinkedOutDate<T extends { clock_in_time: string; clock_out_time: string }>(
  prev: T,
  nextIn: string,
): T {
  const prevInDate = localDatePart(prev.clock_in_time);
  const nextInDate = localDatePart(nextIn);
  const outDate = localDatePart(prev.clock_out_time);
  const outTime = localTimePart(prev.clock_out_time) || DEFAULT_CLOCK_OUT;
  const datesWereLinked = !outDate || !prevInDate || outDate === prevInDate;
  return {
    ...prev,
    clock_in_time: nextIn,
    clock_out_time:
      datesWereLinked && nextInDate ? combineLocalDatetime(nextInDate, outTime) : prev.clock_out_time,
  };
}

function AttendanceTotalHoursField({
  clockIn,
  clockOut,
  grossMinutes,
  breakMinutes,
}: {
  clockIn: string;
  clockOut: string;
  grossMinutes: number | null;
  breakMinutes: number;
}) {
  const inLabel = formatTimeDisplay(localTimePart(clockIn));
  const outLabel = formatTimeDisplay(localTimePart(clockOut));
  const inDate = localDatePart(clockIn);
  const outDate = localDatePart(clockOut);
  const nextDay = Boolean(inDate && outDate && inDate !== outDate);
  const net = grossMinutes == null ? null : Math.max(0, grossMinutes - Math.max(0, breakMinutes));
  const range =
    inLabel && outLabel
      ? `${inLabel} – ${outLabel}${nextDay ? ' (next day)' : ''}`
      : 'Set clock in and clock out to see hours.';

  return (
    <div className="space-y-1.5">
      <AppControlLabelRow
        label="Total hours"
        fieldHint={
          <AppFieldHint hint="Total hours\n\nCalculated from clock in to clock out. Not edited directly — change the times below." />
        }
      />
      <div className={uiCx(uiRadius.control, uiBorders.input, uiColors.surfaceSubtle, 'px-3 py-2.5')}>
        <div className="text-lg font-semibold tabular-nums text-gray-900">
          {grossMinutes == null ? '—' : formatDurationMinutes(grossMinutes)}
        </div>
        <p className={uiTypography.helper}>
          {range}
          {grossMinutes != null && breakMinutes > 0 ? (
            <>
              {' · '}
              {formatDurationMinutes(breakMinutes)} break
              {' · '}
              <span className="font-medium text-gray-800">{formatDurationMinutes(net)} after break</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

const ATTENDANCE_STATUS_OPTIONS = [
  {
    key: 'approved',
    label: 'Approved',
    active: 'border-emerald-600 bg-emerald-50 text-emerald-800',
  },
  {
    key: 'pending',
    label: 'Pending',
    active: 'border-amber-500 bg-amber-50 text-amber-900',
  },
  {
    key: 'rejected',
    label: 'Rejected',
    active: 'border-red-500 bg-red-50 text-red-800',
  },
] as const;

function AttendanceStatusField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <AppControlLabelRow
        label="Status *"
        fieldHint={<AppFieldHint hint="Status\n\nApproval state for this row (approved, pending, or rejected)." />}
      />
      <div className="flex flex-wrap gap-2">
        {ATTENDANCE_STATUS_OPTIONS.map((option) => {
          const isActive = value === option.key;
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={uiCx(
                'inline-flex items-center px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                uiRadius.tab,
                uiTypography.controlLabel,
                isActive ? option.active : uiCx(uiBorders.strong, 'bg-white text-gray-700 hover:bg-gray-50'),
              )}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const extractJobType = (reason?: string | null) => {
  if (!reason) return null;
  if (reason.startsWith('JOB_TYPE:')) {
    const [marker] = reason.split('|');
    return marker.replace('JOB_TYPE:', '');
  }
  return null;
};

const extractHoursWorked = (reason?: string | null): number | null => {
  if (!reason) return null;
  const parts = reason.split('|');
  for (const part of parts) {
    if (part.startsWith('HOURS_WORKED:')) {
      const hours = parseFloat(part.replace('HOURS_WORKED:', ''));
      return isNaN(hours) ? null : hours;
    }
  }
  return null;
};

const isHoursWorkedEntry = (reason?: string | null): boolean => {
  return extractHoursWorked(reason) !== null;
};

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
    <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-b border-gray-100 py-2 last:border-0 sm:grid-cols-[10rem_1fr]">
      <div className={uiCx(uiTypography.controlLabel, 'shrink-0')}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'min-w-0 break-words text-gray-900')}>{children}</div>
    </div>
  );
}

function SignaturePreviewBlock({ fileId, label }: { fileId?: string | null; label: string }) {
  if (!fileId?.trim()) {
    return (
      <div className="pt-1">
        <p className={uiCx(uiTypography.controlLabel, 'mb-1')}>{label}</p>
        <p className={uiTypography.helper}>None</p>
      </div>
    );
  }
  const fid = encodeURIComponent(fileId.trim());
  const thumb = withFileAccessToken(`/files/${fid}/thumbnail?w=640`);
  const dl = withFileAccessToken(`/files/${fid}/download`);
  return (
    <div className="min-w-0 pt-1">
      <p className={uiCx(uiTypography.controlLabel, 'mb-1')}>{label}</p>
      <a
        href={dl}
        target="_blank"
        rel="noopener noreferrer"
        className={uiCx(uiTypography.helper, 'text-blue-600 hover:underline')}
      >
        Open / download
      </a>
      <img src={thumb} alt="" className="mt-1.5 max-w-full rounded border border-gray-200 bg-white" />
    </div>
  );
}

const ATTENDANCE_ADMIN_GRID = 'grid-cols-[32px_3fr_4fr_4fr_4fr_4fr_5fr_3fr_3fr_3fr_3fr_auto]';
const ATTENDANCE_ADMIN_GRID_READONLY = 'grid-cols-[3fr_4fr_4fr_4fr_4fr_5fr_3fr_3fr_3fr_3fr_auto]';
const ATTENDANCE_ADMIN_MIN_WIDTH = 'min-w-[1220px]';

const buildEvents = (attendances: Attendance[], projects: Project[] = []): AttendanceEvent[] => {
  // NEW MODEL: Each attendance record is already a complete event
  // No need to group clock-in and clock-out records together
  // Ensure attendances is always an array
  if (!Array.isArray(attendances)) {
    return [];
  }
  const events: AttendanceEvent[] = attendances.map((att) => {
    // Use clock_in_time or clock_out_time for time_selected_utc (backward compatibility)
    const timeSelected = att.clock_in_time || att.clock_out_time || att.time_selected_utc;
    
    // Check if this is a "hours worked" entry
    const hoursWorkedValue = extractHoursWorked(att.reason_text);
    const isHoursWorked = hoursWorkedValue !== null;
    
    // Calculate hours_worked
    let hoursWorked: number | null = null;
    if (isHoursWorked && hoursWorkedValue !== null) {
      hoursWorked = typeof hoursWorkedValue === 'string' ? parseFloat(hoursWorkedValue) : hoursWorkedValue;
    } else if (att.hours_worked !== null && att.hours_worked !== undefined) {
      hoursWorked = att.hours_worked;
    } else if (att.clock_in_time && att.clock_out_time) {
      // Calculate from clock-in and clock-out times
      const diff = new Date(att.clock_out_time).getTime() - new Date(att.clock_in_time).getTime();
      hoursWorked = diff / 3600000; // Convert to hours
    }
    
    // Subtract break minutes from hours_worked if break exists (internal list may send gross; subcontractor sends net)
    if (
      hoursWorked !== null &&
      att.break_minutes !== null &&
      att.break_minutes !== undefined &&
      att.break_minutes > 0 &&
      att.record_kind !== 'subcontractor'
    ) {
      hoursWorked = Math.max(0, hoursWorked - (att.break_minutes / 60));
    }
    
    // When there's a shift_id, try to find the project_id from project_name
    let projectId: string | null = null;
    let jobType: string | null = null;
    if (att.shift_id && att.project_name) {
      // Find project by name in the projects list
      const project = projects.find((p) => p.name === att.project_name);
      if (project) {
        projectId = project.id;
        jobType = project.id; // Use project_id as job_type when there's a shift
      }
    } else if ((att as Attendance).project_id) {
      projectId = (att as Attendance).project_id || null;
    } else if (!att.shift_id) {
      // No shift - extract job_type from reason_text
      jobType = extractJobType(att.reason_text);
    }
    
    return {
      event_id: att.id,
      record_kind: att.record_kind || 'internal',
      subcontractor_company_name: att.subcontractor_company_name || null,
      worker_id: att.worker_id,
      worker_name: att.worker_name,
      job_name: att.job_name,
      project_name: att.project_name,
      job_type: jobType,
      project_id: projectId,
      shift_id: att.shift_id || undefined,
      clock_in_id: att.clock_in_time ? att.id : null,
      clock_in_time: att.clock_in_time || null,
      clock_in_status: att.clock_in_time
        ? att.record_kind === 'subcontractor'
          ? ((att as Attendance).hr_status || 'approved').toLowerCase()
          : att.status
        : null,
      clock_in_reason: att.clock_in_time ? att.reason_text : null,
      clock_out_id: att.clock_out_time ? att.id : null,
      clock_out_time: att.clock_out_time || null,
      clock_out_status: att.clock_out_time
        ? att.record_kind === 'subcontractor'
          ? ((att as Attendance).hr_status || 'approved').toLowerCase()
          : att.status
        : null,
      clock_out_reason: att.clock_out_time ? att.reason_text : null,
      hours_worked: hoursWorked,
      break_minutes: att.break_minutes || null,
      is_hours_worked: isHoursWorked,
      shift_deleted: att.shift_deleted || false,
      shift_deleted_by: att.shift_deleted_by || null,
      shift_deleted_at: att.shift_deleted_at || null,
      project_address: att.project_address ?? null,
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
      source: att.source ?? null,
      gps_lat: att.gps_lat ?? null,
      gps_lng: att.gps_lng ?? null,
      gps_accuracy_m: att.gps_accuracy_m ?? null,
      hr_status: att.hr_status ?? null,
      sage_state: att.sage_state ?? 'none',
      sage_locked: Boolean(att.sage_locked),
      sage_error: att.sage_error ?? null,
      sage_synced_at: att.sage_synced_at ?? null,
      sage_paid_at: att.sage_paid_at ?? null,
    };
  });

  return events.sort(
    (a, b) =>
      new Date(b.clock_in_time || b.clock_out_time || '').getTime() -
      new Date(a.clock_in_time || a.clock_out_time || '').getTime()
  );
};

export default function Attendance() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=> api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const perms = new Set<string>(me?.permissions || []);
  const canEditAttendance = isAdmin || perms.has('hr:attendance:write') || perms.has('hr:users:edit:timesheet') || perms.has('users:write');
  const listGridCols = canEditAttendance ? ATTENDANCE_ADMIN_GRID : ATTENDANCE_ADMIN_GRID_READONLY;
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'week'>('week');
  const [weekStart, setWeekStart] = useState<Date>(() => startOfSundayWeek(new Date()));
  const [filters, setFilters] = useState({
    worker_id: '',
    start_date: '',
    end_date: '',
    status: '',
    sage_state: '',
    record_kind: 'internal' as 'internal' | 'subcontractor' | 'all',
    subcontractor_company_id: '',
    project_id: '',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<AttendanceEvent | null>(null);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    worker_id: '',
    job_type: '0',
    clock_in_time: '',
    clock_out_time: '',
    status: 'approved',
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Unpaid break on this row (minutes). 0 = no break.
  const [breakMinutesTotal, setBreakMinutesTotal] = useState(0);
  const [breakCustom, setBreakCustom] = useState(false);
  

  // Build query string for filters
  const weekDates = useMemo(() => weekDateStrings(weekStart), [weekStart]);
  const weekStartStr = weekDates[0] || '';
  const weekEndStr = weekDates[6] || '';
  const queryParams = new URLSearchParams();
  if (viewMode === 'week') {
    queryParams.set('record_kind', 'internal');
    queryParams.set('start_date', weekStartStr);
    queryParams.set('end_date', weekEndStr);
    queryParams.set('limit', '5000');
    if (filters.worker_id) queryParams.set('worker_id', filters.worker_id);
    if (filters.project_id) queryParams.set('project_id', filters.project_id);
    if (filters.status) queryParams.set('status', filters.status);
  } else {
    if (filters.worker_id) queryParams.set('worker_id', filters.worker_id);
    if (filters.start_date) queryParams.set('start_date', filters.start_date);
    if (filters.end_date) queryParams.set('end_date', filters.end_date);
    if (filters.status) queryParams.set('status', filters.status);
    if (filters.record_kind) queryParams.set('record_kind', filters.record_kind);
    if (filters.subcontractor_company_id) queryParams.set('subcontractor_company_id', filters.subcontractor_company_id);
    if (filters.project_id) queryParams.set('project_id', filters.project_id);
  }
  const queryString = queryParams.toString();
  const url = queryString
    ? `/settings/attendance/list?${queryString}`
    : '/settings/attendance/list';

  const attendanceEmployeesQuery = {
    limit: 2000,
    activeOnly: true,
    sort: 'name' as const,
    lite: true,
  };
  const { data: users, isLoading: isEmployeesLoading } = useQuery({
    queryKey: employeesDirectoryQueryKey(attendanceEmployeesQuery),
    queryFn: () => fetchEmployeesDirectory(attendanceEmployeesQuery),
    staleTime: 5 * 60 * 1000,
  });

  const { data: attendances, isLoading, isFetching: isHoursFetching, error, refetch } = useQuery({
    queryKey: ['settings-attendance', queryString, refreshKey],
    queryFn: async () => {
      const result = await api<Attendance[]>('GET', url);
      // Ensure result is always an array
      return Array.isArray(result) ? result : [];
    },
    placeholderData: keepPreviousData,
    enabled: viewMode === 'list' || !isEmployeesLoading,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['attendance-projects'],
    queryFn: async () => {
      const result = await api<Project[]>('GET', '/projects');
      return Array.isArray(result) ? result : [];
    },
    enabled: !isEmployeesLoading,
  });

  const { data: subcontractorCompanies = [] } = useQuery({
    queryKey: ['subcontractor-companies-dd'],
    queryFn: async () => {
      const result = await api<{ items?: Array<{ id: string; name: string }> }>(
        'GET',
        '/subcontractors/companies?page=1&limit=500&status=all'
      );
      const items = Array.isArray(result?.items) ? result.items : [];
      return items;
    },
    enabled: viewMode === 'list',
  });

  const attendanceEvents = useMemo(() => {
    const events = buildEvents(
      Array.isArray(attendances) ? attendances : [],
      Array.isArray(projects) ? projects : [],
    );
    if (!filters.sage_state) return events;
    return events.filter((event) => (event.sage_state || 'none') === filters.sage_state);
  }, [attendances, projects, filters.sage_state]);

  const jobOptions = useMemo(() => {
    const projectsArray = Array.isArray(projects) ? projects : [];
    const projectJobs = projectsArray.map((p) => ({
      id: p.id,
      code: p.code || p.id,
      name: p.name,
    }));
    return [...PREDEFINED_JOBS, ...projectJobs];
  }, [projects]);

  const employeeUsers = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    return list.map((u: User) => ({
      id: String(u.id),
      name: u.name,
      username: u.username,
      is_active: u.is_active,
    }));
  }, [users]);

  const weekEmployees = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const u of employeeUsers) {
      if (u.is_active === false) continue;
      if (filters.worker_id && u.id !== filters.worker_id) continue;
      byId.set(u.id, { id: u.id, name: u.name || u.username || u.id });
    }
    for (const event of attendanceEvents) {
      if (filters.worker_id && event.worker_id !== filters.worker_id) continue;
      if (byId.has(event.worker_id)) continue;
      byId.set(event.worker_id, {
        id: event.worker_id,
        name: event.worker_name || event.worker_id,
      });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [employeeUsers, attendanceEvents, filters.worker_id]);

  const isWeekLoading = isEmployeesLoading;

  const workerFilterOptions = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    return [
      { value: '', label: 'All Workers' },
      ...list.map((u: User) => ({
        value: String(u.id),
        label: u.name || u.username || String(u.id),
      })),
    ];
  }, [users]);

  const companyFilterOptions = useMemo(() => {
    return [
      { value: '', label: 'All companies' },
      ...subcontractorCompanies.map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [subcontractorCompanies]);

  const eventJobLabel = useCallback(
    (event: AttendanceEvent) => resolveAttendanceEventJobLabel(event, jobOptions),
    [jobOptions],
  );

  type AttendanceSortColumn =
    | 'type'
    | 'worker'
    | 'company'
    | 'clock_in'
    | 'clock_out'
    | 'project'
    | 'hours'
    | 'break'
    | 'status'
    | 'sage';
  const { sortBy, sortDir, setSort } = useLocalAppListSort<AttendanceSortColumn>('clock_in', 'desc');

  const attendanceStatusSortKey = useCallback((event: AttendanceEvent) => {
    if (event.record_kind === 'subcontractor') {
      if (!event.clock_out_time) return 'open';
      return (event.hr_status || event.clock_in_status || 'approved').toLowerCase();
    }
    if (
      event.clock_in_status === 'approved' &&
      (!event.clock_out_status || event.clock_out_status === 'approved')
    ) {
      return 'approved';
    }
    if (event.clock_in_status === 'pending' || event.clock_out_status === 'pending') return 'pending';
    return 'rejected';
  }, []);

  const sortedAttendanceEvents = useMemo(
    () =>
      sortListByAppColumn(attendanceEvents, sortBy, sortDir, {
        type: (e) => e.record_kind || 'internal',
        worker: (e) => e.worker_name,
        company: (e) => e.subcontractor_company_name || '',
        clock_in: (e) => (e.is_hours_worked ? null : e.clock_in_time ? Date.parse(e.clock_in_time) : null),
        clock_out: (e) => (e.is_hours_worked ? null : e.clock_out_time ? Date.parse(e.clock_out_time) : null),
        project: (e) => eventJobLabel(e),
        hours: (e) => e.hours_worked ?? null,
        break: (e) => e.break_minutes ?? null,
        status: (e) => attendanceStatusSortKey(e),
        sage: (e) => e.sage_state || 'none',
      }),
    [attendanceEvents, sortBy, sortDir, eventJobLabel, attendanceStatusSortKey],
  );

  const recordKindBadge = (event: AttendanceEvent) =>
    event.record_kind === 'subcontractor' ? (
      <AppBadge variant="info">Subcontractor</AppBadge>
    ) : (
      <AppBadge variant="neutral">Internal</AppBadge>
    );

  const attendanceStatusBadge = (event: AttendanceEvent) => {
    if (event.record_kind === 'subcontractor') {
      if (!event.clock_out_time) {
        return <AppBadge variant="warning">Open</AppBadge>;
      }
      const st = (event.hr_status || event.clock_in_status || 'approved').toLowerCase();
      if (st === 'approved') return <AppBadge variant="success">Approved</AppBadge>;
      if (st === 'pending') return <AppBadge variant="warning">Pending</AppBadge>;
      return <AppBadge variant="danger">Rejected</AppBadge>;
    }
    const approved =
      event.clock_in_status === 'approved' && (!event.clock_out_status || event.clock_out_status === 'approved');
    const pending = event.clock_in_status === 'pending' || event.clock_out_status === 'pending';
    if (approved) return <AppBadge variant="success">Approved</AppBadge>;
    if (pending) return <AppBadge variant="warning">Pending</AppBadge>;
    return <AppBadge variant="danger">Rejected</AppBadge>;
  };

  const closeAttendanceModal = () => {
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      worker_id: '',
      job_type: '0',
      clock_in_time: '',
      clock_out_time: '',
      status: 'approved',
    });
    setSelectedWorkers([]);
    setBreakMinutesTotal(0);
    setBreakCustom(false);
    setEditingEvent(null);
  };

  const handleOpenModal = (event?: AttendanceEvent, seed?: { workerId: string; date: string }) => {
    setViewingEvent(null);
    if (event) {
      setEditingEvent(event);
      setSelectedWorkers([]); // Clear selection when editing

      if (event.record_kind === 'subcontractor') {
        const projectId = event.project_id || '';
        const st = (event.hr_status || event.clock_in_status || 'approved').toLowerCase();
        setFormData({
          worker_id: event.worker_id,
          job_type: projectId,
          clock_in_time: toLocalInputValue(event.clock_in_time),
          clock_out_time: toLocalInputValue(event.clock_out_time),
          status: st === 'pending' || st === 'rejected' ? st : 'approved',
        });
        if (event.break_minutes && event.break_minutes > 0) {
          setBreakMinutesTotal(event.break_minutes);
          setBreakCustom(!isBreakPresetMinutes(event.break_minutes));
        } else {
          setBreakMinutesTotal(0);
          setBreakCustom(false);
        }
        setShowModal(true);
        return;
      }

      const isHoursWorked =
        event.is_hours_worked ||
        (event.clock_in_reason && event.clock_in_reason.includes('HOURS_WORKED:')) ||
        (event.clock_out_reason && event.clock_out_reason.includes('HOURS_WORKED:'));

      let hoursWorkedValue = event.hours_worked ?? null;
      if (isHoursWorked) {
        const reason = event.clock_in_reason || event.clock_out_reason || '';
        const fromReason = extractHoursWorked(reason);
        if (fromReason != null) hoursWorkedValue = fromReason;
      }

      const jobTypeForForm = event.project_id || event.job_type || '0';
      let clockInTimeValue = toLocalInputValue(event.clock_in_time);
      let clockOutTimeValue = toLocalInputValue(event.clock_out_time);

      if (isHoursWorked) {
        const datePart = event.clock_in_time
          ? attendanceWorkDate(event.clock_in_time, true)
          : event.clock_out_time
            ? attendanceWorkDate(event.clock_out_time, true)
            : getTodayLocal();
        const mapped = shiftFromWorkedHours(datePart, hoursWorkedValue ?? 8);
        clockInTimeValue = mapped.clock_in_time;
        clockOutTimeValue = mapped.clock_out_time;
      } else if (!clockOutTimeValue && clockInTimeValue) {
        clockOutTimeValue = combineLocalDatetime(localDatePart(clockInTimeValue), DEFAULT_CLOCK_OUT);
      } else if (!clockInTimeValue) {
        const fallback = defaultShiftForDate(getTodayLocal());
        clockInTimeValue = fallback.clock_in_time;
        clockOutTimeValue = clockOutTimeValue || fallback.clock_out_time;
      }

      setFormData({
        worker_id: event.worker_id,
        job_type: jobTypeForForm,
        clock_in_time: clockInTimeValue,
        clock_out_time: clockOutTimeValue,
        status: event.clock_in_status || 'approved',
      });
      
      // Load manual break time if exists
      if (event.break_minutes && event.break_minutes > 0) {
        setBreakMinutesTotal(event.break_minutes);
        setBreakCustom(!isBreakPresetMinutes(event.break_minutes));
      } else {
        setBreakMinutesTotal(0);
        setBreakCustom(false);
      }
    } else {
      setEditingEvent(null);
      if (seed?.workerId && seed.date) {
        setSelectedWorkers([seed.workerId]);
        setFormData({
          worker_id: seed.workerId,
          job_type: '0',
          ...defaultShiftForDate(seed.date),
          status: 'approved',
        });
      } else {
        setFormData({
          worker_id: '',
          job_type: '0',
          ...defaultShiftForDate(getTodayLocal()),
          status: 'approved',
        });
      }
      setBreakMinutesTotal(0);
      setBreakCustom(false);
    }
    setShowModal(true);
  };

  const handleDeleteEvent = async (event: AttendanceEvent) => {
    if (isSagePaid(event.sage_state, event.sage_locked)) {
      toast.error(SAGE_PAID_MESSAGE);
      return;
    }
    setViewingEvent(null);
    const result = await confirm({
      title: 'Delete attendance',
      message: 'This removes the hours for this worker on this day. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') {
      return;
    }
    setDeletingId(event.event_id);
    try {
      // NEW MODEL: Delete single attendance record (event_id is the attendance id)
      const attendanceId = event.clock_in_id || event.clock_out_id || event.event_id;
      if (!attendanceId) {
        toast.error('Cannot find attendance record to delete');
        setDeletingId(null);
        return;
      }
      
      console.log('Deleting attendance via DELETE:', attendanceId);
      await api(
        'DELETE',
        event.record_kind === 'subcontractor' ? `/subcontractors/attendance/${attendanceId}` : `/settings/attendance/${attendanceId}`
      );
      console.log('Delete result: success');
      
      // Invalidate and refetch
      await queryClient.invalidateQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });
      
      // Force refetch attendance first
      const refetchResult = await queryClient.refetchQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });
      console.log('Refetch after delete:', refetchResult);
      
      // Small delay to ensure backend has processed the deletion
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Also invalidate and refetch timesheet queries so the entry disappears from project timesheets
      // Invalidate all timesheet queries for all projects
      queryClient.invalidateQueries({
        queryKey: ['timesheet'],
        exact: false,
      });
      
      // Force refetch all timesheet queries immediately
      await queryClient.refetchQueries({
        queryKey: ['timesheet'],
        exact: false,
      });
      
      // Force component re-render
      setRefreshKey(prev => prev + 1);
      
      toast.success('Attendance event deleted');
      closeAttendanceModal();
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(err?.message || 'Failed to delete event');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleSelect = (eventId: string) => {
    setSelectedEvents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedEvents.size === attendanceEvents.length) {
      // Deselect all
      setSelectedEvents(new Set());
    } else {
      // Select all
      setSelectedEvents(new Set(attendanceEvents.map((e) => e.event_id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedEvents.size === 0) {
      toast.error('No events selected');
      return;
    }

    const result = await confirm({
      title: 'Delete Selected Attendance Events',
      message: `Are you sure you want to delete ${selectedEvents.size} attendance event(s)? This action cannot be undone.`,
      confirmText: 'Delete All',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') {
      return;
    }

    setDeletingSelected(true);
    const selectedArray = Array.from(selectedEvents);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const eventId of selectedArray) {
        try {
          const event = attendanceEvents.find((e) => e.event_id === eventId);
          if (!event) continue;
          if (isSagePaid(event.sage_state, event.sage_locked)) {
            errorCount++;
            continue;
          }

          const attendanceId = event.clock_in_id || event.clock_out_id || event.event_id;
          if (!attendanceId) {
            errorCount++;
            continue;
          }

          await api(
            'DELETE',
            event.record_kind === 'subcontractor'
              ? `/subcontractors/attendance/${attendanceId}`
              : `/settings/attendance/${attendanceId}`
          );
          successCount++;
        } catch (err: any) {
          errorCount++;
          console.error(`Failed to delete event ${eventId}:`, err);
        }
      }

      // Invalidate and refetch
      await queryClient.invalidateQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });

      await queryClient.refetchQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });

      // Also invalidate timesheet queries
      queryClient.invalidateQueries({
        queryKey: ['timesheet'],
        exact: false,
      });

      await queryClient.refetchQueries({
        queryKey: ['timesheet'],
        exact: false,
      });

      setRefreshKey((prev) => prev + 1);
      setSelectedEvents(new Set());

      if (errorCount > 0) {
        toast.error(`${successCount} deleted, ${errorCount} failed`);
      } else {
        toast.success(`${successCount} attendance event(s) deleted`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete selected events');
    } finally {
      setDeletingSelected(false);
    }
  };

  const handleSubmit = async () => {
    if (isSagePaid(editingEvent?.sage_state, editingEvent?.sage_locked)) {
      toast.error(SAGE_PAID_MESSAGE);
      return;
    }
    const isEditingSubcontractor = editingEvent?.record_kind === 'subcontractor';
    // For editing, use formData.worker_id; for creating, use selectedWorkers
    const workersToProcess = editingEvent 
      ? [formData.worker_id] 
      : (Array.isArray(selectedWorkers) && selectedWorkers.length > 0 ? selectedWorkers : []);
    
    if (!isEditingSubcontractor && workersToProcess.length === 0) {
      toast.error(editingEvent ? 'Please select a worker' : 'Please select at least one worker');
      return;
    }
    setIsSubmitting(true);

    if (!isCompleteLocalDatetime(formData.clock_in_time)) {
      toast.error('Clock-in time is required');
      setIsSubmitting(false);
      return;
    }
    if (!isEditingSubcontractor && !isCompleteLocalDatetime(formData.clock_out_time)) {
      toast.error('Clock-in and clock-out times are required');
      setIsSubmitting(false);
      return;
    }

    const clockInUtc = toUtcISOString(formData.clock_in_time);
    const clockOutUtc = isCompleteLocalDatetime(formData.clock_out_time)
      ? toUtcISOString(formData.clock_out_time)
      : null;

    if (!clockInUtc) {
      toast.error('Clock-in time is required');
      setIsSubmitting(false);
      return;
    }

    if (clockOutUtc) {
      const clockInDate = new Date(clockInUtc);
      const clockOutDate = new Date(clockOutUtc);
      if (clockOutDate <= clockInDate) {
        toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
        setIsSubmitting(false);
        return;
      }

      if (breakMinutesTotal > 0) {
        const totalMinutes = Math.floor((clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60));
        if (breakMinutesTotal >= totalMinutes) {
          toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
          setIsSubmitting(false);
          return;
        }
      }
    }

    const reasonText = `JOB_TYPE:${formData.job_type}`;

    try {
      if (editingEvent?.record_kind === 'subcontractor') {
        const attendanceId = editingEvent.event_id;
        const projectsArray = Array.isArray(projects) ? projects : [];
        if (!formData.job_type || !projectsArray.some((p) => p.id === formData.job_type)) {
          toast.error('Select a valid project for this subcontractor attendance');
          setIsSubmitting(false);
          return;
        }
        if (!clockInUtc) {
          toast.error('Clock-in time is required');
          setIsSubmitting(false);
          return;
        }
        if (clockInUtc && clockOutUtc && new Date(clockOutUtc) <= new Date(clockInUtc)) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          setIsSubmitting(false);
          return;
        }
        try {
          const patchBody: Record<string, unknown> = {
            project_id: formData.job_type,
            clock_in_time: clockInUtc,
            clock_out_time: clockOutUtc || null,
            hr_status: formData.status,
          };
          if (clockOutUtc) {
            patchBody.manual_break_minutes = clockOutUtc ? Math.max(0, breakMinutesTotal) : 0;
          }
          await api('PATCH', `/subcontractors/attendance/${attendanceId}`, patchBody);
          toast.success('Attendance updated');
          await queryClient.invalidateQueries({
            queryKey: ['settings-attendance'],
            exact: false,
          });
          await queryClient.refetchQueries({
            queryKey: ['settings-attendance'],
            exact: false,
          });
          queryClient.invalidateQueries({ queryKey: ['timesheet'], exact: false });
          await queryClient.refetchQueries({ queryKey: ['timesheet'], exact: false });
          setRefreshKey((prev) => prev + 1);
          setShowModal(false);
          resetForm();
        } catch (e: any) {
          toast.error(e?.message || 'Failed to update attendance', { duration: 5000 });
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      if (editingEvent) {
        // NEW MODEL: Update single attendance record with both clock_in_time and clock_out_time
        const attendanceId = editingEvent.clock_in_id || editingEvent.clock_out_id;
        if (!attendanceId) {
          toast.error('Cannot find attendance record to update');
          setIsSubmitting(false);
          return;
        }

        const updatePayload: any = {
          clock_in_time: clockInUtc,
          clock_out_time: clockOutUtc,
          status: formData.status,
          entry_kind: 'clock',
          declared_hours: null,
          // Always include reason_text to allow job editing even when there's a shift_id
          reason_text: reasonText,
        };
        
        // Always send break so clearing a previous break is persisted
        if (clockOutUtc) {
          updatePayload.manual_break_minutes = Math.max(0, breakMinutesTotal);
        }
        
        try {
          await api('PUT', `/settings/attendance/${attendanceId}`, updatePayload);
          
          toast.success('Attendance event updated');
          
          // Invalidate and refetch
          await queryClient.invalidateQueries({
            queryKey: ['settings-attendance'],
            exact: false,
          });
          
          await queryClient.refetchQueries({
            queryKey: ['settings-attendance'],
            exact: false,
          });
          
          setRefreshKey(prev => prev + 1);
          
          setShowModal(false);
          resetForm();
        } catch (e: any) {
          // Show specific error message and keep modal open
          // The api function already extracts the detail from the backend response
          const errorMsg = e.message || 'Failed to update attendance';
          toast.error(errorMsg, { duration: 5000 });
          // Don't close modal - let user fix and retry
          return;
        }
      } else {
        // NEW MODEL: Create attendance records for each selected worker
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const workerId of workersToProcess) {
          const createPayload: any = {
            worker_id: workerId,
            type: clockInUtc && clockOutUtc ? 'in' : (clockInUtc ? 'in' : 'out'), // Type for backward compatibility
            time_selected_utc: clockInUtc || clockOutUtc, // For backward compatibility
            clock_in_time: clockInUtc,
            clock_out_time: clockOutUtc,
            status: formData.status,
            entry_kind: 'clock',
            declared_hours: null,
            reason_text: reasonText,
          };
          
          // Always send break so clearing a previous break is persisted
          if (clockOutUtc) {
            createPayload.manual_break_minutes = Math.max(0, breakMinutesTotal);
          }
          
          try {
            await api('POST', '/settings/attendance/manual', createPayload);
            successCount++;
          } catch (e: any) {
            errorCount++;
            const usersArray = Array.isArray(users) ? users : [];
            const workerName = usersArray.find((u: any) => u.id === workerId)?.name || usersArray.find((u: any) => u.id === workerId)?.username || workerId;
            // The api function already extracts the detail from the backend response
            // e.message contains the backend error message (e.g., "Cannot create attendance: ...")
            let errorMsg = e.message || 'Failed to create attendance';
            
            // If the error message is a conflict message from backend, it's already user-friendly
            // Just add worker name for context if not already in the message
            if (errorMsg.includes('Cannot create attendance') || errorMsg.includes('Cannot update attendance')) {
              // Backend message is already clear and user-friendly, add worker name for context
              errors.push(`${workerName}: ${errorMsg}`);
            } else {
              // For other errors, still add worker name
              errors.push(`${workerName}: ${errorMsg}`);
            }
          }
        }

        if (errorCount > 0) {
          // Show specific error messages
          if (errors.length > 0) {
            // Show the first error (most relevant) as a toast
            toast.error(errors[0], { duration: 5000 });
            // If there are multiple errors, show them all in console and as additional toasts
            if (errors.length > 1) {
              errors.slice(1).forEach((err) => {
                toast.error(err, { duration: 5000 });
              });
            }
          } else {
            toast.error(`${successCount} attendance${successCount > 1 ? 's' : ''} created, ${errorCount} failed.`);
          }
          // Don't close modal or reset form when there are errors - let user fix and retry
          // Only invalidate queries if some succeeded
          if (successCount > 0) {
            await queryClient.invalidateQueries({
              queryKey: ['settings-attendance'],
              exact: false,
            });
            await queryClient.refetchQueries({
              queryKey: ['settings-attendance'],
              exact: false,
            });
            setRefreshKey(prev => prev + 1);
          }
          // Return early - don't close modal or reset form
          return;
        } else {
          toast.success(`${successCount} attendance${successCount > 1 ? 's' : ''} created successfully`);
        }
      }

      // Invalidate and refetch
      await queryClient.invalidateQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });
      
      // Force refetch and wait for it
      await queryClient.refetchQueries({
        queryKey: ['settings-attendance'],
        exact: false,
      });
      
      // Force component re-render
      setRefreshKey(prev => prev + 1);
      
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save attendance event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectsList = Array.isArray(projects) ? projects : [];

  const isSubmitDisabled = useMemo(() => {
    if (isSagePaid(editingEvent?.sage_state, editingEvent?.sage_locked)) return true;
    if (!isCompleteLocalDatetime(formData.clock_in_time)) return true;
    if (editingEvent?.record_kind === 'subcontractor') {
      if (formData.clock_out_time && !isCompleteLocalDatetime(formData.clock_out_time)) return true;
      return !projectsList.some((p) => p.id === formData.job_type);
    }
    if (!isCompleteLocalDatetime(formData.clock_out_time)) return true;
    if (editingEvent) return !formData.worker_id;
    return (Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) === 0;
  }, [editingEvent, formData, projectsList, selectedWorkers]);

  const attendanceLocked = isSagePaid(editingEvent?.sage_state, editingEvent?.sage_locked);
  const isSubcontractorEdit = editingEvent?.record_kind === 'subcontractor';

  const entryGrossMinutes = useMemo(() => {
    if (!isCompleteLocalDatetime(formData.clock_in_time) || !isCompleteLocalDatetime(formData.clock_out_time)) {
      return null;
    }
    const inUtc = toUtcISOString(formData.clock_in_time);
    const outUtc = toUtcISOString(formData.clock_out_time);
    if (!inUtc || !outUtc) return null;
    const minutes = Math.floor((new Date(outUtc).getTime() - new Date(inUtc).getTime()) / 60000);
    return minutes > 0 ? minutes : null;
  }, [formData.clock_in_time, formData.clock_out_time]);

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Attendance"
        subtitle={
          viewMode === 'week'
            ? 'Weekly timesheet — click a cell to add or edit hours'
            : 'Manage all clock-in/out records'
        }
        icon={<Clock className="h-4 w-4" />}
        actions={
          <AppTabs
            value={viewMode}
            onChange={(key) => setViewMode(key as 'list' | 'week')}
            tabs={[
              { key: 'week', label: 'Week' },
              { key: 'list', label: 'List' },
            ]}
          />
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title="Filters"
          description={
            viewMode === 'week'
              ? 'Week view is Sunday–Saturday for internal employees. Use List for subcontractors and bulk delete.'
              : 'Narrow the attendance list by type, worker, project, or date.'
          }
        />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {viewMode === 'list' ? (
          <AppSelect
            label="Record type"
            value={filters.record_kind}
            onChange={(e) =>
              setFilters({
                ...filters,
                record_kind: e.target.value as 'internal' | 'subcontractor' | 'all',
              })
            }
            options={[
              { value: 'internal', label: 'Internal Employees' },
              { value: 'subcontractor', label: 'Subcontractors' },
              { value: 'all', label: 'All' },
            ]}
          />
          ) : null}
          <AppCombobox
            label="Worker"
            value={filters.worker_id}
            onChange={(value) => setFilters({ ...filters, worker_id: value })}
            options={workerFilterOptions}
            placeholder="All Workers"
          />
          <AppProjectSelect
            label="Project"
            value={filters.project_id}
            onChange={(id) => setFilters({ ...filters, project_id: id })}
            allowEmpty
            emptyOptionLabel="All Projects"
          />
          {viewMode === 'list' ? (
          <AppCombobox
            label="Subcontractor company"
            value={filters.subcontractor_company_id}
            onChange={(value) => setFilters({ ...filters, subcontractor_company_id: value })}
            options={companyFilterOptions}
            placeholder="All companies"
          />
          ) : null}
          {viewMode === 'list' ? (
          <AppDatePicker
            label="Start Date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          ) : null}
          {viewMode === 'list' ? (
          <AppDatePicker
            label="End Date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
          ) : null}
          <AppSelect
            label="Status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'approved', label: 'Approved' },
              { value: 'pending', label: 'Pending' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'open', label: 'Open (subcontractor)' },
              { value: 'finalized', label: 'Finalized (subcontractor)' },
            ]}
          />
          {filters.record_kind !== 'subcontractor' ? (
          <AppSelect
            label="Sage"
            value={filters.sage_state}
            onChange={(e) => setFilters({ ...filters, sage_state: e.target.value })}
            options={[
              { value: '', label: 'All Sage statuses' },
              { value: 'none', label: 'Not queued' },
              { value: 'queued', label: 'Queued' },
              { value: 'sent', label: 'In Sage' },
              { value: 'paid', label: 'Paid' },
              { value: 'error', label: 'Sage error' },
            ]}
          />
          ) : null}
        </div>
      </AppCard>

      {error && (
        <div className={uiCx('rounded-xl border border-red-200 bg-red-50 p-3', uiTypography.helper, 'text-red-800')}>
          Error loading attendance records: {String(error)}
        </div>
      )}

      {viewMode === 'list' && canEditAttendance && selectedEvents.size > 0 && (
        <div className={uiCx('flex items-center justify-between rounded-xl border bg-blue-50 p-3')}>
          <div className={uiCx(uiTypography.helper, 'font-medium text-blue-900')}>
            {selectedEvents.size} event(s) selected
          </div>
          <AppButton
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void handleDeleteSelected()}
            disabled={deletingSelected}
            loading={deletingSelected}
          >
            Delete All Selected
          </AppButton>
        </div>
      )}

      {viewMode === 'week' ? (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AttendanceWeekGrid
          weekStart={weekStart}
          onWeekStartChange={setWeekStart}
          employees={weekEmployees}
          entries={attendanceEvents}
          jobLabel={eventJobLabel}
          canEdit={canEditAttendance}
          isLoading={isWeekLoading}
          hoursLoading={viewMode === 'week' && !isEmployeesLoading && (isLoading || attendances == null)}
          onAdd={(workerId, date) => handleOpenModal(undefined, { workerId, date })}
          onEdit={(entry) => {
            const match = attendanceEvents.find((e) => e.event_id === entry.event_id);
            if (match) handleOpenModal(match);
          }}
        />
      </AppCard>
      ) : (
      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className="mt-4 flex flex-col gap-2 overflow-x-auto">
          {canEditAttendance && (
            <AppListCreateItem
              label="New Attendance"
              layout="row"
              className={uiCx('w-full', ATTENDANCE_ADMIN_MIN_WIDTH)}
              onClick={() => handleOpenModal()}
            />
          )}
          {isLoading ? (
            <div className={uiCx(ATTENDANCE_ADMIN_MIN_WIDTH, 'px-4 py-4')}>
              <div className="h-6 animate-pulse rounded bg-gray-100" />
            </div>
          ) : error ? (
            <p className={uiCx(uiTypography.helper, 'px-1 text-red-600')}>Could not load attendance.</p>
          ) : attendanceEvents.length === 0 ? (
            <AppEmptyState
              title="No attendance records found"
              className="border-0 bg-transparent p-0 py-6 shadow-none"
            />
          ) : (
            <AppSortableEntityList layout="flat">
              <AppSortableEntityListHeader variant="flat" gridCols={listGridCols} minWidth={ATTENDANCE_ADMIN_MIN_WIDTH}>
                {canEditAttendance && (
                  <div className="flex w-8 shrink-0 items-center justify-center">
                    <AppCheckboxControl
                      aria-label="Select all attendance records"
                      checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                      onChange={() => handleSelectAll()}
                    />
                  </div>
                )}
                <AppSortableEntityListSortColumn
                  label="Type"
                  column="type"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Worker"
                  column="worker"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Company"
                  column="company"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Clock In"
                  column="clock_in"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Clock Out"
                  column="clock_out"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Job/Project"
                  column="project"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Hours"
                  column="hours"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <AppSortableEntityListSortColumn
                  label="Break"
                  column="break"
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
                  label="Sage"
                  column="sage"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={setSort}
                />
                <div className="min-w-0 w-24" aria-hidden />
              </AppSortableEntityListHeader>
              <AppSortableEntityListFlatBody gridCols={listGridCols} minWidth={ATTENDANCE_ADMIN_MIN_WIDTH}>
                {sortedAttendanceEvents.map((event) => (
                  <AppSortableEntityListRow
                    key={event.event_id}
                    as="div"
                    variant="flat"
                    gridCols={listGridCols}
                    minWidth={ATTENDANCE_ADMIN_MIN_WIDTH}
                    className="group cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewingEvent(event)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setViewingEvent(event);
                      }
                    }}
                  >
                    {canEditAttendance && (
                      <div
                        className="flex w-8 shrink-0 items-center justify-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AppCheckboxControl
                          aria-label="Select attendance record"
                          checked={selectedEvents.has(event.event_id)}
                          onChange={() => handleToggleSelect(event.event_id)}
                        />
                      </div>
                    )}
                    <div className="min-w-0">{recordKindBadge(event)}</div>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>{event.worker_name}</span>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-600')}>
                      {event.subcontractor_company_name || '—'}
                    </span>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                      {event.is_hours_worked ? '—' : event.clock_in_time ? formatDateTime(event.clock_in_time) : '—'}
                    </span>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate text-gray-900')}>
                      {event.is_hours_worked ? '—' : event.clock_out_time ? formatDateTime(event.clock_out_time) : '—'}
                    </span>
                    <span
                      className={uiCx(
                        'min-w-0 truncate text-sm font-semibold text-gray-900 transition-colors group-hover:text-[#7f1010]',
                      )}
                    >
                      {eventJobLabel(event)}
                    </span>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 text-gray-900')}>{formatHours(event.hours_worked)}</span>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 text-gray-900')}>{formatBreak(event.break_minutes)}</span>
                    <div className="min-w-0">{attendanceStatusBadge(event)}</div>
                    <div className="min-w-0">
                      <AttendanceSageBadge
                        state={event.sage_state}
                        recordKind={event.record_kind}
                        error={event.sage_error}
                        empty="dash"
                      />
                    </div>
                    <div className="flex w-24 shrink-0 items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {canEditAttendance && (
                        <>
                          <AppListRowIconButton
                            preset="edit"
                            label={isSagePaid(event.sage_state, event.sage_locked) ? 'View attendance' : 'Edit attendance'}
                            onClick={() => handleOpenModal(event)}
                          />
                          <AppListRowIconButton
                            preset="delete"
                            label="Delete attendance"
                            loading={deletingId === event.event_id}
                            disabled={isSagePaid(event.sage_state, event.sage_locked)}
                            onClick={() => void handleDeleteEvent(event)}
                          />
                        </>
                      )}
                      {event.shift_deleted && (
                        <AppTooltip
                          content={
                            event.shift_deleted_by
                              ? `The shift related to this attendance was deleted by ${event.shift_deleted_by}${event.shift_deleted_at ? ` on ${new Date(event.shift_deleted_at).toLocaleDateString()}` : ''}`
                              : 'The shift related to this attendance was deleted'
                          }
                        >
                          <TriangleAlert className="inline-block h-3 w-3 text-yellow-600" aria-hidden />
                        </AppTooltip>
                      )}
                    </div>
                  </AppSortableEntityListRow>
                ))}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
          )}
        </div>
      </AppCard>
      )}

      <AppFormModal
        open={!!viewingEvent}
        onClose={() => setViewingEvent(null)}
        layout="detail"
        size="md"
        title="Attendance details"
        description={viewingEvent ? `Record ID: ${viewingEvent.event_id}` : undefined}
        quickInfo={scWorkerAttendanceDetailQuickInfo}
        bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setViewingEvent(null)}>
              Close
            </AppButton>
          </div>
        }
      >
        {viewingEvent ? (
          <div className="min-w-0">
            {viewingEvent.record_kind === 'subcontractor' ? (
                    <>
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
                      <DetailField label="Clock in">{formatDateTime(viewingEvent.clock_in_time)}</DetailField>
                      <DetailField label="Clock in by (user)">{viewingEvent.clock_in_confirmed_by || '—'}</DetailField>
                      <DetailField label="Clock out">{formatDateTime(viewingEvent.clock_out_time)}</DetailField>
                      <DetailField label="Clock out by (user)">{viewingEvent.clock_out_confirmed_by || '—'}</DetailField>
                      <DetailField label="Hours worked">{formatHours(viewingEvent.hours_worked)}</DetailField>
                      <DetailField label="Break">{formatBreak(viewingEvent.break_minutes)}</DetailField>
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
                    </>
                  ) : (
                    <>
                      <DetailField label="Worker">{viewingEvent.worker_name}</DetailField>
                      <DetailField label="Company">—</DetailField>
                      <DetailField label="Record type">Internal</DetailField>
                      <DetailField label="Job / project">
                        {eventJobLabel(viewingEvent)}
                      </DetailField>
                      <DetailField label="Project address">{viewingEvent.project_address || '—'}</DetailField>
                      <DetailField label="Status">
                        {viewingEvent.clock_in_status === 'approved' &&
                        (!viewingEvent.clock_out_status || viewingEvent.clock_out_status === 'approved')
                          ? 'Approved'
                          : viewingEvent.clock_in_status === 'pending' || viewingEvent.clock_out_status === 'pending'
                            ? 'Pending'
                            : 'Rejected'}
                      </DetailField>
                      <DetailField label="Sage">
                        <AttendanceSageBadge
                          state={viewingEvent.sage_state}
                          recordKind={viewingEvent.record_kind}
                          error={viewingEvent.sage_error}
                          empty="dash"
                        />
                        {viewingEvent.sage_error ? (
                          <div className="mt-1 text-red-700">{viewingEvent.sage_error}</div>
                        ) : null}
                      </DetailField>
                      <DetailField label="Clock in">
                        {viewingEvent.is_hours_worked ? '—' : formatDateTime(viewingEvent.clock_in_time)}
                      </DetailField>
                      <DetailField label="Clock out">
                        {viewingEvent.is_hours_worked ? '—' : formatDateTime(viewingEvent.clock_out_time)}
                      </DetailField>
                      <DetailField label="Hours worked">{formatHours(viewingEvent.hours_worked)}</DetailField>
                      <DetailField label="Break">{formatBreak(viewingEvent.break_minutes)}</DetailField>
                      <DetailField label="Source">{viewingEvent.source || '—'}</DetailField>
                      {viewingEvent.gps_lat != null && viewingEvent.gps_lng != null ? (
                        <DetailField label="Location">
                          <span className="text-xs">
                            {Number(viewingEvent.gps_lat).toFixed(6)}, {Number(viewingEvent.gps_lng).toFixed(6)}
                            {viewingEvent.gps_accuracy_m != null
                              ? ` · ±${Math.round(viewingEvent.gps_accuracy_m)}m`
                              : ''}
                          </span>
                        </DetailField>
                      ) : null}
                      {(viewingEvent.clock_in_reason || viewingEvent.clock_out_reason) ? (
                        <DetailField label="Notes / reason">
                          <pre className="whitespace-pre-wrap font-sans text-xs">
                            {viewingEvent.clock_in_reason || viewingEvent.clock_out_reason}
                          </pre>
                        </DetailField>
                      ) : null}
                      {viewingEvent.is_hours_worked ? (
                        <DetailField label="Entry mode">Hours worked (no specific clock times)</DetailField>
                      ) : null}
                      <DetailField label="Approved at">{formatDateTime(viewingEvent.approved_at)}</DetailField>
                      <DetailField label="Approved by (user id)">{viewingEvent.approved_by || '—'}</DetailField>
                      {viewingEvent.shift_deleted ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 mt-2">
                          Linked shift was deleted
                          {viewingEvent.shift_deleted_by ? ` by ${viewingEvent.shift_deleted_by}` : ''}
                          {viewingEvent.shift_deleted_at
                            ? ` on ${new Date(viewingEvent.shift_deleted_at).toLocaleString()}`
                            : ''}
                        </div>
                      ) : null}
                    </>
                  )}
          </div>
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={showModal}
        onClose={closeAttendanceModal}
        formWidth="comfortable"
        title={
          attendanceLocked
            ? 'Attendance (locked)'
            : editingEvent
              ? 'Edit attendance'
              : 'New attendance'
        }
        description={
          attendanceLocked
            ? SAGE_PAID_MESSAGE
            : editingEvent
              ? isSubcontractorEdit
                ? 'Update project, clock times, and approval.'
                : `Change job, hours, break, or approval${editingEvent.worker_name ? ` for ${editingEvent.worker_name}` : ''}.`
              : 'Add hours for one or more employees.'
        }
        quickInfo={
          isSubcontractorEdit
            ? scWorkerManualAttendanceQuickInfo(true)
            : attendanceManualEntryQuickInfo(!!editingEvent)
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
            <div>
              {editingEvent && !attendanceLocked ? (
                <AppButton
                  type="button"
                  variant="danger"
                  size="sm"
                  loading={deletingId === editingEvent.event_id}
                  disabled={Boolean(deletingId)}
                  onClick={() => void handleDeleteEvent(editingEvent)}
                >
                  Delete
                </AppButton>
              ) : null}
            </div>
            <div className={uiCx(uiLayout.actionsRow)}>
              <AppButton type="button" variant="secondary" size="sm" onClick={closeAttendanceModal}>
                Cancel
              </AppButton>
              <AppButton
                type="button"
                size="sm"
                disabled={isSubmitDisabled}
                loading={isSubmitting}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting
                  ? 'Saving...'
                  : attendanceLocked
                    ? 'Locked'
                    : editingEvent
                      ? 'Update'
                      : 'Create'}
              </AppButton>
            </div>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          {attendanceLocked ? (
            <div className={uiCx(uiRadius.control, uiBorders.subtle, uiColors.surfaceSubtle, 'p-3', uiTypography.helper, 'text-gray-800')}>
              {SAGE_PAID_MESSAGE}
            </div>
          ) : null}
          {editingEvent?.sage_state === 'error' && editingEvent.sage_error ? (
            <div className={uiCx(uiRadius.control, 'border border-red-200 bg-red-50 p-3', uiTypography.helper, 'text-red-800')}>
              {editingEvent.sage_error}
            </div>
          ) : null}
          <AttendanceTotalHoursField
            clockIn={formData.clock_in_time}
            clockOut={formData.clock_out_time}
            grossMinutes={entryGrossMinutes}
            breakMinutes={breakMinutesTotal}
          />
          {editingEvent ? (
            editingEvent.record_kind === 'subcontractor' ? (
              <AppReadOnlyField
                label="Subcontractor worker"
                value={
                  <>
                    {editingEvent.worker_name}
                    {editingEvent.subcontractor_company_name ? (
                      <span className="font-normal text-gray-500"> · {editingEvent.subcontractor_company_name}</span>
                    ) : null}
                  </>
                }
              />
            ) : (
              <AppUserSelect
                label="Worker"
                users={employeeUsers}
                value={formData.worker_id}
                onChange={() => undefined}
                disabled
                helperText="Worker cannot be changed. Delete this row and add a new one for a different person."
                fieldHint="Worker\n\nEmployee this attendance row belongs to."
              />
            )
          ) : (
            <AppUserSelect
              mode="multiple"
              label="Workers *"
              users={employeeUsers}
              value={selectedWorkers}
              onChange={setSelectedWorkers}
              placeholder="Select workers..."
              helperText="The same hours are created for everyone you select."
              fieldHint="Workers\n\nOne or more internal employees to create the same attendance row for."
            />
          )}
          {isSubcontractorEdit ? (
            <AppProjectSelect
              label="Project *"
              value={formData.job_type}
              onChange={(id) => setFormData({ ...formData, job_type: id })}
              disabled={attendanceLocked}
              fieldHint="Project\n\nJob site where this subcontractor worker was on site."
            />
          ) : (
            <JobSearchCombobox
              value={formData.job_type}
              onChange={(jobId) => setFormData((prev) => ({ ...prev, job_type: jobId || '0' }))}
              disabled={attendanceLocked}
              fieldHint="Job\n\nProject or office job (Shop, Repairs, Stat Holiday) this row applies to. Type to search."
            />
          )}
          <LocalDateTimeFields
            key={`clock-in-${editingEvent?.event_id ?? 'new'}`}
            label="Clock in"
            value={formData.clock_in_time}
            onChange={(next) => setFormData((prev) => applyClockInKeepingLinkedOutDate(prev, next))}
            required
            disabled={attendanceLocked}
            dateFieldHint="Clock-in date\n\nWork day for this row. Changing it also moves clock out when both were on the same day."
            timeFieldHint="Clock-in time\n\nStart of the shift. New rows start at 8:00 AM."
          />
          <LocalDateTimeFields
            key={`clock-out-${editingEvent?.event_id ?? 'new'}`}
            label="Clock out"
            value={formData.clock_out_time}
            onChange={(next) => setFormData((prev) => ({ ...prev, clock_out_time: next }))}
            required
            disabled={attendanceLocked}
            dateFieldHint="Clock-out date\n\nStays on the same day as clock in unless you change it here."
            timeFieldHint="Clock-out time\n\nEnd of the shift. New rows start at 4:00 PM."
          />
          <AttendanceBreakField
            minutes={breakMinutesTotal}
            custom={breakCustom}
            disabled={attendanceLocked}
            onChange={(minutes, custom) => {
              setBreakMinutesTotal(minutes);
              setBreakCustom(custom);
            }}
          />
          {editingEvent ? (
            <AttendanceStatusField
              value={formData.status}
              disabled={attendanceLocked}
              onChange={(status) => setFormData((prev) => ({ ...prev, status }))}
            />
          ) : null}
        </div>
      </AppFormModal>
    </div>
  );
}

