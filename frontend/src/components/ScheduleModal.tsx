import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
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

type ScheduleModalProps = {
  onClose: () => void;
};

export default function ScheduleModal({ onClose }: ScheduleModalProps) {
  const queryClient = useQueryClient();
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

  // Map project addresses for quick lookup
  const projectAddresses = useMemo(() => {
    const addressMap: Record<string, string> = {};
    if (!projects) return addressMap;
    
    projects.forEach((project: any) => {
      const projectId = String(project.id);
      
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
      
      const address = addressParts.length > 0 ? addressParts.join(', ') : 'No address available';
      addressMap[projectId] = address;
    });
    
    return addressMap;
  }, [projects]);

  // Helper function to get formatted address for a project
  const getProjectAddress = (projectId: string): string => {
    if (!projectId) return 'No address available';
    const id = String(projectId);
    return projectAddresses[id] || 'No address available';
  };

  // Get attendances for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): Attendance | undefined => {
    let att: Attendance | undefined;
    if (selectedShift?.id === shiftId) {
      att = selectedShiftAttendances.find((a) => a.shift_id === shiftId);
    } else {
      att = attendances.find((a) => a.shift_id === shiftId);
    }
    
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

  // Clock-in/out modal state
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>(''); // Stores time in 24h format (HH:MM) for backend
  const [selectedHour12, setSelectedHour12] = useState<string>(''); // Stores hour in 12h format (1-12)
  const [selectedMinute, setSelectedMinute] = useState<string>(''); // Stores minute (00, 15, 30, 45)
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM'); // Stores AM/PM
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<{ inside: boolean; distance?: number; radius?: number } | null>(null);

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

  // Check if user is supervisor/admin
  const isSupervisorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roles = (currentUser.roles || []).map((r: any) => (typeof r === 'string' ? r : r.name || '').toLowerCase());
    const permissions = (currentUser.permissions || []).map((p: string) => p.toLowerCase());
    return roles.includes('admin') || roles.includes('supervisor') || permissions.includes('dispatch:write');
  }, [currentUser]);

  // Haversine distance calculation
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
  const getCurrentLocation = (): Promise<{ lat: number; lng: number; accuracy: number }> => {
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
          if (selectedShift?.geofences && selectedShift.geofences.length > 0) {
            checkGeofence(location.lat, location.lng, selectedShift.geofences);
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

  // Handle clock-in/out - can work with or without a selected shift
  const handleClockInOut = async (type: 'in' | 'out', shift?: Shift | null) => {
    // Use provided shift or selectedShift
    const shiftToUse = shift || selectedShift;
    
    setClockType(type);
    setReasonText('');
    setGpsError('');
    setGpsLocation(null); // Clear previous location
    setGeofenceStatus(null);

    // Set default time to now (rounded to 15 min) in 12h format
    const now = new Date();
    const hour24 = now.getHours();
    const minutes = Math.round(now.getMinutes() / 15) * 15;
    const { hour12, amPm } = convert24hTo12h(hour24);
    
    setSelectedHour12(String(hour12));
    setSelectedMinute(String(minutes).padStart(2, '0'));
    setSelectedAmPm(amPm);
    
    // Also set in 24h format for backend
    const roundedTime = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSelectedTime(roundedTime);

    // If no shift provided, we'll create one when submitting
    // For now, set a temporary shift object for the modal
    if (!shiftToUse) {
      // Create a temporary shift object for today
      const today = new Date();
      const todayStr = formatDateLocal(today);
      // Use first available project or null
      const defaultProject = projects && projects.length > 0 ? projects[0] : null;
      
      // Create a temporary shift object (won't be saved until submit)
      const tempShift: Shift = {
        id: 'temp', // Temporary ID
        project_id: defaultProject?.id || '',
        project_name: defaultProject?.name || 'General',
        worker_id: currentUser?.id || '',
        date: todayStr,
        start_time: '09:00:00',
        end_time: '17:00:00',
        status: 'scheduled',
        geofences: defaultProject?.lat && defaultProject?.lng ? [{
          lat: parseFloat(defaultProject.lat),
          lng: parseFloat(defaultProject.lng),
          radius_m: 150
        }] : undefined,
      };
      setSelectedShift(tempShift);
    }

    // Open modal first so user can see it
    setShowClockModal(true);

    // Try to get GPS location automatically when modal opens
    setGpsLoading(true);
    try {
      await getCurrentLocation();
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

    // Ensure time is in valid format (HH:MM) with 15-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || ![0, 15, 30, 45].includes(minutes)) {
      toast.error('Please select a valid time in 15-minute increments');
      return;
    }

    setSubmitting(true);

    try {
      let shiftId = selectedShift.id;
      
      // If this is a temporary shift (no real shift exists), create one first
      if (selectedShift.id === 'temp' || !selectedShift.id) {
        if (!currentUser?.id) {
          toast.error('User not found');
          setSubmitting(false);
          return;
        }

        // Get default project (first available or require user to have at least one)
        if (!projects || projects.length === 0) {
          toast.error('No projects available. Please contact your supervisor to assign you to a project.');
          setSubmitting(false);
          return;
        }

        const defaultProject = projects[0];
        const today = new Date();
        const todayStr = formatDateLocal(today);
        
        // Determine start and end times based on clock type and current time
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        
        // For clock in: start time is current time (or rounded), end time is 8 hours later
        // For clock out: we need the start time from when they clocked in, or use a default
        let startTime = '09:00';
        let endTime = '17:00';
        
        if (clockType === 'in') {
          // Start time is selected time (or current time rounded to 15 min)
          const [selHours, selMinutes] = selectedTime.split(':').map(Number);
          const roundedMin = Math.round((selMinutes || currentMin) / 15) * 15;
          startTime = `${String(selHours !== undefined ? selHours : currentHour).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
          // End time is 8 hours later from start time
          const startHour = selHours !== undefined ? selHours : currentHour;
          const endHour = (startHour + 8) % 24;
          endTime = `${String(endHour).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
        } else {
          // For clock out, try to find existing clock in for today
          // First, refresh shifts to make sure we have the latest (in case one was just created)
          await refetchShifts();
          
          // Get all shifts for today (may include shifts created automatically on clock in)
          const todayShiftsResponse = await api<Shift[]>('GET', `/dispatch/shifts?date_range=${todayStr},${todayStr}&worker_id=${currentUser.id}`);
          
          // Fetch attendances for all today's shifts to find clock in
          let clockInShiftId: string | null = null;
          for (const shift of todayShiftsResponse) {
            try {
              const shiftAttendances = await api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`);
              const clockIn = shiftAttendances.find((a: Attendance) => a.type === 'in');
              if (clockIn) {
                clockInShiftId = shift.id;
                break;
              }
            } catch (e) {
              // Skip if can't fetch attendances for this shift
            }
          }
          
          if (clockInShiftId) {
            // Use the shift from the clock in
            shiftId = clockInShiftId;
            // Use existing shift, no need to create new one
          } else {
            // No clock in found, we need to create a shift for clock out
            // This shouldn't normally happen, but handle it gracefully
            startTime = '09:00';
            const roundedMin = Math.round(currentMin / 15) * 15;
            endTime = `${String(currentHour).padStart(2, '0')}:${String(roundedMin).padStart(2, '0')}`;
          }
        }

        // Only create shift if we don't have a valid shiftId yet
        if (shiftId === 'temp' || !shiftId) {
          try {
            // Create a temporary shift for today
            const shiftData = {
              worker_id: currentUser.id,
              date: todayStr,
              start_time: startTime,
              end_time: endTime,
              default_break_min: 30,
            };

            const createdShift = await api('POST', `/dispatch/projects/${defaultProject.id}/shifts`, shiftData);
            shiftId = createdShift.id;
            
            // Update selectedShift with the created shift
            setSelectedShift({
              ...selectedShift,
              id: shiftId,
              project_id: defaultProject.id,
              project_name: defaultProject.name,
              date: todayStr,
              start_time: startTime + ':00',
              end_time: endTime + ':00',
            });

            // Refetch shifts to get the new one
            await refetchShifts();
          } catch (createError: any) {
            const errorMsg = createError.response?.data?.detail || createError.message || 'Failed to create shift';
            toast.error(`Failed to create shift: ${errorMsg}`);
            setSubmitting(false);
            return;
          }
        }
      }

      // Use shift date (from selectedShift which may have been updated)
      const shiftDate = selectedShift.date;
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
        setSubmitting(false);
        return;
      }

      const payload: any = {
        shift_id: shiftId,
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

      // Check if supervisor is doing for another worker
      const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
      const isSupervisorDoingForOther = isSupervisorOrAdmin && !isWorkerOwner;
      
      // Add reason text if provided
      if (isSupervisorDoingForOther) {
        if (!reasonText || !reasonText.trim() || reasonText.trim().length < 15) {
          toast.error('Reason text is required (minimum 15 characters) when supervisor clocks in/out for a worker');
          setSubmitting(false);
          return;
        }
        payload.reason_text = reasonText.trim();
      } else if (reasonText && reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      setShowClockModal(false);
      setClockType(null);
      setSelectedTime('');
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

  // Get clock-in/out status - NEW MODEL: Get the attendance record (which may have both clock_in and clock_out)
  const attendance = selectedShift ? (selectedShiftAttendances.find((a) => a.shift_id === selectedShift.id) || attendances.find((a) => a.shift_id === selectedShift.id)) : null;
  const clockIn = attendance?.clock_in_time ? attendance : null;
  const clockOut = attendance?.clock_out_time ? attendance : null;
  const canClockIn = selectedShift ? (!attendance?.clock_in_time || attendance.status === 'rejected') : false;
  const canClockOut = selectedShift
    ? attendance?.clock_in_time && (attendance.status === 'approved' || attendance.status === 'pending') && !attendance.clock_out_time
    : false;
  const isOwnShift = currentUser && selectedShift && String(currentUser.id) === String(selectedShift.worker_id);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Schedule</h2>
            <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex">
            {/* Left side - Calendar */}
            <div className="flex-1 p-6 overflow-y-auto">
              {/* Week Controls */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const newDate = new Date(anchorDate);
                      newDate.setDate(newDate.getDate() - 7); // Previous week
                      setAnchorDate(newDate);
                    }}
                    className="px-3 py-1 rounded border"
                  >
                    ← Previous Week
                  </button>
                  <span className="text-sm font-semibold text-gray-700 min-w-[200px] text-center">
                    {weekLabel}
                  </span>
                  <button
                    onClick={() => {
                      const newDate = new Date(anchorDate);
                      newDate.setDate(newDate.getDate() + 7); // Next week
                      setAnchorDate(newDate);
                    }}
                    className="px-3 py-1 rounded border"
                  >
                    Next Week →
                  </button>
                  <button
                    onClick={() => {
                      const n = new Date();
                      const day = n.getDay(); // 0 = Sunday
                      n.setDate(n.getDate() - day); // Go back to Sunday
                      n.setHours(0, 0, 0, 0);
                      setAnchorDate(n);
                    }}
                    className="px-3 py-1 rounded border"
                  >
                    Today
                  </button>
                </div>
              </div>

              {/* Weekly Schedule - List View */}
              <div className="space-y-2">
                {weekDays.map(({ date, key, dayName }) => {
                  const dateStr = formatDateLocal(date);
                  const isToday = (() => {
                    const t = new Date();
                    return formatDateLocal(t) === dateStr;
                  })();

                  const dayShifts = shiftsByDate[dateStr] || [];
                  const dateFormatted = date.toLocaleDateString('en-US', { day: 'numeric', month: 'numeric' });

                  return (
                    <div
                      key={key}
                      className={`rounded border bg-white p-4 flex items-start gap-4 ${
                        isToday ? 'ring-2 ring-brand-red' : ''
                      } ${selectedShift && selectedShift.date === dateStr && selectedShift.id ? 'border-blue-500 border-2' : ''}`}
                    >
                      {/* Date Column */}
                      <div className="min-w-[120px] flex-shrink-0">
                        <div className="text-sm font-semibold text-gray-700">
                          {dayName}
                        </div>
                        <div className="text-xs text-gray-600">
                          {dateFormatted}
                        </div>
                      </div>

                      {/* Shifts Column */}
                      <div className="flex-1 flex flex-wrap gap-2">
                        {dayShifts.length > 0 ? (
                          dayShifts.map((shift) => {
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
                                className={`p-3 rounded border cursor-pointer min-w-[200px] ${
                                  isSelected
                                    ? 'bg-blue-200 border-blue-400'
                                    : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                                }`}
                                title={`${shift.project_name || 'Project'}: ${formatTime12h(shift.start_time)} - ${formatTime12h(shift.end_time)}`}
                              >
                                <div className="font-medium text-sm mb-1">
                                  {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                                </div>
                                {shift.project_name && (
                                  <div className="text-xs text-gray-600 mb-1">
                                    {shift.project_name}
                                  </div>
                                )}
                                <div className="text-xs text-gray-500 mb-2">
                                  {projectAddress}
                                </div>
                                <div className="space-y-1">
                                  {shiftClockIn && (
                                    <div>
                                      <span className={`text-xs px-2 py-0.5 rounded ${
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
                                    </div>
                                  )}
                                  {shiftClockOut && (
                                    <div>
                                      <span className={`text-xs px-2 py-0.5 rounded ${
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
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-gray-400 italic">No shifts</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right side - Shift Details */}
            <div className="w-96 border-l bg-gray-50 overflow-y-auto">
              {selectedShift ? (
                <div className="p-6 space-y-4">
                  <h3 className="text-lg font-semibold">Shift Details</h3>

                  {/* Project Name */}
                  {selectedShift.project_name && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                      <div className="text-gray-900">{selectedShift.project_name}</div>
                    </div>
                  )}

                  {/* Date and Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                    <div className="text-gray-900">
                      {new Date(selectedShift.date).toLocaleDateString()} • {formatTime12h(selectedShift.start_time)} - {formatTime12h(selectedShift.end_time)}
                    </div>
                  </div>

                  {/* Worker */}
                  {worker && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
                      <div className="text-gray-900">{worker.name || worker.username}</div>
                    </div>
                  )}

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
                  {selectedShift.job_name && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                      <div className="text-gray-900">{selectedShift.job_name}</div>
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

                  {/* Attendance Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Attendance Status</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Clock In:</span>
                        {clockIn ? (
                          <div className="flex items-center gap-2">
                            {getStatusBadge(clockIn.status)}
                            <span className="text-sm text-gray-900">
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
                            {clockIn.source === 'supervisor' && (
                              <span className="text-xs text-gray-500">(Supervisor)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not clocked in</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Clock Out:</span>
                        {clockOut ? (
                          <div className="flex items-center gap-2">
                            {getStatusBadge(clockOut.status)}
                            <span className="text-sm text-gray-900">
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
                            {clockOut.source === 'supervisor' && (
                              <span className="text-xs text-gray-500">(Supervisor)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">Not clocked out</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Clock In/Out Buttons */}
                  {isOwnShift && (
                    <div className="pt-4 border-t space-y-2">
                      <button
                        onClick={() => handleClockInOut('in')}
                        disabled={!canClockIn || submitting}
                        className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                          canClockIn
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Clock In
                      </button>
                      <button
                        onClick={() => handleClockInOut('out')}
                        disabled={!canClockOut || submitting}
                        className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                          canClockOut
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        Clock Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <h3 className="text-lg font-semibold">Clock In/Out</h3>
                  {(() => {
                    // Get today's date
                    const today = new Date();
                    const todayStr = formatDateLocal(today);
                    // Check if user has any shifts today
                    const hasShiftsToday = shiftsByDate[todayStr] && shiftsByDate[todayStr].length > 0;
                    
                    // If user has shifts today, show message to select a shift (buttons disabled)
                    if (hasShiftsToday) {
                      return (
                        <div className="space-y-4">
                          <p className="text-sm text-gray-600">
                            You have shifts scheduled for today. Please select a shift from the calendar to clock in/out.
                          </p>
                          <div className="space-y-2">
                            <button
                              disabled
                              className="w-full px-4 py-2 rounded font-medium bg-gray-200 text-gray-400 cursor-not-allowed"
                            >
                              Clock In
                            </button>
                            <button
                              disabled
                              className="w-full px-4 py-2 rounded font-medium bg-gray-200 text-gray-400 cursor-not-allowed"
                            >
                              Clock Out
                            </button>
                          </div>
                        </div>
                      );
                    }
                    
                    // If no shifts today, buttons are enabled and user can clock in/out directly
                    // A shift will be created automatically when they clock in/out
                    // Check if user has any attendances for today (to determine clock in/out status)
                    // Note: We check all shifts in the month view, but also need to check if there are shifts created today
                    // that might not be in the current month view
                    const todayShiftsInView = shifts.filter((s: Shift) => s.date === todayStr);
                    const todayAttendancesFromView = attendances.filter((a: Attendance) => {
                      return todayShiftsInView.some((s: Shift) => s.id === a.shift_id);
                    });
                    // NEW MODEL: Find attendance with clock_in_time (may or may not have clock_out_time)
                    const todayAttendance = todayAttendancesFromView.find((a: Attendance) => a.clock_in_time);
                    const todayClockIn = todayAttendance?.clock_in_time ? todayAttendance : undefined;
                    const todayClockOut = todayAttendance?.clock_out_time ? todayAttendance : undefined;
                    // For backward compatibility, check type field if no clock_in_time found
                    const todayClockInOld = !todayClockIn ? todayAttendancesFromView.find((a: Attendance) => a.type === 'in') : undefined;
                    const todayClockOutOld = !todayClockOut ? todayAttendancesFromView.find((a: Attendance) => a.type === 'out') : undefined;
                    const finalClockIn = todayClockIn || todayClockInOld;
                    const finalClockOut = todayClockOut || todayClockOutOld;
                    const canClockIn = !finalClockIn || finalClockIn.status === 'rejected';
                    const canClockOut = finalClockIn && (finalClockIn.status === 'approved' || finalClockIn.status === 'pending') && !finalClockOut;
                    
                    return (
                      <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                          No shifts scheduled for today. You can clock in/out directly.
                        </p>
                        <div className="space-y-2">
                          <button
                            onClick={() => handleClockInOut('in', null)}
                            disabled={!canClockIn || submitting}
                            className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                              canClockIn
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Clock In
                          </button>
                          <button
                            onClick={() => handleClockInOut('out', null)}
                            disabled={!canClockOut || submitting}
                            className={`w-full px-4 py-2 rounded font-medium transition-colors ${
                              canClockOut
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Clock Out
                          </button>
                        </div>
                        {finalClockIn && (
                          <div className="pt-4 border-t">
                            <div className="text-sm space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-600">Clock In:</span>
                                <div className="flex items-center gap-2">
                                  {getStatusBadge(finalClockIn.status)}
                                  <span className="text-gray-900">
                                    {finalClockIn.clock_in_time ? new Date(finalClockIn.clock_in_time).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : (finalClockIn.time_selected_utc ? new Date(finalClockIn.time_selected_utc).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    }) : '--')}
                                  </span>
                                </div>
                              </div>
                              {finalClockOut && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-600">Clock Out:</span>
                                  <div className="flex items-center gap-2">
                                    {getStatusBadge(finalClockOut.status)}
                                    <span className="text-gray-900">
                                      {finalClockOut.clock_out_time ? new Date(finalClockOut.clock_out_time).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true,
                                      }) : (finalClockOut.time_selected_utc ? new Date(finalClockOut.time_selected_utc).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true,
                                      }) : '--')}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Clock In/Out Modal */}
      {showClockModal && clockType && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
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
                  ) : selectedShift ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 mt-2">
                      <div className="font-medium">ℹ Location captured (not mandatory)</div>
                      <div className="text-xs mt-1 opacity-75">
                        No geofence is defined for this shift. Your location has been captured but is not mandatory for clock-in/out.
                      </div>
                    </div>
                  ) : null}
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
                    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                    
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
                    
                    // Require reason ONLY if: supervisor doing for other worker
                    // Location is captured but not mandatory
                    // Different day will make it pending but doesn't require reason
                    const requiresReason = isSupervisorDoingForOther;
                    return requiresReason && <span className="text-red-500">*</span>;
                  })()
                }
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry..."
                className="w-full border rounded px-3 py-2 h-24"
                minLength={15}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(() => {
                  if (!selectedShift) {
                    return 'Optional: Reason text is recommended when clocking in/out without a scheduled shift.';
                  }
                  
                  const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                  const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                  
                  if (isSupervisorDoingForOther) {
                    return (
                      <span className="text-red-600 font-medium">
                        Required (minimum 15 characters): Supervisor clock-in/out for another worker always requires a reason.
                      </span>
                    );
                  }
                  
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
                  setClockType(null);
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
    </>
  );
}
