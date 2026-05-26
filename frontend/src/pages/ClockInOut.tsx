import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import { ClockActionTile } from '@/components/ClockActionTile';
import { ClockInOutModalLayer } from '@/components/ClockInOutModalLayer';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppHeroEditButton,
  AppModal,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

// Helper to format date as "Mon dd" (e.g., "Dec 23")
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function attendanceBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  return 'danger';
}

type Shift = {
  id: string;
  project_id: string;
  project_name?: string;
  worker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  job_name?: string;
};

type Attendance = {
  id: string;
  shift_id: string | null;
  type?: 'in' | 'out'; // For backward compatibility, but not used in new model
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  time_selected_utc?: string | null; // For backward compatibility
  reason_text?: string;
  job_type?: string; // Extracted job_type from backend (for direct attendance)
  break_minutes?: number | null; // Break time in minutes
};

type Project = {
  id: string;
  name: string;
  code?: string;
};

type WeeklySummaryDay = {
  date: string;
  day_name: string;
  clock_in: string | null;
  clock_out: string | null;
  clock_in_status: string | null;
  clock_out_status: string | null;
  job_type: string | null;
  job_name: string;
  hours_worked_minutes: number;
  hours_worked_formatted: string;
  break_minutes?: number;
  break_formatted?: string | null;
  worker_name?: string;  // Optional worker name for attendance summary modal
  shift_deleted?: boolean;
  shift_deleted_by?: string | null;
  shift_deleted_at?: string | null;
};

type WeeklySummary = {
  week_start: string;
  week_end: string;
  days: WeeklySummaryDay[];
  total_minutes: number;
  total_hours_formatted: string;
  reg_minutes?: number;
  reg_hours_formatted?: string;
  total_break_minutes?: number;
  total_break_formatted?: string;
};

// Predefined job options
const PREDEFINED_JOBS = [
  { id: '0', code: '0', name: 'No Project Assigned' },
  { id: '37', code: '37', name: 'Repairs' },
  { id: '47', code: '47', name: 'Shop' },
  { id: '53', code: '53', name: 'YPK Developments' },
  { id: '136', code: '136', name: 'Stat Holiday' },
];

export default function ClockInOut() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;

  // Get query params for auto-opening modal from Schedule page
  const shiftIdFromUrl = searchParams.get('shift_id');
  const typeFromUrl = searchParams.get('type') as 'in' | 'out' | null;
  const dateFromUrl = searchParams.get('date');
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Use date from URL if provided, otherwise use today
    if (dateFromUrl) {
      return dateFromUrl;
    }
    const today = new Date();
    return formatDateLocal(today);
  });
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [isTodayStatusExpanded, setIsTodayStatusExpanded] = useState(true);

  // Edit attendance states
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null);
  const [editingType, setEditingType] = useState<'in' | 'out' | null>(null);
  const [editTime, setEditTime] = useState<string>('');
  const [editHour12, setEditHour12] = useState<string>('');
  const [editMinute, setEditMinute] = useState<string>('');
  const [editAmPm, setEditAmPm] = useState<'AM' | 'PM'>('AM');
  const [editInsertBreakTime, setEditInsertBreakTime] = useState<boolean>(false);
  const [editBreakHours, setEditBreakHours] = useState<string>('0');
  const [editBreakMinutes, setEditBreakMinutes] = useState<string>('0');
  const [editingSubmitting, setEditingSubmitting] = useState(false);

  // Edit break time only states
  const [editingBreakTimeAttendance, setEditingBreakTimeAttendance] = useState<Attendance | null>(null);
  const [editBreakTimeOnly, setEditBreakTimeOnly] = useState<boolean>(false);
  const [editBreakTimeHours, setEditBreakTimeHours] = useState<string>('0');
  const [editBreakTimeMinutes, setEditBreakTimeMinutes] = useState<string>('0');
  const [editingBreakTimeSubmitting, setEditingBreakTimeSubmitting] = useState(false);

  // Calculate current week (Sunday to Saturday)
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day; // Go to Sunday
    const sunday = new Date(today.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  });

  const weekStartStr = useMemo(() => formatDateLocal(weekStart), [weekStart]);

  // Get today's date string
  const todayStr = useMemo(() => {
    const today = new Date();
    return formatDateLocal(today);
  }, []);

  // Fetch current user
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 0, // Always fetch fresh data to ensure permissions are up to date
  });

  // Fetch shift by ID if shift_id is provided in URL (must be before selectedDateShift)
  const { data: shiftById } = useQuery({
    queryKey: ['shift-by-id', shiftIdFromUrl],
    queryFn: () => {
      if (!shiftIdFromUrl) return Promise.resolve(null);
      return api<Shift>('GET', `/dispatch/shifts/${shiftIdFromUrl}`);
    },
    enabled: !!shiftIdFromUrl,
  });

  // Fetch scheduled shifts for selected date
  const { data: shiftsForSelectedDate = [] } = useQuery({
    queryKey: ['clock-in-out-shifts', selectedDate, currentUser?.id],
    queryFn: () => {
      if (!currentUser?.id) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${selectedDate},${selectedDate}&worker_id=${currentUser.id}&status=scheduled`);
    },
    enabled: !!currentUser?.id,
  });

  // Filter only scheduled shifts
  const scheduledShifts = useMemo(() => {
    return shiftsForSelectedDate.filter(s => s.status === 'scheduled');
  }, [shiftsForSelectedDate]);

  // Get the shift for selected date - prefer shift from URL if available
  const selectedDateShift = useMemo(() => {
    // If we have a shift from URL, use it
    if (shiftById && shiftById.date === selectedDate) {
      return shiftById;
    }
    // Otherwise, use the first scheduled shift for selected date
    return scheduledShifts.length > 0 ? scheduledShifts[0] : null;
  }, [scheduledShifts, shiftById, selectedDate]);

  // Fetch attendances for selected date's shift (if scheduled)
  const { data: attendances = [], refetch: refetchAttendances } = useQuery({
    queryKey: ['clock-in-out-attendances', selectedDateShift?.id],
    queryFn: () => {
      if (!selectedDateShift?.id) return Promise.resolve([]);
      return api<Attendance[]>('GET', `/dispatch/shifts/${selectedDateShift.id}/attendance`);
    },
    enabled: !!selectedDateShift?.id,
  });

  // Fetch all attendances for selected date (scheduled + direct)
  // Also store shifts for mapping shift_id to project
  const { data: allAttendancesData, refetch: refetchAllAttendances } = useQuery({
    queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [], shifts: [] };
      
      const allAttendances: Attendance[] = [];
      
      // Get attendances for scheduled shifts on this date
      const shifts = await api<Shift[]>('GET', `/dispatch/shifts?date_range=${selectedDate},${selectedDate}&worker_id=${currentUser.id}`);
      const scheduledAttendances = await Promise.all(
        (shifts || []).map(async (shift: Shift) => {
          try {
            return await api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`);
          } catch {
            return [];
          }
        })
      );
      allAttendances.push(...scheduledAttendances.flat());
      
      // Get direct attendances (no shift) for this date
      try {
        const directAttendances = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${selectedDate}`);
        allAttendances.push(...directAttendances);
      } catch {
        // If endpoint doesn't exist yet, continue without direct attendances
      }
      
      return { attendances: allAttendances, shifts: shifts || [] };
    },
    enabled: !!currentUser?.id,
  });

  const allAttendancesForDate = allAttendancesData?.attendances || [];
  const allShiftsForDate = allAttendancesData?.shifts || [];

  // Create a map of shift_id to shift for quick lookup
  const shiftsMap = useMemo(() => {
    const map = new Map<string, Shift>();
    // Add shifts from shiftsForSelectedDate
    shiftsForSelectedDate.forEach(shift => {
      map.set(shift.id, shift);
    });
    // Add shifts from allShiftsForDate (from allAttendancesData)
    allShiftsForDate.forEach(shift => {
      map.set(shift.id, shift);
    });
    // Add shiftById if available
    if (shiftById) {
      map.set(shiftById.id, shiftById);
    }
    return map;
  }, [shiftsForSelectedDate, allShiftsForDate, shiftById]);

  // Fetch project details when a shift is selected
  const { data: project } = useQuery({
    queryKey: ['project', selectedDateShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${selectedDateShift?.project_id}`),
    enabled: !!selectedDateShift?.project_id,
  });

  // Fetch employees list for worker and supervisor names
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  // Fetch worker's employee profile to get supervisor
  const { data: workerProfile } = useQuery({
    queryKey: ['worker-profile', selectedDateShift?.worker_id],
    queryFn: () => api<any>('GET', `/users/${selectedDateShift?.worker_id}`),
    enabled: !!selectedDateShift?.worker_id,
  });

  // NEW MODEL: Each attendance record is already a complete event
  // Find all attendances with clock_in_time (for clock-in display)
  // and all attendances with clock_out_time (for clock-out display)
  const clockIns = useMemo(() => {
    return allAttendancesForDate
      .filter(a => a.clock_in_time !== null && a.clock_in_time !== undefined)
      .sort((a, b) => {
        const aTime = a.clock_in_time || a.time_selected_utc || '';
        const bTime = b.clock_in_time || b.time_selected_utc || '';
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }, [allAttendancesForDate]);

  const clockOuts = useMemo(() => {
    return allAttendancesForDate
      .filter(a => a.clock_out_time !== null && a.clock_out_time !== undefined)
      .sort((a, b) => {
        const aTime = a.clock_out_time || a.time_selected_utc || '';
        const bTime = b.clock_out_time || b.time_selected_utc || '';
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
  }, [allAttendancesForDate]);

  // Get the most recent clock-in and clock-out for UI
  const clockIn = clockIns[0] || null;  // Most recent clock-in
  const clockOut = clockOuts[0] || null;  // Most recent clock-out

  // Helper function to check if an attendance is a "hours worked" entry
  // A "hours worked" entry must have BOTH clock-in AND clock-out with HOURS_WORKED marker
  // A single clock-in or clock-out alone is NOT a "hours worked" entry
  const isHoursWorked = (attendance: Attendance | null): boolean => {
    if (!attendance?.reason_text) return false;
    // Only consider it "hours worked" if it has the marker
    // But we need to be careful: a clock-in alone with HOURS_WORKED is still "open" until clock-out is created
    return attendance.reason_text.includes("HOURS_WORKED:");
  };

  // Find all complete attendances (with both clock in and clock out) from selected date
  const completeAttendancesToday = useMemo(() => {
    return allAttendancesForDate
      .filter(a => a.clock_in_time && a.clock_out_time && !isHoursWorked(a))
      .filter(a => {
        const attendanceDate = a.clock_in_time || a.clock_out_time || a.time_selected_utc;
        if (!attendanceDate) return false;
        const attDate = new Date(attendanceDate);
        return formatDateLocal(attDate) === selectedDate;
      })
      .sort((a, b) => {
        const aTime = a.clock_in_time || a.time_selected_utc || '';
        const bTime = b.clock_in_time || b.time_selected_utc || '';
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
  }, [allAttendancesForDate, selectedDate]);

  // Keep the most recent complete attendance for backward compatibility
  const completeAttendanceToday = useMemo(() => {
    return completeAttendancesToday[completeAttendancesToday.length - 1] || null;
  }, [completeAttendancesToday]);
  
  // Helper to check if a clock-in/out pair forms a complete "hours worked" event
  // This is different from checking a single attendance record
  const isCompleteHoursWorkedEvent = (clockIn: Attendance | null, clockOut: Attendance | null): boolean => {
    if (!clockIn || !clockOut) return false;
    return isHoursWorked(clockIn) && isHoursWorked(clockOut);
  };

  // Robust open-clock-in detection:
  // Pair clock-outs to the latest unmatched clock-in chronologically.
  // This avoids missing open attendances after edits or out-of-order times.
  const { openClockIn, hasOpenClockIn } = useMemo(() => {
    const events = (allAttendancesForDate || [])
      .filter(a => !!(a.clock_in_time || a.clock_out_time || a.time_selected_utc))
      .map(a => {
        const t = a.clock_in_time || a.clock_out_time || a.time_selected_utc || '';
        return { a, tMs: new Date(t).getTime() };
      })
      .sort((x, y) => x.tMs - y.tMs);

    const openStack: { att: Attendance; inMs: number }[] = [];

    for (const { a } of events) {
      // Ignore hours worked marker records for open/close logic
      if (isHoursWorked(a)) continue;

      // Single-record complete attendance
      if (a.clock_in_time && a.clock_out_time) {
        continue;
      }

      if (a.clock_in_time && !a.clock_out_time) {
        openStack.push({ att: a, inMs: new Date(a.clock_in_time).getTime() });
        continue;
      }

      if (a.clock_out_time && !a.clock_in_time) {
        const outMs = new Date(a.clock_out_time).getTime();
        // Close the most recent unmatched clock-in that occurred before this clock-out
        for (let i = openStack.length - 1; i >= 0; i--) {
          if (openStack[i].inMs <= outMs) {
            openStack.splice(i, 1);
            break;
          }
        }
      }
    }

    const open = openStack.length ? openStack[openStack.length - 1].att : null;
    return { openClockIn: open, hasOpenClockIn: !!open };
  }, [allAttendancesForDate]);

  // Get the job type from the open clock-in (for direct attendance, it's stored in reason_text)
  const clockInJobType = useMemo(() => {
    if (!openClockIn) return null;
    
    // For direct attendance (no shift), extract job_type from reason_text
    // Format: "JOB_TYPE:{job_type}|{reason}" or just "JOB_TYPE:{job_type}"
    if (!openClockIn.shift_id) {
      if (openClockIn.job_type) {
        return openClockIn.job_type;
      }
      if (openClockIn.reason_text) {
        const reason = openClockIn.reason_text;
        if (reason.startsWith("JOB_TYPE:")) {
          const parts = reason.split("|");
          const job_marker = parts[0];
          return job_marker.replace("JOB_TYPE:", "");
        }
      }
    }
    
    // For scheduled attendance, get from shift
    return selectedDateShift?.job_name || null;
  }, [openClockIn, selectedDateShift]);
  
  // (kept previously) hasCompleteAttendanceForDate / hasMultipleShifts no longer gate clock-in enablement

  // Can clock in ONLY if:
  // 1. There's NO open clock-in (must close current event first)
  // NOTE: Multiple attendances per day are allowed; only block when there is an open clock-in
  const canClockIn = !hasOpenClockIn;
  
  // Can clock out if there's an open clock-in (one with clock_in_time but no clock_out_time)
  // The clock-in must be approved or pending
  // EXCEPTION: "hours worked" entries are always complete, so they don't allow clock-out
  const canClockOut = hasOpenClockIn && openClockIn && (openClockIn.status === 'approved' || openClockIn.status === 'pending');
  
  // --- Prefill job for Clock In based on the next pending scheduled shift (earliest not completed) ---
  const shiftCompletionById = useMemo(() => {
    const map = new Map<string, { completed: boolean }>();

    // Group attendances by shift_id and mark completed when there is any clock-out >= clock-in for that shift
    const byShift = new Map<string, Attendance[]>();
    for (const a of allAttendancesForDate) {
      if (!a.shift_id) continue;
      const arr = byShift.get(a.shift_id) || [];
      arr.push(a);
      byShift.set(a.shift_id, arr);
    }

    for (const [shiftId, arr] of byShift.entries()) {
      // Completed if any record has both times
      const hasSingleRecordComplete = arr.some(x => !!x.clock_in_time && !!x.clock_out_time);
      if (hasSingleRecordComplete) {
        map.set(shiftId, { completed: true });
        continue;
      }

      // Or completed if there exists a clock_out_time that is after the latest clock_in_time
      const clockInTimes = arr
        .map(x => (x.clock_in_time ? new Date(x.clock_in_time).getTime() : null))
        .filter((t): t is number => typeof t === 'number');
      const clockOutTimes = arr
        .map(x => (x.clock_out_time ? new Date(x.clock_out_time).getTime() : null))
        .filter((t): t is number => typeof t === 'number');

      const latestIn = clockInTimes.length ? Math.max(...clockInTimes) : null;
      const latestOut = clockOutTimes.length ? Math.max(...clockOutTimes) : null;
      const completed = latestIn !== null && latestOut !== null && latestOut >= latestIn;
      map.set(shiftId, { completed });
    }

    return map;
  }, [allAttendancesForDate]);

  const allScheduledShiftsForDate = useMemo(() => {
    const seen = new Set<string>();
    const out: Shift[] = [];

    for (const s of scheduledShifts) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }

    if (shiftById && shiftById.date === selectedDate) {
      if (!seen.has(shiftById.id)) {
        seen.add(shiftById.id);
        out.push(shiftById);
      }
    }

    // Sort by start_time (HH:MM or HH:MM:SS)
    const toMins = (t: string) => {
      const [h, m] = String(t || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    out.sort((a, b) => toMins(a.start_time) - toMins(b.start_time));
    return out;
  }, [scheduledShifts, shiftById, selectedDate]);

  const nextPendingShift = useMemo(() => {
    for (const s of allScheduledShiftsForDate) {
      const completion = shiftCompletionById.get(s.id);
      if (!completion?.completed) return s;
    }
    return null;
  }, [allScheduledShiftsForDate, shiftCompletionById]);

  // Fetch weekly summary - always for current user only (Personal > Clock in/out)
  const { data: weeklySummary, refetch: refetchWeeklySummary } = useQuery({
    queryKey: ['weekly-attendance-summary', weekStartStr, currentUser?.id],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('week_start', weekStartStr);
      // Always pass current user's ID to ensure we only get their attendances
      if (currentUser?.id) {
        params.set('worker_id', currentUser.id);
      }
      return api<WeeklySummary>('GET', `/dispatch/attendance/weekly-summary?${params.toString()}`);
    },
    enabled: !!currentUser?.id,
  });

  // Fetch all projects for job selector
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => api<Project[]>('GET', '/projects'),
  });

  // Combine predefined jobs with projects
  const jobOptions = useMemo(() => {
    const projectJobs = (projects || []).map(p => ({
      id: p.id,
      code: p.code || p.id,
      name: p.name,
    }));
    return [...PREDEFINED_JOBS, ...projectJobs];
  }, [projects]);

  // Get the job name for display from the open clock-in
  const clockInJobName = useMemo(() => {
    if (!openClockIn || !clockInJobType) return null;
    
    // If it's a scheduled shift, use project name
    if (openClockIn.shift_id && project) {
      return project.name || project.code || 'Unknown Project';
    }
    
    // For direct attendance, find job in jobOptions
    const jobOption = jobOptions.find(j => j.id === clockInJobType);
    if (jobOption) {
      return `${jobOption.code} - ${jobOption.name}`;
    }
    
    return clockInJobType;
  }, [openClockIn, clockInJobType, project, jobOptions]);

  // Get the job type from complete attendance
  const completeAttendanceJobType = useMemo(() => {
    if (!completeAttendanceToday) return null;
    
    // For direct attendance (no shift), extract job_type from reason_text
    if (!completeAttendanceToday.shift_id) {
      if (completeAttendanceToday.job_type) {
        return completeAttendanceToday.job_type;
      }
      if (completeAttendanceToday.reason_text) {
        const reason = completeAttendanceToday.reason_text;
        if (reason.startsWith("JOB_TYPE:")) {
          const parts = reason.split("|");
          const job_marker = parts[0];
          return job_marker.replace("JOB_TYPE:", "");
        }
      }
    }
    
    // For scheduled attendance, get from shift
    return selectedDateShift?.job_name || null;
  }, [completeAttendanceToday, selectedDateShift]);

  // Get the job name for display from complete attendance
  const completeAttendanceJobName = useMemo(() => {
    if (!completeAttendanceToday || !completeAttendanceJobType) return null;
    
    // If it's a scheduled shift, use project name
    if (completeAttendanceToday.shift_id && project) {
      return project.name || project.code || 'Unknown Project';
    }
    
    // For direct attendance, find job in jobOptions
    const jobOption = jobOptions.find(j => j.id === completeAttendanceJobType);
    if (jobOption) {
      return `${jobOption.code} - ${jobOption.name}`;
    }
    
    return completeAttendanceJobType;
  }, [completeAttendanceToday, completeAttendanceJobType, project, jobOptions]);

  // Auto-open modal when coming from Schedule page
  useEffect(() => {
    if (shiftIdFromUrl && typeFromUrl && shiftById) {
      if (dateFromUrl) {
        setSelectedDate(dateFromUrl);
      }
      setClockType(typeFromUrl);
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('shift_id');
      newSearchParams.delete('type');
      newSearchParams.delete('date');
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [shiftIdFromUrl, typeFromUrl, dateFromUrl, shiftById, searchParams, setSearchParams]);

  // Helper function to check if an attendance is from selected date
  const isAttendanceFromToday = (attendance: Attendance | null): boolean => {
    if (!attendance) return false;
    const attendanceDate = attendance.clock_in_time || attendance.clock_out_time || attendance.time_selected_utc;
    if (!attendanceDate) return false;
    const attDate = new Date(attendanceDate);
    return formatDateLocal(attDate) === selectedDate;
  };

  // Helper function to convert 12h time to 24h format
  const updateEditTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (!hour12 || !minute) {
      setEditTime('');
      return;
    }
    const hour = parseInt(hour12, 10);
    const hour24 = amPm === 'PM' && hour !== 12 ? hour + 12 : amPm === 'AM' && hour === 12 ? 0 : hour;
    setEditTime(`${String(hour24).padStart(2, '0')}:${minute}`);
  };

  // Function to open edit modal
  const openEditModal = (attendance: Attendance, type: 'in' | 'out') => {
    setEditingAttendance(attendance);
    setEditingType(type);
    
    // Get the time to edit
    const timeToEdit = type === 'in' ? attendance.clock_in_time : attendance.clock_out_time;
    if (timeToEdit) {
      const date = new Date(timeToEdit);
      const hour24 = date.getHours();
      const minute = date.getMinutes();
      const roundedMin = Math.round(minute / 5) * 5;
      const finalMinute = roundedMin === 60 ? 0 : roundedMin;
      const finalHour = roundedMin === 60 ? (hour24 === 23 ? 0 : hour24 + 1) : hour24;

      const hour12 = finalHour === 0 ? 12 : finalHour > 12 ? finalHour - 12 : finalHour;
      const amPm = finalHour >= 12 ? 'PM' : 'AM';

      setEditHour12(String(hour12));
      setEditMinute(String(finalMinute).padStart(2, '0'));
      setEditAmPm(amPm);
      updateEditTimeFrom12h(String(hour12), String(finalMinute).padStart(2, '0'), amPm);
    }

  };

  // Function to open edit break time only modal
  const openEditBreakTimeModal = (attendance: Attendance) => {
    setEditingBreakTimeAttendance(attendance);
    
    // Initialize break time if attendance has break_minutes
    if (attendance.break_minutes && attendance.break_minutes > 0) {
      const breakTotalMinutes = attendance.break_minutes;
      const breakHours = Math.floor(breakTotalMinutes / 60);
      const breakMins = breakTotalMinutes % 60;
      setEditBreakTimeHours(String(breakHours));
      setEditBreakTimeMinutes(String(breakMins).padStart(2, '0'));
    } else {
      setEditBreakTimeHours('0');
      setEditBreakTimeMinutes('0');
    }
  };

  // Function to handle break time only edit submission
  const handleEditBreakTimeOnly = async () => {
    if (!editingBreakTimeAttendance) {
      toast.error('No attendance selected');
      return;
    }

    setEditingBreakTimeSubmitting(true);

    try {
      // Validate that attendance has both clock in and clock out
      if (!editingBreakTimeAttendance.clock_in_time || !editingBreakTimeAttendance.clock_out_time) {
        toast.error('Cannot edit break time: attendance must be complete (both clock-in and clock-out)');
        setEditingBreakTimeSubmitting(false);
        return;
      }

      const clockInTime = new Date(editingBreakTimeAttendance.clock_in_time);
      const clockOutTime = new Date(editingBreakTimeAttendance.clock_out_time);
      const totalMinutes = Math.floor((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60));

      // Validate break time
      const breakTotalMinutes = parseInt(editBreakTimeHours) * 60 + parseInt(editBreakTimeMinutes);
      
      if (breakTotalMinutes >= totalMinutes) {
        toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break time.');
        setEditingBreakTimeSubmitting(false);
        return;
      }

      const updatePayload: any = {
        manual_break_minutes: breakTotalMinutes > 0 ? breakTotalMinutes : 0
      };

      await api('PUT', `/settings/attendance/${editingBreakTimeAttendance.id}`, updatePayload);
      
      const breakMsg = breakTotalMinutes > 0
        ? `Break time updated to ${breakTotalMinutes} minutes`
        : 'Break time removed';
      toast.success(breakMsg);
      
      // Refetch data
      await refetchAllAttendances();
      await refetchAttendances();
      await refetchWeeklySummary();
      
      // Close modal
      setEditingBreakTimeAttendance(null);
      setEditBreakTimeHours('0');
      setEditBreakTimeMinutes('0');
    } catch (error: any) {
      console.error('Error updating break time:', error);
      toast.error(error?.response?.data?.detail || 'Failed to update break time');
    } finally {
      setEditingBreakTimeSubmitting(false);
    }
  };

  // Function to handle edit submission
  const handleEditAttendance = async () => {
    if (!editingAttendance || !editingType || !editTime) {
      toast.error('Please select a time');
      return;
    }

    setEditingSubmitting(true);

    try {
      // Get the date from the attendance
      const attendanceDate = editingAttendance.clock_in_time || editingAttendance.clock_out_time || editingAttendance.time_selected_utc;
      if (!attendanceDate) {
        toast.error('Cannot determine attendance date');
        setEditingSubmitting(false);
        return;
      }

      const date = new Date(attendanceDate);
      const dateStr = formatDateLocal(date);
      
      // Combine date and time
      const [hours, minutes] = editTime.split(':');
      const dateTimeLocal = `${dateStr}T${hours}:${minutes}:00`;
      
      // Convert to UTC (assuming local timezone)
      const dateTime = new Date(dateTimeLocal);
      const dateTimeUtc = dateTime.toISOString();

      // Get clock in and clock out times for validation
      let clockInTime: Date | null = null;
      let clockOutTime: Date | null = null;

      if (editingType === 'in') {
        clockInTime = dateTime;
        clockOutTime = editingAttendance.clock_out_time ? new Date(editingAttendance.clock_out_time) : null;
      } else {
        clockInTime = editingAttendance.clock_in_time ? new Date(editingAttendance.clock_in_time) : null;
        clockOutTime = dateTime;
      }

      // Validate that clock-out time is after clock-in time
      if (clockInTime && clockOutTime && clockOutTime <= clockInTime) {
        toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
        setEditingSubmitting(false);
        return;
      }

      const updatePayload: any = {};
      if (editingType === 'in') {
        updatePayload.clock_in_time = dateTimeUtc;
      } else {
        updatePayload.clock_out_time = dateTimeUtc;
      }

      await api('PUT', `/settings/attendance/${editingAttendance.id}`, updatePayload);
      
      toast.success(`Clock ${editingType === 'in' ? 'in' : 'out'} time updated successfully`);
      
      // Refetch data
      await refetchAllAttendances();
      await refetchAttendances();
      await refetchWeeklySummary();
      
      // Close modal
      setEditingAttendance(null);
      setEditingType(null);
      setEditTime('');
      setEditHour12('');
      setEditMinute('');
      setEditAmPm('AM');
    } catch (error: any) {
      console.error('Error updating attendance:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to update attendance';
      toast.error(errorMsg);
    } finally {
      setEditingSubmitting(false);
    }
  };

  // Navigation for week summary
  const goToPreviousWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() - 7);
    setWeekStart(newWeekStart);
  };

  const goToNextWeek = () => {
    const newWeekStart = new Date(weekStart);
    newWeekStart.setDate(newWeekStart.getDate() + 7);
    setWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const sunday = new Date(today.setDate(diff));
    sunday.setHours(0, 0, 0, 0);
    setWeekStart(sunday);
  };

  // Format week range
  // Format week range label - always use simple format: "nov 30 - dez 6"
  const weekRangeLabel = useMemo(() => {
    if (!weeklySummary) return '';
    const startFormatted = formatDate(weeklySummary.week_start);
    const endFormatted = formatDate(weeklySummary.week_end);
    return `${startFormatted} - ${endFormatted}`;
  }, [weeklySummary]);

  // Calculate working duration if clocked in
  const workingDuration = useMemo(() => {
    if (!hasOpenClockIn || !openClockIn?.clock_in_time) return null;
    const clockInDate = new Date(openClockIn.clock_in_time);
    const now = new Date();
    const diffMs = now.getTime() - clockInDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return diffHours > 0 
      ? `${diffHours}h ${diffMinutes}m`
      : `${diffMinutes}m`;
  }, [hasOpenClockIn, openClockIn]);

  // Update working duration every minute
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    if (!hasOpenClockIn) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, [hasOpenClockIn]);

  // Recalculate with currentTime
  const workingDurationLive = useMemo(() => {
    if (!hasOpenClockIn || !openClockIn?.clock_in_time) return null;
    const clockInDate = new Date(openClockIn.clock_in_time);
    const diffMs = currentTime.getTime() - clockInDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return diffHours > 0 
      ? `${diffHours}h ${diffMinutes}m`
      : `${diffMinutes}m`;
  }, [hasOpenClockIn, openClockIn, currentTime]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const hourSelectOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
    [],
  );
  const minuteSelectOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i * 5;
        return { value: String(m).padStart(2, '0'), label: String(m).padStart(2, '0') };
      }),
    [],
  );
  const amPmSelectOptions = useMemo(
    () => [
      { value: 'AM', label: 'AM' },
      { value: 'PM', label: 'PM' },
    ],
    [],
  );
  const breakHourOptions = useMemo(
    () => Array.from({ length: 3 }, (_, i) => ({ value: String(i), label: String(i) })),
    [],
  );
  const breakMinuteOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i * 5;
        return { value: String(m).padStart(2, '0'), label: String(m).padStart(2, '0') };
      }),
    [],
  );

  const closeEditModal = () => {
    setEditingAttendance(null);
    setEditingType(null);
    setEditTime('');
    setEditHour12('');
    setEditMinute('');
    setEditAmPm('AM');
  };

  const closeBreakTimeModal = () => {
    setEditingBreakTimeAttendance(null);
    setEditBreakTimeHours('0');
    setEditBreakTimeMinutes('0');
  };

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-h-screen w-full')}>
      <AppPageHeader
        title="Clock In / Out"
        subtitle="Track your work hours and manage your attendance"
        icon={<Clock className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <div className="grid grid-cols-[1.5fr_1fr] items-stretch gap-2">
        {/* Left Column - Two Stacked Cards */}
        <div className={uiCx(uiSpacing.sectionStack, 'flex h-full min-h-0 flex-col')}>
          <AppCard
            className="shrink-0"
            title="Clock Actions"
            actions={
              <AppDatePicker
                id="clock-actions-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                triggerVariant="card"
                triggerClassName="w-[220px] max-w-[60vw] shrink-0"
                aria-label="Select date"
              />
            }
          >
            <div className={uiSpacing.sectionStack}>
              <ClockActionTile
                kind="in"
                enabled={!hasOpenClockIn && canClockIn}
                disabled={modalSubmitting}
                onClick={() => setClockType('in')}
                title={
                  hasOpenClockIn
                    ? 'You must clock out first'
                    : !canClockIn && hasOpenClockIn
                      ? 'You have an open clock-in. Please clock out first.'
                      : !canClockIn
                        ? 'Cannot clock in'
                        : undefined
                }
              />
              <ClockActionTile
                kind="out"
                enabled={hasOpenClockIn && canClockOut}
                disabled={modalSubmitting}
                onClick={() => setClockType('out')}
                title={!canClockOut && hasOpenClockIn ? 'Clock-in must be approved or pending' : undefined}
              />
            </div>
          </AppCard>

          <div className="flex min-h-0 flex-1 flex-col">
          <AppCard
            className="flex h-full min-h-0 flex-1 flex-col"
            title={selectedDate === todayStr ? 'Today Status' : `Status - ${formatDate(selectedDate)}`}
            actions={
              <button
                type="button"
                onClick={() => setIsTodayStatusExpanded((v) => !v)}
                className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title={isTodayStatusExpanded ? 'Collapse' : 'Expand'}
                aria-expanded={isTodayStatusExpanded}
                aria-label={isTodayStatusExpanded ? 'Collapse status' : 'Expand status'}
              >
                <svg
                  className={uiCx('h-3 w-3 transition-transform', isTodayStatusExpanded && 'rotate-180')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            }
          >
            {isTodayStatusExpanded ? (
            <div className={uiSpacing.sectionStack}>
              {/* Show all attendances for the selected date */}
              {(() => {
                // Combine open clock-ins and complete attendances
                const allAttendancesToShow: Attendance[] = [];
                
                // Add open clock-in if exists
                if (hasOpenClockIn && openClockIn) {
                  allAttendancesToShow.push(openClockIn);
                }
                
                // Add all complete attendances
                completeAttendancesToday.forEach(att => {
                  // Don't add if it's already the open clock-in
                  if (!hasOpenClockIn || !openClockIn || att.id !== openClockIn.id) {
                    allAttendancesToShow.push(att);
                  }
                });
                
                // Sort by clock-in time (earliest first)
                allAttendancesToShow.sort((a, b) => {
                  const aTime = a.clock_in_time || a.time_selected_utc || '';
                  const bTime = b.clock_in_time || b.time_selected_utc || '';
                  return new Date(aTime).getTime() - new Date(bTime).getTime();
                });
                
                if (allAttendancesToShow.length === 0) {
                  return (
                    <AppEmptyState title="No attendance records for this date" className="py-6" />
                  );
                }
                
                return allAttendancesToShow.map((attendance, index) => {
                  const isOpen = !attendance.clock_out_time;
                  const isComplete = attendance.clock_in_time && attendance.clock_out_time;
                  
                  // Get job name for this attendance
                  let attendanceJobName: string | null = null;
                  if (attendance.shift_id) {
                    // Get shift for this attendance
                    const attendanceShift = shiftsMap.get(attendance.shift_id);
                    if (attendanceShift) {
                      attendanceJobName = attendanceShift.project_name || 'Unknown Project';
                    }
                  } else if (attendance.reason_text) {
                    const reason = attendance.reason_text;
                    if (reason.startsWith("JOB_TYPE:")) {
                      const parts = reason.split("|");
                      const job_marker = parts[0];
                      const jobType = job_marker.replace("JOB_TYPE:", "");
                      const jobOption = jobOptions.find(j => j.id === jobType);
                      if (jobOption) {
                        attendanceJobName = `${jobOption.code} - ${jobOption.name}`;
                      }
                    }
                  }
                  
                  return (
                    <div key={attendance.id || index} className={`${index > 0 ? 'pt-4 border-t border-gray-200/40' : ''}`}>
                      {allAttendancesToShow.length > 1 && (
                        <div className="text-xs font-medium text-gray-700 mb-3">
                          Attendance {index + 1} {isOpen ? '(Open)' : '(Completed)'}
                        </div>
                      )}
                      
                      {/* Clock Status */}
                      <div className="flex items-center gap-3 mb-3">
                        <svg 
                          className={`w-5 h-5 ${isOpen ? 'text-green-600' : 'text-gray-400'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth={2} 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <div className="text-xs text-gray-500 mb-0.5 font-medium uppercase tracking-wide">Status</div>
                          <div className={`text-sm font-semibold ${isOpen ? 'text-green-600' : 'text-gray-600'}`}>
                            {isOpen ? 'Clocked In' : 'Completed'}
                          </div>
                        </div>
                      </div>

                      {/* Clock-in Time */}
                      {attendance.clock_in_time && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Clock-in Time</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-gray-900 font-semibold">
                              {new Date(attendance.clock_in_time).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </div>
                            {isAttendanceFromToday(attendance) && (
                              <AppHeroEditButton
                                onClick={() => openEditModal(attendance, 'in')}
                                title="Edit clock-in time"
                                aria-label="Edit clock-in time"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Clock-out Time */}
                      {isComplete && attendance.clock_out_time && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Clock-out Time</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-gray-900 font-semibold">
                              {new Date(attendance.clock_out_time).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </div>
                            {isAttendanceFromToday(attendance) && (
                              <AppHeroEditButton
                                onClick={() => openEditModal(attendance, 'out')}
                                title="Edit clock-out time"
                                aria-label="Edit clock-out time"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Break Time */}
                      {isComplete && attendance.clock_in_time && attendance.clock_out_time && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Break Time</div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm text-gray-900 font-semibold">
                              {attendance.break_minutes && attendance.break_minutes > 0
                                ? `${Math.floor(attendance.break_minutes / 60)}h ${String(attendance.break_minutes % 60).padStart(2, '0')}m`
                                : '0h 00m'}
                            </div>
                            {isAttendanceFromToday(attendance) && (
                              <AppHeroEditButton
                                onClick={() => openEditBreakTimeModal(attendance)}
                                title="Edit break time"
                                aria-label="Edit break time"
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {/* Worked Hours */}
                      {isComplete && attendance.clock_in_time && attendance.clock_out_time && (() => {
                        const clockInTime = new Date(attendance.clock_in_time);
                        const clockOutTime = new Date(attendance.clock_out_time);
                        const totalMinutes = Math.floor((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60));
                        const breakMinutes = attendance.break_minutes || 0;
                        const workedMinutes = Math.max(0, totalMinutes - breakMinutes);
                        const workedHours = Math.floor(workedMinutes / 60);
                        const workedMins = workedMinutes % 60;
                        return (
                          <div className="mb-3">
                            <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Worked Hours</div>
                            <div className="text-sm text-gray-900 font-semibold">
                              {workedMins > 0 ? `${workedHours}h ${String(workedMins).padStart(2, '0')}m` : `${workedHours}h`}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Working Time (for open clock-in - only show for the most recent open clock-in) */}
                      {isOpen && attendance.id === openClockIn?.id && workingDurationLive && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Working Time</div>
                          <div className="text-sm text-gray-900 font-semibold">Working for {workingDurationLive}</div>
                        </div>
                      )}

                      {/* Approval Status */}
                      {attendance.status && (
                        <div className="mb-3">
                          <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Approval Status</div>
                          <AppBadge variant={attendanceBadgeVariant(attendance.status)}>
                            {attendance.status}
                          </AppBadge>
                        </div>
                      )}

                      {/* Job Information */}
                      {attendanceJobName && (
                        <div className="flex items-start gap-2 text-xs text-gray-600">
                          <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span>Job: {attendanceJobName}</span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}

              {/* Contextual Notices */}
              <div className="pt-3 border-t border-gray-200/40 space-y-2">
                {hasOpenClockIn ? (
                  <>
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>You have an open clock-in. Clock out to close this period.</span>
                    </div>
                    {clockInJobName && (
                      <div className="flex items-start gap-2 text-xs text-gray-600">
                        <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Job: {clockInJobName}</span>
                      </div>
                    )}
                  </>
                ) : allScheduledShiftsForDate.length > 0 ? (
                  nextPendingShift ? (
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        Next scheduled shift: {nextPendingShift.project_name || 'Unknown'} ({formatTime12h(nextPendingShift.start_time)} - {formatTime12h(nextPendingShift.end_time)})
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-xs text-gray-600">
                      <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>All scheduled shifts are completed for this date.</span>
                    </div>
                  )
                ) : (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>No scheduled shifts for this date.</span>
                  </div>
                )}
              </div>
            </div>
            ) : null}
          </AppCard>
          </div>

        </div>

        <AppCard
          className="flex h-full min-h-0 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col"
          title="Weekly Summary"
          actions={
            <div className="flex items-center gap-1">
              <AppButton variant="secondary" size="sm" leftIcon={<ChevronLeft className="h-4 w-4" />} onClick={goToPreviousWeek} aria-label="Previous week" />
              <AppButton variant="secondary" size="sm" onClick={goToCurrentWeek}>
                Today
              </AppButton>
              <AppButton variant="secondary" size="sm" rightIcon={<ChevronRight className="h-4 w-4" />} onClick={goToNextWeek} aria-label="Next week" />
            </div>
          }
        >

          {weeklySummary && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* SECTION A — Weekly Overview (General Information) */}
              <div className="shrink-0 pb-4 border-b border-gray-200">
                <div className="text-xs text-gray-500 text-center font-medium uppercase tracking-wide mb-4">
                  {weekRangeLabel}
                </div>

                {/* Compact Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Total Hours Worked</div>
                    <div className="text-sm font-semibold text-gray-900">{weeklySummary.total_hours_formatted || '0h 00m'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Break Time</div>
                    <div className="text-sm font-semibold text-gray-900">{weeklySummary.total_break_formatted || '0h 00m'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Overtime</div>
                    <div className="text-sm font-semibold text-gray-900">0h 00m</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">Regular Hours</div>
                    <div className="text-sm font-semibold text-gray-900">{weeklySummary.reg_hours_formatted || '0h 00m'}</div>
                  </div>
                </div>
              </div>

              {/* SECTION B — Daily Breakdown (Detailed Reference) */}
              <div className="flex min-h-0 flex-1 flex-col pt-4">
                <div className="shrink-0 text-[10px] font-semibold text-gray-600 mb-3 uppercase tracking-wide">Daily Breakdown</div>
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto">
                  {weeklySummary.days.map((day, index) => {
                    const clockInTime = day.clock_in 
                      ? new Date(day.clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      : null;
                    const clockOutTime = day.clock_out
                      ? new Date(day.clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      : null;
                    const timeRange = clockInTime && clockOutTime 
                      ? `${clockInTime} - ${clockOutTime}`
                      : clockInTime 
                      ? `${clockInTime} - --:--`
                      : null;

                    // Show entry if it has clock_in/out OR if it has hours worked
                    if (!day.clock_in && !day.clock_out && (!day.hours_worked_minutes || day.hours_worked_minutes === 0)) {
                      return null; // Don't show days with no entries
                    }

                    // Use unique key combining date, clock_in time, and index to handle multiple events per day
                    const uniqueKey = `${day.date}-${day.clock_in || 'no-in'}-${day.clock_out || 'no-out'}-${index}`;

                    return (
                      <div key={uniqueKey} className="border-b border-gray-200 pb-3.5 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 mb-1">
                              {day.day_name}, {formatDate(day.date)}
                            </div>
                            {timeRange && (
                              <div className="text-xs text-gray-500 mb-0.5">
                                {timeRange}
                              </div>
                            )}
                            {day.job_name && (
                              <div className="text-xs text-gray-500 truncate">
                                {day.job_type || ''} - {day.job_name}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-semibold text-gray-700 flex items-center justify-end gap-1.5">
                              <span>{day.hours_worked_formatted || '0h 00m'}</span>
                              {day.shift_deleted && (
                                <span
                                  className="text-yellow-600"
                                  title={
                                    day.shift_deleted_by
                                      ? `The shift related to this attendance was deleted by ${day.shift_deleted_by}${day.shift_deleted_at ? ` on ${new Date(day.shift_deleted_at).toLocaleDateString('en-US')}` : ''}`
                                      : 'The shift related to this attendance was deleted'
                                  }
                                >
                                  <svg className="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {(!weeklySummary.days || weeklySummary.days.filter(d => d.clock_in || d.clock_out).length === 0) && (
                    <AppEmptyState title="No attendance records for this week" className="py-6" />
                  )}
                </div>
              </div>
            </div>
          )}
        </AppCard>
      </div>

      {clockType && (
        <ClockInOutModalLayer
          selectedDate={selectedDate}
          clockType={clockType}
          onClose={() => setClockType(null)}
          shiftById={shiftById ?? null}
          onBusyChange={setModalSubmitting}
        />
      )}


      <AppModal
        open={Boolean(editingAttendance && editingType)}
        onClose={closeEditModal}
        title={`Edit Clock ${editingType === 'in' ? 'In' : 'Out'} Time`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={closeEditModal}>
              Cancel
            </AppButton>
            <AppButton onClick={handleEditAttendance} disabled={editingSubmitting || !editTime} loading={editingSubmitting}>
              {editingSubmitting ? 'Updating...' : 'Update'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-2">
          <span className={uiTypography.controlLabel}>Time *</span>
          <div className="flex items-center gap-2">
            <AppSelect
              className="flex-1"
              value={editHour12}
              onChange={(e) => {
                const hour12 = e.target.value;
                setEditHour12(hour12);
                updateEditTimeFrom12h(hour12, editMinute, editAmPm);
              }}
              options={hourSelectOptions}
              placeholder="Hour"
              required
            />
            <span className="font-medium text-gray-500">:</span>
            <AppSelect
              className="flex-1"
              value={editMinute}
              onChange={(e) => {
                const minute = e.target.value;
                setEditMinute(minute);
                updateEditTimeFrom12h(editHour12, minute, editAmPm);
              }}
              options={minuteSelectOptions}
              placeholder="Min"
              required
            />
            <AppSelect
              className="flex-1"
              value={editAmPm}
              onChange={(e) => {
                const amPm = e.target.value as 'AM' | 'PM';
                setEditAmPm(amPm);
                updateEditTimeFrom12h(editHour12, editMinute, amPm);
              }}
              options={amPmSelectOptions}
              required
            />
          </div>
        </div>
      </AppModal>

      <AppModal
        open={Boolean(editingBreakTimeAttendance)}
        onClose={closeBreakTimeModal}
        title="Edit Break Time"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <AppButton variant="secondary" onClick={closeBreakTimeModal}>
              Cancel
            </AppButton>
            <AppButton onClick={handleEditBreakTimeOnly} disabled={editingBreakTimeSubmitting} loading={editingBreakTimeSubmitting}>
              {editingBreakTimeSubmitting ? 'Updating...' : 'Update'}
            </AppButton>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <AppSelect
            label="Hours"
            value={editBreakTimeHours}
            onChange={(e) => setEditBreakTimeHours(e.target.value)}
            options={breakHourOptions}
            className="min-w-[100px] flex-1"
          />
          <AppSelect
            label="Minutes"
            value={editBreakTimeMinutes}
            onChange={(e) => setEditBreakTimeMinutes(e.target.value)}
            options={breakMinuteOptions}
            className="min-w-[100px] flex-1"
          />
        </div>
      </AppModal>

    </div>
  );
}
