import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';

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
  
  // Helper to check if a clock-in/out pair forms a complete "hours worked" event
  // This is different from checking a single attendance record
  const isCompleteHoursWorkedEvent = (clockIn: Attendance | null, clockOut: Attendance | null): boolean => {
    if (!clockIn || !clockOut) return false;
    return isHoursWorked(clockIn) && isHoursWorked(clockOut);
  };

  // NEW MODEL: Check if there's an open clock-in (one with clock_in_time but no clock_out_time)
  // IMPORTANT: "hours worked" entries are always complete (both clock_in_time and clock_out_time exist)
  // and should never be treated as "open"
  const hasOpenClockIn = useMemo(() => {
    // Find the most recent attendance with clock_in_time but no clock_out_time
    // (excluding "hours worked" entries which always have both)
    for (const att of allAttendancesForDate) {
      // Must have clock_in_time
      if (!att.clock_in_time) continue;
      
      // If it's a "hours worked" entry, it should have clock_out_time (complete event)
      if (isHoursWorked(att)) {
        // "hours worked" entries should always be complete, but check just in case
        if (att.clock_out_time) {
          continue; // Complete "hours worked" event, check next
        }
        // Data inconsistency: "hours worked" without clock_out_time, skip it
        continue;
      }
      
      // Regular attendance: if it has clock_in_time but no clock_out_time, it's open
      if (!att.clock_out_time) {
        return true; // Found an open clock-in
      }
    }
    
    return false; // No open clock-ins found
  }, [allAttendancesForDate]);

  // Find the most recent open clock-in for canClockOut and isJobLocked
  const openClockIn = useMemo(() => {
    return allAttendancesForDate.find(att => 
      att.clock_in_time && !att.clock_out_time && !isHoursWorked(att)
    ) || null;
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
  
  // Can clock in ONLY if there's NO open clock-in (must close current event first)
  // This ensures events are created sequentially: clock-in -> clock-out -> clock-in -> clock-out
  // EXCEPTION: "hours worked" entries are always complete, so they don't block clock-in
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
  

  // Fetch weekly summary
  const { data: weeklySummary, refetch: refetchWeeklySummary } = useQuery({
    queryKey: ['weekly-attendance-summary', weekStartStr, currentUser?.id],
    queryFn: () => api<WeeklySummary>('GET', `/dispatch/attendance/weekly-summary?week_start=${weekStartStr}`),
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

    if (!selectedTime || !selectedTime.includes(':')) {
      toast.error('Please select a time');
      return;
    }

    // Validate time format and 5-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
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

    setSubmitting(true);

    try {
      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await refetchAllAttendances();  // This will update clockIn, clockOut, clockIns, clockOuts, hasOpenClockIn
      await refetchAttendances();
      await refetchWeeklySummary();
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-shifts'] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to submit attendance';
      toast.error(errorMsg);
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
  const weekRangeLabel = useMemo(() => {
    if (!weeklySummary) return '';
    const start = new Date(weeklySummary.week_start);
    const end = new Date(weeklySummary.week_end);
    const startMonth = formatDate(weeklySummary.week_start).split(' ')[0];
    const endMonth = formatDate(weeklySummary.week_end);
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()}, ${startMonth} - ${end.getDate()}, ${endMonth}`;
    }
    return `${formatDate(weeklySummary.week_start)} - ${endMonth}`;
  }, [weeklySummary]);

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold mb-3">Clock in/out</h1>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Left column - Clock In/Out Form */}
        <div className="rounded-xl border bg-white p-6 space-y-6">
          {/* Date Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 w-full"
            />
          </div>

          {/* Message based on shift status */}
          {selectedDateShift ? (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium">
                You are assigned for a shift {selectedDate === todayStr ? 'today' : `on ${formatDate(selectedDate)}`} at the project {selectedDateShift.project_name || 'Unknown'}
              </p>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium">
                You are not assigned for any specific project {selectedDate === todayStr ? 'today' : `on ${formatDate(selectedDate)}`}
              </p>
            </div>
          )}

          {/* Shift Details (if scheduled) */}
          {selectedDateShift && (
            <div className="border rounded-lg p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Shift Details</h3>
                <div className="space-y-3">
                  {/* Project Name */}
                  {selectedDateShift.project_name && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                      <div className="text-gray-900">{selectedDateShift.project_name}</div>
                    </div>
                  )}

                  {/* Date and Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                    <div className="text-gray-900">
                      {new Date(selectedDateShift.date).toLocaleDateString()} • {formatTime12h(selectedDateShift.start_time)} - {formatTime12h(selectedDateShift.end_time)}
                    </div>
                  </div>

                  {/* Worker */}
                  {(() => {
                    const worker = employees?.find((e: any) => e.id === selectedDateShift.worker_id);
                    return worker ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
                        <div className="text-gray-900">{worker.name || worker.username}</div>
                      </div>
                    ) : null;
                  })()}

                  {/* Supervisor of Worker */}
                  {workerProfile?.manager_user_id && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
                      <div className="text-gray-900">
                        {(() => {
                          const supervisor = employees?.find((e: any) => e.id === workerProfile.manager_user_id);
                          return supervisor?.name || supervisor?.username || 'N/A';
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Job Type */}
                  {selectedDateShift.job_name && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                      <div className="text-gray-900">{selectedDateShift.job_name}</div>
                    </div>
                  )}

                  {/* Address */}
                  {project && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <div className="text-gray-900">
                        {(() => {
                          // First try to use project address fields
                          let addressParts = [
                            project.address,
                            project.address_city,
                            project.address_province,
                            project.address_country,
                          ].filter(Boolean);
                          
                          // If no project address, fallback to site address fields
                          if (addressParts.length === 0) {
                            addressParts = [
                              project.site_address_line1,
                              project.site_city,
                              project.site_province,
                              project.site_country,
                            ].filter(Boolean);
                          }
                          
                          return addressParts.length > 0
                            ? addressParts.join(', ')
                            : 'No address available';
                        })()}
                      </div>
                    </div>
                  )}

                  {/* On-site Lead */}
                  {project?.onsite_lead_id && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">On-site Lead</label>
                      <div className="text-gray-900">
                        {(() => {
                          const onsiteLead = employees?.find((e: any) => e.id === project.onsite_lead_id);
                          return onsiteLead?.name || onsiteLead?.username || 'N/A';
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Current Status - show only when there's an open clock-in (without clock-out) */}
              {/* After clock-out, the event is closed and this section disappears */}
              {selectedDateShift && hasOpenClockIn && openClockIn && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Clock In:</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          openClockIn.status === 'approved' ? 'bg-green-100 text-green-800' :
                          openClockIn.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {openClockIn.status}
                        </span>
                        <span className="font-medium">
                          {new Date(openClockIn.clock_in_time).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-600">
                    * You have an open clock-in. Clock out to close this period.
                  </div>
                </div>
              )}

              {/* Clock In/Out Buttons */}
              <div className="pt-4 border-t space-y-2">
                <button
                  onClick={() => setClockType('in')}
                  disabled={!canClockIn || submitting}
                  className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                    canClockIn
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={hasOpenClockIn ? 'You must clock out first to close the current event before starting a new one' : ''}
                >
                  Clock In
                </button>
                <button
                  onClick={() => {
                    // Ensure job is set from clock-in before opening modal (for scheduled shifts, job comes from shift)
                    setClockType('out');
                  }}
                  disabled={!canClockOut || submitting}
                  className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                    canClockOut
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={!hasOpenClockIn ? 'You must clock in first before clocking out' : !canClockOut ? 'Clock-in must be approved or pending' : ''}
                >
                  Clock Out
                </button>
              </div>
            </div>
          )}

          {/* Job Selector and Clock In/Out (if no scheduled shift) */}
          {!selectedDateShift && (
            <div className="border rounded-lg p-4 space-y-4">
              {/* Job Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job <span className="text-red-500">*</span>
                  {isJobLocked && clockInJobType && (
                    <span className="ml-2 text-xs text-gray-500">(Locked - same as clock-in)</span>
                  )}
                </label>
                <select
                  value={isJobLocked && clockInJobType ? clockInJobType : selectedJob}
                  onChange={(e) => !isJobLocked && setSelectedJob(e.target.value)}
                  disabled={isJobLocked}
                  className={`w-full rounded-lg border border-gray-300 px-4 py-2 ${
                    isJobLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                  required
                >
                  <option value="">Select a job...</option>
                  {jobOptions.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.code} - {job.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Status for non-scheduled - show only when there's an open clock-in (without clock-out) */}
              {/* After clock-out, the event is closed and this section disappears */}
              {hasOpenClockIn && openClockIn && !isHoursWorked(openClockIn) && (
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Clock In:</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          openClockIn.status === 'approved' ? 'bg-green-100 text-green-800' :
                          openClockIn.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {openClockIn.status}
                        </span>
                        <span className="font-medium">
                          {new Date(openClockIn.clock_in_time).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-600">
                    * You have an open clock-in. Clock out to close this period.
                  </div>
                </div>
              )}

              {/* Clock In/Out Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => setClockType('in')}
                  disabled={!selectedJob || submitting || !canClockIn}
                  className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                    selectedJob && canClockIn
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={hasOpenClockIn ? 'You must clock out first to close the current event before starting a new one' : !selectedJob ? 'Please select a job' : ''}
                >
                  Clock In
                </button>
                <button
                  onClick={() => {
                    // Ensure job is set from clock-in before opening modal
                    if (isJobLocked && clockInJobType) {
                      setSelectedJob(clockInJobType);
                    }
                    setClockType('out');
                  }}
                  disabled={submitting || !canClockOut || (!selectedJob && !clockInJobType)}
                  className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                    canClockOut && (selectedJob || clockInJobType)
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                  title={!hasOpenClockIn ? 'You must clock in first before clocking out' : !canClockOut ? 'Clock-in must be approved or pending' : !selectedJob && !clockInJobType ? 'Job not selected' : ''}
                >
                  Clock Out
                </button>
              </div>
            </div>
          )}

          {/* Clock Modal */}
          {clockType && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-semibold">
                  Clock {clockType === 'in' ? 'In' : 'Out'}
                </h3>

                {/* Time selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
                  {!hasUnrestrictedClock ? (
                    <div className="flex gap-2 items-center pointer-events-none">
                      <div className="flex-1 border rounded px-3 py-2 bg-gray-100 opacity-60 text-gray-500">
                        {selectedHour12 || 'Hour'}
                      </div>
                      <span className="text-gray-500 font-medium">:</span>
                      <div className="flex-1 border rounded px-3 py-2 bg-gray-100 opacity-60 text-gray-500">
                        {selectedMinute || 'Min'}
                      </div>
                      <div className="flex-1 border rounded px-3 py-2 bg-gray-100 opacity-60 text-gray-500">
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
                        className="flex-1 border rounded px-3 py-2"
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
                        className="flex-1 border rounded px-3 py-2"
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
                        className="flex-1 border rounded px-3 py-2"
                        required
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  )}
                  {!hasUnrestrictedClock && (
                    <p className="text-xs text-gray-500 mt-1">
                      Time is locked. Contact an administrator to enable time editing.
                    </p>
                  )}
                </div>

                {/* Manual Break Time (only for Clock Out) */}
                {clockType === 'out' && (
                  <div>
                    <label className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={insertBreakTime}
                        onChange={(e) => setInsertBreakTime(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                      />
                      <span className="text-sm font-medium text-gray-700">Insert Break Time</span>
                    </label>
                    {insertBreakTime && (
                      <div className="ml-6 space-y-2">
                        <div className="flex gap-2 items-center">
                          <label className="text-xs text-gray-600 w-12">Hours:</label>
                          <select
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            className="flex-1 border rounded px-3 py-2"
                          >
                            {Array.from({ length: 3 }, (_, i) => (
                              <option key={i} value={String(i)}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <label className="text-xs text-gray-600 w-12 ml-2">Minutes:</label>
                          <select
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            className="flex-1 border rounded px-3 py-2"
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

                {/* GPS Status */}
                <div>
                  {gpsLocation ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                      <div className="text-green-800">✓ Location captured</div>
                      <div className="text-xs text-green-600 mt-1">
                        Accuracy: {Math.round(gpsLocation.accuracy)}m
                      </div>
                    </div>
                  ) : gpsLoading ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800"></div>
                        <span>Getting location...</span>
                      </div>
                    </div>
                  ) : gpsError ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      {gpsError}
                      <button
                        onClick={getCurrentLocation}
                        className="ml-2 text-xs underline"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                      No location data
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
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
                    className="flex-1 px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClockInOut}
                    disabled={submitting || !selectedTime}
                    className="flex-1 px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column - Weekly Summary */}
        <div className="rounded-xl border bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Weekly Summary</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPreviousWeek}
                className="px-2 py-1 rounded border text-sm hover:bg-gray-50"
              >
                ←
              </button>
              <button
                onClick={goToCurrentWeek}
                className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
              >
                Today
              </button>
              <button
                onClick={goToNextWeek}
                className="px-2 py-1 rounded border text-sm hover:bg-gray-50"
              >
                →
              </button>
            </div>
          </div>

          {weeklySummary && (
            <>
              <div className="text-sm text-gray-600 text-center">
                {weekRangeLabel}
              </div>

              {/* Total Hours Summary */}
              <div className="grid grid-cols-5 gap-2 text-sm border-b pb-3">
                <div className="text-center">
                  <div className="text-gray-600">Reg</div>
                  <div className="font-medium">{weeklySummary.reg_hours_formatted || '0h 00m'}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600">OT1</div>
                  <div className="font-medium">0h 00m</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600">OT2</div>
                  <div className="font-medium">0h 00m</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600">Break</div>
                  <div className="font-medium">{weeklySummary.total_break_formatted || '0h 00m'}</div>
                </div>
                <div className="text-center">
                  <div className="text-gray-600">Total</div>
                  <div className="font-medium">{weeklySummary.total_hours_formatted || '0h 00m'}</div>
                </div>
              </div>

              {/* Daily Entries */}
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
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
                    <div key={uniqueKey} className="border-b pb-3 last:border-b-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {day.day_name}, {formatDate(day.date)}
                          </div>
                          <div className="text-xs text-gray-600 space-y-1 mt-1">
                            {day.job_name && (
                              <div>Job: {day.job_type || ''} - {day.job_name}</div>
                            )}
                            <div>Service Item: 1 - Regular</div>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-sm font-medium">
                            {day.hours_worked_formatted || '0h 00m'}
                          </div>
                          {timeRange && (
                            <div className="text-xs text-gray-600 mt-1">
                              {timeRange}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {(!weeklySummary.days || weeklySummary.days.filter(d => d.clock_in || d.clock_out).length === 0) && (
                  <div className="text-center text-gray-500 py-8 text-sm">
                    No attendance records for this week
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
