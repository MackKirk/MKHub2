import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, ChevronLeft, ChevronRight, Clock, Coffee, Info, AlertTriangle, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { JobSearchCombobox } from '@/components/JobSearchCombobox';
import { formatJobPickerLine, getPredefinedJob, isPredefinedJobId } from '@/constants/predefinedJobs';
import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';
import { formatRoundedHhmm } from '@/lib/timePickerUtils';
import {
  AppButton,
  AppCard,
  AppControlLabelRow,
  AppDatePicker,
  AppFieldHint,
  AppFormModal,
  AppModal,
  AppTimePicker,
  uiCx,
  uiDropdown,
  uiLayout,
  uiRadius,
  uiTypography,
} from '@/components/ui';

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

function parseQuarterHour(hhmm: string): { hours: number; minutes: number } | null {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [hours, minutes] = hhmm.split(':').map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    minutes % 15 !== 0
  ) {
    return null;
  }
  return { hours, minutes };
}

function localDateTime(year: number, month: number, day: number, hours: number, minutes: number) {
  return new Date(year, month - 1, day, hours, minutes, 0);
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatClockTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function capitalizeWeekday(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function weekStartSundayFrom(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function shiftLocalDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
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

type WeeklySummaryDay = {
  date: string;
  day_name: string;
  clock_in: string | null;
  clock_out: string | null;
  hours_worked_minutes: number;
  hours_worked_formatted: string;
};

type WeeklySummary = {
  week_start: string;
  week_end: string;
  days: WeeklySummaryDay[];
  total_minutes: number;
  total_hours_formatted: string;
  reg_hours_formatted?: string;
  total_break_formatted?: string;
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
  /** Keep the parent date in sync when the modal date picker changes. */
  onDateChange?: (date: string) => void;
};

export function ClockInOutModalLayer({
  selectedDate: dateProp,
  clockType,
  onClose,
  shiftById = null,
  onBusyChange,
  onDateChange,
}: ClockInOutModalLayerProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const todayStr = getTodayLocal();

  const [selectedDate, setSelectedDate] = useState(dateProp);
  useEffect(() => {
    setSelectedDate(dateProp);
  }, [dateProp]);

  const goToDate = useCallback(
    (next: string) => {
      setSelectedDate(next);
      onDateChange?.(next);
    },
    [onDateChange],
  );

  const [selectedJob, setSelectedJob] = useState<string>('');
  const [jobTouched, setJobTouched] = useState<boolean>(false);
  const [shiftPickOpen, setShiftPickOpen] = useState<boolean>(false);
  const [shiftPickOptions, setShiftPickOptions] = useState<Shift[]>([]);
  const [shiftPickSelectedId, setShiftPickSelectedId] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
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

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 0,
  });

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

  const weekStartStr = useMemo(
    () => formatDateLocal(weekStartSundayFrom(selectedDate)),
    [selectedDate],
  );

  const { data: weeklySummary } = useQuery({
    queryKey: ['weekly-attendance-summary', weekStartStr, currentUser?.id],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('week_start', weekStartStr);
      if (currentUser?.id) params.set('worker_id', currentUser.id);
      return api<WeeklySummary>('GET', `/dispatch/attendance/weekly-summary?${params.toString()}`);
    },
    enabled: !!currentUser?.id,
  });

  const { data: needsAttention } = useQuery({
    queryKey: ['attendance-needs-attention'],
    queryFn: () =>
      api<{ count: number; items?: { date: string; missing_clock_out?: boolean }[] }>(
        'GET',
        '/dispatch/attendance/needs-attention',
      ),
    enabled: !!currentUser?.id,
    staleTime: 30_000,
  });

  const pendingPastDays = needsAttention?.items ?? [];
  const pendingPastCount = needsAttention?.count ?? pendingPastDays.length;
  const firstPendingPastDate = pendingPastDays[0]?.date ?? null;

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
      setStartTime('');
      setEndTime(formatRoundedHhmm());
    }
  }, [clockType, selectedDate]);

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

  const resetLocalModalState = useCallback(() => {
    setStartTime('');
    setEndTime('');
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

    if (clockType === 'in' && !startTime) {
      toast.error('Please set a start time');
      return;
    }

    const endParsed = parseQuarterHour(endTime);
    if (!endParsed) {
      toast.error('Please select a valid end time in 15-minute increments');
      return;
    }

    const [year, month, day] = selectedDate.split('-').map(Number);
    const now = new Date();
    const maxFutureMs = 4 * 60 * 1000;
    const endDateTime = localDateTime(year, month, day, endParsed.hours, endParsed.minutes);
    if (endDateTime.getTime() > now.getTime() + maxFutureMs) {
      toast.error('End time cannot be in the future. Please select a valid time.');
      return;
    }

    let startDateTime: Date | null = null;
    if (clockType === 'in') {
      const startParsed = parseQuarterHour(startTime);
      if (!startParsed) {
        toast.error('Please select a valid start time in 15-minute increments');
        return;
      }
      startDateTime = localDateTime(year, month, day, startParsed.hours, startParsed.minutes);
      if (endDateTime.getTime() <= startDateTime.getTime()) {
        toast.error('End time must be after start time');
        return;
      }
    }

    if (clockType === 'out') {
      if (openClockIn && openClockIn.clock_in_time) {
        const clockInDate = new Date(openClockIn.clock_in_time);
        if (endDateTime <= clockInDate) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          return;
        }
      }
    }

    const endStr = `${String(endParsed.hours).padStart(2, '0')}:${String(endParsed.minutes).padStart(2, '0')}`;
    const startStr = startTime;
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

    const periodStart =
      clockType === 'out' && openClockIn?.clock_in_time
        ? new Date(openClockIn.clock_in_time)
        : startDateTime;
    const totalMinutes = periodStart
      ? Math.floor((endDateTime.getTime() - periodStart.getTime()) / (1000 * 60))
      : 0;
    const workedHours = Math.floor(totalMinutes / 60);
    const workedMinutes = totalMinutes % 60;
    const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;

    const confirmationMessage =
      clockType === 'in'
        ? `Log hours on ${dateFormatted} from ${formatTime12h(startStr)} to ${formatTime12h(endStr)}` +
          `\nHours: ${hoursWorkedStr}` +
          `${projectJobName ? `\nJob: ${projectJobName}` : ''}`
        : `Clock out on ${dateFormatted} at ${formatTime12h(endStr)}` +
          `\nHours: ${hoursWorkedStr}` +
          `${projectJobName ? `\nJob: ${projectJobName}` : ''}`;

    const confirmationResult = await confirm({
      title: clockType === 'in' ? 'Confirm hours' : 'Confirm clock out',
      message: confirmationMessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
    });

    if (confirmationResult !== 'confirm') {
      return;
    }

    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        type: clockType,
        time_selected_local:
          clockType === 'in'
            ? `${selectedDate}T${startStr}:00`
            : `${selectedDate}T${endStr}:00`,
      };

      if (clockType === 'in') {
        payload.clock_out_time_local = `${selectedDate}T${endStr}:00`;
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
        toast.success(clockType === 'in' ? 'Hours saved' : 'Clock-out approved');
      } else if (result.status === 'pending') {
        toast.success(clockType === 'in' ? 'Hours submitted for approval' : 'Clock-out submitted for approval');
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
      queryClient.invalidateQueries({ queryKey: ['attendance-needs-attention'] });

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

  const closeShiftPick = () => {
    setShiftPickOpen(false);
    setShiftPickOptions([]);
    setShiftPickSelectedId('');
  };

  const isToday = selectedDate === todayStr;
  const isCurrentWeek = weekStartStr === formatDateLocal(weekStartSundayFrom(todayStr));
  const hoursPreview = useMemo(() => {
    const endParsed = parseQuarterHour(endTime);
    if (!endParsed) return null;
    const [year, month, day] = selectedDate.split('-').map(Number);
    const endDateTime = localDateTime(year, month, day, endParsed.hours, endParsed.minutes);
    let startDateTime: Date | null = null;
    if (clockType === 'out' && openClockIn?.clock_in_time) {
      startDateTime = new Date(openClockIn.clock_in_time);
    } else if (clockType === 'in') {
      const startParsed = parseQuarterHour(startTime);
      if (!startParsed) return null;
      startDateTime = localDateTime(year, month, day, startParsed.hours, startParsed.minutes);
    }
    if (!startDateTime || endDateTime.getTime() <= startDateTime.getTime()) return null;
    const total = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 60_000);
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }, [
    clockType,
    endTime,
    openClockIn?.clock_in_time,
    selectedDate,
    startTime,
  ]);

  const infoBanner = hasOpenClockIn
    ? 'This entry is missing an end time. Use Clock out to add one.'
    : nextPendingShift
      ? `Next scheduled shift: ${nextPendingShift.project_name || 'Unknown'} (${formatTime12h(nextPendingShift.start_time)} – ${formatTime12h(nextPendingShift.end_time)})`
      : 'At the end of the day, log your start time and end time.';

  const weekRangeLabel = weeklySummary
    ? `${formatDateShort(weeklySummary.week_start)} – ${formatDateShort(weeklySummary.week_end)}`
    : `${formatDateShort(weekStartStr)} – ${formatDateShort(shiftLocalDate(weekStartStr, 6))}`;

  const weekDayRows = useMemo(() => {
    const byDate = new Map((weeklySummary?.days ?? []).map((d) => [d.date, d]));
    const rows: WeeklySummaryDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = shiftLocalDate(weekStartStr, i);
      const existing = byDate.get(date);
      if (existing) {
        rows.push(existing);
        continue;
      }
      const dayName = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
      rows.push({
        date,
        day_name: dayName,
        clock_in: null,
        clock_out: null,
        hours_worked_minutes: 0,
        hours_worked_formatted: '0h 00m',
      });
    }
    return rows;
  }, [weekStartStr, weeklySummary]);

  const canSubmit =
    !submitting &&
    (clockType === 'in' ? Boolean(selectedJob && startTime && endTime) : Boolean(endTime));

  return (
    <>
      <AppFormModal
        open
        onClose={closeModal}
        formWidth="wide"
        title={clockType === 'in' ? 'Log hours' : 'Clock out'}
        description={
          clockType === 'in'
            ? 'Enter start and end time at the end of the day. Times use 15-minute steps.'
            : 'Add an end time to an open entry.'
        }
        quickInfo={
          <>
            <p>Log a complete shift: start, end, and job. This is not a live timer.</p>
            <p>Location is optional and does not block submit.</p>
            {clockType === 'in' && selectedDateShift && project ? (
              <p>Job is pre-filled from your scheduled shift when applicable.</p>
            ) : null}
          </>
        }
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" onClick={closeModal}>
              Cancel
            </AppButton>
            {clockType === 'in' ? (
              <button
                type="button"
                onClick={() => void handleClockInOut()}
                disabled={!canSubmit}
                className={uiCx(
                  'inline-flex h-9 items-center justify-center gap-2 px-5 text-xs font-semibold text-white shadow-sm',
                  'bg-gradient-to-br from-green-500 via-green-600 to-emerald-800',
                  uiRadius.control,
                  'hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {submitting ? 'Saving…' : 'Log hours'}
              </button>
            ) : (
              <AppButton variant="danger" onClick={() => void handleClockInOut()} loading={submitting} disabled={!canSubmit}>
                Clock out
              </AppButton>
            )}
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)] md:items-start">
          <div className="space-y-3">
            <div
              className={uiCx(
                'flex items-center gap-3 px-4 py-3.5 text-white shadow-sm',
                uiRadius.card,
                clockType === 'in'
                  ? 'bg-gradient-to-br from-green-500 via-green-600 to-emerald-800'
                  : 'bg-gradient-to-br from-red-500 via-red-600 to-rose-800',
              )}
            >
              <span
                className={uiCx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white',
                  clockType === 'in' ? 'text-green-700' : 'text-red-700',
                )}
              >
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold">
                  {clockType === 'in' ? 'Log hours' : 'Clock out'}
                </div>
                <div className="text-xs text-white/85">
                  {hoursPreview ? `This entry: ${hoursPreview}` : 'Start and end time in 15-minute steps'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <AppButton
                variant="secondary"
                size="sm"
                leftIcon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => goToDate(shiftLocalDate(selectedDate, -1))}
                aria-label="Previous day"
              />
              <AppButton variant="secondary" size="sm" onClick={() => goToDate(todayStr)}>
                {isToday ? 'Today' : formatDateShort(selectedDate)}
              </AppButton>
              <AppButton
                variant="secondary"
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => goToDate(shiftLocalDate(selectedDate, 1))}
                aria-label="Next day"
              />
              <AppDatePicker
                id="log-hours-date"
                value={selectedDate}
                onChange={(e) => e.target.value && goToDate(e.target.value)}
                triggerClassName="w-[9.5rem]"
                aria-label="Select date"
              />
            </div>

            {pendingPastCount > 0 && firstPendingPastDate ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-900">
                    {pendingPastCount === 1
                      ? '1 past day still needs attention'
                      : `${pendingPastCount} past days still need attention`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    Open entries from before today are missing an end time.
                  </p>
                  <button
                    type="button"
                    onClick={() => goToDate(firstPendingPastDate)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline hover:text-amber-950"
                  >
                    Go to {formatDateShort(firstPendingPastDate)}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  {pendingPastDays.length > 1 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {pendingPastDays.slice(0, 5).map((item) => (
                        <button
                          key={item.date}
                          type="button"
                          onClick={() => goToDate(item.date)}
                          className={uiCx(
                            'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                            item.date === selectedDate
                              ? 'border-amber-400 bg-amber-100 text-amber-950'
                              : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-100',
                          )}
                        >
                          {formatDateShort(item.date)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {clockType === 'in' ? (
              <JobSearchCombobox
                value={selectedJob}
                onChange={(jobId) => {
                  setJobTouched(true);
                  setSelectedJob(jobId);
                }}
                disabled={isJobLocked}
                fieldHint={
                  selectedDateShift && project
                    ? 'Job\n\nPre-filled from your scheduled shift for today. Change only if you worked a different job.'
                    : 'Job\n\nThe project or office job these hours belong to.'
                }
              />
            ) : (
              <div className={uiCx('rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5', uiRadius.control)}>
                <div className="text-[11px] font-medium text-gray-500">Job</div>
                <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">
                  {clockInJobName || 'Open entry'}
                </div>
              </div>
            )}

            <div className={clockType === 'in' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1'}>
              {clockType === 'in' ? (
                <AppTimePicker
                  label="Start time *"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                  fieldHint="Start time\n\nWhen this job started. 15-minute steps (8:00, 8:15, 8:30, 8:45)."
                />
              ) : null}
              <AppTimePicker
                label={clockType === 'in' ? 'End time *' : 'Clock out *'}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                fieldHint={
                  clockType === 'in'
                    ? 'End time\n\nWhen this job ended. Defaults to now, rounded to 15 minutes.'
                    : 'Clock out\n\nEnd time for the open entry. 15-minute steps.'
                }
              />
            </div>

            <div className="space-y-1.5">
              <AppControlLabelRow
                label="Location"
                fieldHint={
                  <AppFieldHint hint="Location\n\nOptional. GPS may be captured if you allow it. It does not block logging hours." />
                }
              />
              {gpsLocation ? (
                <div className={uiCx('rounded-lg border border-green-200 bg-green-50 p-3', uiRadius.control)}>
                  <div className="flex items-center gap-2 text-xs font-medium text-green-800">
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Location captured</span>
                  </div>
                  <div className="mt-1 text-xs text-green-700">Accuracy: {Math.round(gpsLocation.accuracy)}m</div>
                </div>
              ) : gpsLoading ? (
                <div className={uiCx('rounded-lg border border-blue-200 bg-blue-50 p-3', uiRadius.control)}>
                  <div className="flex items-center gap-2 text-xs text-blue-800">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-800 border-t-transparent" />
                    <span>Getting location...</span>
                  </div>
                </div>
              ) : gpsError ? (
                <div className={uiCx('rounded-lg border border-yellow-200 bg-yellow-50 p-3', uiRadius.control)}>
                  <div className="text-xs text-yellow-800">
                    {gpsError}
                    <button
                      type="button"
                      onClick={getCurrentLocation}
                      className="ml-2 font-medium underline hover:text-yellow-900"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <div className={uiCx('rounded-lg border border-gray-200 bg-gray-50 p-3', uiRadius.control)}>
                  <div className="text-xs text-gray-600">No location data</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-1">
              <AppButton
                variant="ghost"
                size="sm"
                leftIcon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => goToDate(shiftLocalDate(selectedDate, -7))}
                aria-label="Previous week"
              />
              <div className={uiCx('min-h-11 flex-1 rounded-xl px-2 py-1.5 text-center', isCurrentWeek ? 'bg-emerald-50' : 'bg-gray-50')}>
                <div className={uiCx('text-sm font-semibold', isCurrentWeek ? 'text-emerald-800' : 'text-gray-900')}>
                  {weekRangeLabel || 'This week'}
                </div>
                {isCurrentWeek ? <div className="text-[10px] font-medium text-emerald-700">this week</div> : null}
              </div>
              <AppButton
                variant="ghost"
                size="sm"
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => goToDate(shiftLocalDate(selectedDate, 7))}
                aria-label="Next week"
              />
            </div>

            <AppCard>
              <div className="grid grid-cols-2 gap-2.5">
                <HoursSideMetric
                  icon={<Clock className="h-3.5 w-3.5" />}
                  tint="bg-emerald-50 text-emerald-700"
                  label="Total"
                  value={weeklySummary?.total_hours_formatted || '0h 00m'}
                />
                <HoursSideMetric
                  icon={<Briefcase className="h-3.5 w-3.5" />}
                  tint="bg-blue-50 text-blue-700"
                  label="Regular"
                  value={weeklySummary?.reg_hours_formatted || '0h 00m'}
                />
                <HoursSideMetric
                  icon={<Zap className="h-3.5 w-3.5" />}
                  tint="bg-orange-50 text-orange-700"
                  label="Overtime"
                  value="0h 00m"
                />
                <HoursSideMetric
                  icon={<Coffee className="h-3.5 w-3.5" />}
                  tint="bg-gray-100 text-gray-600"
                  label="Breaks"
                  value={weeklySummary?.total_break_formatted || '0h 00m'}
                />
              </div>
              <div className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
                {weekDayRows.map((day) => {
                  const inT = day.clock_in ? formatClockTimestamp(day.clock_in) : null;
                  const outT = day.clock_out ? formatClockTimestamp(day.clock_out) : null;
                  const range = inT && outT ? `${inT} – ${outT}` : inT ? `${inT} – --:--` : null;
                  const hasHours =
                    Boolean(day.clock_in || day.clock_out) ||
                    (day.hours_worked_minutes && day.hours_worked_minutes > 0);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => goToDate(day.date)}
                      className={uiCx(
                        'flex w-full items-center gap-2 py-2 text-left hover:bg-gray-50',
                        day.date === selectedDate && 'bg-emerald-50/70',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className={uiCx(
                            'text-xs font-semibold',
                            hasHours ? 'text-gray-900' : 'text-gray-500',
                          )}
                        >
                          {capitalizeWeekday(day.day_name)} · {formatDateShort(day.date)}
                        </div>
                        {range ? (
                          <div className="mt-0.5 text-[11px] text-gray-500">{range}</div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-gray-400">No hours logged</div>
                        )}
                      </div>
                      <div
                        className={uiCx(
                          'text-xs font-semibold tabular-nums',
                          hasHours ? 'text-gray-900' : 'text-gray-400',
                        )}
                      >
                        {day.hours_worked_formatted || '0h 00m'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!weeklySummary ? (
                <p className={uiCx(uiTypography.helper, 'mt-2 text-center')}>Updating hours…</p>
              ) : null}
            </AppCard>
            <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-50 px-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
                <Info className="h-4 w-4" />
              </span>
              <p className="pt-1 text-xs text-emerald-800">{infoBanner}</p>
            </div>
          </div>
        </div>
      </AppFormModal>
      <AppModal
        open={shiftPickOpen}
        onClose={closeShiftPick}
        title="Select Shift"
        description={`You have multiple shifts for this project on ${formatDateShort(selectedDate)}. Choose which shift you are clocking in for.`}
        size="md"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton variant="secondary" size="sm" onClick={closeShiftPick}>
              Cancel
            </AppButton>
            <AppButton
              size="sm"
              onClick={async () => {
                if (!shiftPickSelectedId) {
                  toast.error('Please select a shift');
                  return;
                }
                const selected = shiftPickSelectedId;
                closeShiftPick();
                await performClockInOut(selected);
              }}
            >
              Confirm Shift
            </AppButton>
          </div>
        }
      >
        <ul className={uiCx(uiDropdown.menuOptionsList, 'max-h-[60vh]')} role="listbox">
          {shiftPickOptions.map((s) => (
            <li key={s.id} role="option" aria-selected={shiftPickSelectedId === s.id}>
              <button
                type="button"
                onClick={() => setShiftPickSelectedId(s.id)}
                className={uiCx(
                  uiDropdown.option,
                  'flex items-center justify-between gap-4',
                  shiftPickSelectedId === s.id && uiDropdown.optionSelected,
                )}
              >
                <span className="min-w-0 truncate text-xs text-gray-900">
                  {s.project_name || 'Project'} <span className="text-gray-400">•</span>{' '}
                  {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                </span>
                <span
                  className={uiCx(
                    'h-4 w-4 shrink-0 rounded-full border',
                    shiftPickSelectedId === s.id ? 'border-brand-red bg-brand-red' : 'border-gray-300',
                  )}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </AppModal>
    </>
  );
}

function HoursSideMetric({
  icon,
  tint,
  label,
  value,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={uiCx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tint)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold tabular-nums text-gray-900">{value}</div>
        <div className="text-[10px] text-gray-500">{label}</div>
      </div>
    </div>
  );
}
