import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';

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
  geofences?: any[];
};

type Attendance = {
  id: string;
  shift_id: string;
  type?: 'in' | 'out'; // For backward compatibility
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null; // For backward compatibility
  status: string;
  source: string;
};

export default function ScheduleCard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // anchorDate now represents the Sunday of the current week
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const d = new Date();
    // Get Sunday of current week
    const day = d.getDay(); // 0 = Sunday, 6 = Saturday
    d.setDate(d.getDate() - day); // Go back to Sunday
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);

  // Calculate week range for API query (Sunday to Saturday)
  const weekStart = useMemo(() => {
    // anchorDate is already Sunday
    return new Date(anchorDate);
  }, [anchorDate]);

  const weekEnd = useMemo(() => {
    // Saturday is 6 days after Sunday
    const saturday = new Date(anchorDate);
    saturday.setDate(saturday.getDate() + 6);
    return saturday;
  }, [anchorDate]);

  const dateRange = useMemo(() => {
    return `${formatDateLocal(weekStart)},${formatDateLocal(weekEnd)}`;
  }, [weekStart, weekEnd]);

  // Fetch current user first
  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
  });

  // Fetch shifts - always filter by current user's worker_id
  // This ensures only the logged-in user's shifts are shown in the schedule
  const { data: shifts = [], refetch: refetchShifts } = useQuery({
    queryKey: ['schedule-shifts', dateRange, currentUser?.id],
    queryFn: () => {
      // Always filter by current user's ID to show only their shifts
      const workerId = currentUser?.id;
      if (!workerId) return Promise.resolve([]);
      return api<Shift[]>('GET', `/dispatch/shifts?date_range=${dateRange}&worker_id=${workerId}`);
    },
    enabled: !!currentUser?.id,
  });

  // Fetch employees for worker names
  const { data: employees } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  // Fetch projects list (basic info)
  const { data: projectsList } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<any[]>('GET', '/projects'),
  });

  // Get unique project IDs from shifts
  const uniqueProjectIds = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((shift) => {
      if (shift.project_id) {
        ids.add(shift.project_id);
      }
    });
    return Array.from(ids);
  }, [shifts]);

  // Fetch detailed project info for projects that have shifts
  const { data: projectsDetails } = useQuery({
    queryKey: ['projects-details', uniqueProjectIds.join(',')],
    queryFn: async () => {
      if (uniqueProjectIds.length === 0) return [];
      const promises = uniqueProjectIds.map((id) => 
        api<any>('GET', `/projects/${id}`).catch(() => null)
      );
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: uniqueProjectIds.length > 0,
  });

  // Combine projects list with details
  const projects = useMemo(() => {
    if (!projectsList) return null;
    if (!projectsDetails || projectsDetails.length === 0) return projectsList;
    
    // Create a map of detailed projects
    const detailsMap = new Map(projectsDetails.map((p: any) => [p.id, p]));
    
    // Merge list with details
    return projectsList.map((p: any) => {
      const details = detailsMap.get(p.id);
      return details ? { ...p, ...details } : p;
    });
  }, [projectsList, projectsDetails]);

  // Fetch project details when a shift is selected
  const { data: project } = useQuery({
    queryKey: ['project', selectedShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${selectedShift?.project_id}`),
    enabled: !!selectedShift?.project_id,
  });

  // Fetch worker's employee profile to get supervisor
  const { data: workerProfile } = useQuery({
    queryKey: ['worker-profile', selectedShift?.worker_id],
    queryFn: () => api<any>('GET', `/users/${selectedShift?.worker_id}`),
    enabled: !!selectedShift?.worker_id,
  });

  // Fetch all attendances for shifts in the current month
  const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
  const { data: attendances = [], refetch: refetchAttendances } = useQuery({
    queryKey: ['schedule-attendances', shiftIds.join(',')],
    queryFn: async () => {
      if (shiftIds.length === 0) return [];
      const promises = shiftIds.map(async (shiftId) => {
        try {
          const atts = await api<Attendance[]>('GET', `/dispatch/shifts/${shiftId}/attendance`);
          return atts;
        } catch (e) {
          console.error(`Failed to fetch attendance for shift ${shiftId}:`, e);
          return [];
        }
      });
      const allAttendances = await Promise.all(promises);
      return allAttendances.flat();
    },
    enabled: shiftIds.length > 0,
  });

  // Fetch attendances for selected shift
  const { data: selectedShiftAttendances = [], refetch: refetchSelectedShiftAttendances } = useQuery({
    queryKey: ['shift-attendances', selectedShift?.id],
    queryFn: () => api<Attendance[]>('GET', `/dispatch/shifts/${selectedShift?.id}/attendance`),
    enabled: !!selectedShift?.id,
  });

  // Get project address helper
  const getProjectAddress = (projectId: string): string => {
    const proj = projects?.find((p: any) => p.id === projectId);
    if (!proj) return 'No address available';
    
    // First try to use project address fields
    let addressParts = [
      proj.address,
      proj.address_city,
      proj.address_province,
      proj.address_country,
    ].filter(Boolean);
    
    // If no project address, fallback to site address fields
    if (addressParts.length === 0) {
      addressParts = [
        proj.site_address_line1,
        proj.site_city,
        proj.site_province,
        proj.site_country,
      ].filter(Boolean);
    }
    
    return addressParts.length > 0 ? addressParts.join(', ') : 'No address available';
  };

  // Get attendance for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): Attendance | null => {
    const att = attendances.find((a: Attendance) => a.shift_id === shiftId);
    if (!att) return null;
    
    // Return the attendance if it has the requested time field
    if (type === 'in' && att.clock_in_time) return att;
    if (type === 'out' && att.clock_out_time) return att;
    
    // For backward compatibility, check type field
    if (att.type === type) return att;
    
    return null;
  };

  // Generate week days (Sunday to Saturday)
  const weekDays = useMemo(() => {
    const days: { date: Date; key: string; dayName: string }[] = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(anchorDate);
      d.setDate(d.getDate() + i);
      days.push({
        date: d,
        key: formatDateLocal(d),
        dayName: dayNames[i]
      });
    }
    return days;
  }, [anchorDate]);

  const weekLabel = useMemo(() => {
    const start = weekStart.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    const end = weekEnd.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${start} - ${end}`;
  }, [weekStart, weekEnd]);

  // Group shifts by date
  const shiftsByDate = useMemo(() => {
    const grouped: Record<string, Shift[]> = {};
    shifts.forEach((shift) => {
      const dateKey = shift.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(shift);
    });
    return grouped;
  }, [shifts]);

  // Navigation functions
  const goToPreviousWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() - 7);
    setAnchorDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(anchorDate);
    newDate.setDate(newDate.getDate() + 7);
    setAnchorDate(newDate);
  };

  const goToToday = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    setAnchorDate(d);
  };

  // Clock-in/out state
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedHour12, setSelectedHour12] = useState<string>('');
  const [selectedMinute, setSelectedMinute] = useState<string>('');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showClockModal, setShowClockModal] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<{ inside: boolean; distance?: number; radius?: number } | null>(null);

  // Haversine distance calculation (same as backend)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const errorMsg = 'Geolocation is not supported by your browser';
        setGpsError(errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      setGpsLoading(true);
      setGpsError('');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
          };
          setGpsLocation(location);
          setGpsLoading(false);
          
          // Check geofence if shift has geofences
          if (selectedShift?.geofences && selectedShift.geofences.length > 0) {
            checkGeofence(location);
          } else {
            setGeofenceStatus(null);
          }
          
          resolve(location);
        },
        (error) => {
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
          setGpsLoading(false);
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

  const checkGeofence = (userLocation: { lat: number; lng: number }) => {
    if (!selectedShift?.geofences || selectedShift.geofences.length === 0) {
      setGeofenceStatus(null);
      return;
    }

    let closestDistance = Infinity;
    let closestGeofence = null;

    for (const geofence of selectedShift.geofences) {
      const distance = haversineDistance(
        userLocation.lat,
        userLocation.lng,
        geofence.lat,
        geofence.lng
      );
      if (distance < closestDistance) {
        closestDistance = distance;
        closestGeofence = geofence;
      }
    }

    if (closestGeofence) {
      const radius = closestGeofence.radius || 150;
      const inside = closestDistance <= radius;
      setGeofenceStatus({
        inside,
        distance: Math.round(closestDistance),
        radius,
      });
    } else {
      setGeofenceStatus(null);
    }
  };

  const handleClockInOut = async (shift: Shift, type: 'in' | 'out') => {
    setSelectedShift(shift);
    setClockType(type);
    setGpsLocation(null);
    setGeofenceStatus(null);

    // Set default time to now (rounded to 15 min) in 12h format
    const now = new Date();
    const hour24 = now.getHours();
    const minute = now.getMinutes();
    const roundedMin = Math.round(minute / 15) * 15;
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

    setReasonText('');
    setShowClockModal(true);
    setGpsLoading(true);

    try {
      await getCurrentLocation();
    } catch (error) {
      // Error is already set by getCurrentLocation, so user will see it in the modal
    } finally {
      setGpsLoading(false);
    }
  };

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

  const submitAttendance = async () => {
    if (!selectedShift || !clockType) {
      toast.error('Invalid shift or clock type');
      return;
    }

    if (!selectedTime || !selectedTime.includes(':')) {
      toast.error('Please select a time');
      return;
    }

    // Ensure time is in valid format (HH:MM) with 15-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || ![0, 15, 30, 45].includes(minutes)) {
      toast.error('Please select a valid time in 15-minute increments');
      return;
    }

    // Use shift date, not workDate, to ensure correct date is used
    const shiftDate = selectedShift.date; // Format: YYYY-MM-DD
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const timeSelectedLocal = `${shiftDate}T${timeStr}:00`;

    // Validate: Block future times (except in Attendance tab which has no restrictions)
    // Create date using local timezone explicitly to avoid timezone issues
    // Add 1 minute buffer to account for any timezone/clock differences
    const [year, month, day] = shiftDate.split('-').map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    const now = new Date();
    const bufferMs = 60 * 1000; // 1 minute buffer
    if (selectedDateTime.getTime() > (now.getTime() + bufferMs)) {
      toast.error('Clock-in/out cannot be in the future. Please select a valid time.');
      return;
    }

    setSubmitting(true);

    try {
      const payload: any = {
        shift_id: selectedShift.id,
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add GPS location if available
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      // Add reason text if provided
      if (reasonText && reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      // Close modal and reset state
      setShowClockModal(false);
      setSelectedShift(null);
      setClockType(null);
      setSelectedTime('');
      setSelectedHour12('');
      setSelectedMinute('');
      setReasonText('');
      setGpsLocation(null);
      setGpsError('');
      
      // Clear selected shift if it was temporary
      if (selectedShift.id === 'temp') {
        setSelectedShift(null);
      }

      // Refetch shifts and attendances
      await refetchShifts();
      await refetchAttendances();
      await refetchSelectedShiftAttendances();
      
      // Invalidate timesheet queries to sync with TimesheetTab
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs'] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to submit attendance';
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Get worker info
  const worker = useMemo(() => {
    if (!selectedShift) return null;
    return employees?.find((e: any) => e.id === selectedShift.worker_id);
  }, [selectedShift, employees]);

  // Get clock-in/out status
  // NEW MODEL: Get the attendance record (which may have both clock_in and clock_out)
  const attendance = selectedShift ? attendances.find((a: Attendance) => a.shift_id === selectedShift.id) : null;
  const clockIn = attendance?.clock_in_time ? attendance : null;
  const clockOut = attendance?.clock_out_time ? attendance : null;
  const canClockIn = selectedShift ? (!attendance?.clock_in_time || attendance.status === 'rejected') : false;
  const canClockOut = selectedShift
    ? attendance?.clock_in_time && (attendance.status === 'approved' || attendance.status === 'pending') && !attendance.clock_out_time
    : false;
  const isOwnShift = currentUser && selectedShift && String(currentUser.id) === String(selectedShift.worker_id);

  return (
    <div className="grid grid-cols-[1.5fr_1fr] gap-6">
      {/* LEFT COLUMN - Weekly Schedule */}
      <div className="rounded-[12px] border border-gray-200/60 bg-white shadow-sm p-6">
        {/* Week Navigation Header */}
        <div className="mb-6 pb-4 border-b border-gray-200/60">
          <h2 className="text-xl font-semibold text-gray-900 tracking-tight mb-4">Weekly Schedule</h2>
          {/* Week Controls */}
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousWeek}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all duration-200 hover:shadow-sm active:scale-[0.98]"
            >
              ← Previous Week
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[200px] text-center">
              {weekLabel}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={goToToday}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all duration-200 hover:shadow-sm active:scale-[0.98]"
              >
                Today
              </button>
              <button
                onClick={goToNextWeek}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 transition-all duration-200 hover:shadow-sm active:scale-[0.98]"
              >
                Next Week →
              </button>
            </div>
          </div>
        </div>

        {/* Day Rows */}
        <div className="space-y-3">
          {weekDays.map(({ date, key, dayName }) => {
            const dateStr = formatDateLocal(date);
            const isToday = (() => {
              const t = new Date();
              return formatDateLocal(t) === dateStr;
            })();

            const dayShifts = shiftsByDate[dateStr] || [];
            const dateFormatted = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

            return (
              <div
                key={key}
                className={`rounded-lg border transition-all duration-200 ${
                  dayShifts.length > 0
                    ? `bg-white border-gray-200/60 p-4 ${
                        isToday ? 'ring-2 ring-brand-red/30 border-brand-red/40' : ''
                      }`
                    : `bg-gray-50/30 border-gray-100/60 p-2.5 ${
                        isToday ? 'ring-1 ring-brand-red/20 border-brand-red/20' : ''
                      }`
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-semibold ${
                      dayShifts.length > 0 ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {dayName}
                    </div>
                    <div className={`text-xs ${
                      dayShifts.length > 0 ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {dateFormatted}
                    </div>
                    {isToday && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red font-medium">
                        Today
                      </span>
                    )}
                  </div>
                </div>

                {/* Shifts */}
                {dayShifts.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {dayShifts.map((shift) => {
                      const shiftClockIn = getAttendanceForShift(shift.id, 'in');
                      const shiftClockOut = getAttendanceForShift(shift.id, 'out');
                      const isSelected = selectedShift?.id === shift.id;
                      const projectAddress = getProjectAddress(shift.project_id);

                      return (
                        <div
                          key={shift.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (selectedShift?.id === shift.id) {
                              setSelectedShift(null);
                            } else {
                              setSelectedShift(shift);
                            }
                          }}
                          className={`relative rounded-lg border p-3 cursor-pointer transition-all duration-200 flex-1 min-w-[240px] ${
                            isSelected
                              ? 'border-brand-red bg-brand-red/5 shadow-md hover:shadow-lg'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50 hover:shadow-sm hover:-translate-y-0.5 active:scale-[0.98]'
                          }`}
                        >
                          {/* Left Accent Bar */}
                          <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-l-lg ${
                            isSelected ? 'bg-brand-red' : 'bg-gray-300'
                          }`} />
                          
                          <div className="pl-2">
                            {/* Time - Strongest */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div className="font-bold text-base text-gray-900">
                                {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                              </div>
                            </div>
                            
                            {/* Project - Secondary */}
                            {shift.project_name && (
                              <div className="text-sm text-gray-700 mb-2 font-semibold">
                                {shift.project_name}
                              </div>
                            )}
                            
                            {/* Address - Muted */}
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="line-clamp-1">{projectAddress}</span>
                            </div>
                            
                            {/* Attendance Status */}
                            {(shiftClockIn || shiftClockOut) && (
                              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-200">
                                {shiftClockIn && (
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    shiftClockIn.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    shiftClockIn.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    In: {shiftClockIn.clock_in_time ? new Date(shiftClockIn.clock_in_time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : (shiftClockIn.time_selected_utc ? new Date(shiftClockIn.time_selected_utc).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : '--')}
                                  </span>
                                )}
                                {shiftClockOut && (
                                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    shiftClockOut.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    shiftClockOut.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    Out: {shiftClockOut.clock_out_time ? new Date(shiftClockOut.clock_out_time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : (shiftClockOut.time_selected_utc ? new Date(shiftClockOut.time_selected_utc).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : '--')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">No shifts</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN - Shift Details Panel */}
      <div className="rounded-[12px] border border-gray-200/60 bg-white shadow-sm p-6">
        <h3 className="text-xl font-semibold text-gray-900 tracking-tight mb-6">Shift Details</h3>
        
        {selectedShift ? (
          <div className="space-y-5">
            {/* Core Info Section */}
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Core Info</div>
              
              {/* Project Card */}
              {selectedShift.project_name && (
                <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Project</div>
                  <div className="text-sm font-semibold text-gray-900">{selectedShift.project_name}</div>
                </div>
              )}

              {/* Date & Time Card */}
              <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Date & Time</div>
                <div className="text-sm font-semibold text-gray-900">
                  {new Date(selectedShift.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="text-sm text-gray-700 mt-1">
                  {formatTime12h(selectedShift.start_time)} - {formatTime12h(selectedShift.end_time)}
                </div>
              </div>

              {/* Job Type Card */}
              {selectedShift.job_name && (
                <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Job Type</div>
                  <div className="text-sm font-semibold text-gray-900">{selectedShift.job_name}</div>
                </div>
              )}
            </div>

            {/* People Section */}
            <div className="space-y-3 pt-2 border-t border-gray-200/60">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">People</div>
              
              {/* Worker Card */}
              {worker && (
                <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Worker</div>
                  <div className="text-sm font-semibold text-gray-900">{worker.name || worker.username}</div>
                </div>
              )}

              {/* Supervisor Card */}
              {workerProfile?.manager_user_id && (
                <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Supervisor</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {(() => {
                      const supervisor = employees?.find((e: any) => e.id === workerProfile.manager_user_id);
                      return supervisor?.name || supervisor?.username || 'N/A';
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Location Section */}
            {project && (
              <div className="space-y-3 pt-2 border-t border-gray-200/60">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Location</div>
                
                <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div className="flex-1">
                      <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Address</div>
                      <div className="text-sm text-gray-900">
                        {(() => {
                          let addressParts = [
                            project.address,
                            project.address_city,
                            project.address_province,
                            project.address_country,
                          ].filter(Boolean);
                          
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
                  </div>
                </div>
              </div>
            )}

            {/* Attendance Status Card */}
            <div className="rounded-lg border border-gray-200/60 bg-gray-50/50 p-4 pt-2 border-t border-gray-200/60">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Attendance Status</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-gray-600">Clock In:</span>
                  </div>
                  {clockIn ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        clockIn.status === 'approved' ? 'bg-green-100 text-green-800' :
                        clockIn.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {clockIn.status === 'approved' ? 'Approved' : clockIn.status === 'pending' ? 'Pending' : 'Rejected'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {clockIn.clock_in_time ? new Date(clockIn.clock_in_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockIn.time_selected_utc ? new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Not clocked in</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-gray-600">Clock Out:</span>
                  </div>
                  {clockOut ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        clockOut.status === 'approved' ? 'bg-green-100 text-green-800' :
                        clockOut.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {clockOut.status === 'approved' ? 'Approved' : clockOut.status === 'pending' ? 'Pending' : 'Rejected'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {clockOut.clock_out_time ? new Date(clockOut.clock_out_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : (clockOut.time_selected_utc ? new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        }) : '--')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">Not clocked out</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance Actions */}
            {isOwnShift && (
              <div className="pt-4 border-t border-gray-200/60">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-3">Actions</div>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      navigate(`/clock-in-out?shift_id=${selectedShift.id}&type=in&date=${selectedShift.date}`);
                    }}
                    disabled={!canClockIn || submitting}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-200 ${
                      canClockIn && !submitting
                        ? 'border-green-200 bg-green-50/50 hover:border-green-300 hover:bg-green-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500/20'
                        : 'border-gray-200 bg-gray-50/30 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 flex-shrink-0 ${
                        canClockIn && !submitting ? 'text-green-600' : 'text-gray-400'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 text-left">
                        <div className={`text-sm font-semibold ${
                          canClockIn && !submitting ? 'text-green-700' : 'text-gray-400'
                        }`}>
                          Clock In
                        </div>
                        <div className={`text-xs mt-0.5 ${
                          canClockIn && !submitting ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          Start your shift
                        </div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      navigate(`/clock-in-out?shift_id=${selectedShift.id}&type=out&date=${selectedShift.date}`);
                    }}
                    disabled={!canClockOut || submitting}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-200 ${
                      canClockOut && !submitting
                        ? 'border-red-200 bg-red-50/50 hover:border-red-300 hover:bg-red-50 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/20'
                        : 'border-gray-200 bg-gray-50/30 cursor-not-allowed opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <svg className={`w-5 h-5 flex-shrink-0 ${
                        canClockOut && !submitting ? 'text-red-600' : 'text-gray-400'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 text-left">
                        <div className={`text-sm font-semibold ${
                          canClockOut && !submitting ? 'text-red-700' : 'text-gray-400'
                        }`}>
                          Clock Out
                        </div>
                        <div className={`text-xs mt-0.5 ${
                          canClockOut && !submitting ? 'text-red-600' : 'text-gray-400'
                        }`}>
                          End your shift
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3 text-center">Only one action is available at a time</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium">Select a shift to view details</p>
          </div>
        )}
      </div>

      {/* Clock In/Out Modal */}
      {showClockModal && selectedShift && clockType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              Clock {clockType === 'in' ? 'In' : 'Out'}
            </h3>

            {/* Time selector (12h format with AM/PM) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
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
                  {[0, 15, 30, 45].map((m) => (
                    <option key={m} value={String(m).padStart(2, '0')}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
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
              <p className="text-xs text-gray-500 mt-1">
                Time must be in 15-minute increments (00, 15, 30, 45)
              </p>
            </div>

            {/* GPS Status */}
            <div>
              {gpsLocation ? (
                <>
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-green-800">✓ Location captured</div>
                        <div className="text-xs text-green-600 mt-1">
                          Accuracy: {Math.round(gpsLocation.accuracy)}m
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={getCurrentLocation}
                        disabled={gpsLoading}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50 bg-white"
                      >
                        {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                      </button>
                    </div>
                  </div>
                  {selectedShift?.geofences && selectedShift.geofences.length > 0 ? (
                    geofenceStatus && (
                      <div className={`p-3 border rounded text-sm mt-2 ${
                        geofenceStatus.inside
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-orange-50 border-orange-200 text-orange-800'
                      }`}>
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
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 mt-2">
                      <div className="font-medium">ℹ Location captured (not mandatory)</div>
                      <div className="text-xs mt-1 opacity-75">
                        No geofence is defined for this shift. Your location has been captured but is not mandatory for clock-in/out.
                      </div>
                    </div>
                  )}
                </>
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
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                  No location data
                </div>
              )}
            </div>

            {/* Reason text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason {
                  (() => {
                    // Check if clock-in/out is on a different day than the shift date
                    let isDifferentDay = false;
                    if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                      try {
                        const shiftDate = selectedShift.date; // YYYY-MM-DD
                        const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12 
                          ? parseInt(selectedHour12) + 12 
                          : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12 
                          ? 0 
                          : parseInt(selectedHour12);
                        const selectedDateTime = new Date(`${shiftDate}T${String(hour24).padStart(2, '0')}:${selectedMinute}:00`);
                        const selectedDateStr = formatDateLocal(selectedDateTime);
                        // Check if selected date is different from shift date
                        isDifferentDay = selectedDateStr !== shiftDate;
                      } catch (e) {
                        // Ignore errors in calculation
                      }
                    }
                    
                    // Reason is not required (location is captured but not mandatory)
                    // Different day will make it pending but doesn't require reason
                    return null;
                  })()
                }
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry..."
                className="w-full border rounded px-3 py-2 min-h-[80px]"
                rows={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(() => {
                  // Check if clock-in/out is on a different day than TODAY or in the future
                  let isDifferentDayFromToday = false;
                  let isFutureTime = false;
                  if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                    try {
                      const shiftDate = selectedShift.date; // YYYY-MM-DD
                      const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12 
                        ? parseInt(selectedHour12) + 12 
                        : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12 
                        ? 0 
                        : parseInt(selectedHour12);
                      
                      // Create date using local timezone explicitly to avoid timezone issues
                      const [year, month, day] = shiftDate.split('-').map(Number);
                      const selectedDateTime = new Date(year, month - 1, day, hour24, parseInt(selectedMinute), 0);
                      
                      const now = new Date();
                      const todayStr = formatDateLocal(now);
                      const selectedDateStr = formatDateLocal(selectedDateTime);
                      
                      // Check if selected date is different from TODAY
                      isDifferentDayFromToday = selectedDateStr !== todayStr;
                      
                      // Check if time is in the future (with 1 minute buffer for timezone differences)
                      const bufferMs = 60 * 1000; // 1 minute buffer
                      isFutureTime = selectedDateTime.getTime() > (now.getTime() + bufferMs);
                    } catch (e) {
                      // Ignore errors in calculation
                    }
                  }
                  
                  // Reason is required ONLY when supervisor clocks in/out for another worker
                  // Location is captured but not mandatory
                  // Show warning if different day from today OR future time
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
                  
                  // Location is captured but not mandatory
                  if (!gpsLocation || gpsError) {
                    return (
                      <span className="text-gray-600">
                        Optional: Location is captured but not mandatory. Reason is optional.
                      </span>
                    );
                  }
                  
                  // Reason is optional for workers doing their own clock-in/out
                  return 'Optional: Reason is not required for your own clock-in/out on the same day as the shift.';
                })()}
              </p>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-gray-500 mt-2">
              <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setShowClockModal(false);
                  setSelectedShift(null);
                  setClockType(null);
                  setSelectedTime('');
                  setSelectedHour12('');
                  setSelectedMinute('');
                  setReasonText('');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={submitAttendance}
                disabled={submitting || !selectedTime || !selectedHour12 || !selectedMinute}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

