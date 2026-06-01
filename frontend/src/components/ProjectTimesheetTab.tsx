import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import SubcontractorClockModal from '@/components/SubcontractorClockModal';
import {
  editTimeEntryQuickInfo,
  projectClockInOutQuickInfo,
} from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppSectionHeader,
  AppSelect,
  AppTable,
  AppTextarea,
  AppTimePicker,
  appSectionPresetProps,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiSpacing,
} from '@/components/ui';

type Project = {
  id: string;
  code?: string;
  name?: string;
  division_onsite_leads?: Record<string, string>;
  onsite_lead_id?: string;
};

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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  return `${month} ${day}`;
}

function formatHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}min`;
}

export default function ProjectTimesheetTab({
  projectId,
  statusLabel,
  designSystem,
}: {
  projectId: string;
  statusLabel?: string;
  designSystem?: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [month, setMonth] = useState<string>(getCurrentMonthLocal());
  const [userFilter, setUserFilter] = useState<string>('');
  
  // Edit time entry modal state
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [editBreakMinutes, setEditBreakMinutes] = useState<string>('0');
  const [subcontractorClockOpen, setSubcontractorClockOpen] = useState(false);
  
  // Fetch project details for confirmation messages
  const { data: projectData } = useQuery({ 
    queryKey: ['project', projectId], 
    queryFn: () => api<Project>('GET', `/projects/${projectId}`) 
  });
  
  // Check if editing is restricted based on status (On Hold and Finished restrict editing for timesheet)
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'on hold' || statusLower === 'finished';
  }, [statusLabel]);
  
  const qs = useMemo(()=>{
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    if (userFilter) p.set('user_id', userFilter);
    const s = p.toString();
    return s? ('?'+s): '';
  }, [month, userFilter]);
  const { data, refetch } = useQuery({ queryKey:['timesheet', projectId, qs], queryFn: ()=> api<any[]>(`GET`, `/projects/${projectId}/timesheet${qs}`), refetchInterval: 10000 });
  const entries = data||[];
  const [workDate, setWorkDate] = useState<string>(formatDateLocal(new Date()));
  
  // Get timesheet settings for default break
  const { data: settings } = useQuery({ queryKey:['settings-bundle'], queryFn: ()=>api<Record<string, any[]>>('GET','/settings') });
  const defaultBreakMin = useMemo(() => {
    const timesheetItems = (settings?.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    return breakItem?.value ? parseInt(breakItem.value, 10) : 30;
  }, [settings]);
  
  // Fetch all shifts for the project to get break minutes for each entry
  // We need to fetch shifts for the month range to get break minutes
  const monthRange = useMemo(() => {
    if (!month) return null;
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const firstDay = new Date(year, monthNum - 1, 1);
      const lastDay = new Date(year, monthNum, 0);
      return `${formatDateLocal(firstDay)},${formatDateLocal(lastDay)}`;
    } catch {
      return null;
    }
  }, [month]);
  
  const { data: allShifts } = useQuery({
    queryKey: ['dispatch-shifts-all', projectId, monthRange],
    queryFn: () => api<any[]>('GET', `/dispatch/projects/${projectId}/shifts${monthRange ? `?date_range=${monthRange}` : ''}`),
    enabled: !!projectId
  });

  // Timesheet audit logs (read-permitted source used as fallback for View Timesheet users)
  const logsMonth = useMemo(() => {
    const d = String(workDate || '').slice(0, 7);
    if (d) return d;
    return String(month || '').slice(0, 7) || getCurrentMonthLocal();
  }, [workDate, month]);
  const logsQs = useMemo(() => {
    const p = new URLSearchParams();
    if (logsMonth) p.set('month', logsMonth);
    p.set('limit', '500');
    p.set('offset', '0');
    const s = p.toString();
    return s ? ('?' + s) : '';
  }, [logsMonth]);
  const { data: timesheetLogs } = useQuery({
    queryKey: ['timesheetLogsMini', projectId, logsQs],
    queryFn: () => api<any[]>('GET', `/projects/${projectId}/timesheet/logs${logsQs}`),
    enabled: !!projectId
  });
  
  // Create a map of shifts by user_id and work_date for quick lookup
  const shiftsByUserAndDate = useMemo(() => {
    const map: Record<string, any> = {};
    if (allShifts) {
      allShifts.forEach((shift: any) => {
        const key = `${shift.worker_id}_${shift.date}`;
        if (!map[key] || !Array.isArray(map[key])) {
          map[key] = [];
        }
        map[key].push(shift);
      });
    }
    return map;
  }, [allShifts]);

  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });

  // Find latest attendance-related log for a worker/date/type (clock-in / clock-out)
  const findAttendanceLog = useCallback((workerId: any, dateStr: string, type: 'in'|'out') => {
    const logs = (timesheetLogs || []) as any[];
    if (!logs.length || !workerId || !dateStr) return null;
    const day = String(dateStr).slice(0, 10);
    const wantType = type === 'in' ? 'clock-in' : 'clock-out';
    const worker = (employees || []).find((e: any) => String(e.id) === String(workerId));
    const workerName = worker?.name || worker?.username || '';
    const matches = logs.filter((l: any) => {
      const ch = l?.changes || {};
      if (!ch?.attendance_type) return false;
      if (String(ch.attendance_type) !== wantType) return false;
      if (ch.work_date && String(ch.work_date).slice(0, 10) !== day) return false;
      if (ch.worker_id && String(ch.worker_id) === String(workerId)) return true;
      if (workerName && ch.worker_name && String(ch.worker_name).toLowerCase() === String(workerName).toLowerCase()) return true;
      return false;
    });
    if (!matches.length) return null;
    matches.sort((a: any, b: any) => {
      const aT = new Date(a?.changes?.time_entered || a?.changes?.time_selected || a?.timestamp || 0).getTime();
      const bT = new Date(b?.changes?.time_entered || b?.changes?.time_selected || b?.timestamp || 0).getTime();
      return bT - aT;
    });
    return matches[0];
  }, [timesheetLogs, employees]);

  const formatTimeFromIsoToHHMMSSLocal = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}:00`;
  };

  // Read-only derived entries from logs (so View Timesheet users can still see history)
  const displayEntries = useMemo(() => {
    if (entries && entries.length) return entries;
    const logs = (timesheetLogs || []) as any[];
    if (!logs.length) return entries;
    const rows: any[] = [];
    const seen = new Set<string>();

    // Prefer shifts (project-scoped) to build per-worker/day rows
    const keys = Object.keys(shiftsByUserAndDate || {});
    for (const key of keys) {
      const parts = key.split('_');
      const workerId = parts[0];
      const workDateStr = parts.slice(1).join('_');
      if (!workerId || !workDateStr) continue;
      if (month && String(workDateStr).slice(0,7) !== String(month).slice(0,7)) continue;
      if (userFilter && String(userFilter) !== String(workerId)) continue;

      const clockInLog = findAttendanceLog(workerId, workDateStr, 'in');
      const clockOutLog = findAttendanceLog(workerId, workDateStr, 'out');
      if (!clockInLog && !clockOutLog) continue;

      const clockInIso = clockInLog?.changes?.time_selected || clockInLog?.changes?.time_entered || null;
      const clockOutIso = clockOutLog?.changes?.time_selected || clockOutLog?.changes?.time_entered || null;

      let minutes = 0;
      if (clockInIso && clockOutIso) {
        const a = new Date(clockInIso).getTime();
        const b = new Date(clockOutIso).getTime();
        if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) minutes = Math.floor((b - a) / 60000);
      }

      const emp = (employees || []).find((e: any) => String(e.id) === String(workerId));
      const rowId = `attendance-${workerId}-${String(workDateStr).slice(0,10)}`;
      if (seen.has(rowId)) continue;
      seen.add(rowId);

      rows.push({
        id: rowId,
        user_id: workerId,
        user_name: emp?.name || emp?.username || (clockInLog?.changes?.worker_name || clockOutLog?.changes?.worker_name || ''),
        user_avatar_file_id: emp?.profile_photo_file_id || null,
        work_date: String(workDateStr).slice(0,10),
        start_time: formatTimeFromIsoToHHMMSSLocal(clockInIso),
        end_time: formatTimeFromIsoToHHMMSSLocal(clockOutIso),
        minutes,
        break_minutes: 0,
        is_from_attendance: true,
        notes: 'Clock-in via attendance system'
      });
    }

    return rows;
  }, [entries, timesheetLogs, shiftsByUserAndDate, employees, month, userFilter, findAttendanceLog]);

  // Calculate total minutes with break deduction
  // Use break_minutes from backend (already calculated using same function as attendance table)
  const { minutesTotal, breakTotal } = useMemo(() => {
    let total = 0;
    let breakTotal = 0;
    (displayEntries || []).forEach((e: any) => {
      // e.minutes is already net minutes (after break deduction) for attendance entries
      const entryMinutes = Number(e.minutes || 0);
      total += entryMinutes;
      const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? e.break_minutes : 0;
      breakTotal += breakMin;
    });
    return { minutesTotal: total, breakTotal };
  }, [displayEntries]);
  
  const hoursTotalMinutes = minutesTotal; // Already net (after break)
  
  // Get current user info to check if supervisor/admin
  const { data: currentUser } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  
  // Check permissions for timesheet
  const isAdmin = (currentUser?.roles||[]).includes('admin');
  const permissions = new Set(currentUser?.permissions || []);
  const hasEditTimesheetPermission = isAdmin || permissions.has('business:projects:timesheet:write');
  const canEditTimesheet = hasEditTimesheetPermission && !isEditingRestricted;
  const canEditAttendance = isAdmin || permissions.has('hr:attendance:write') || permissions.has('hr:users:edit:timesheet') || permissions.has('users:write');
  
  // Check if user is supervisor or admin
  const isSupervisorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roles = currentUser.roles || [];
    const permissions = currentUser.permissions || [];
    return roles.includes('admin') || roles.includes('supervisor') || permissions.includes('dispatch:write');
  }, [currentUser]);

  // Check if user is on-site lead of the project
  const isOnSiteLead = useMemo(() => {
    if (!currentUser || !projectData) return false;
    const userId = String(currentUser.id);
    
    // Check division_onsite_leads
    if (projectData.division_onsite_leads) {
      for (const divisionId in projectData.division_onsite_leads) {
        const leadId = projectData.division_onsite_leads[divisionId];
        if (String(leadId) === userId) {
          return true;
        }
      }
    }
    
    // Check legacy onsite_lead_id field
    if (projectData.onsite_lead_id && String(projectData.onsite_lead_id) === userId) {
      return true;
    }
    
    return false;
  }, [currentUser, projectData]);

  // In Projects > Timesheet, clock-in/out actions are allowed for admins/supervisors/on-site leads
  // as long as they have attendance edit permissions (or business timesheet write).
  // Also restricted by project status (On Hold and Finished)
  const canProjectClockActions = useMemo(() => {
    if (isEditingRestricted) return false;
    return !!(canEditTimesheet || (canEditAttendance && (isSupervisorOrAdmin || isOnSiteLead)));
  }, [canEditTimesheet, canEditAttendance, isSupervisorOrAdmin, isOnSiteLead, isEditingRestricted]);
  
  // Fetch shifts for the selected date
  const dateRange = useMemo(() => {
    return `${workDate},${workDate}`;
  }, [workDate]);

  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts', projectId, dateRange],
    queryFn: async () => {
      try {
        const allShifts = await api<any[]>('GET', `/dispatch/projects/${projectId}/shifts?date_range=${dateRange}`);
        // Return all shifts (not just scheduled) to show all shifts including those with attendances
        return allShifts;
      } catch {
        return [];
      }
    },
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Fetch attendance records for shifts
  const { data: attendances, refetch: refetchAttendances } = useQuery({
    queryKey: ['attendances', projectId, workDate, shifts?.map((s: any) => s.id).join(',')],
    queryFn: async () => {
      if (!shifts || shifts.length === 0) return [];
      try {
        const attendancePromises = shifts.map((shift: any) =>
          api<any[]>('GET', `/dispatch/shifts/${shift.id}/attendance`).catch(() => [])
        );
        const results = await Promise.all(attendancePromises);
        return results.flat();
      } catch {
        return [];
      }
    },
    enabled: !!shifts && shifts.length > 0,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Clock-in/out state
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>(''); // Stores time in 24h format (HH:MM) for backend
  const [selectedHour12, setSelectedHour12] = useState<string>(''); // Stores hour in 12h format (1-12)
  const [selectedMinute, setSelectedMinute] = useState<string>(''); // Stores minute in 5-minute increments (00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM'); // Stores AM/PM
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showClockModal, setShowClockModal] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<{ inside: boolean; distance?: number; radius?: number } | null>(null);
  
  // Manual break time (only for clock out)
  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

  const closeClockModal = () => {
    setShowClockModal(false);
    setSelectedShift(null);
    setClockType(null);
    setSelectedTime('');
    setSelectedHour12('');
    setSelectedMinute('');
    setReasonText('');
  };

  // Escape to close clock modal
  useEffect(() => {
    if (!showClockModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeClockModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showClockModal]);

  // Prevent body scroll when clock modal is open
  useEffect(() => {
    if (!showClockModal) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showClockModal]);

  // Haversine distance calculation (same as backend)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  };

  // Check if GPS location is inside geofence
  const checkGeofence = (lat: number, lng: number, geofences: any[] | null | undefined) => {
    if (!geofences || geofences.length === 0) {
      setGeofenceStatus(null); // No geofence - don't set status, message won't show
      return;
    }

    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      
      if (distance <= radiusM) {
        setGeofenceStatus({ inside: true, distance: Math.round(distance), radius: radiusM });
        return;
      }
    }
    
    // Find the closest geofence to show distance
    let minDistance = Infinity;
    let closestRadius = 150;
    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      if (distance < minDistance) {
        minDistance = distance;
        closestRadius = radiusM;
      }
    }
    
    setGeofenceStatus({ inside: false, distance: Math.round(minDistance), radius: closestRadius });
  };

  // Get GPS location
  const getCurrentLocation = (shiftForGeofence?: any): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      setGpsLoading(true);
      setGpsError('');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLoading(false);
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
          };
          setGpsLocation(location);
          
          // Check geofence if shift has geofences
          // Use shiftForGeofence if provided, otherwise use selectedShift
          const shiftToCheck = shiftForGeofence || selectedShift;
          if (shiftToCheck?.geofences && shiftToCheck.geofences.length > 0) {
            checkGeofence(location.lat, location.lng, shiftToCheck.geofences);
          } else {
            setGeofenceStatus(null); // No geofence - don't set status, message won't show
          }
          
          resolve(location);
        },
        (error) => {
          setGpsLoading(false);
          const errorMsg =
            error.code === 1
              ? 'Location permission denied'
              : error.code === 2
              ? 'Location unavailable'
              : error.code === 3
              ? 'Location request timeout'
              : 'Failed to get location';
          setGpsError(errorMsg);
          setGpsLocation(null);
          setGeofenceStatus(null);
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Helper function to convert 24h to 12h format
  const convert24hTo12h = (hour24: number): { hour12: number; amPm: 'AM' | 'PM' } => {
    if (hour24 === 0) return { hour12: 12, amPm: 'AM' };
    if (hour24 === 12) return { hour12: 12, amPm: 'PM' };
    if (hour24 < 12) return { hour12: hour24, amPm: 'AM' };
    return { hour12: hour24 - 12, amPm: 'PM' };
  };

  // Helper function to convert 12h to 24h format
  const convert12hTo24h = (hour12: number, amPm: 'AM' | 'PM'): number => {
    if (amPm === 'AM') {
      if (hour12 === 12) return 0;
      return hour12;
    } else {
      if (hour12 === 12) return 12;
      return hour12 + 12;
    }
  };

  // Update selectedTime (24h format) when 12h format changes
  const updateTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (hour12 && minute) {
      const hour12Num = parseInt(hour12, 10);
      if (!isNaN(hour12Num) && hour12Num >= 1 && hour12Num <= 12) {
        const hour24 = convert12hTo24h(hour12Num, amPm);
        const time24h = `${String(hour24).padStart(2, '0')}:${minute}`;
        setSelectedTime(time24h);
      }
    } else {
      // Clear selectedTime if fields are incomplete
      setSelectedTime('');
    }
  };

  // Handle clock-in/out
  const handleClockInOut = async (shift: any, type: 'in' | 'out') => {
    setSelectedShift(shift);
    setClockType(type);
    setReasonText('');
    setGpsError('');
    setGpsLocation(null); // Clear previous location
    setGeofenceStatus(null);
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');

    // Set default time to now (rounded to 5 min) in 12h format
    const now = new Date();
    const hour24 = now.getHours();
    const minutes = Math.round(now.getMinutes() / 5) * 5;
    const { hour12, amPm } = convert24hTo12h(hour24);
    
    setSelectedHour12(String(hour12));
    setSelectedMinute(String(minutes).padStart(2, '0'));
    setSelectedAmPm(amPm);
    
    // Also set in 24h format for backend
    const roundedTime = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSelectedTime(roundedTime);

    // Open modal first so user can see it
    setShowClockModal(true);

    // Try to get GPS location automatically when modal opens
    // Pass shift directly to ensure geofence check uses the correct shift
    setGpsLoading(true);
    try {
      await getCurrentLocation(shift);
    } catch (error) {
      console.warn('GPS location failed:', error);
      // Error is already set by getCurrentLocation, so user will see it in the modal
    } finally {
      setGpsLoading(false);
    }
  };

  // Submit attendance
  const submitAttendance = async () => {
    if (!selectedShift || !clockType) {
      toast.error('Invalid shift or clock type');
      return;
    }

    if (!selectedTime || !selectedTime.includes(':')) {
      toast.error('Please select a time');
      return;
    }

    // Ensure time is in valid format (HH:MM) with 5-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes % 5 !== 0 || minutes < 0 || minutes > 59) {
      toast.error('Please select a valid time in 5-minute increments');
      return;
    }

    // Use shift date, not workDate, to ensure correct date is used
    const shiftDate = selectedShift.date; // Format: YYYY-MM-DD
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const timeSelectedLocal = `${shiftDate}T${timeStr}:00`;

    // Check if user is supervisor/on-site lead doing clock-in/out for another worker
    // This check happens before the 4-minute validation to allow supervisors/on-site leads to set future times
    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
    const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
    // For frontend validation, check both supervisor and on-site lead status
    // Backend will also check on-site lead status, so supervisors and on-site leads can set future times
    const isAuthorizedSupervisor = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;

    // Validate: Allow future times with 4 minute margin
    // This restriction only applies to personal clock-in/out (not when supervisor/on-site lead is clocking in for another worker)
    // When supervisor or on-site lead is clocking in for another worker in Projects > Timesheet, allow any future time
    if (!isAuthorizedSupervisor) {
      // Create date using local timezone explicitly to avoid timezone issues
      const [year, month, day] = shiftDate.split('-').map(Number);
      const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
      const now = new Date();
      const maxFutureMs = 4 * 60 * 1000; // 4 minutes buffer for future times
      if (selectedDateTime.getTime() > (now.getTime() + maxFutureMs)) {
        toast.error('Clock-in/out cannot be more than 4 minutes in the future. Please select a valid time.');
        return;
      }
    }

    // Validate: If clocking out, check that clock-out time is not before or equal to clock-in time
    if (clockType === 'out' && selectedShift) {
      // Find the most recent open clock-in for this shift (one with clock_in_time but no clock_out_time)
      const openClockIn = attendances?.find(
        (a: any) => a.shift_id === selectedShift.id && a.clock_in_time && !a.clock_out_time
      );
      
      if (openClockIn && openClockIn.clock_in_time) {
        const [year, month, day] = shiftDate.split('-').map(Number);
        const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        const clockInDate = new Date(openClockIn.clock_in_time);
        
        // Compare dates in the same timezone (both are local)
        if (selectedDateTime <= clockInDate) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          return;
        }
        
        // Validate break time: break cannot be greater than or equal to total time
        if (insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          const totalMinutes = Math.floor((selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60));
          
          if (breakTotalMinutes >= totalMinutes) {
            toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
            return;
          }
        }
      }
    }

    // Prepare confirmation message
    const time12h = formatTime12h(timeStr);
    const dateFormatted = formatDate(shiftDate);
    const projectName = projectData?.name || projectData?.code || 'Unknown Project';
    
    // Get worker name if supervisor is doing for another worker
    let workerName = '';
    if (isSupervisorDoingForOther && selectedShift?.worker_id) {
      const worker = employees?.find((e: any) => String(e.id) === String(selectedShift.worker_id));
      workerName = worker?.display_name || worker?.name || 'Unknown Worker';
    }
    
    // Build confirmation message
    let confirmationMessage = '';
    if (clockType === 'out' && selectedShift) {
      // Find the open clock-in for detailed confirmation
      const openClockIn = attendances?.find(
        (a: any) => a.shift_id === selectedShift.id && a.clock_in_time && !a.clock_out_time
      );
      
      if (openClockIn && openClockIn.clock_in_time) {
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
        
        // Calculate hours worked
        const [year, month, day] = shiftDate.split('-').map(Number);
        const clockOutDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        const clockInDateTime = new Date(clockInTime);
        const diffMs = clockOutDateTime.getTime() - clockInDateTime.getTime();
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        
        // Subtract break from total minutes to get net hours worked
        const netMinutes = Math.max(0, totalMinutes - breakTotalMinutes);
        const workedHours = Math.floor(netMinutes / 60);
        const workedMinutes = netMinutes % 60;
        const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;
        
        // Build message with worker name if supervisor
        const workerInfo = isSupervisorDoingForOther && workerName ? `Worker: ${workerName}\n` : '';
        
        confirmationMessage = `You are about to clock out with the following details:\n\n` +
          `${workerInfo}Date: ${dateFormatted}\n` +
          `Clock In: ${clockInTime12h}\n` +
          `Clock Out: ${time12h}${breakInfo ? `\n${breakInfo}` : ''}\n` +
          `Hours Worked: ${hoursWorkedStr}\n` +
          `Project: ${projectName}\n\n` +
          `Do you want to confirm?`;
      } else {
        // Fallback if no open clock-in found
        if (isSupervisorDoingForOther && workerName) {
          confirmationMessage = `You are about to clock out for ${workerName} on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
        } else {
          confirmationMessage = `You are about to clock out on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
        }
      }
    } else {
      // Simple confirmation for clock-in
      if (isSupervisorDoingForOther && workerName) {
        confirmationMessage = `You are about to clock in for ${workerName} on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
      } else {
        confirmationMessage = `You are about to clock in on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
      }
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
      const payload: any = {
        shift_id: selectedShift.id,
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add manual break time if checkbox is checked (only for clock out)
      if (clockType === 'out' && insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
        payload.manual_break_minutes = breakTotalMinutes;
      }

      // Add GPS location if available
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      // Check if supervisor or on-site lead is doing for another worker
      const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
      const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
      const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
      const isDoingForOther = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
      
      // Add reason text if provided
      if (isDoingForOther) {
        if (!reasonText || !reasonText.trim() || reasonText.trim().length < 15) {
          toast.error('Reason text is required (minimum 15 characters) when clocking in/out for another user');
          setSubmitting(false);
          return;
        }
        payload.reason_text = reasonText.trim();
      } else if (reasonText && reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      // Use regular attendance endpoint
      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      setSelectedShift(null);
      setClockType(null);
      setSelectedTime('');
      setSelectedHour12('');
      setSelectedMinute('');
      setReasonText('');
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
      setGpsLocation(null);
      setGpsError('');
      closeClockModal();

      // Refetch both shifts and attendances immediately
      await Promise.all([
        refetchShifts(),
        refetchAttendances(),
        refetch()
      ]);
      
      // Invalidate all related queries to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['timesheetLogsMini', projectId] });
      queryClient.invalidateQueries({ queryKey: ['attendances'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      // Extract error message from the error object
      let errorMsg = 'Failed to submit attendance';
      if (error.message) {
        errorMsg = error.message;
      } else if (error.response?.data?.detail) {
        errorMsg = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      toast.error(errorMsg);
      // Log full error for debugging
      console.error('Full error object:', error);
      if (error.response?.data) {
        console.error('Error response:', error.response.data);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Get attendance for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): any => {
    const att = (attendances || []).find((a: any) => a.shift_id === shiftId);
    if (!att) return undefined;
    
    // Return the attendance if it has the requested time field
    if (type === 'in' && att.clock_in_time) return att;
    if (type === 'out' && att.clock_out_time) return att;
    
    // For backward compatibility, check type field
    if (att.type === type) return att;
    
    return undefined;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    if (designSystem) {
      switch (status) {
        case 'approved':
          return <AppBadge variant="success">Approved</AppBadge>;
        case 'pending':
          return <AppBadge variant="warning">Pending</AppBadge>;
        case 'rejected':
          return <AppBadge variant="danger">Rejected</AppBadge>;
        default:
          return null;
      }
    }
    switch (status) {
      case 'approved':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800">Approved</span>;
      case 'pending':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">Pending</span>;
      case 'rejected':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-800">Rejected</span>;
      default:
        return null;
    }
  };

  const employeeSelectOptions = useMemo(
    () => [
      { value: '', label: 'All' },
      ...sortByLabel(employees || [], (emp: any) => (emp.name || emp.username || '').toString()).map((emp: any) => ({
        value: String(emp.id),
        label: emp.name || emp.username || '',
      })),
    ],
    [employees],
  );

  const resetEditForm = () => {
    setEditingEntry(null);
    setEditStartTime('');
    setEditEndTime('');
    setEditBreakMinutes('0');
  };

  const openEditEntry = (e: any) => {
    setEditingEntry(e);
    const startTime = e.start_time ? e.start_time.slice(0, 5) : '';
    const endTime = e.end_time ? e.end_time.slice(0, 5) : '';
    const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? String(e.break_minutes) : '0';
    setEditStartTime(startTime);
    setEditEndTime(endTime);
    setEditBreakMinutes(breakMin);
  };

  const saveEditEntry = async () => {
    if (!editStartTime || !editEndTime) {
      toast.error('Start time and end time are required');
      return;
    }
    try {
      const [startH, startM] = editStartTime.split(':').map(Number);
      const [endH, endM] = editEndTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const minutes = endMinutes - startMinutes;
      if (minutes <= 0) {
        toast.error('End time must be after start time');
        return;
      }
      const breakMin = editBreakMinutes === '' ? 0 : parseInt(editBreakMinutes, 10);
      if (isNaN(breakMin) || breakMin < 0) {
        toast.error('Break minutes must be a valid non-negative number');
        return;
      }
      if (breakMin >= minutes) {
        toast.error('Break time cannot be greater than or equal to total time');
        return;
      }
      const payload: any = {
        start_time: `${editStartTime}:00`,
        end_time: `${editEndTime}:00`,
        minutes,
      };
      if (!isNaN(breakMin)) {
        payload.break_minutes = breakMin;
      }
      await api('PATCH', `/projects/${projectId}/timesheet/${editingEntry.id}`, payload);
      await refetch();
      await refetchAttendances();
      await refetchShifts();
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      toast.success('Time entry updated');
      resetEditForm();
    } catch (_e) {
      toast.error('Failed to update time entry');
    }
  };

  const deleteEntry = async (entryId: string) => {
    const result = await confirm({
      title: 'Delete Time Entry',
      message: 'Are you sure you want to delete this time entry?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    try {
      await api('DELETE', `/projects/${projectId}/timesheet/${entryId}`);
      await refetch();
      await refetchAttendances();
      await refetchShifts();
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
      toast.success('Time entry deleted');
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.toLowerCase().includes('do not have permission') || msg.includes('403')) {
        toast.error('You do not have permission to delete this attendance/time entry');
      } else {
        toast.error('Failed to delete time entry');
      }
    }
  };

  const getEntryRowMeta = (e: any) => {
    const now = new Date();
    const endDt = e.end_time ? new Date(`${e.work_date}T${e.end_time}`) : new Date(`${e.work_date}T23:59:00`);
    const created = e.created_at ? new Date(e.created_at) : null;
    const future = endDt.getTime() > now.getTime();
    let offIcon = '';
    if (created) {
      const wdEnd = new Date(`${e.work_date}T23:59:00`);
      const diffH = (created.getTime() - wdEnd.getTime()) / 3600000;
      if (diffH > 0) {
        if (diffH <= 12) offIcon = '🟢';
        else if (diffH <= 24) offIcon = '🟡';
        else offIcon = '🔴';
      }
    }
    const futIcon = future ? '⏳' : '';
    const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? e.break_minutes : 0;
    const hoursAfterBreak = e.minutes;
    let timeDisplay = '--:-- - --:--';
    if (e.is_from_attendance && e.start_time && e.end_time) {
      timeDisplay = `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}`;
    } else if (e.start_time && e.end_time) {
      timeDisplay = `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}`;
    }
    const isAttendanceRow = !!e.is_from_attendance;
    const hasAttendanceId = !!e.attendance_id || (typeof e.id === 'string' && e.id.startsWith('attendance_'));
    const canModify = isEditingRestricted ? false : isAttendanceRow ? canEditAttendance && hasAttendanceId : canEditTimesheet;
    return { future, offIcon, futIcon, breakMin, hoursAfterBreak, timeDisplay, canModify };
  };

  const renderEntryActions = (e: any, canModify: boolean) => {
    if (!canModify) return null;
    if (designSystem) {
      return (
        <div className="flex items-center gap-1.5">
          <AppButton variant="ghost" size="sm" type="button" onClick={() => openEditEntry(e)}>
            Edit
          </AppButton>
          <AppButton variant="secondary" size="sm" type="button" onClick={() => deleteEntry(e.id)}>
            Delete
          </AppButton>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => openEditEntry(e)} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 hover:bg-gray-200">
          Edit
        </button>
        <button onClick={() => deleteEntry(e.id)} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 hover:bg-gray-200">
          Delete
        </button>
      </div>
    );
  };

  const isClockReasonRequired = () => {
    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
    const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
    return isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
  };

  const isClockSubmitDisabled = () => {
    if (submitting) return true;
    if (designSystem) {
      if (!selectedTime || !selectedTime.includes(':')) return true;
    } else if (!selectedTime || !selectedHour12 || !selectedMinute) {
      return true;
    }
    if (isClockReasonRequired() && (!reasonText.trim() || reasonText.trim().length < 15)) {
      return true;
    }
    return false;
  };

  const renderClockReasonHelper = () => {
    if (isClockReasonRequired()) {
      return (
        <span className="text-red-600 font-medium">
          Required (minimum 15 characters): You must provide a reason when clocking in/out for another user.
        </span>
      );
    }
    let isDifferentDayFromToday = false;
    let isFutureTime = false;
    if (selectedShift && selectedTime) {
      try {
        const shiftDate = selectedShift.date;
        const [hours, minutes] = selectedTime.split(':').map(Number);
        const [year, month, day] = shiftDate.split('-').map(Number);
        const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        const now = new Date();
        const todayStr = formatDateLocal(now);
        const selectedDateStr = formatDateLocal(selectedDateTime);
        isDifferentDayFromToday = selectedDateStr !== todayStr;
        const bufferMs = 60 * 1000;
        isFutureTime = selectedDateTime.getTime() > now.getTime() + bufferMs;
      } catch {
        /* ignore */
      }
    }
    if (isFutureTime) {
      return (
        <span className="text-red-600 font-medium">
          ⚠ Clock-in/out cannot be in the future. Please select a valid time.
        </span>
      );
    }
    if (isDifferentDayFromToday) {
      return (
        <span className="text-orange-600 font-medium">
          ℹ Clock-in/out on a different day than today will require supervisor approval. Reason is optional.
        </span>
      );
    }
    if (!gpsLocation || gpsError) {
      return <span className="text-gray-600">Optional: Location is captured but not mandatory. Reason is optional.</span>;
    }
    return 'Optional: Reason is not required for your own clock-in/out on the same day as the shift.';
  };

  const renderGpsBlock = () => (
    <div>
      {gpsLocation ? (
        <>
          <div
            className={uiCx(
              uiRadius.card,
              'border border-green-200 bg-green-50 p-3 text-sm',
              !designSystem && 'rounded-lg',
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-green-800">✓ Location captured</div>
                <div className="text-xs text-green-600 mt-1">Accuracy: {Math.round(gpsLocation.accuracy)}m</div>
              </div>
              {designSystem ? (
                <AppButton variant="secondary" size="sm" type="button" onClick={() => getCurrentLocation(selectedShift)} disabled={gpsLoading}>
                  {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                </AppButton>
              ) : (
                <button
                  type="button"
                  onClick={() => getCurrentLocation(selectedShift)}
                  disabled={gpsLoading}
                  className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 bg-white text-sm font-medium text-gray-700"
                >
                  {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                </button>
              )}
            </div>
          </div>
          {selectedShift?.geofences && selectedShift.geofences.length > 0 ? (
            geofenceStatus && (
              <div
                className={uiCx(
                  uiRadius.card,
                  'p-3 border text-sm mt-2',
                  geofenceStatus.inside
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-orange-50 border-orange-200 text-orange-800',
                )}
              >
                {geofenceStatus.inside ? (
                  <div>
                    <div className="font-medium">✓ Great! You are at the right site to clock-in/out</div>
                    {geofenceStatus.distance !== undefined && (
                      <div className="text-xs mt-1 opacity-75">
                        Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius)
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="font-medium">ℹ You are not at the correct site</div>
                    {geofenceStatus.distance !== undefined && (
                      <div className="text-xs mt-1 opacity-75">
                        Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius). Location is captured but not mandatory.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          ) : (
            <div className={uiCx(uiRadius.card, 'p-3 bg-blue-50 border border-blue-200 text-sm text-blue-800 mt-2')}>
              <div className="font-medium">ℹ Location captured (not mandatory)</div>
              <div className="text-xs mt-1 opacity-75">
                No geofence is defined for this shift. Your location has been captured but is not mandatory for clock-in/out.
              </div>
            </div>
          )}
        </>
      ) : gpsLoading ? (
        <div className={uiCx(uiRadius.card, 'p-3 bg-blue-50 border border-blue-200 text-sm text-blue-800')}>
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800" />
            <span>Getting location...</span>
          </div>
        </div>
      ) : gpsError ? (
        <div className={uiCx(uiRadius.card, 'p-3 bg-yellow-50 border border-yellow-200 text-sm text-yellow-800')}>{gpsError}</div>
      ) : (
        <div className={uiCx(uiRadius.card, 'p-3 bg-gray-50 border border-gray-200 text-sm text-gray-600')}>No location data</div>
      )}
    </div>
  );

  const renderShiftCards = () =>
    shifts?.map((shift: any) => {
      const directClockIn = getAttendanceForShift(shift.id, 'in');
      const directClockOut = getAttendanceForShift(shift.id, 'out');
      const clockInLog = !directClockIn ? findAttendanceLog(shift.worker_id, shift.date || workDate, 'in') : null;
      const clockOutLog = !directClockOut ? findAttendanceLog(shift.worker_id, shift.date || workDate, 'out') : null;
      const clockIn =
        directClockIn ||
        (clockInLog
          ? {
              status: clockInLog?.changes?.status,
              source: clockInLog?.changes?.performed_by || clockInLog?.changes?.source || 'system',
              clock_in_time: clockInLog?.changes?.time_selected || clockInLog?.changes?.time_entered || null,
              time_selected_utc: clockInLog?.changes?.time_selected || null,
            }
          : undefined);
      const clockOut =
        directClockOut ||
        (clockOutLog
          ? {
              status: clockOutLog?.changes?.status,
              source: clockOutLog?.changes?.performed_by || clockOutLog?.changes?.source || 'system',
              clock_out_time: clockOutLog?.changes?.time_selected || clockOutLog?.changes?.time_entered || null,
              time_selected_utc: clockOutLog?.changes?.time_selected || null,
            }
          : undefined);
      const canClockIn = !clockIn || clockIn.status === 'rejected';
      const canClockOut =
        clockIn && (clockIn.status === 'approved' || clockIn.status === 'pending') && (!clockOut || clockOut.status === 'rejected');
      const worker = employees?.find((emp: any) => emp.id === shift.worker_id);
      const cardClass = designSystem
        ? uiCx(uiRadius.card, uiBorders.subtle, uiColors.surfaceSubtle, 'p-2 text-xs')
        : 'p-1.5 border rounded bg-gray-50 text-[10px]';

      return (
        <div key={shift.id} className={cardClass}>
          <div className={designSystem ? 'font-medium mb-1 text-gray-900 text-xs' : 'font-medium mb-1 text-gray-900'}>
            {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
            {shift.job_name && <span className="ml-1 text-gray-500 font-normal">({shift.job_name})</span>}
            {worker && <span className="ml-1 text-gray-600 font-normal">- {worker.name || worker.username}</span>}
          </div>
          <div className="space-y-1 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600 w-8">In:</span>
              {clockIn ? (
                <div className="flex items-center gap-1.5 flex-1">
                  {getStatusBadge(clockIn.status)}
                  <span className="text-gray-700">
                    {clockIn.clock_in_time
                      ? new Date(clockIn.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      : clockIn.time_selected_utc
                        ? new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : '--'}
                  </span>
                  {clockIn.source === 'supervisor' && <span className="text-gray-500 text-[10px]">(Supervisor)</span>}
                </div>
              ) : (
                <span className="text-gray-400">Not clocked in</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-600 w-8">Out:</span>
              {clockOut ? (
                <div className="flex items-center gap-1.5 flex-1">
                  {getStatusBadge(clockOut.status)}
                  <span className="text-gray-700">
                    {clockOut.clock_out_time
                      ? new Date(clockOut.clock_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                      : clockOut.time_selected_utc
                        ? new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : '--'}
                  </span>
                  {clockOut.source === 'supervisor' && <span className="text-gray-500 text-[10px]">(Supervisor)</span>}
                </div>
              ) : (
                <span className="text-gray-400">Not clocked out</span>
              )}
            </div>
          </div>
          {canProjectClockActions && (
            <div className="flex gap-1">
              {designSystem ? (
                <>
                  <AppButton
                    size="sm"
                    type="button"
                    className="flex-1 !border-green-600 !from-green-600 !to-green-600 !bg-green-600 hover:!from-green-700 hover:!to-green-700 hover:!bg-green-700"
                    onClick={() => handleClockInOut(shift, 'in')}
                    disabled={!canClockIn || submitting}
                  >
                    Clock In
                  </AppButton>
                  <AppButton
                    size="sm"
                    type="button"
                    variant="danger"
                    className="flex-1"
                    onClick={() => handleClockInOut(shift, 'out')}
                    disabled={!canClockOut || submitting}
                  >
                    Clock Out
                  </AppButton>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleClockInOut(shift, 'in')}
                    disabled={!canClockIn || submitting}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      canClockIn ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Clock In
                  </button>
                  <button
                    onClick={() => handleClockInOut(shift, 'out')}
                    disabled={!canClockOut || submitting}
                    className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      canClockOut ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Clock Out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    });

  const entryTableRows: ReactNode[][] = displayEntries.map((e: any) => {
    const { futIcon, offIcon, future, breakMin, hoursAfterBreak, timeDisplay, canModify } = getEntryRowMeta(e);
    return [
      <div key={`av-${e.id}`} className="flex items-center gap-1">
        {e.user_avatar_file_id ? (
          <img src={withFileAccessToken(`/files/${e.user_avatar_file_id}/thumbnail?w=64`)} className="w-5 h-5 rounded-full flex-shrink-0" alt="" />
        ) : (
          <span className="w-5 h-5 rounded-full bg-gray-200 inline-block flex-shrink-0" />
        )}
        {(futIcon || offIcon) && <span title={future ? 'Future time' : 'Logged after day end'}>{futIcon}{offIcon}</span>}
        {e.shift_deleted && (
          <span
            className="text-yellow-600"
            title={
              e.shift_deleted_by
                ? `The shift related to this attendance was deleted by ${e.shift_deleted_by}${e.shift_deleted_at ? ` on ${new Date(e.shift_deleted_at).toLocaleDateString()}` : ''}`
                : 'The shift related to this attendance was deleted'
            }
          >
            <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </span>
        )}
      </div>,
      <span className="truncate max-w-[8rem] block">{e.user_name || ''}</span>,
      String(e.work_date).slice(5, 10),
      timeDisplay,
      formatHoursMinutes(hoursAfterBreak),
      breakMin > 0 ? `${breakMin}m` : '--',
      <span className="truncate max-w-[12rem] block">{e.notes || ''}</span>,
      renderEntryActions(e, canModify),
    ];
  });

  const csvExport = async()=>{
    try{
      const qs = new URLSearchParams();
      if (month) qs.set('month', month);
      if (userFilter) qs.set('user_id', userFilter);
      const rows:any[] = await api('GET', `/projects/${projectId}/timesheet?${qs.toString()}`);
      const header = ['Date','User','Hours','Break','Hours (after break)','Notes'];
      const csv = [header.join(',')].concat(rows.map(r=> {
        const key = `${r.user_id}_${r.work_date}`;
        const shiftsForEntry = shiftsByUserAndDate[key] || [];
        const breakMin = shiftsForEntry.length > 0 && shiftsForEntry[0].default_break_min 
          ? shiftsForEntry[0].default_break_min 
          : defaultBreakMin;
        const hoursAfterBreak = Math.max(0, (r.minutes || 0) - breakMin);
        return [r.work_date, JSON.stringify(r.user_name||''), (r.minutes/60).toFixed(2), breakMin, formatHoursMinutes(hoursAfterBreak), JSON.stringify(r.notes||'')].join(',');
      })).join('\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `timesheet_${projectId}_${month||'all'}.csv`; a.click(); URL.revokeObjectURL(url);
    }catch(_e){ toast.error('Export failed'); }
  };
  
  if (designSystem) {
    return (
      <>
        <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Timesheet"
            description="Time tracking and hours for this project."
            {...appSectionPresetProps('timesheet')}
          />
          <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
            {isEditingRestricted && statusLabel && (
              <div className={uiCx(uiRadius.card, 'border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800')}>
                <strong>Editing Restricted:</strong> This project has status &quot;{statusLabel}&quot; which does not allow editing timesheet.
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-3">
              <AppCard bodyClassName="p-3">
                <AppSectionHeader title="Add Time Entry" />
                <div className={uiCx('mt-3', uiSpacing.sectionStack)}>
                  <AppDatePicker
                    label="Date"
                    value={workDate}
                    onChange={(ev) => setWorkDate(ev.target.value)}
                    fieldHint="Date\n\nPick the day to view scheduled shifts and clock in or out."
                  />
                  {shifts && shifts.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1.5">Clock In/Out</p>
                      <div className="space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {renderShiftCards()}
                      </div>
                    </div>
                  ) : (
                    <AppEmptyState className="py-4" title="No shifts scheduled for this date" />
                  )}
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-600 mb-1">Subcontractor Clock-In/Out</p>
                    <AppButton variant="secondary" className="w-full" type="button" onClick={() => setSubcontractorClockOpen(true)}>
                      Subcontractor Clock-In/Out
                    </AppButton>
                  </div>
                </div>
              </AppCard>
              <div className="md:col-span-2 space-y-3">
                <div className={uiCx(uiRadius.card, uiBorders.subtle, 'bg-white p-3 flex flex-wrap items-end gap-3')}>
                  <AppDatePicker
                    label="Month"
                    value={month ? `${month}-01` : ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) setMonth(v.slice(0, 7));
                    }}
                    fieldHint="Month\n\nFilter the timesheet table to entries in this calendar month."
                    triggerClassName="w-[10rem]"
                  />
                  <AppSelect
                    label="Employee"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    options={employeeSelectOptions}
                    className="min-w-[10rem]"
                    fieldHint="Employee\n\nShow all workers or filter entries to one employee."
                  />
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="text-xs text-gray-700">
                      Total: {formatHoursMinutes(hoursTotalMinutes)} <span className="text-[10px] text-gray-500">(after break)</span>
                    </div>
                    <AppButton variant="secondary" size="sm" type="button" onClick={csvExport}>
                      Export CSV
                    </AppButton>
                  </div>
                </div>
                {displayEntries.length > 0 ? (
                  <AppTable
                    columns={['', 'Employee', 'Date', 'Time', 'Hours', 'Break', 'Notes', 'Actions']}
                    rows={entryTableRows}
                  />
                ) : (
                  <AppEmptyState title="No time entries" />
                )}
              </div>
            </div>
          </div>
        </AppCard>

        {editingEntry && (
          <AppFormModal
            open
            onClose={resetEditForm}
            title="Edit Time Entry"
            quickInfo={editTimeEntryQuickInfo}
            footer={
              <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
                <AppButton variant="secondary" size="sm" type="button" onClick={resetEditForm}>
                  Cancel
                </AppButton>
                <AppButton size="sm" type="button" onClick={saveEditEntry}>
                  Save
                </AppButton>
              </div>
            }
          >
            <div className={uiSpacing.sectionStack}>
              <AppTimePicker
                label="Start Time *"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                required
                fieldHint="Start Time\n\nWhen the worker started; must be before end time."
              />
              <AppTimePicker
                label="End Time *"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                required
                fieldHint="End Time\n\nWhen the worker finished; must be after start time."
              />
              <AppInput
                type="number"
                label="Break (minutes)"
                min={0}
                value={editBreakMinutes}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) {
                    setEditBreakMinutes(val);
                  }
                }}
                fieldHint="Break (minutes)\n\nBreak time in minutes deducted from total hours."
              />
            </div>
          </AppFormModal>
        )}

        {showClockModal && selectedShift && clockType && (
          <AppFormModal
            open
            onClose={closeClockModal}
            title={`Clock ${clockType === 'in' ? 'In' : 'Out'}`}
            description={clockType === 'in' ? 'Record start time for this shift' : 'Record end time and optional break'}
            quickInfo={projectClockInOutQuickInfo(clockType)}
            footer={
              <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
                <AppButton variant="secondary" size="sm" type="button" onClick={closeClockModal} disabled={submitting}>
                  Cancel
                </AppButton>
                <AppButton size="sm" type="button" onClick={submitAttendance} disabled={isClockSubmitDisabled()} loading={submitting}>
                  {submitting ? 'Submitting...' : 'Submit'}
                </AppButton>
              </div>
            }
          >
            <div className={uiSpacing.sectionStack}>
              <AppTimePicker
                label="Time *"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                required
                fieldHint="Time\n\nSelect in 5-minute steps. Your own clock events cannot be more than 4 minutes in the future."
              />
              {clockType === 'out' && (
                <div>
                  <AppCheckbox
                    label="Insert Break Time"
                    checked={insertBreakTime}
                    onChange={(checked) => setInsertBreakTime(checked)}
                    fieldHint="Insert Break Time\n\nOptional unpaid break subtracted from hours when clocking out."
                  />
                  {insertBreakTime && (
                    <div className="ml-6 mt-2 flex gap-2 items-center flex-wrap">
                      <AppSelect
                        label="Hours"
                        value={breakHours}
                        onChange={(e) => setBreakHours(e.target.value)}
                        options={Array.from({ length: 3 }, (_, i) => ({ value: String(i), label: String(i) }))}
                        className="min-w-[5rem]"
                        fieldHint="Hours\n\nWhole hours of break time."
                      />
                      <AppSelect
                        label="Minutes"
                        value={breakMinutes}
                        onChange={(e) => setBreakMinutes(e.target.value)}
                        options={Array.from({ length: 12 }, (_, i) => {
                          const m = i * 5;
                          return { value: String(m).padStart(2, '0'), label: String(m).padStart(2, '0') };
                        })}
                        className="min-w-[5rem]"
                        fieldHint="Minutes\n\nBreak minutes in 5-minute steps."
                      />
                    </div>
                  )}
                </div>
              )}
              {renderGpsBlock()}
              <AppTextarea
                label={
                  <>
                    Reason {isClockReasonRequired() && <span className="text-red-500">*</span>}
                  </>
                }
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry..."
                minLength={15}
                fieldHint="Reason\n\nRequired (min. 15 characters) when clocking in or out for another worker; optional for your own same-day events."
                helperText={renderClockReasonHelper()}
              />
              <p className="text-xs text-gray-500">
                <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
              </p>
            </div>
          </AppFormModal>
        )}

        <SubcontractorClockModal
          projectId={projectId}
          open={subcontractorClockOpen}
          onClose={() => setSubcontractorClockOpen(false)}
          designSystem
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Editing Restricted Warning */}
      {isEditingRestricted && statusLabel && (
        <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing timesheet.
        </div>
      )}
      
      <div className="grid md:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-3">
        <h4 className="text-sm font-semibold mb-1.5">Add Time Entry</h4>
        <div className="grid gap-1.5 text-xs">
          <div><label className="text-[10px] text-gray-600 uppercase tracking-wide block mb-0.5">Date</label><input type="date" className="w-full border rounded px-2.5 py-1.5 text-xs" value={workDate} onChange={e=>setWorkDate(e.target.value)} /></div>
          
          {/* Clock In/Out for Shifts */}
          {shifts && shifts.length > 0 ? (
            <div>
              <label className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5 block font-medium">Clock In/Out</label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {renderShiftCards()}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-gray-500 text-center py-3 bg-gray-50 rounded">
              No shifts scheduled for this date
            </div>
          )}
          <div className="pt-2 mt-1.5 border-t border-gray-100">
            <label className="text-[10px] text-gray-600 uppercase tracking-wide block mb-0.5">Subcontractor Clock-In/Out</label>
            <button
              type="button"
              onClick={() => setSubcontractorClockOpen(true)}
              className="w-full border rounded px-2.5 py-1.5 text-xs font-medium bg-white hover:bg-gray-50 text-gray-900"
            >
              Subcontractor Clock-In/Out
            </button>
          </div>
        </div>
        </div>
        
        <div className="md:col-span-2 rounded-xl border bg-white">
        <div className="p-2.5 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5"><label className="text-[10px] text-gray-600 uppercase tracking-wide">Month</label><input type="month" className="border rounded px-2 py-1 text-xs" value={month} onChange={e=>{ setMonth(e.target.value); }} /></div>
          <div className="flex items-center gap-1.5"><label className="text-[10px] text-gray-600 uppercase tracking-wide">Employee</label><select className="border rounded px-2 py-1 text-xs" value={userFilter} onChange={e=>setUserFilter(e.target.value)}><option value="">All</option>{sortByLabel(employees||[], (emp:any)=> (emp.name||emp.username||'').toString()).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}</select></div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-700">Total: {formatHoursMinutes(hoursTotalMinutes)} <span className="text-[10px] text-gray-500">(after break)</span></div>
            <button onClick={csvExport} className="px-2 py-1 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200">Export CSV</button>
          </div>
        </div>
        <div className="border-t">
          {/* Header row */}
          <div className="px-2.5 py-1.5 text-[10px] font-medium text-gray-600 border-b bg-gray-50 flex items-center gap-2">
            <div className="w-6"></div>
            <div className="w-24">Employee</div>
            <div className="w-12">Date</div>
            <div className="w-20">Time</div>
            <div className="w-20">Hours</div>
            <div className="w-16">Break</div>
            <div className="flex-1">Notes</div>
            <div className="w-24"></div>
          </div>
        </div>
        <div className="divide-y">
          {displayEntries.length ? displayEntries.map((e: any) => {
            const { futIcon, offIcon, future, breakMin, hoursAfterBreak, timeDisplay, canModify } = getEntryRowMeta(e);
            return (
              <div key={e.id} className="px-2.5 py-1.5 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {e.user_avatar_file_id ? (
                    <img src={withFileAccessToken(`/files/${e.user_avatar_file_id}/thumbnail?w=64`)} className="w-5 h-5 rounded-full flex-shrink-0" alt="" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-gray-200 inline-block flex-shrink-0" />
                  )}
                  <div className="w-24 text-gray-700 truncate">{e.user_name || ''}</div>
                  <div className="w-12 text-gray-600">{String(e.work_date).slice(5, 10)}</div>
                  <div className="w-20 text-gray-600">{timeDisplay}</div>
                  <div className="w-20 font-medium">{formatHoursMinutes(hoursAfterBreak)}</div>
                  <div className="w-16 font-medium">{breakMin > 0 ? `${breakMin}m` : '--'}</div>
                  <div className="flex-1 text-gray-600 truncate min-w-0">{e.notes || ''}</div>
                  {(futIcon || offIcon) && <span title={future ? 'Future time' : 'Logged after day end'}>{futIcon}{offIcon}</span>}
                  {e.shift_deleted && (
                    <span
                      className="text-yellow-600 ml-1"
                      title={
                        e.shift_deleted_by
                          ? `The shift related to this attendance was deleted by ${e.shift_deleted_by}${e.shift_deleted_at ? ` on ${new Date(e.shift_deleted_at).toLocaleDateString()}` : ''}`
                          : 'The shift related to this attendance was deleted'
                      }
                    >
                      <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </span>
                  )}
                </div>
                {renderEntryActions(e, canModify)}
              </div>
            );
          }) : <div className="p-2.5 text-xs text-gray-600">No time entries</div>}
        </div>
        </div>
      </div>
      {/* Edit Time Entry Modal */}
      {editingEntry && (
        <OverlayPortal><div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Edit Time Entry</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Break (minutes)</label>
              <input
                type="number"
                min="0"
                value={editBreakMinutes}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) {
                    setEditBreakMinutes(val);
                  }
                }}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Break time in minutes (will be deducted from total hours)</p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button onClick={resetEditForm} className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={saveEditEntry} className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700">
                Save
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}

      {/* Clock In/Out Modal - standardized with EventModal / EditShiftModal */}
      {showClockModal && selectedShift && clockType && (
        <OverlayPortal><div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
          onClick={closeClockModal}
        >
          <div
            className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title bar */}
            <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeClockModal}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                  title="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Clock {clockType === 'in' ? 'In' : 'Out'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {clockType === 'in' ? 'Record start time for this shift' : 'Record end time and optional break'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                {/* Time selector (12h format with AM/PM) */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Time *</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={selectedHour12}
                      onChange={(e) => {
                        const hour12 = e.target.value;
                        setSelectedHour12(hour12);
                        updateTimeFrom12h(hour12, selectedMinute, selectedAmPm);
                      }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
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
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
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
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
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
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide w-12">Hours:</label>
                          <select
                            value={breakHours}
                            onChange={(e) => setBreakHours(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                          >
                            {Array.from({ length: 3 }, (_, i) => (
                              <option key={i} value={String(i)}>
                                {i}
                              </option>
                            ))}
                          </select>
                          <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide w-12 ml-2">Minutes:</label>
                          <select
                            value={breakMinutes}
                            onChange={(e) => setBreakMinutes(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
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
                    <>
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-green-800">âœ“ Location captured</div>
                            <div className="text-xs text-green-600 mt-1">
                              Accuracy: {Math.round(gpsLocation.accuracy)}m
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => getCurrentLocation(selectedShift)}
                            disabled={gpsLoading}
                            className="text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 bg-white text-sm font-medium text-gray-700"
                          >
                            {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                          </button>
                        </div>
                      </div>
                      {selectedShift?.geofences && selectedShift.geofences.length > 0 ? (
                        geofenceStatus && (
                          <div className={`p-3 border rounded-lg text-sm mt-2 ${
                            geofenceStatus.inside
                              ? 'bg-green-50 border-green-200 text-green-800'
                              : 'bg-orange-50 border-orange-200 text-orange-800'
                          }`}>
                            {geofenceStatus.inside ? (
                              <div>
                                <div className="font-medium">âœ“ Great! You are at the right site to clock-in/out</div>
                                {geofenceStatus.distance !== undefined && (
                                  <div className="text-xs mt-1 opacity-75">
                                    Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius)
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium">â„¹ You are not at the correct site</div>
                                {geofenceStatus.distance !== undefined && (
                                  <div className="text-xs mt-1 opacity-75">
                                    Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius). Location is captured but not mandatory.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 mt-2">
                          <div className="font-medium">â„¹ Location captured (not mandatory)</div>
                          <div className="text-xs mt-1 opacity-75">
                            No geofence is defined for this shift. Your location has been captured but is not mandatory for clock-in/out.
                          </div>
                        </div>
                      )}
                    </>
                  ) : gpsLoading ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                      <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800"></div>
                        <span>Getting location...</span>
                      </div>
                    </div>
                  ) : gpsError ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      {gpsError}
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                      No location data
                    </div>
                  )}
                </div>

                {/* Reason text */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">
                    Reason {
                      (() => {
                        const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                        const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                        const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
                        const requiresReason = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
                        return requiresReason && <span className="text-red-500">*</span>;
                      })()
                    }
                  </label>
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Describe the reason for this attendance entry..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-24 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                    minLength={15}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {(() => {
                      const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                      const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                      const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
                      const isDoingForOther = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;

                      if (isDoingForOther) {
                        return (
                          <span className="text-red-600 font-medium">
                            Required (minimum 15 characters): You must provide a reason when clocking in/out for another user.
                          </span>
                        );
                      }

                      let isDifferentDayFromToday = false;
                      let isFutureTime = false;
                      if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                        try {
                          const shiftDate = selectedShift.date;
                          const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12
                            ? parseInt(selectedHour12) + 12
                            : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12
                            ? 0
                            : parseInt(selectedHour12);
                          const [year, month, day] = shiftDate.split('-').map(Number);
                          const selectedDateTime = new Date(year, month - 1, day, hour24, parseInt(selectedMinute), 0);
                          const now = new Date();
                          const todayStr = formatDateLocal(now);
                          const selectedDateStr = formatDateLocal(selectedDateTime);
                          isDifferentDayFromToday = selectedDateStr !== todayStr;
                          const bufferMs = 60 * 1000;
                          isFutureTime = selectedDateTime.getTime() > (now.getTime() + bufferMs);
                        } catch (e) {}
                      }

                      if (isFutureTime) {
                        return (
                          <span className="text-red-600 font-medium">
                            âš  Clock-in/out cannot be in the future. Please select a valid time.
                          </span>
                        );
                      }
                      if (isDifferentDayFromToday) {
                        return (
                          <span className="text-orange-600 font-medium">
                            â„¹ Clock-in/out on a different day than today will require supervisor approval. Reason is optional.
                          </span>
                        );
                      }
                      if (!gpsLocation || gpsError) {
                        return (
                          <span className="text-gray-600">
                            Optional: Location is captured but not mandatory. Reason is optional.
                          </span>
                        );
                      }
                      return 'Optional: Reason is not required for your own clock-in/out on the same day as the shift.';
                    })()}
                  </p>
                </div>

                {/* Privacy notice */}
                <p className="text-xs text-gray-500 mt-2">
                  <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={closeClockModal}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAttendance}
                disabled={isClockSubmitDisabled()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}
      <SubcontractorClockModal projectId={projectId} open={subcontractorClockOpen} onClose={() => setSubcontractorClockOpen(false)} />
    </div>
  );
}

