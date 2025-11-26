import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';

type Attendance = {
  id: string;
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
};

type AttendanceEvent = {
  event_id: string;
  worker_id: string;
  worker_name: string;
  job_name?: string | null;
  project_name?: string | null;
  job_type?: string | null;
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

const buildEvents = (attendances: Attendance[]): AttendanceEvent[] => {
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
    
    // Subtract break minutes from hours_worked if break exists
    if (hoursWorked !== null && att.break_minutes !== null && att.break_minutes !== undefined && att.break_minutes > 0) {
      hoursWorked = Math.max(0, hoursWorked - (att.break_minutes / 60));
    }
    
    return {
      event_id: att.id,
      worker_id: att.worker_id,
      worker_name: att.worker_name,
      job_name: att.job_name,
      project_name: att.project_name,
      job_type: att.shift_id ? null : extractJobType(att.reason_text),
      shift_id: att.shift_id || undefined,
      clock_in_id: att.clock_in_time ? att.id : null,
      // For "hours worked", store the date (not time) so we can use it for editing
      clock_in_time: isHoursWorked && att.clock_in_time
        ? formatDateLocal(new Date(att.clock_in_time)) + 'T00:00:00Z'
        : att.clock_in_time || null,
      clock_in_status: att.clock_in_time ? att.status : null,
      clock_in_reason: att.clock_in_time ? att.reason_text : null,
      clock_out_id: att.clock_out_time ? att.id : null,
      // For "hours worked", store the date (not time) so we can use it for editing
      clock_out_time: isHoursWorked && att.clock_out_time
        ? formatDateLocal(new Date(att.clock_out_time)) + 'T00:00:00Z'
        : att.clock_out_time || null,
      clock_out_status: att.clock_out_time ? att.status : null,
      clock_out_reason: att.clock_out_time ? att.reason_text : null,
      hours_worked: hoursWorked,
      break_minutes: att.break_minutes || null,
      is_hours_worked: isHoursWorked,
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [filters, setFilters] = useState({
    worker_id: '',
    start_date: '',
    end_date: '',
    status: '',
  });
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const [workerSearch, setWorkerSearch] = useState('');
  const workerDropdownRef = useRef<HTMLDivElement>(null);
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

  const attendanceEvents = useMemo(
    () => buildEvents(Array.isArray(attendances) ? attendances : []),
    [attendances]
  );

  const { data: users } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const result = await api<any[]>('GET', '/employees');
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

  const jobOptions = useMemo(() => {
    const projectsArray = Array.isArray(projects) ? projects : [];
    const projectJobs = projectsArray.map((p) => ({
      id: p.id,
      code: p.code || p.id,
      name: p.name,
    }));
    return [...PREDEFINED_JOBS, ...projectJobs];
  }, [projects]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workerDropdownRef.current && !workerDropdownRef.current.contains(event.target as Node)) {
        setWorkerDropdownOpen(false);
      }
    };

    if (workerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [workerDropdownOpen]);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    if (!workerSearch) return users;
    const searchLower = workerSearch.toLowerCase();
    return users.filter((u: any) => {
      const name = (u.name || u.username || '').toLowerCase();
      return name.includes(searchLower);
    });
  }, [users, workerSearch]);

  const toggleWorker = (workerId: string) => {
    setSelectedWorkers((prev) => {
      const prevArray = Array.isArray(prev) ? prev : [];
      return prevArray.includes(workerId) 
        ? prevArray.filter((id) => id !== workerId) 
        : [...prevArray, workerId];
    });
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
    setWorkerSearch('');
    setEditingEvent(null);
  };

  const handleOpenModal = (event?: AttendanceEvent) => {
    if (event) {
      setEditingEvent(event);
      setSelectedWorkers([]); // Clear selection when editing
      
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
      
      setFormData({
        worker_id: event.worker_id,
        job_type: event.job_type || '0',
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
      await api('DELETE', `/settings/attendance/${attendanceId}`);
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

          await api('DELETE', `/settings/attendance/${attendanceId}`);
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
    // For editing, use formData.worker_id; for creating, use selectedWorkers
    const workersToProcess = editingEvent 
      ? [formData.worker_id] 
      : (Array.isArray(selectedWorkers) && selectedWorkers.length > 0 ? selectedWorkers : []);
    
    if (workersToProcess.length === 0) {
      toast.error(editingEvent ? 'Please select a worker' : 'Please select at least one worker');
      return;
    }

    // Validation rules differ for new vs edit and for entry mode
    if (editingEvent) {
      if (!formData.clock_in_time) {
        toast.error('Clock-in time is required');
        return;
      }
    } else {
      if (formData.entry_mode === 'time') {
        if (!formData.clock_in_time || !formData.clock_out_time) {
          toast.error('Clock-in and clock-out times are required');
          return;
        }
      } else {
        if (!formData.clock_in_time) {
          toast.error('Clock-in time is required when using hours worked');
          return;
        }
        const hours = parseFloat(formData.hours_worked || '0');
        if (!formData.hours_worked || isNaN(hours) || hours <= 0) {
          toast.error('Please enter a valid number of hours worked');
          return;
        }
      }
    }

    let clockInUtc = toUtcISOString(formData.clock_in_time);
    let clockOutUtc = toUtcISOString(formData.clock_out_time);

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
      if (editingEvent) {
        // NEW MODEL: Update single attendance record with both clock_in_time and clock_out_time
        const attendanceId = editingEvent.clock_in_id || editingEvent.clock_out_id;
        if (!attendanceId) {
          toast.error('Cannot find attendance record to update');
          return;
        }

        const updatePayload: any = {
          clock_in_time: clockInUtc,
          clock_out_time: clockOutUtc,
          status: formData.status,
          ...(editingEvent.shift_id ? {} : { reason_text: reasonText }),
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
    }
  };

  const isSubmitDisabled = editingEvent
    ? (!formData.worker_id || !formData.clock_in_time)
    : (Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) === 0
    ? true
    : !formData.clock_in_time
    ? true
    : formData.entry_mode === 'time'
    ? !formData.clock_out_time // Clock-out required for new entries in time mode
    : !formData.hours_worked || parseFloat(formData.hours_worked || '0') <= 0;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Attendance</div>
          <div className="text-sm opacity-90">Manage all clock-in/out records</div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-white text-[#d11616] rounded-lg font-semibold hover:bg-gray-100 transition-colors"
        >
          + New Attendance
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-xl border bg-white p-4 grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Worker</label>
          <select
            value={filters.worker_id}
            onChange={(e) => setFilters({ ...filters, worker_id: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Workers</option>
            {(Array.isArray(users) ? users : []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.username}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          Error loading attendance records: {String(error)}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedEvents.size > 0 && (
        <div className="mb-4 rounded-xl border bg-blue-50 p-4 flex items-center justify-between">
          <div className="text-sm font-medium text-blue-900">
            {selectedEvents.size} event(s) selected
          </div>
          <button
            onClick={handleDeleteSelected}
            disabled={deletingSelected}
            className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deletingSelected ? 'Deleting...' : 'Delete All Selected'}
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left w-12">
                <input
                  type="checkbox"
                  checked={attendanceEvents.length > 0 && selectedEvents.size === attendanceEvents.length}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
              </th>
              <th className="p-3 text-left">Worker</th>
              <th className="p-3 text-left">Clock In</th>
              <th className="p-3 text-left">Clock Out</th>
              <th className="p-3 text-left">Job/Project</th>
              <th className="p-3 text-left">Hours</th>
              <th className="p-3 text-left">Break</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="p-4">
                  <div className="h-6 bg-gray-100 animate-pulse rounded" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-red-600">
                  Error loading data. Please check console for details.
                </td>
              </tr>
            ) : attendanceEvents.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-4 text-center text-gray-500">
                  No attendance records found
                </td>
              </tr>
            ) : (
              attendanceEvents.map((event) => (
                <tr key={event.event_id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedEvents.has(event.event_id)}
                      onChange={() => handleToggleSelect(event.event_id)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-3">{event.worker_name}</td>
                  <td className="p-3">
                    {event.is_hours_worked ? '-' : (event.clock_in_time ? formatDateTime(event.clock_in_time) : '--')}
                  </td>
                  <td className="p-3">
                    {event.is_hours_worked ? '-' : (event.clock_out_time ? formatDateTime(event.clock_out_time) : '--')}
                  </td>
                  <td className="p-3">
                    {event.job_name ||
                      event.project_name ||
                      (event.job_type
                        ? jobOptions.find((j) => j.id === event.job_type)?.name || 'Unknown'
                        : 'No Project')}
                  </td>
                  <td className="p-3">{formatHours(event.hours_worked)}</td>
                  <td className="p-3">{formatBreak(event.break_minutes)}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        event.clock_in_status === 'approved' &&
                        (!event.clock_out_status || event.clock_out_status === 'approved')
                          ? 'bg-green-100 text-green-800'
                          : event.clock_in_status === 'pending' ||
                            event.clock_out_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {event.clock_in_status === 'approved' &&
                      (!event.clock_out_status || event.clock_out_status === 'approved')
                        ? 'Approved'
                        : event.clock_in_status === 'pending' ||
                          event.clock_out_status === 'pending'
                        ? 'Pending'
                        : 'Rejected'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenModal(event)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event)}
                        disabled={deletingId === event.event_id}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {deletingId === event.event_id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingEvent ? 'Edit Attendance Event' : 'New Attendance Event'}
            </h2>
            <div className="space-y-4">
              {editingEvent ? (
                // When editing, show simple select (single worker)
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Worker *</label>
                  <select
                    value={formData.worker_id}
                    onChange={(e) => setFormData({ ...formData, worker_id: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  >
                    <option value="">Select a worker...</option>
                    {(Array.isArray(users) ? users : []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.username}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                // When creating, show multi-select with search
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Workers * {(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) > 0 && `(${Array.isArray(selectedWorkers) ? selectedWorkers.length : 0} selected)`}
                  </label>
                  <div className="relative" ref={workerDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
                      className="w-full border rounded px-3 py-2 text-left bg-white flex items-center justify-between"
                    >
                      <span className="text-sm text-gray-600">
                        {(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) === 0
                          ? 'Select workers...'
                          : `${Array.isArray(selectedWorkers) ? selectedWorkers.length : 0} worker${(Array.isArray(selectedWorkers) ? selectedWorkers.length : 0) > 1 ? 's' : ''} selected`}
                      </span>
                      <span className="text-gray-400">{workerDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    {workerDropdownOpen && (
                      <div 
                        className="absolute z-50 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-60 overflow-auto"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="p-2 border-b space-y-2">
                          <input
                            type="text"
                            placeholder="Search workers..."
                            value={workerSearch}
                            onChange={(e) => setWorkerSearch(e.target.value)}
                            className="w-full border rounded px-2 py-1 text-sm"
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!Array.isArray(filteredEmployees)) return;
                                const allFilteredIds = filteredEmployees.map((u: any) => u.id);
                                setSelectedWorkers((prev) => {
                                  const prevArray = Array.isArray(prev) ? prev : [];
                                  const newSet = new Set([...prevArray, ...allFilteredIds]);
                                  return Array.from(newSet);
                                });
                              }}
                              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelectedWorkers([]);
                              }}
                              className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                        <div className="p-2">
                          {(Array.isArray(filteredEmployees) && filteredEmployees.length > 0) ? (
                            filteredEmployees.map((u: any) => (
                              <label
                                key={u.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer rounded"
                                onMouseDown={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(selectedWorkers) && selectedWorkers.includes(u.id)}
                                  onChange={() => toggleWorker(u.id)}
                                  className="rounded"
                                  onMouseDown={(e) => e.stopPropagation()}
                                />
                                <span className="text-sm">{u.name || u.username}</span>
                              </label>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-gray-600">No workers found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {Array.isArray(selectedWorkers) && selectedWorkers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedWorkers.map((workerId) => {
                        const worker = (Array.isArray(users) ? users : []).find((u: any) => u.id === workerId);
                        return (
                          <span
                            key={workerId}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                          >
                            {worker?.name || worker?.username || workerId}
                            <button
                              type="button"
                              onClick={() => toggleWorker(workerId)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {!editingEvent?.shift_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job *</label>
                  <select
                    value={formData.job_type}
                    onChange={(e) => setFormData({ ...formData, job_type: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  >
                    {jobOptions.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.code} - {job.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Type
                </label>
                <div className="inline-flex rounded-lg border border-gray-300 bg-gray-50 overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => {
                        // When switching to 'time', clear hours_worked
                        return {
                          ...prev,
                          entry_mode: 'time',
                          hours_worked: '',
                        };
                      });
                    }}
                    className={`px-3 py-1.5 ${
                      formData.entry_mode === 'time'
                        ? 'bg-white text-gray-900'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Clock In / Out
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => {
                        // When switching to 'hours', reset clock_in_time to date at midnight
                        // and calculate hours_worked from clock_in and clock_out if both exist
                        const datePart = prev.clock_in_time ? prev.clock_in_time.slice(0, 10) : getTodayLocal();
                        let hoursWorked = '';
                        
                        // If we have both clock_in and clock_out, calculate hours
                        if (prev.clock_in_time && prev.clock_out_time) {
                          const inTime = new Date(prev.clock_in_time);
                          const outTime = new Date(prev.clock_out_time);
                          const diffMs = outTime.getTime() - inTime.getTime();
                          const diffHours = diffMs / (1000 * 60 * 60);
                          if (diffHours > 0) {
                            hoursWorked = diffHours.toString();
                          }
                        }
                        
                        return {
                          ...prev,
                          entry_mode: 'hours',
                          clock_in_time: `${datePart}T00:00`,
                          clock_out_time: '', // Clear clock-out time when switching to hours mode
                          hours_worked: hoursWorked,
                        };
                      });
                    }}
                    className={`px-3 py-1.5 border-l border-gray-300 ${
                      formData.entry_mode === 'hours'
                        ? 'bg-white text-gray-900'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Hours Worked
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {formData.entry_mode === 'time'
                    ? 'Enter exact clock-in and clock-out times.'
                    : 'Enter start time and total hours; clock-out will be calculated automatically.'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formData.entry_mode === 'time'
                    ? 'Clock In Time * (Local)'
                    : 'Work Date *'}
                </label>
                {formData.entry_mode === 'time' ? (
                  <input
                    type="datetime-local"
                    value={formData.clock_in_time}
                    onChange={(e) =>
                      setFormData({ ...formData, clock_in_time: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  />
                ) : (
                  <input
                    type="date"
                    value={formData.clock_in_time ? formData.clock_in_time.slice(0, 10) : ''}
                    onChange={(e) => {
                      const date = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        clock_in_time: date ? `${date}T00:00` : '',
                      }));
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  />
                )}
              </div>
              {formData.entry_mode === 'time' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {editingEvent
                        ? 'Clock Out Time (Local) - Optional'
                        : 'Clock Out Time * (Local)'}
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.clock_out_time}
                      onChange={(e) =>
                        setFormData({ ...formData, clock_out_time: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      required={!editingEvent}
                    />
                  </div>
                  {/* Manual Break Time (always available in clock in/out mode) */}
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
                </>
              )}
              {formData.entry_mode === 'hours' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hours Worked *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={formData.hours_worked}
                      onChange={(e) =>
                        setFormData({ ...formData, hours_worked: e.target.value })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      placeholder="e.g. 8"
                      required
                    />
                  </div>
                  {/* Manual Break Time (for hours worked mode) */}
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
                </>
              )}
              {editingEvent && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    required
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitDisabled}
                className="px-4 py-2 bg-[#d11616] text-white rounded-lg hover:bg-[#b01414] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingEvent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

