import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ConfirmProvider';

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

// Helper function to format date as YYYY-MM-DD in local timezone (not UTC)
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to format date to Portuguese day name
function formatDayName(dateStr: string): string {
  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const date = new Date(dateStr + 'T00:00:00');
  const dayIndex = date.getDay();
  return days[dayIndex] || dateStr;
}

// Helper to format date as "day, month dd"
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  return `${month} ${day}`;
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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromHome = location.state?.fromHome === true;
  
  // Get query params for auto-opening modal from Schedule page
  const shiftIdFromUrl = searchParams.get('shift_id');
  const confirm = useConfirm();
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
  const [selectedJob, setSelectedJob] = useState<string>('');
  const [selectedHour12, setSelectedHour12] = useState<string>('');
  const [selectedMinute, setSelectedMinute] = useState<string>('');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string>('');
  
  // Manual break time (only for clock out)
  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

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

  // Check if user has unrestricted clock in/out permission
  const hasUnrestrictedClock = useMemo(() => {
    if (!currentUser) return false; // Default to false if user not loaded yet
    
    // Admin users always have unrestricted access
    const roles = currentUser?.roles || [];
    const isAdmin = roles.some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    
    // Check for unrestricted clock permission
    // IMPORTANT: Only check explicit permission, not admin role
    const permissions = currentUser?.permissions || [];
    const hasHrPermission = permissions.includes('hr:timesheet:unrestricted_clock');
    const hasLegacyPermission = permissions.includes('timesheet:unrestricted_clock');
    return hasHrPermission || hasLegacyPermission;
  }, [currentUser]);

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
  const { data: allAttendancesForDate = [], refetch: refetchAllAttendances } = useQuery({
    queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      
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
      
      return allAttendances;
    },
    enabled: !!currentUser?.id,
  });

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

  // Find the most recent complete attendance (with both clock in and clock out) from today
  const completeAttendanceToday = useMemo(() => {
    const today = formatDateLocal(new Date());
    return allAttendancesForDate
      .filter(a => a.clock_in_time && a.clock_out_time && !isHoursWorked(a))
      .filter(a => {
        const attendanceDate = a.clock_in_time || a.clock_out_time || a.time_selected_utc;
        if (!attendanceDate) return false;
        const attDate = new Date(attendanceDate);
        return formatDateLocal(attDate) === today;
      })
      .sort((a, b) => {
        const aTime = a.clock_out_time || a.time_selected_utc || '';
        const bTime = b.clock_out_time || b.time_selected_utc || '';
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      })[0] || null;
  }, [allAttendancesForDate]);
  
  // Helper to check if a clock-in/out pair forms a complete "hours worked" event
  // This is different from checking a single attendance record
  const isCompleteHoursWorkedEvent = (clockIn: Attendance | null, clockOut: Attendance | null): boolean => {
    if (!clockIn || !clockOut) return false;
    return isHoursWorked(clockIn) && isHoursWorked(clockOut);
  };

  // NEW MODEL: Check if there's an open clock-in (one with clock_in_time but no clock_out_time)
  // IMPORTANT: "hours worked" entries are always complete (both clock_in_time and clock_out_time exist)
  // and should never be treated as "open"
  // The backend uses a single record model where clock_in_time and clock_out_time can be in the same record
  // OR separate records (one with clock_in_time, another with clock_out_time)
  const hasOpenClockIn = useMemo(() => {
    // Get the most recent clock-in and clock-out
    const mostRecentClockIn = clockIns[0];
    const mostRecentClockOut = clockOuts[0];
    
    // If there's no clock-in at all, there's no open clock-in
    if (!mostRecentClockIn || !mostRecentClockIn.clock_in_time) return false;
    
    // If it's a "hours worked" entry, it should have clock_out_time (complete event)
    if (isHoursWorked(mostRecentClockIn)) {
      return false;
    }
    
    // If the clock-in record itself has clock_out_time, it's complete (not open)
    if (mostRecentClockIn.clock_out_time) {
      return false;
    }
    
    // Check if there's a clock-out that comes AFTER the most recent clock-in
    // This handles the case where backend creates separate records
    // IMPORTANT: We need to check if the clock-in is MORE RECENT than any clock-out
    if (mostRecentClockOut && mostRecentClockOut.clock_out_time) {
      const clockInTime = new Date(mostRecentClockIn.clock_in_time).getTime();
      const clockOutTime = new Date(mostRecentClockOut.clock_out_time).getTime();
      
      // If clock-in time is MORE RECENT than clock-out time, there's an open clock-in
      // If clock-out time is more recent than or equal to clock-in time, the period is closed
      if (clockInTime > clockOutTime) {
        // Clock-in is more recent than clock-out, so there's an open clock-in
        return true;
      } else {
        // Clock-out is more recent than or equal to clock-in, so the period is closed
        return false;
      }
    }
    
    // If we get here, there's a clock-in without a matching clock-out (open)
    return true;
  }, [allAttendancesForDate, clockIns, clockOuts]);

  // Find the most recent open clock-in for canClockOut and isJobLocked
  // IMPORTANT: Backend may create separate records for clock-in and clock-out
  // So we need to check if there's a clock-out that comes after the clock-in
  const openClockIn = useMemo(() => {
    if (!hasOpenClockIn) return null;
    
    // Get the most recent clock-in
    const mostRecentClockIn = clockIns[0];
    if (!mostRecentClockIn || !mostRecentClockIn.clock_in_time) return null;
    
    // If it's a "hours worked" entry, it's not open
    if (isHoursWorked(mostRecentClockIn)) return null;
    
    // If it has clock_out_time, it's not open
    if (mostRecentClockIn.clock_out_time) return null;
    
    // Check if there's a clock-out that comes after this clock-in
    const clockInTime = new Date(mostRecentClockIn.clock_in_time).getTime();
    const mostRecentClockOut = clockOuts[0];
    
    if (mostRecentClockOut && mostRecentClockOut.clock_out_time) {
      const clockOutTime = new Date(mostRecentClockOut.clock_out_time).getTime();
      // If clock-out is after or equal to clock-in, the period is closed
      // If clock-in is more recent than clock-out, there's an open clock-in
      if (clockOutTime >= clockInTime) {
        return null; // Clock-out closes the period
      }
    }
    
    return mostRecentClockIn;
  }, [allAttendancesForDate, clockIns, clockOuts, hasOpenClockIn]);

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
  
  // Can clock in ONLY if:
  // 1. There's NO open clock-in (must close current event first)
  // Multiple clock ins/outs per day are allowed as long as previous ones are closed
  const canClockIn = !hasOpenClockIn;
  
  // Can clock out if there's an open clock-in (one with clock_in_time but no clock_out_time)
  // The clock-in must be approved or pending
  // EXCEPTION: "hours worked" entries are always complete, so they don't allow clock-out
  const canClockOut = hasOpenClockIn && openClockIn && (openClockIn.status === 'approved' || openClockIn.status === 'pending');
  
  // If there's an open clock-in, lock the job to the same job type (cannot change)
  // If there's no open clock-in, user can select a new job for a new event
  // EXCEPTION: "hours worked" entries are always complete, so they don't lock the job
  const isJobLocked = hasOpenClockIn && openClockIn !== null;
  
  // Auto-set selectedJob from clock-in if it's locked
  // Always set it when there's an open clock-in, even if already set (to ensure it matches)
  useEffect(() => {
    if (isJobLocked && clockInJobType) {
      // Always update selectedJob to match clockInJobType when locked
      // This ensures it's set even after a new clock-in is created
      setSelectedJob(clockInJobType);
    } else if (!isJobLocked && !hasOpenClockIn) {
      // Only clear if there's no open clock-in and it's not locked
      // Don't clear immediately to avoid flickering
    }
  }, [isJobLocked, clockInJobType, hasOpenClockIn, openClockIn]);
  

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

  // Initialize time to current time
  useEffect(() => {
    if (clockType) {
      const now = new Date();
      const hour24 = now.getHours();
      const minute = now.getMinutes();
      const roundedMin = Math.round(minute / 5) * 5;
      const finalMinute = roundedMin === 60 ? 0 : roundedMin;
      const finalHour = roundedMin === 60 ? (hour24 === 23 ? 0 : hour24 + 1) : hour24;

      const hour12 = finalHour === 0 ? 12 : finalHour > 12 ? finalHour - 12 : finalHour;
      const amPm = finalHour >= 12 ? 'PM' : 'AM';

      setSelectedHour12(String(hour12));
      setSelectedMinute(String(finalMinute).padStart(2, '0'));
      setSelectedAmPm(amPm);

      const hour24Final = amPm === 'PM' && hour12 !== 12 ? hour12 + 12 : amPm === 'AM' && hour12 === 12 ? 0 : hour12;
      setSelectedTime(`${String(hour24Final).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);
    }
  }, [clockType]);

  // Get GPS location
  const getCurrentLocation = () => {
    setGpsLoading(true);
    setGpsError('');
    
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser');
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
        });
        setGpsLoading(false);
      },
      (error) => {
        setGpsError(error.message || 'Failed to get location');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Auto-open modal when coming from Schedule page
  useEffect(() => {
    if (shiftIdFromUrl && typeFromUrl && shiftById) {
      // Set the date from URL if provided
      if (dateFromUrl) {
        setSelectedDate(dateFromUrl);
      }
      
      // Set clock type to open modal
      setClockType(typeFromUrl);
      
      // Set default time to now (rounded to 5 min) in 12h format
      const now = new Date();
      const hour24 = now.getHours();
      const minute = now.getMinutes();
      const roundedMin = Math.round(minute / 5) * 5;
      const finalMinute = roundedMin === 60 ? 0 : roundedMin;
      const finalHour = roundedMin === 60 ? (hour24 === 23 ? 0 : hour24 + 1) : hour24;

      const hour12 = finalHour === 0 ? 12 : finalHour > 12 ? finalHour - 12 : finalHour;
      const amPm = finalHour >= 12 ? 'PM' : 'AM';

      setSelectedHour12(String(hour12));
      setSelectedMinute(String(finalMinute).padStart(2, '0'));
      setSelectedAmPm(amPm);

      // Calculate 24h format for selectedTime
      const hour24Final = amPm === 'PM' && hour12 !== 12 ? hour12 + 12 : amPm === 'AM' && hour12 === 12 ? 0 : hour12;
      setSelectedTime(`${String(hour24Final).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`);
      
      // Clear URL params after opening modal
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('shift_id');
      newSearchParams.delete('type');
      newSearchParams.delete('date');
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [shiftIdFromUrl, typeFromUrl, dateFromUrl, shiftById, searchParams, setSearchParams]);

  // Helper function to check if an attendance is from today
  const isAttendanceFromToday = (attendance: Attendance | null): boolean => {
    if (!attendance) return false;
    const attendanceDate = attendance.clock_in_time || attendance.clock_out_time || attendance.time_selected_utc;
    if (!attendanceDate) return false;
    const attDate = new Date(attendanceDate);
    const today = new Date();
    return formatDateLocal(attDate) === formatDateLocal(today);
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

    // Initialize break time if attendance has break_minutes
    if (attendance.break_minutes && attendance.break_minutes > 0) {
      const breakTotalMinutes = attendance.break_minutes;
      const breakHours = Math.floor(breakTotalMinutes / 60);
      const breakMins = breakTotalMinutes % 60;
      setEditInsertBreakTime(true);
      setEditBreakHours(String(breakHours));
      setEditBreakMinutes(String(breakMins).padStart(2, '0'));
    } else {
      setEditInsertBreakTime(false);
      setEditBreakHours('0');
      setEditBreakMinutes('0');
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
      setEditBreakTimeOnly(true);
      setEditBreakTimeHours(String(breakHours));
      setEditBreakTimeMinutes(String(breakMins).padStart(2, '0'));
    } else {
      setEditBreakTimeOnly(false);
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

      // Validate break time if enabled
      if (editBreakTimeOnly) {
        const breakTotalMinutes = parseInt(editBreakTimeHours) * 60 + parseInt(editBreakTimeMinutes);
        
        if (breakTotalMinutes >= totalMinutes) {
          toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break time.');
          setEditingBreakTimeSubmitting(false);
          return;
        }
      }

      const updatePayload: any = {};
      if (editBreakTimeOnly) {
        const breakTotalMinutes = parseInt(editBreakTimeHours) * 60 + parseInt(editBreakTimeMinutes);
        if (breakTotalMinutes > 0) {
          updatePayload.manual_break_minutes = breakTotalMinutes;
        } else {
          updatePayload.manual_break_minutes = 0;
        }
      } else {
        updatePayload.manual_break_minutes = 0;
      }

      await api('PUT', `/settings/attendance/${editingBreakTimeAttendance.id}`, updatePayload);
      
      const breakMsg = editBreakTimeOnly
        ? `Break time updated to ${parseInt(editBreakTimeHours) * 60 + parseInt(editBreakTimeMinutes)} minutes`
        : 'Break time removed';
      toast.success(breakMsg);
      
      // Refetch data
      await refetchAllAttendances();
      await refetchAttendances();
      await refetchWeeklySummary();
      
      // Close modal
      setEditingBreakTimeAttendance(null);
      setEditBreakTimeOnly(false);
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

      // Validate break time if enabled
      if (editInsertBreakTime && clockInTime && clockOutTime) {
        const breakTotalMinutes = parseInt(editBreakHours) * 60 + parseInt(editBreakMinutes);
        const totalMinutes = Math.floor((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60));
        
        if (breakTotalMinutes >= totalMinutes) {
          toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
          setEditingSubmitting(false);
          return;
        }
      }

      const updatePayload: any = {};
      if (editingType === 'in') {
        updatePayload.clock_in_time = dateTimeUtc;
      } else {
        updatePayload.clock_out_time = dateTimeUtc;
      }

      // Add break time if editing clock-out and break time is enabled
      // Also allow editing break time when editing clock-in if attendance is complete
      if (editingType === 'out' || (editingType === 'in' && editingAttendance.clock_out_time)) {
        if (editInsertBreakTime) {
          const breakTotalMinutes = parseInt(editBreakHours) * 60 + parseInt(editBreakMinutes);
          if (breakTotalMinutes > 0) {
            updatePayload.manual_break_minutes = breakTotalMinutes;
          } else {
            updatePayload.manual_break_minutes = 0;
          }
        } else {
          // If break time is disabled, set to 0
          updatePayload.manual_break_minutes = 0;
        }
      }

      await api('PUT', `/settings/attendance/${editingAttendance.id}`, updatePayload);
      
      const breakMsg = (editingType === 'out' || (editingType === 'in' && editingAttendance.clock_out_time)) && editInsertBreakTime
        ? ` with ${parseInt(editBreakHours) * 60 + parseInt(editBreakMinutes)} minutes break`
        : '';
      toast.success(`Clock ${editingType === 'in' ? 'in' : 'out'} time updated successfully${breakMsg}`);
      
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

  // Auto-get location when opening clock modal
  useEffect(() => {
    if (clockType) {
      getCurrentLocation();
    }
  }, [clockType]);

  const updateTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (!hour12 || !minute) {
      setSelectedTime('');
      return;
    }

    const hour24 = amPm === 'PM' && parseInt(hour12) !== 12 
      ? parseInt(hour12) + 12 
      : amPm === 'AM' && parseInt(hour12) === 12 
      ? 0 
      : parseInt(hour12);
    
    const timeStr = `${String(hour24).padStart(2, '0')}:${minute}`;
    setSelectedTime(timeStr);
  };

  const handleClockInOut = async () => {
    if (!clockType) {
      toast.error('Please select clock in or out');
      return;
    }

    // If user doesn't have permission to edit time, use current time automatically
    let timeToUse = selectedTime;
    if (!hasUnrestrictedClock || !timeToUse || !timeToUse.includes(':')) {
      // Use current time if no permission or no time selected
      const now = new Date();
      const hours = now.getHours();
      const minutes = Math.floor(now.getMinutes() / 5) * 5; // Round to nearest 5 minutes
      timeToUse = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // Validate time format and 5-minute increments
    const [hours, minutes] = timeToUse.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes % 5 !== 0 || minutes < 0 || minutes > 59) {
      toast.error('Please select a valid time in 5-minute increments');
      return;
    }

    // Validate: Allow future times with 4 minute margin
    // Create date using local timezone explicitly to avoid timezone issues
    const [year, month, day] = selectedDate.split('-').map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    const now = new Date();
    const maxFutureMs = 4 * 60 * 1000; // 4 minutes buffer for future times
    if (selectedDateTime.getTime() > (now.getTime() + maxFutureMs)) {
      toast.error('Clock-in/out cannot be more than 4 minutes in the future. Please select a valid time.');
      setSubmitting(false);
      return;
    }

    // Validate: If clocking out, check that clock-out time is not before or equal to clock-in time
    if (clockType === 'out') {
      // Find the most recent open clock-in (one without clock-out)
      const openClockIn = allAttendancesForDate.find(
        a => a.clock_in_time && !a.clock_out_time
      );
      
      if (openClockIn && openClockIn.clock_in_time) {
        const clockInDate = new Date(openClockIn.clock_in_time);
        if (selectedDateTime <= clockInDate) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          setSubmitting(false);
          return;
        }
        
        // Validate break time: break cannot be greater than or equal to total time
        if (insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          const totalMinutes = Math.floor((selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60));
          
          if (breakTotalMinutes >= totalMinutes) {
            toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
            setSubmitting(false);
            return;
          }
        }
      }
    }

    // Prepare confirmation message
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const time12h = formatTime12h(timeStr);
    const dateFormatted = formatDate(selectedDate);
    
    // Get project/job name
    let projectJobName = '';
    if (selectedDateShift && project) {
      projectJobName = project.name || project.code || 'Unknown Project';
    } else if (selectedJob) {
      const jobOption = jobOptions.find(j => j.id === selectedJob);
      projectJobName = jobOption?.name || selectedJob;
    }
    
    // Build confirmation message
    let confirmationMessage = '';
    if (clockType === 'out' && openClockIn) {
      // Detailed confirmation for clock-out
      const clockInTime = new Date(openClockIn.clock_in_time);
      // Format clock-in time in local timezone
      const clockInHour = clockInTime.getHours();
      const clockInMin = clockInTime.getMinutes();
      const clockInTime12h = formatTime12h(
        `${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`
      );
      
      // Calculate break information first
      let breakTotalMinutes = 0;
      let breakInfo = '';
      if (insertBreakTime) {
        breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
        if (breakTotalMinutes > 0) {
          const breakH = Math.floor(breakTotalMinutes / 60);
          const breakM = breakTotalMinutes % 60;
          breakInfo = breakM > 0 ? `Break: ${breakH}h ${breakM}min` : `Break: ${breakH}h`;
        }
      }
      
      // Calculate hours worked (reuse year, month, day from validation above)
      const [yearOut, monthOut, dayOut] = selectedDate.split('-').map(Number);
      const clockOutDateTime = new Date(yearOut, monthOut - 1, dayOut, hours, minutes, 0);
      const clockInDateTime = new Date(clockInTime);
      const diffMs = clockOutDateTime.getTime() - clockInDateTime.getTime();
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      
      // Subtract break from total minutes to get net hours worked
      const netMinutes = Math.max(0, totalMinutes - breakTotalMinutes);
      const workedHours = Math.floor(netMinutes / 60);
      const workedMinutes = netMinutes % 60;
      const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;
      
      // Build confirmation message with break right after clock out
      confirmationMessage = `You are about to clock out with the following details:\n\n` +
        `Date: ${dateFormatted}\n` +
        `Clock In: ${clockInTime12h}\n` +
        `Clock Out: ${time12h}${breakInfo ? `\n${breakInfo}` : ''}\n` +
        `Hours Worked: ${hoursWorkedStr}${projectJobName ? `\nProject/Job: ${projectJobName}` : ''}\n\n` +
        `Do you want to confirm?`;
    } else {
      // Simple confirmation for clock-in
      confirmationMessage = `You are about to clock ${clockType === 'in' ? 'in' : 'out'} on ${dateFormatted} at ${time12h}${projectJobName ? ` for ${projectJobName}` : ''}.\n\nDo you want to confirm?`;
    }
    
    // Show confirmation dialog
    const confirmationResult = await confirm({
      title: `Confirm Clock-${clockType === 'in' ? 'In' : 'Out'}`,
      message: confirmationMessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });
    
    if (confirmationResult !== 'confirm') {
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      const timeSelectedLocal = `${selectedDate}T${timeStr}:00`;

      const payload: any = {
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add manual break time if checkbox is checked (only for clock out)
      if (clockType === 'out' && insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
        payload.manual_break_minutes = breakTotalMinutes;
      }

      // Add GPS location if available (for history only, not validation)
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      let result;

      // If there's a scheduled shift (from URL or selected date), use normal attendance route
      if (selectedDateShift) {
        payload.shift_id = selectedDateShift.id;
        result = await api('POST', '/dispatch/attendance', payload);
      } else {
        // If no scheduled shift, use direct attendance route (without creating shift/project)
        // Use locked job type if clock-in exists, otherwise use selected job
        // For clock-out, always use clockInJobType if locked (to match the open clock-in)
        const jobTypeToUse = (clockType === 'out' && isJobLocked && clockInJobType) 
          ? clockInJobType 
          : (isJobLocked && clockInJobType ? clockInJobType : selectedJob);
        if (!jobTypeToUse) {
          toast.error('Please select a Job');
          setSubmitting(false);
          return;
        }
        payload.job_type = jobTypeToUse;
        result = await api('POST', '/dispatch/attendance/direct', payload);
      }

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      // Reset state
      setClockType(null);
      setSelectedTime('');
      setSelectedHour12('');
      setSelectedMinute('');
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
      
      // Only keep job selected if there's an open clock-in (locked)
      // After clock-out, job is unlocked to allow creating a new event
      // For clock-in, keep the job selected if it will be locked (hasOpenClockIn will be true after refetch)
      if (clockType === 'out') {
        // After clock-out, reset job to allow new event
        setSelectedJob('');
      }
      // For clock-in, don't reset - the useEffect will handle locking it if there's an open clock-in
      
      setGpsLocation(null);
      setGpsError('');
      
      // Refetch data - IMPORTANT: refetch allAttendancesForDate to update clock-in/out status
      // Clear cache first to ensure fresh data
      queryClient.removeQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
      
      // Wait a bit to ensure backend has processed the request
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await refetchAllAttendances();  // This will update clockIn, clockOut, clockIns, clockOuts, hasOpenClockIn
      await refetchAttendances();
      await refetchWeeklySummary();
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-shifts'] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to submit attendance';
      toast.error(errorMsg);
      
      // Even on error, refetch to update UI state (in case attendance was created but error was about something else)
      // This is especially important for conflict errors where the attendance might have been created
      const isConflictError = error.response?.status === 400 && errorMsg.includes('already');
      if (isConflictError) {
        // For conflict errors, wait a bit longer and refetch to sync UI
        await new Promise(resolve => setTimeout(resolve, 500));
        queryClient.removeQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
        queryClient.invalidateQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
        await refetchAllAttendances();
        await refetchAttendances();
        await refetchWeeklySummary();
      }
    } finally {
      setSubmitting(false);
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

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50/50">
      {/* Standardized Page Header */}
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 py-4 px-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1.5">Clock In / Out</h1>
        <p className="text-sm text-gray-600 font-medium">Track your work hours and manage your attendance</p>
      </div>

      <div className="grid grid-cols-[1.2fr_1fr] gap-8">
        {/* Left Column - Two Stacked Cards */}
        <div className="space-y-4">
          {/* CARD 1 — Today Status (Informational Only) */}
          <div className="rounded-[12px] border border-gray-200/60 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">Today Status</h3>
            
            <div className="space-y-4">
              {/* Clock Status */}
              <div className="flex items-center gap-3">
                <svg 
                  className={`w-5 h-5 ${hasOpenClockIn ? 'text-green-600' : 'text-gray-400'}`} 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth={2} 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <div className="text-xs text-gray-500 mb-0.5 font-medium uppercase tracking-wide">Status</div>
                  <div className={`text-sm font-semibold ${hasOpenClockIn ? 'text-green-600' : 'text-gray-600'}`}>
                    {hasOpenClockIn ? 'Clocked In' :
                     (clockOut && !hasOpenClockIn) ? 'Completed' :
                     'Not Clocked In'}
                  </div>
                </div>
              </div>

              {/* Working Time */}
              {hasOpenClockIn && openClockIn && workingDurationLive && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Working Time</div>
                  <div className="text-sm text-gray-900 font-semibold">Working for {workingDurationLive}</div>
                </div>
              )}

              {/* Break Time (if completed - shown above clock times) */}
              {!hasOpenClockIn && completeAttendanceToday && completeAttendanceToday.clock_in_time && completeAttendanceToday.clock_out_time && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Break Time</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-900 font-semibold">
                      {completeAttendanceToday.break_minutes && completeAttendanceToday.break_minutes > 0
                        ? `${Math.floor(completeAttendanceToday.break_minutes / 60)}h ${String(completeAttendanceToday.break_minutes % 60).padStart(2, '0')}m`
                        : '0h 00m'}
                    </div>
                    {isAttendanceFromToday(completeAttendanceToday) && (
                      <button
                        onClick={() => openEditBreakTimeModal(completeAttendanceToday)}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
                        title="Edit break time"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Clock-in Time */}
              {hasOpenClockIn && openClockIn && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Clock-in Time</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-900 font-semibold">
                      {new Date(openClockIn.clock_in_time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </div>
                    {isAttendanceFromToday(openClockIn) && (
                      <button
                        onClick={() => openEditModal(openClockIn, 'in')}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
                        title="Edit clock-in time"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Clock-out Time (if completed) */}
              {!hasOpenClockIn && completeAttendanceToday && completeAttendanceToday.clock_out_time && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Clock-out Time</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-900 font-semibold">
                      {new Date(completeAttendanceToday.clock_out_time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </div>
                    {isAttendanceFromToday(completeAttendanceToday) && (
                      <button
                        onClick={() => openEditModal(completeAttendanceToday, 'out')}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
                        title="Edit clock-out time"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Clock-in Time (if completed, show the clock-in from the complete attendance) */}
              {!hasOpenClockIn && completeAttendanceToday && completeAttendanceToday.clock_in_time && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Clock-in Time</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-gray-900 font-semibold">
                      {new Date(completeAttendanceToday.clock_in_time).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </div>
                    {isAttendanceFromToday(completeAttendanceToday) && (
                      <button
                        onClick={() => openEditModal(completeAttendanceToday, 'in')}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-95 transition-all"
                        title="Edit clock-in time"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Approval Status */}
              {hasOpenClockIn && openClockIn && openClockIn.status && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Approval Status</div>
                  <span className={`inline-block text-xs px-2.5 py-1 rounded font-medium ${
                    openClockIn.status === 'approved' ? 'bg-green-50 text-green-700' :
                    openClockIn.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-red-50 text-red-700'
                  }`}>
                    {openClockIn.status}
                  </span>
                </div>
              )}

              {/* Contextual Notices */}
              <div className="pt-3 border-t border-gray-200/40 space-y-2">
                {selectedDateShift && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Assigned to project: {selectedDateShift.project_name || 'Unknown'}</span>
                  </div>
                )}
                {!selectedDateShift && selectedDate === todayStr && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Not assigned to any specific project today</span>
                  </div>
                )}
                {hasOpenClockIn && (
                  <div className="flex items-start gap-2 text-xs text-gray-600">
                    <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>You have an open clock-in. Clock out to close this period.</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 2 — Clock Actions (Action-Focused) */}
          <div className="rounded-[12px] border border-gray-200/60 bg-white shadow-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">Clock Actions</h3>
            
            <div className="space-y-3">
              {/* Clock In Action Tile */}
              <button
                onClick={() => setClockType('in')}
                disabled={hasOpenClockIn || !canClockIn || submitting || (!selectedDateShift && !selectedJob)}
                className={`w-full rounded-[12px] border-2 p-4 text-left transition-all duration-200 ${
                  !hasOpenClockIn && canClockIn && (selectedDateShift || selectedJob) && !submitting
                    ? 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                    : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
                }`}
                title={
                  hasOpenClockIn ? 'You must clock out first' : 
                  !selectedDateShift && !selectedJob ? 'Please select a job' : ''
                }
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    !hasOpenClockIn && canClockIn && (selectedDateShift || selectedJob) && !submitting
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-300 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      {/* Clock circle */}
                      <circle cx="12" cy="12" r="9" />
                      {/* Clock hands */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                      {/* Arrow pointing in (right side) */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12h-3m3 0l-2 2m2-2l-2-2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-base font-semibold mb-1 ${
                      !hasOpenClockIn && canClockIn && (selectedDateShift || selectedJob) && !submitting
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}>
                      Clock In
                    </div>
                    <div className={`text-xs ${
                      !hasOpenClockIn && canClockIn && (selectedDateShift || selectedJob) && !submitting
                        ? 'text-gray-600'
                        : 'text-gray-400'
                    }`}>
                      Start tracking your work time
                    </div>
                  </div>
                </div>
              </button>

              {/* Clock Out Action Tile */}
              <button
                onClick={() => {
                  if (isJobLocked && clockInJobType) {
                    setSelectedJob(clockInJobType);
                  }
                  setClockType('out');
                }}
                disabled={!hasOpenClockIn || !canClockOut || submitting}
                className={`w-full rounded-[12px] border-2 p-4 text-left transition-all duration-200 ${
                  hasOpenClockIn && canClockOut && !submitting
                    ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                    : 'border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60'
                }`}
                title={!canClockOut && hasOpenClockIn ? 'Clock-in must be approved or pending' : ''}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                    hasOpenClockIn && canClockOut && !submitting
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-300 text-gray-500'
                  }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      {/* Clock circle */}
                      <circle cx="12" cy="12" r="9" />
                      {/* Clock hands */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
                      {/* Arrow pointing out (left side) */}
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h3m-3 0l2 2m-2-2l2-2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-base font-semibold mb-1 ${
                      hasOpenClockIn && canClockOut && !submitting
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}>
                      Clock Out
                    </div>
                    <div className={`text-xs ${
                      hasOpenClockIn && canClockOut && !submitting
                        ? 'text-gray-600'
                        : 'text-gray-400'
                    }`}>
                      End your current work session
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Weekly Summary Panel */}
        <div className="rounded-[12px] border border-gray-200/60 bg-white shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">Weekly Summary</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={goToPreviousWeek}
                className="px-2 py-1 rounded-lg border border-gray-200/60 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
              >
                ←
              </button>
              <button
                onClick={goToCurrentWeek}
                className="px-2.5 py-1 rounded-lg border border-gray-200/60 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
              >
                Today
              </button>
              <button
                onClick={goToNextWeek}
                className="px-2 py-1 rounded-lg border border-gray-200/60 hover:bg-gray-50 active:bg-gray-100 active:scale-[0.98] text-xs font-medium text-gray-600 transition-all duration-150"
              >
                →
              </button>
            </div>
          </div>

          {weeklySummary && (
            <>
              {/* SECTION A — Weekly Overview (General Information) */}
              <div className="pb-6 border-b border-gray-200/60">
                <div className="text-xs text-gray-500 text-center font-medium uppercase tracking-wide mb-4">
                  {weekRangeLabel}
                </div>

                {/* Compact Metrics Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 font-medium">Total Hours Worked</div>
                    <div className="text-lg font-bold text-gray-900">{weeklySummary.total_hours_formatted || '0h 00m'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 font-medium">Break Time</div>
                    <div className="text-lg font-bold text-gray-900">{weeklySummary.total_break_formatted || '0h 00m'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 font-medium">Overtime</div>
                    <div className="text-lg font-bold text-gray-900">0h 00m</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5 font-medium">Regular Hours</div>
                    <div className="text-lg font-bold text-gray-900">{weeklySummary.reg_hours_formatted || '0h 00m'}</div>
                  </div>
                </div>
              </div>

              {/* SECTION B — Daily Breakdown (Detailed Reference) */}
              <div className="pt-6">
                <h4 className="text-xs font-semibold text-gray-600 mb-4 uppercase tracking-wide">Daily Breakdown</h4>
                <div className="space-y-3.5 max-h-[400px] overflow-y-auto">
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
                      <div key={uniqueKey} className="border-b border-gray-200/30 pb-3.5 last:border-b-0 last:pb-0">
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
                                      ? `The shift related to this attendance was deleted by ${day.shift_deleted_by}${day.shift_deleted_at ? ` on ${new Date(day.shift_deleted_at).toLocaleDateString()}` : ''}`
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
                    <div className="text-center text-gray-400 py-6 text-xs">
                      No attendance records for this week
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Clock Modal - Premium Centered Style */}
      {clockType && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setClockType(null);
              setSelectedTime('');
              setSelectedHour12('');
              setSelectedMinute('');
              setInsertBreakTime(false);
              setBreakHours('0');
              setBreakMinutes('0');
              setGpsLocation(null);
              setGpsError('');
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-gray-200/60 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200/60 flex-shrink-0">
              <h3 className="text-xl font-semibold text-gray-900">
                Clock {clockType === 'in' ? 'In' : 'Out'}
              </h3>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              {/* Time selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time *</label>
                {!hasUnrestrictedClock ? (
                  <div className="flex gap-2 items-center pointer-events-none">
                    <div className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 bg-gray-100 opacity-60 text-gray-500">
                      {selectedHour12 || 'Hour'}
                    </div>
                    <span className="text-gray-500 font-medium">:</span>
                    <div className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 bg-gray-100 opacity-60 text-gray-500">
                      {selectedMinute || 'Min'}
                    </div>
                    <div className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 bg-gray-100 opacity-60 text-gray-500">
                      {selectedAmPm || 'AM'}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedHour12}
                      onChange={(e) => {
                        const hour12 = e.target.value;
                        setSelectedHour12(hour12);
                        updateTimeFrom12h(hour12, selectedMinute, selectedAmPm);
                      }}
                      className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                      required
                    >
                      <option value="">Hour</option>
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                    <span className="text-gray-500 font-medium">:</span>
                    <select
                      value={selectedMinute}
                      onChange={(e) => {
                        const minute = e.target.value;
                        setSelectedMinute(minute);
                        updateTimeFrom12h(selectedHour12, minute, selectedAmPm);
                      }}
                      className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                      required
                    >
                      <option value="">Min</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i * 5;
                        return (
                          <option key={m} value={String(m).padStart(2, '0')}>
                            {String(m).padStart(2, '0')}
                          </option>
                        );
                      })}
                    </select>
                    <select
                      value={selectedAmPm}
                      onChange={(e) => {
                        const amPm = e.target.value as 'AM' | 'PM';
                        setSelectedAmPm(amPm);
                        updateTimeFrom12h(selectedHour12, selectedMinute, amPm);
                      }}
                      className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                )}
                {!hasUnrestrictedClock && (
                  <p className="text-xs text-gray-500 mt-2">
                    Time is locked. Contact an administrator to enable time editing.
                  </p>
                )}
              </div>

              {/* Manual Break Time (only for Clock Out) */}
              {clockType === 'out' && (
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={insertBreakTime}
                      onChange={(e) => setInsertBreakTime(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red focus:ring-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Insert Break Time</span>
                  </label>
                  {insertBreakTime && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="flex gap-3 items-center">
                        <label className="text-sm text-gray-600 w-16">Hours:</label>
                        <select
                          value={breakHours}
                          onChange={(e) => setBreakHours(e.target.value)}
                          className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                        >
                          {Array.from({ length: 3 }, (_, i) => (
                            <option key={i} value={String(i)}>
                              {i}
                            </option>
                          ))}
                        </select>
                        <label className="text-sm text-gray-600 w-16">Minutes:</label>
                        <select
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(e.target.value)}
                          className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
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
                    </div>
                  )}
                </div>
              )}

              {/* GPS Status - Styled as success card */}
              <div>
                {gpsLocation ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                    <div className="flex items-center gap-2 text-green-800 font-medium">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Location captured</span>
                    </div>
                    <div className="text-sm text-green-700 mt-1.5">
                      Accuracy: {Math.round(gpsLocation.accuracy)}m
                    </div>
                  </div>
                ) : gpsLoading ? (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-center gap-2 text-blue-800">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-800 border-t-transparent"></div>
                      <span className="text-sm font-medium">Getting location...</span>
                    </div>
                  </div>
                ) : gpsError ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <div className="text-sm text-yellow-800">
                      {gpsError}
                      <button
                        onClick={getCurrentLocation}
                        className="ml-2 text-xs underline font-medium hover:text-yellow-900"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                    <div className="text-sm text-gray-600">No location data</div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  setClockType(null);
                  setSelectedTime('');
                  setSelectedHour12('');
                  setSelectedMinute('');
                  setInsertBreakTime(false);
                  setBreakHours('0');
                  setBreakMinutes('0');
                  setGpsLocation(null);
                  setGpsError('');
                }}
                className="px-4 py-2.5 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleClockInOut}
                disabled={submitting}
                className="px-4 py-2.5 rounded-lg bg-brand-red text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Attendance Modal */}
      {editingAttendance && editingType && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingAttendance(null);
              setEditingType(null);
              setEditTime('');
              setEditHour12('');
              setEditMinute('');
              setEditAmPm('AM');
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-gray-200/60 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200/60 flex-shrink-0">
              <h3 className="text-xl font-semibold text-gray-900">
                Edit Clock {editingType === 'in' ? 'In' : 'Out'} Time
              </h3>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              {/* Time selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time *</label>
                <div className="flex gap-2 items-center">
                  <select
                    value={editHour12}
                    onChange={(e) => {
                      const hour12 = e.target.value;
                      setEditHour12(hour12);
                      updateEditTimeFrom12h(hour12, editMinute, editAmPm);
                    }}
                    className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                    required
                  >
                    <option value="">Hour</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-500 font-medium">:</span>
                  <select
                    value={editMinute}
                    onChange={(e) => {
                      const minute = e.target.value;
                      setEditMinute(minute);
                      updateEditTimeFrom12h(editHour12, minute, editAmPm);
                    }}
                    className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                    required
                  >
                    <option value="">Min</option>
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i * 5;
                      return (
                        <option key={m} value={String(m).padStart(2, '0')}>
                          {String(m).padStart(2, '0')}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={editAmPm}
                    onChange={(e) => {
                      const amPm = e.target.value as 'AM' | 'PM';
                      setEditAmPm(amPm);
                      updateEditTimeFrom12h(editHour12, editMinute, amPm);
                    }}
                    className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                    required
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              {/* Break Time (only for clock-out or complete attendance) */}
              {(editingType === 'out' || (editingType === 'in' && editingAttendance.clock_out_time)) && (
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editInsertBreakTime}
                      onChange={(e) => setEditInsertBreakTime(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red focus:ring-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Insert Break Time</span>
                  </label>
                  {editInsertBreakTime && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="flex gap-3 items-center">
                        <label className="text-sm text-gray-600 w-16">Hours:</label>
                        <select
                          value={editBreakHours}
                          onChange={(e) => setEditBreakHours(e.target.value)}
                          className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                        >
                          {Array.from({ length: 3 }, (_, i) => (
                            <option key={i} value={String(i)}>
                              {i}
                            </option>
                          ))}
                        </select>
                        <label className="text-sm text-gray-600 w-16">Minutes:</label>
                        <select
                          value={editBreakMinutes}
                          onChange={(e) => setEditBreakMinutes(e.target.value)}
                          className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
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
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  setEditingAttendance(null);
                  setEditingType(null);
                  setEditTime('');
                  setEditHour12('');
                  setEditMinute('');
                  setEditAmPm('AM');
                  setEditInsertBreakTime(false);
                  setEditBreakHours('0');
                  setEditBreakMinutes('0');
                }}
                className="px-4 py-2.5 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleEditAttendance}
                disabled={editingSubmitting || !editTime}
                className="px-4 py-2.5 rounded-lg bg-brand-red text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {editingSubmitting ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Break Time Only Modal */}
      {editingBreakTimeAttendance && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingBreakTimeAttendance(null);
              setEditBreakTimeOnly(false);
              setEditBreakTimeHours('0');
              setEditBreakTimeMinutes('0');
            }
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-gray-200/60 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200/60 flex-shrink-0">
              <h3 className="text-xl font-semibold text-gray-900">
                Edit Break Time
              </h3>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto">
              {/* Break Time Toggle */}
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editBreakTimeOnly}
                    onChange={(e) => setEditBreakTimeOnly(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red focus:ring-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Insert Break Time</span>
                </label>
                {editBreakTimeOnly && (
                  <div className="mt-3 ml-7 space-y-3">
                    <div className="flex gap-3 items-center">
                      <label className="text-sm text-gray-600 w-16">Hours:</label>
                      <select
                        value={editBreakTimeHours}
                        onChange={(e) => setEditBreakTimeHours(e.target.value)}
                        className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
                      >
                        {Array.from({ length: 3 }, (_, i) => (
                          <option key={i} value={String(i)}>
                            {i}
                          </option>
                        ))}
                      </select>
                      <label className="text-sm text-gray-600 w-16">Minutes:</label>
                      <select
                        value={editBreakTimeMinutes}
                        onChange={(e) => setEditBreakTimeMinutes(e.target.value)}
                        className="flex-1 border border-gray-200/60 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-red/40 focus:border-brand-red/60 transition-colors"
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
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => {
                  setEditingBreakTimeAttendance(null);
                  setEditBreakTimeOnly(false);
                  setEditBreakTimeHours('0');
                  setEditBreakTimeMinutes('0');
                }}
                className="px-4 py-2.5 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleEditBreakTimeOnly}
                disabled={editingBreakTimeSubmitting}
                className="px-4 py-2.5 rounded-lg bg-brand-red text-white hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {editingBreakTimeSubmitting ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
