import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import OverlayPortal from '@/components/OverlayPortal';
import { JobSearchCombobox } from '@/components/JobSearchCombobox';
import { formatJobPickerLine, getPredefinedJob, isPredefinedJobId } from '@/constants/predefinedJobs';

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

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  status: string;
  time_selected_utc?: string | null;
  reason_text?: string;
  job_type?: string;
  break_minutes?: number | null;
};

type Project = {
  id: string;
  name: string;
  code?: string;
};

function isHoursWorked(attendance: Attendance | null): boolean {
  if (!attendance?.reason_text) return false;
  return attendance.reason_text.includes('HOURS_WORKED:');
}

export type ClockInOutModalLayerProps = {
  selectedDate: string;
  clockType: 'in' | 'out';
  onClose: () => void;
  /** Deep-linked shift from schedule / URL */
  shiftById?: Shift | null;
  /** Lets parent disable main clock tiles while submit is in flight */
  onBusyChange?: (busy: boolean) => void;
};

export function ClockInOutModalLayer({
  selectedDate,
  clockType,
  onClose,
  shiftById = null,
  onBusyChange,
}: ClockInOutModalLayerProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [selectedJob, setSelectedJob] = useState<string>('');
  const [jobTouched, setJobTouched] = useState<boolean>(false);
  const [shiftPickOpen, setShiftPickOpen] = useState<boolean>(false);
  const [shiftPickOptions, setShiftPickOptions] = useState<Shift[]>([]);
  const [shiftPickSelectedId, setShiftPickSelectedId] = useState<string>('');
  const [selectedHour12, setSelectedHour12] = useState<string>('');
  const [selectedMinute, setSelectedMinute] = useState<string>('');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [submitting, setSubmittingInternal] = useState(false);
  const setSubmitting = useCallback(
    (v: boolean) => {
      setSubmittingInternal(v);
      onBusyChange?.(v);
    },
    [onBusyChange]
  );

  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string>('');

  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 0,
  });

  const hasUnrestrictedClock = useMemo(() => {
    if (!currentUser) return false;
    const roles = currentUser?.roles || [];
    const isAdmin = roles.some((r: string) => String(r || '').toLowerCase() === 'admin');
    if (isAdmin) return true;
    const permissions = currentUser?.permissions || [];
    const hasHrPermission = permissions.includes('hr:timesheet:unrestricted_clock');
    const hasLegacyPermission = permissions.includes('timesheet:unrestricted_clock');
    return hasHrPermission || hasLegacyPermission;
  }, [currentUser]);

  const { data: shiftsForSelectedDate = [] } = useQuery({
    queryKey: ['clock-in-out-shifts', selectedDate, currentUser?.id],
    queryFn: () => {
      if (!currentUser?.id) return Promise.resolve([]);
      return api<Shift[]>(
        'GET',
        `/dispatch/shifts?date_range=${selectedDate},${selectedDate}&worker_id=${currentUser.id}&status=scheduled`
      );
    },
    enabled: !!currentUser?.id,
  });

  const scheduledShifts = useMemo(() => {
    return shiftsForSelectedDate.filter((s) => s.status === 'scheduled');
  }, [shiftsForSelectedDate]);

  const selectedDateShift = useMemo(() => {
    if (shiftById && shiftById.date === selectedDate) {
      return shiftById;
    }
    return scheduledShifts.length > 0 ? scheduledShifts[0] : null;
  }, [scheduledShifts, shiftById, selectedDate]);

  const { refetch: refetchAttendances } = useQuery({
    queryKey: ['clock-in-out-attendances', selectedDateShift?.id],
    queryFn: () => {
      if (!selectedDateShift?.id) return Promise.resolve([]);
      return api<Attendance[]>('GET', `/dispatch/shifts/${selectedDateShift.id}/attendance`);
    },
    enabled: !!selectedDateShift?.id,
  });

  const { data: allAttendancesData, refetch: refetchAllAttendances } = useQuery({
    queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { attendances: [], shifts: [] };

      const allAttendances: Attendance[] = [];

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

      try {
        const directAttendances = await api<Attendance[]>('GET', `/dispatch/attendance/direct/${selectedDate}`);
        allAttendances.push(...directAttendances);
      } catch {
        // ignore
      }

      return { attendances: allAttendances, shifts: shifts || [] };
    },
    enabled: !!currentUser?.id,
  });

  const allAttendancesForDate = allAttendancesData?.attendances || [];

  const { data: project } = useQuery({
    queryKey: ['project', selectedDateShift?.project_id],
    queryFn: () => api<any>('GET', `/projects/${selectedDateShift?.project_id}`),
    enabled: !!selectedDateShift?.project_id,
  });

  const { data: selectedJobProject } = useQuery({
    queryKey: ['clock-modal-selected-job-project', selectedJob],
    queryFn: () => api<Project>('GET', `/projects/${selectedJob}`),
    enabled: !!selectedJob && !isPredefinedJobId(selectedJob),
  });

  const { openClockIn, hasOpenClockIn } = useMemo(() => {
    const events = (allAttendancesForDate || [])
      .filter((a) => !!(a.clock_in_time || a.clock_out_time || a.time_selected_utc))
      .map((a) => {
        const t = a.clock_in_time || a.clock_out_time || a.time_selected_utc || '';
        return { a, tMs: new Date(t).getTime() };
      })
      .sort((x, y) => x.tMs - y.tMs);

    const openStack: { att: Attendance; inMs: number }[] = [];

    for (const { a } of events) {
      if (isHoursWorked(a)) continue;

      if (a.clock_in_time && a.clock_out_time) {
        continue;
      }

      if (a.clock_in_time && !a.clock_out_time) {
        openStack.push({ att: a, inMs: new Date(a.clock_in_time).getTime() });
        continue;
      }

      if (a.clock_out_time && !a.clock_in_time) {
        const outMs = new Date(a.clock_out_time).getTime();
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

  const clockInJobType = useMemo(() => {
    if (!openClockIn) return null;

    if (!openClockIn.shift_id) {
      if (openClockIn.job_type) {
        return openClockIn.job_type;
      }
      if (openClockIn.reason_text) {
        const reason = openClockIn.reason_text;
        if (reason.startsWith('JOB_TYPE:')) {
          const parts = reason.split('|');
          const job_marker = parts[0];
          return job_marker.replace('JOB_TYPE:', '');
        }
      }
    }

    return selectedDateShift?.job_name || null;
  }, [openClockIn, selectedDateShift]);

  const isJobLocked = hasOpenClockIn && openClockIn !== null;

  useEffect(() => {
    if (isJobLocked && clockInJobType) {
      setSelectedJob(clockInJobType);
    }
  }, [isJobLocked, clockInJobType, hasOpenClockIn, openClockIn]);

  const shiftCompletionById = useMemo(() => {
    const map = new Map<string, { completed: boolean }>();

    const byShift = new Map<string, Attendance[]>();
    for (const a of allAttendancesForDate) {
      if (!a.shift_id) continue;
      const arr = byShift.get(a.shift_id) || [];
      arr.push(a);
      byShift.set(a.shift_id, arr);
    }

    for (const [shiftId, arr] of byShift.entries()) {
      const hasSingleRecordComplete = arr.some((x) => !!x.clock_in_time && !!x.clock_out_time);
      if (hasSingleRecordComplete) {
        map.set(shiftId, { completed: true });
        continue;
      }

      const clockInTimes = arr
        .map((x) => (x.clock_in_time ? new Date(x.clock_in_time).getTime() : null))
        .filter((t): t is number => typeof t === 'number');
      const clockOutTimes = arr
        .map((x) => (x.clock_out_time ? new Date(x.clock_out_time).getTime() : null))
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

  useEffect(() => {
    if (clockType === 'in') {
      setJobTouched(false);
    }
  }, [clockType]);

  useEffect(() => {
    if (clockType !== 'in') return;
    if (isJobLocked || hasOpenClockIn) return;
    if (jobTouched) return;
    if (nextPendingShift?.project_id) {
      setSelectedJob(nextPendingShift.project_id);
    }
  }, [clockType, isJobLocked, hasOpenClockIn, jobTouched, nextPendingShift?.project_id]);

  const { data: clockInJobTypeProject } = useQuery({
    queryKey: ['clock-modal-clock-in-job-project', clockInJobType],
    queryFn: () => api<Project>('GET', `/projects/${clockInJobType}`),
    enabled:
      !!clockInJobType &&
      !isPredefinedJobId(clockInJobType) &&
      !(openClockIn?.shift_id && !!project),
  });

  const clockInJobName = useMemo(() => {
    if (!openClockIn || !clockInJobType) return null;

    if (openClockIn.shift_id && project) {
      return formatJobPickerLine(project);
    }

    const pre = getPredefinedJob(clockInJobType);
    if (pre) return formatJobPickerLine(pre);

    if (clockInJobTypeProject) return formatJobPickerLine(clockInJobTypeProject);

    return clockInJobType;
  }, [openClockIn, clockInJobType, project, clockInJobTypeProject]);

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

  const getCurrentLocation = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (clockType) {
      getCurrentLocation();
    }
  }, [clockType, getCurrentLocation]);

  const updateTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (!hour12 || !minute) {
      setSelectedTime('');
      return;
    }

    const hour24 =
      amPm === 'PM' && parseInt(hour12, 10) !== 12
        ? parseInt(hour12, 10) + 12
        : amPm === 'AM' && parseInt(hour12, 10) === 12
          ? 0
          : parseInt(hour12, 10);

    const timeStr = `${String(hour24).padStart(2, '0')}:${minute}`;
    setSelectedTime(timeStr);
  };

  const resetLocalModalState = useCallback(() => {
    setSelectedTime('');
    setSelectedHour12('');
    setSelectedMinute('');
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
    setGpsLocation(null);
    setGpsError('');
    setShiftPickOpen(false);
    setShiftPickOptions([]);
    setShiftPickSelectedId('');
  }, []);

  const closeModal = useCallback(() => {
    resetLocalModalState();
    onClose();
  }, [onClose, resetLocalModalState]);

  const performClockInOut = async (overrideShiftId?: string | null) => {
    if (clockType === 'in' && !selectedJob) {
      toast.error('Please select a Job to clock in');
      return;
    }

    let targetShiftId: string | null = null;
    if (clockType === 'in') {
      if (overrideShiftId) {
        targetShiftId = overrideShiftId;
      } else {
        const matchingShifts = allScheduledShiftsForDate.filter((s) => String(s.project_id) === String(selectedJob));
        const pendingShifts = matchingShifts.filter((s) => !shiftCompletionById.get(s.id)?.completed);

        if (pendingShifts.length > 1) {
          setShiftPickOptions(pendingShifts);
          setShiftPickSelectedId(pendingShifts[0]?.id || '');
          setShiftPickOpen(true);
          return;
        }

        if (pendingShifts.length === 1) {
          targetShiftId = pendingShifts[0].id;
        }
      }
    }

    let timeToUse = selectedTime;
    if (!hasUnrestrictedClock || !timeToUse || !timeToUse.includes(':')) {
      const now = new Date();
      const hours = now.getHours();
      const minutes = Math.floor(now.getMinutes() / 5) * 5;
      timeToUse = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    const [hours, minutes] = timeToUse.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes % 5 !== 0 || minutes < 0 || minutes > 59) {
      toast.error('Please select a valid time in 5-minute increments');
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    const now = new Date();
    const maxFutureMs = 4 * 60 * 1000;
    if (selectedDateTime.getTime() > now.getTime() + maxFutureMs) {
      toast.error('Clock-in/out cannot be in the future. Please select a valid time.');
      setSubmitting(false);
      return;
    }

    if (clockType === 'out') {
      if (openClockIn && openClockIn.clock_in_time) {
        const clockInDate = new Date(openClockIn.clock_in_time);
        if (selectedDateTime <= clockInDate) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          setSubmitting(false);
          return;
        }

        if (insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
          const totalMinutes = Math.floor((selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60));

          if (breakTotalMinutes >= totalMinutes) {
            toast.error(
              'Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.'
            );
            setSubmitting(false);
            return;
          }
        }
      }
    }

    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const time12h = formatTime12h(timeStr);
    const dateFormatted = formatDateShort(selectedDate);

    let projectJobName = '';
    if (clockType === 'out' && clockInJobName) {
      projectJobName = clockInJobName;
    } else if (selectedJob) {
      const pre = getPredefinedJob(selectedJob);
      if (pre) projectJobName = formatJobPickerLine(pre);
      else if (selectedJobProject) projectJobName = formatJobPickerLine(selectedJobProject);
      else projectJobName = selectedJob;
    }

    let confirmationMessage = '';
    if (clockType === 'out' && openClockIn) {
      const clockInTime = new Date(openClockIn.clock_in_time!);
      const clockInHour = clockInTime.getHours();
      const clockInMin = clockInTime.getMinutes();
      const clockInTime12h = formatTime12h(`${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`);

      let breakTotalMinutes = 0;
      let breakInfo = '';
      if (insertBreakTime) {
        breakTotalMinutes = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
        if (breakTotalMinutes > 0) {
          const breakH = Math.floor(breakTotalMinutes / 60);
          const breakM = breakTotalMinutes % 60;
          breakInfo = breakM > 0 ? `Break: ${breakH}h ${breakM}min` : `Break: ${breakH}h`;
        }
      }

      const [yearOut, monthOut, dayOut] = selectedDate.split('-').map(Number);
      const clockOutDateTime = new Date(yearOut, monthOut - 1, dayOut, hours, minutes, 0);
      const clockInDateTime = new Date(clockInTime);
      const diffMs = clockOutDateTime.getTime() - clockInDateTime.getTime();
      const totalMinutes = Math.floor(diffMs / (1000 * 60));

      const netMinutes = Math.max(0, totalMinutes - breakTotalMinutes);
      const workedHours = Math.floor(netMinutes / 60);
      const workedMinutes = netMinutes % 60;
      const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;

      confirmationMessage =
        `You are about to clock out with the following details:\n\n` +
        `Date: ${dateFormatted}\n` +
        `Clock In: ${clockInTime12h}\n` +
        `Clock Out: ${time12h}${breakInfo ? `\n${breakInfo}` : ''}\n` +
        `Hours Worked: ${hoursWorkedStr}${projectJobName ? `\nProject/Job: ${projectJobName}` : ''}\n\n` +
        `Do you want to confirm?`;
    } else {
      confirmationMessage = `You are about to clock ${clockType === 'in' ? 'in' : 'out'} on ${dateFormatted} at ${time12h}${projectJobName ? ` for ${projectJobName}` : ''}.\n\nDo you want to confirm?`;
    }

    const confirmationResult = await confirm({
      title: `Confirm Clock-${clockType === 'in' ? 'In' : 'Out'}`,
      message: confirmationMessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
    });

    if (confirmationResult !== 'confirm') {
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      const timeSelectedLocal = `${selectedDate}T${timeStr}:00`;

      const payload: Record<string, unknown> = {
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      if (clockType === 'out' && insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
        payload.manual_break_minutes = breakTotalMinutes;
      }

      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      let result: { status?: string };

      if (clockType === 'out') {
        if (!openClockIn) {
          toast.error('No open clock-in found to clock out');
          setSubmitting(false);
          return;
        }

        if (openClockIn.shift_id) {
          payload.shift_id = openClockIn.shift_id;
          result = await api('POST', '/dispatch/attendance', payload);
        } else {
          const jobTypeToUse = clockInJobType;
          if (!jobTypeToUse) {
            toast.error('Missing job information for clock-out');
            setSubmitting(false);
            return;
          }
          payload.job_type = jobTypeToUse;
          result = await api('POST', '/dispatch/attendance/direct', payload);
        }
      } else {
        if (targetShiftId) {
          payload.shift_id = targetShiftId;
          result = await api('POST', '/dispatch/attendance', payload);
        } else {
          const jobTypeToUse = selectedJob;
          if (!jobTypeToUse) {
            toast.error('Please select a Job');
            setSubmitting(false);
            return;
          }
          payload.job_type = jobTypeToUse;
          result = await api('POST', '/dispatch/attendance/direct', payload);
        }
      }

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      resetLocalModalState();
      if (clockType === 'out') {
        setSelectedJob('');
      }

      queryClient.removeQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });

      await new Promise((resolve) => setTimeout(resolve, 500));

      await refetchAllAttendances();
      await refetchAttendances();
      queryClient.invalidateQueries({ queryKey: ['weekly-attendance-summary'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['clock-in-out-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-attendances'] });
      queryClient.invalidateQueries({ queryKey: ['shift-attendances'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['overview-clock-attendances'] });

      onClose();
    } catch (error: unknown) {
      console.error('Error submitting attendance:', error);
      const err = error as { response?: { data?: { detail?: string }; status?: number }; message?: string };
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to submit attendance';
      toast.error(errorMsg);

      const isConflictError = err.response?.status === 400 && errorMsg.includes('already');
      if (isConflictError) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        queryClient.removeQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
        queryClient.invalidateQueries({ queryKey: ['clock-in-out-all-attendances', selectedDate, currentUser?.id] });
        await refetchAllAttendances();
        await refetchAttendances();
        queryClient.invalidateQueries({ queryKey: ['weekly-attendance-summary'] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClockInOut = async () => {
    return performClockInOut(null);
  };

  return (
    <>
      <OverlayPortal>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
        >
          <div
            className="max-w-md w-full max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0 rounded-t-xl border-b border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeModal} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Clock {clockType === 'in' ? 'In' : 'Out'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {clockType === 'in' ? 'Record your clock-in time and job' : 'Record your clock-out time'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
                <div>
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Time *</label>
                  {!hasUnrestrictedClock ? (
                    <div className="flex gap-2 items-center pointer-events-none">
                      <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 opacity-60 text-gray-500 text-sm">
                        {selectedHour12 || 'Hour'}
                      </div>
                      <span className="text-gray-500 font-medium">:</span>
                      <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 opacity-60 text-gray-500 text-sm">
                        {selectedMinute || 'Min'}
                      </div>
                      <div className="flex-1 border border-gray-200 rounded-lg px-3 py-2 bg-gray-100 opacity-60 text-gray-500 text-sm">
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
                  )}
                  {!hasUnrestrictedClock && (
                    <p className="text-[10px] text-gray-500 mt-1.5">
                      Time is locked. Contact an administrator to enable time editing.
                    </p>
                  )}
                </div>

                {clockType === 'in' && (
                  <div>
                    <JobSearchCombobox
                      value={selectedJob}
                      onChange={(jobId) => {
                        setJobTouched(true);
                        setSelectedJob(jobId);
                      }}
                      disabled={isJobLocked}
                    />
                    {selectedDateShift && project && (
                      <p className="text-[10px] text-gray-500 mt-1">Pre-filled from your scheduled shift</p>
                    )}
                  </div>
                )}

                {clockType === 'out' && (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={insertBreakTime}
                        onChange={(e) => setInsertBreakTime(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-200 text-brand-red focus:ring-brand-red"
                      />
                      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Insert Break Time</span>
                    </label>
                    {insertBreakTime && (
                      <div className="mt-2 ml-5 space-y-2">
                        <div className="flex gap-2 items-center">
                          <label className="text-[10px] text-gray-500 w-12">Hours:</label>
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
                          <label className="text-[10px] text-gray-500 w-12">Minutes:</label>
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

                <div>
                  {gpsLocation ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800 font-medium text-sm">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Location captured</span>
                      </div>
                      <div className="text-xs text-green-700 mt-1">Accuracy: {Math.round(gpsLocation.accuracy)}m</div>
                    </div>
                  ) : gpsLoading ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-800 text-sm">
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-800 border-t-transparent" />
                        <span>Getting location...</span>
                      </div>
                    </div>
                  ) : gpsError ? (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="text-sm text-yellow-800">
                        {gpsError}
                        <button
                          type="button"
                          onClick={getCurrentLocation}
                          className="ml-2 text-xs underline font-medium hover:text-yellow-900"
                        >
                          Try again
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="text-sm text-gray-600">No location data</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={closeModal}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClockInOut}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </OverlayPortal>

      {shiftPickOpen && (
        <OverlayPortal>
          <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShiftPickOpen(false);
                setShiftPickOptions([]);
                setShiftPickSelectedId('');
              }
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full border border-gray-200/60 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200/60">
                <h3 className="text-xl font-semibold text-gray-900">Select Shift</h3>
                <p className="text-sm text-gray-600 mt-1">
                  You have multiple shifts for this project on {formatDateShort(selectedDate)}. Choose which shift you are clocking in for.
                </p>
              </div>

              <div className="p-6 space-y-3 overflow-y-auto max-h-[60vh]">
                {shiftPickOptions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setShiftPickSelectedId(s.id)}
                    className={`w-full text-left rounded-xl border p-4 hover:bg-gray-50 transition-colors ${
                      shiftPickSelectedId === s.id ? 'border-brand-red ring-2 ring-brand-red/30' : 'border-gray-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {s.project_name || 'Project'} <span className="text-gray-400 font-medium">•</span>{' '}
                          {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex-shrink-0 ${
                          shiftPickSelectedId === s.id ? 'border-brand-red bg-brand-red' : 'border-gray-300'
                        }`}
                      />
                    </div>
                  </button>
                ))}
              </div>

              <div className="p-6 border-t border-gray-200/60 bg-gray-50/50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShiftPickOpen(false);
                    setShiftPickOptions([]);
                    setShiftPickSelectedId('');
                  }}
                  className="px-4 py-2.5 rounded-lg border border-gray-200/60 hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!shiftPickSelectedId) {
                      toast.error('Please select a shift');
                      return;
                    }
                    const selected = shiftPickSelectedId;
                    setShiftPickOpen(false);
                    setShiftPickOptions([]);
                    setShiftPickSelectedId('');
                    await performClockInOut(selected);
                  }}
                  className="px-4 py-2.5 rounded-lg bg-brand-red text-white hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  Confirm Shift
                </button>
              </div>
            </div>
          </div>
        </OverlayPortal>
      )}
    </>
  );
}
