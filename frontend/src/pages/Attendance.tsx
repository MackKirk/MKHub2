import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Clock, TriangleAlert } from 'lucide-react';
import { api, withFileAccessToken } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import { isCompleteLocalDatetime, LocalDateTimeFields } from '@/components/LocalDateTimeFields';
import {
  scWorkerAttendanceDetailQuickInfo,
  scWorkerManualAttendanceQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
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
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  AppTooltip,
  AppUserSelect,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  sortListByAppColumn,
  useLocalAppListSort,
} from '@/components/ui';


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
};

type User = {
  id: string;
  username: string;
  name?: string;
};

type Project = {
  id: string;
  code?: string;
  name: string;
};

const PREDEFINED_JOBS = [
  { id: '0', code: '0', name: 'No Project Assigned' },
  { id: '37', code: '37', name: 'Repairs' },
  { id: '47', code: '47', name: 'Shop' },
  { id: '53', code: '53', name: 'YPK Developments' },
  { id: '136', code: '136', name: 'Stat Holiday' },
];

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

const ATTENDANCE_ADMIN_GRID = 'grid-cols-[32px_3fr_4fr_4fr_4fr_4fr_5fr_3fr_3fr_3fr_auto]';
const ATTENDANCE_ADMIN_GRID_READONLY = 'grid-cols-[3fr_4fr_4fr_4fr_4fr_5fr_3fr_3fr_3fr_auto]';
const ATTENDANCE_ADMIN_MIN_WIDTH = 'min-w-[1100px]';

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
      // For "hours worked", store the date (not time) so we can use it for editing
      clock_in_time: isHoursWorked && att.clock_in_time
        ? formatDateLocal(new Date(att.clock_in_time)) + 'T00:00:00Z'
        : att.clock_in_time || null,
      clock_in_status: att.clock_in_time
        ? att.record_kind === 'subcontractor'
          ? ((att as Attendance).hr_status || 'approved').toLowerCase()
          : att.status
        : null,
      clock_in_reason: att.clock_in_time ? att.reason_text : null,
      clock_out_id: att.clock_out_time ? att.id : null,
      // For "hours worked", store the date (not time) so we can use it for editing
      clock_out_time: isHoursWorked && att.clock_out_time
        ? formatDateLocal(new Date(att.clock_out_time)) + 'T00:00:00Z'
        : att.clock_out_time || null,
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
  const [filters, setFilters] = useState({
    worker_id: '',
    start_date: '',
    end_date: '',
    status: '',
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
    entry_mode: 'time' as 'time' | 'hours',
    hours_worked: '',
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Manual break time
  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');
  

  // Build query string for filters
  const queryParams = new URLSearchParams();
  if (filters.worker_id) queryParams.set('worker_id', filters.worker_id);
  if (filters.start_date) queryParams.set('start_date', filters.start_date);
  if (filters.end_date) queryParams.set('end_date', filters.end_date);
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.record_kind) queryParams.set('record_kind', filters.record_kind);
  if (filters.subcontractor_company_id) queryParams.set('subcontractor_company_id', filters.subcontractor_company_id);
  if (filters.project_id) queryParams.set('project_id', filters.project_id);
  const queryString = queryParams.toString();
  const url = queryString
    ? `/settings/attendance/list?${queryString}`
    : '/settings/attendance/list';

  const { data: attendances, isLoading, error, refetch } = useQuery({
    queryKey: ['settings-attendance', queryString, refreshKey],
    queryFn: async () => {
      const result = await api<Attendance[]>('GET', url);
      // Ensure result is always an array
      return Array.isArray(result) ? result : [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['attendance-projects'],
    queryFn: async () => {
      const result = await api<Project[]>('GET', '/projects');
      return Array.isArray(result) ? result : [];
    },
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
  });

  const { data: users } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const result = await api<any[]>('GET', '/employees');
      return Array.isArray(result) ? result : [];
    },
  });

  const attendanceEvents = useMemo(
    () => buildEvents(Array.isArray(attendances) ? attendances : [], Array.isArray(projects) ? projects : []),
    [attendances, projects]
  );

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
    }));
  }, [users]);

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
    (event: AttendanceEvent) =>
      event.shift_id
        ? event.project_name || event.job_name || 'No Project'
        : event.job_name ||
          event.project_name ||
          (event.job_type ? jobOptions.find((j) => j.id === event.job_type)?.name || 'Unknown' : 'No Project'),
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
    | 'status';
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
      entry_mode: 'time',
      hours_worked: '',
    });
    setSelectedWorkers([]);
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
    setEditingEvent(null);
  };

  const handleOpenModal = (event?: AttendanceEvent) => {
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
          entry_mode: 'time',
          hours_worked: '',
        });
        if (event.break_minutes && event.break_minutes > 0) {
          const breakH = Math.floor(event.break_minutes / 60);
          const breakM = event.break_minutes % 60;
          setInsertBreakTime(true);
          setBreakHours(String(breakH));
          setBreakMinutes(String(breakM).padStart(2, '0'));
        } else {
          setInsertBreakTime(false);
          setBreakHours('0');
          setBreakMinutes('0');
        }
        setShowModal(true);
        return;
      }

      // Detect if this event was created as "hours worked"
      const isHoursWorked = event.is_hours_worked || 
        (event.clock_in_reason && event.clock_in_reason.includes('HOURS_WORKED:')) ||
        (event.clock_out_reason && event.clock_out_reason.includes('HOURS_WORKED:'));
      
      // Extract hours_worked value if it's a "hours worked" entry
      let hoursWorkedValue = '';
      if (isHoursWorked) {
        const reason = event.clock_in_reason || event.clock_out_reason || '';
        const parts = reason.split('|');
        for (const part of parts) {
          if (part.startsWith('HOURS_WORKED:')) {
            hoursWorkedValue = part.replace('HOURS_WORKED:', '');
            break;
          }
        }
      }
      
      // For "hours worked" entries, extract only the date part (no time)
      // We now store the date in clock_in_time even for "hours worked" entries
      let clockInTimeValue = '';
      if (isHoursWorked) {
        // For "hours worked", clock_in_time contains the date at midnight (YYYY-MM-DDT00:00:00Z)
        // Extract date part and format for date input
        if (event.clock_in_time) {
          const datePart = formatDateLocal(new Date(event.clock_in_time));
          clockInTimeValue = `${datePart}T00:00`; // Set to midnight for date input
        } else if (event.clock_out_time) {
          // Fallback to clock_out_time if clock_in_time is not available
          const datePart = formatDateLocal(new Date(event.clock_out_time));
          clockInTimeValue = `${datePart}T00:00`;
        }
      } else {
        clockInTimeValue = toLocalInputValue(event.clock_in_time);
      }
      
      // Determine job_type: use project_id if available (from shift), otherwise use job_type from reason_text
      const jobTypeForForm = event.project_id || event.job_type || '0';
      
      setFormData({
        worker_id: event.worker_id,
        job_type: jobTypeForForm,
        clock_in_time: clockInTimeValue,
        clock_out_time: toLocalInputValue(event.clock_out_time),
        status: event.clock_in_status || 'approved',
        entry_mode: isHoursWorked ? 'hours' : 'time',
        hours_worked: hoursWorkedValue,
      });
      
      // Load manual break time if exists
      if (event.break_minutes && event.break_minutes > 0) {
        const breakH = Math.floor(event.break_minutes / 60);
        const breakM = event.break_minutes % 60;
        setInsertBreakTime(true);
        setBreakHours(String(breakH));
        setBreakMinutes(String(breakM).padStart(2, '0'));
      } else {
        setInsertBreakTime(false);
        setBreakHours('0');
        setBreakMinutes('0');
      }
    } else {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset();
      const local = new Date(now.getTime() - tzOffset * 60000)
        .toISOString()
        .slice(0, 16);
      setEditingEvent(null);
      setFormData({
        worker_id: '',
        job_type: '0',
        clock_in_time: local,
        clock_out_time: '',
        status: 'approved',
        entry_mode: 'time',
        hours_worked: '',
      });
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
    }
    setShowModal(true);
  };

  const handleDeleteEvent = async (event: AttendanceEvent) => {
    setViewingEvent(null);
    const result = await confirm({
      title: 'Delete Attendance Event',
      message: 'Are you sure you want to delete this attendance event (clock-in/out)? This action cannot be undone.',
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

    // Validation rules differ for new vs edit and for entry mode
    if (editingEvent) {
      if (!formData.clock_in_time) {
        toast.error('Clock-in time is required');
        setIsSubmitting(false);
        return;
      }
    } else {
      if (formData.entry_mode === 'time') {
        if (!formData.clock_in_time || !formData.clock_out_time) {
          toast.error('Clock-in and clock-out times are required');
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!formData.clock_in_time) {
          toast.error('Clock-in time is required when using hours worked');
          setIsSubmitting(false);
          return;
        }
        const hours = parseFloat(formData.hours_worked || '0');
        if (!formData.hours_worked || isNaN(hours) || hours <= 0) {
          toast.error('Please enter a valid number of hours worked');
          setIsSubmitting(false);
          return;
        }
      }
    }

    let clockInUtc = toUtcISOString(formData.clock_in_time);
    let clockOutUtc = toUtcISOString(formData.clock_out_time);

    // Validate that clock-out time is not before or equal to clock-in time
    if (clockInUtc && clockOutUtc) {
      const clockInDate = new Date(clockInUtc);
      const clockOutDate = new Date(clockOutUtc);
      if (clockOutDate <= clockInDate) {
        toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
        setIsSubmitting(false);
        return;
      }
      
      // Validate break time: break cannot be greater than or equal to total time
      if (insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
        const totalMinutes = Math.floor((clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60));
        
        if (breakTotalMinutes >= totalMinutes) {
          toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
          setIsSubmitting(false);
          return;
        }
      }
    }

    // When using "hours worked" (both create and edit), auto-calculate clock-out
    // and mark with HOURS_WORKED in reason_text
    let reasonText = `JOB_TYPE:${formData.job_type}`;
    if (formData.entry_mode === 'hours' && formData.clock_in_time) {
      const hours = parseFloat(formData.hours_worked || '0');
      if (hours > 0) {
        // Extract date part and ensure it's at midnight local time
        const datePart = formData.clock_in_time.slice(0, 10); // YYYY-MM-DD
        const midnightLocal = `${datePart}T00:00`;
        
        // Convert to UTC
        clockInUtc = toUtcISOString(midnightLocal);
        
        if (clockInUtc) {
          // Set clock-out to clock-in + hours
          const inDate = new Date(clockInUtc);
          const outDate = new Date(inDate.getTime() + hours * 3600000);
          clockOutUtc = outDate.toISOString();
        }
        
        // Add HOURS_WORKED marker to reason_text
        reasonText = `JOB_TYPE:${formData.job_type}|HOURS_WORKED:${hours}`;
      }
    }

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
            patchBody.manual_break_minutes = insertBreakTime
              ? parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10)
              : 0;
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
          // Always include reason_text to allow job editing even when there's a shift_id
          reason_text: reasonText,
        };
        
        // Add manual break time if checkbox is checked and clock_out_time exists
        if (clockOutUtc && insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          updatePayload.manual_break_minutes = breakTotalMinutes;
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
        // For "hours worked", we MUST have both clock-in and clock-out
        if (formData.entry_mode === 'hours' && !clockOutUtc) {
          toast.error('Failed to calculate clock-out time for hours worked entry');
          setIsSubmitting(false);
          return;
        }

        // Create attendance for each selected worker
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
            reason_text: reasonText,
          };
          
          // Add manual break time if checkbox is checked and clock_out_time exists
          if (clockOutUtc && insertBreakTime) {
            const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
            createPayload.manual_break_minutes = breakTotalMinutes;
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
    if (editingEvent?.record_kind === 'subcontractor') {
      return !isCompleteLocalDatetime(formData.clock_in_time) || !projectsList.some((p) => p.id === formData.job_type);
    }
    if (editingEvent) {
      if (formData.entry_mode === 'time') {
        if (!isCompleteLocalDatetime(formData.clock_in_time)) return true;
        return !formData.worker_id;
      }
      if (!formData.clock_in_time?.slice(0, 10)) return true;
      const hours = parseFloat(formData.hours_worked || '0');
      return !formData.worker_id || !formData.hours_worked || Number.isNaN(hours) || hours <= 0;
    }
    if ((Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) === 0) return true;
    if (formData.entry_mode === 'time') {
      if (!isCompleteLocalDatetime(formData.clock_in_time)) return true;
      return !isCompleteLocalDatetime(formData.clock_out_time);
    }
    if (!formData.clock_in_time?.slice(0, 10)) return true;
    const hours = parseFloat(formData.hours_worked || '0');
    return !formData.hours_worked || Number.isNaN(hours) || hours <= 0;
  }, [editingEvent, formData, projectsList, selectedWorkers]);

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Attendance"
        subtitle="Manage all clock-in/out records"
        icon={<Clock className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader title="Filters" description="Narrow the attendance list by type, worker, project, or date." />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <AppCombobox
            label="Subcontractor company"
            value={filters.subcontractor_company_id}
            onChange={(value) => setFilters({ ...filters, subcontractor_company_id: value })}
            options={companyFilterOptions}
            placeholder="All companies"
          />
          <AppDatePicker
            label="Start Date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
          <AppDatePicker
            label="End Date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
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
        </div>
      </AppCard>

      {error && (
        <div className={uiCx('rounded-xl border border-red-200 bg-red-50 p-3', uiTypography.helper, 'text-red-800')}>
          Error loading attendance records: {String(error)}
        </div>
      )}

      {canEditAttendance && selectedEvents.size > 0 && (
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

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader title="Records" description="Click a row to view details. Use checkboxes for bulk delete." />
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
                    <div className="flex w-24 shrink-0 items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {canEditAttendance && (
                        <>
                          <AppListRowIconButton
                            preset="edit"
                            label="Edit attendance"
                            onClick={() => handleOpenModal(event)}
                          />
                          <AppListRowIconButton
                            preset="delete"
                            label="Delete attendance"
                            loading={deletingId === event.event_id}
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
                        {viewingEvent.shift_id
                          ? viewingEvent.project_name || viewingEvent.job_name || 'No Project'
                          : viewingEvent.job_name ||
                            viewingEvent.project_name ||
                            (viewingEvent.job_type
                              ? jobOptions.find((j) => j.id === viewingEvent.job_type)?.name || 'Unknown'
                              : 'No Project')}
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
        title={editingEvent ? 'Edit Attendance Event' : 'New Attendance'}
        description={
          editingEvent
            ? editingEvent.record_kind === 'subcontractor'
              ? 'Update project and clock times (subcontractor attendance).'
              : 'Update clock-in/out and status'
            : 'Add manual clock-in/out or hours worked'
        }
        quickInfo={scWorkerManualAttendanceQuickInfo(!!editingEvent)}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
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
              {isSubmitting ? 'Saving...' : editingEvent ? 'Update' : 'Create'}
            </AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
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
                label="Worker *"
                users={employeeUsers}
                value={formData.worker_id}
                onChange={(userId) => setFormData({ ...formData, worker_id: userId })}
                placeholder="Select a worker..."
                fieldHint="Worker\n\nEmployee this attendance row applies to."
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
              fieldHint="Workers\n\nOne or more internal employees to create the same attendance row for."
            />
          )}
          {editingEvent?.record_kind === 'subcontractor' ? (
            <AppProjectSelect
              label="Project *"
              value={formData.job_type}
              onChange={(id) => setFormData({ ...formData, job_type: id })}
              fieldHint="Project\n\nJob site where this subcontractor worker was on site."
            />
          ) : (
            <AppSelect
              label="Job *"
              value={formData.job_type}
              onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
              fieldHint="Job\n\nProject or job code this attendance row applies to."
              options={jobOptions.map((job) => ({
                value: job.id,
                label: `${job.code} - ${job.name}`,
              }))}
            />
          )}
          <div>
            <AppControlLabelRow
              label="Entry Type"
              fieldHint={
                <AppFieldHint hint="Entry type\n\nClock in / out — enter start and end times. Hours worked — enter total hours for one work date." />
              }
            />
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-xs">
              <AppButton
                type="button"
                variant={formData.entry_mode === 'time' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0 shadow-none"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    entry_mode: 'time',
                    hours_worked: '',
                  }));
                }}
              >
                Clock In / Out
              </AppButton>
              <AppButton
                type="button"
                variant={formData.entry_mode === 'hours' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-gray-200 shadow-none"
                onClick={() => {
                  setFormData((prev) => {
                    const datePart = prev.clock_in_time ? prev.clock_in_time.slice(0, 10) : getTodayLocal();
                    let hoursWorked = '';
                    if (prev.clock_in_time && prev.clock_out_time) {
                      const inTime = new Date(prev.clock_in_time);
                      const outTime = new Date(prev.clock_out_time);
                      const diffMs = outTime.getTime() - inTime.getTime();
                      const diffHours = diffMs / (1000 * 60 * 60);
                      if (diffHours > 0) hoursWorked = diffHours.toString();
                    }
                    return {
                      ...prev,
                      entry_mode: 'hours',
                      clock_in_time: `${datePart}T00:00`,
                      clock_out_time: '',
                      hours_worked: hoursWorked,
                    };
                  });
                }}
              >
                Hours Worked
              </AppButton>
            </div>
          </div>
          {formData.entry_mode === 'time' ? (
            <LocalDateTimeFields
              key={`clock-in-${editingEvent?.event_id ?? 'new'}`}
              label="Clock in"
              value={formData.clock_in_time}
              onChange={(next) => setFormData((prev) => ({ ...prev, clock_in_time: next }))}
              required
              dateFieldHint="Clock-in date\n\nDay the employee started on site."
              timeFieldHint="Clock-in time\n\nLocal time when the employee clocked in (5-minute steps)."
            />
          ) : (
            <AppDatePicker
              label="Work Date *"
              value={formData.clock_in_time ? formData.clock_in_time.slice(0, 10) : ''}
              onChange={(e) => {
                const date = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  clock_in_time: date ? `${date}T00:00` : '',
                }));
              }}
              fieldHint="Work date\n\nCalendar day when the hours were worked."
              required
            />
          )}
          {formData.entry_mode === 'time' && (
            <>
              <LocalDateTimeFields
                key={`clock-out-${editingEvent?.event_id ?? 'new'}`}
                label="Clock out"
                value={formData.clock_out_time}
                onChange={(next) => setFormData((prev) => ({ ...prev, clock_out_time: next }))}
                required={!editingEvent}
                dateFieldHint="Clock-out date\n\nDay the employee finished on site."
                timeFieldHint="Clock-out time\n\nLocal time when the employee clocked out. Must be after clock-in."
              />
              <div>
                <AppCheckbox
                  label="Insert break time"
                  fieldHint="Insert break time\n\nSubtract unpaid break minutes from the total session time."
                  checked={insertBreakTime}
                  onChange={setInsertBreakTime}
                />
                {insertBreakTime && (
                  <div className="flex flex-wrap items-end gap-3 pl-8">
                    <AppSelect
                      className="min-w-[100px] flex-1"
                      label="Hours"
                      value={breakHours}
                      onChange={(e) => setBreakHours(e.target.value)}
                      options={Array.from({ length: 3 }, (_, i) => ({
                        value: String(i),
                        label: String(i),
                      }))}
                    />
                    <AppSelect
                      className="min-w-[100px] flex-1"
                      label="Minutes"
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(e.target.value)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const m = i * 5;
                        const v = String(m).padStart(2, '0');
                        return { value: v, label: v };
                      })}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          {formData.entry_mode === 'hours' && (
            <>
              <AppInput
                label="Hours Worked *"
                type="number"
                min={0}
                step="0.25"
                value={formData.hours_worked}
                onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                placeholder="e.g. 8"
                fieldHint="Hours worked\n\nTotal hours for the work date (e.g. 8 for a full day)."
                required
              />
              <div>
                <AppCheckbox label="Insert break time" checked={insertBreakTime} onChange={setInsertBreakTime} />
                {insertBreakTime && (
                  <div className="flex flex-wrap items-end gap-3 pl-8">
                    <AppSelect
                      className="min-w-[100px] flex-1"
                      label="Hours"
                      value={breakHours}
                      onChange={(e) => setBreakHours(e.target.value)}
                      options={Array.from({ length: 3 }, (_, i) => ({
                        value: String(i),
                        label: String(i),
                      }))}
                    />
                    <AppSelect
                      className="min-w-[100px] flex-1"
                      label="Minutes"
                      value={breakMinutes}
                      onChange={(e) => setBreakMinutes(e.target.value)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const m = i * 5;
                        const v = String(m).padStart(2, '0');
                        return { value: v, label: v };
                      })}
                    />
                  </div>
                )}
              </div>
            </>
          )}
          {editingEvent && (
            <AppSelect
              label="Status *"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              fieldHint="Status\n\nApproval state for this row (approved, pending, or rejected)."
              options={[
                { value: 'approved', label: 'Approved' },
                { value: 'pending', label: 'Pending' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
          )}
        </div>
      </AppFormModal>
    </div>
  );
}

