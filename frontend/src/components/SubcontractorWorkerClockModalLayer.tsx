import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';
import { useConfirm } from '@/components/ConfirmProvider';
import { ProjectSearchCombobox } from '@/components/ProjectSearchCombobox';
import { scWorkerClockQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppButton,
  AppCheckbox,
  AppDatePicker,
  AppFormModal,
  AppSelect,
  uiSpacing,
} from '@/components/ui';

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  const v = String(m).padStart(2, '0');
  return { value: v, label: v };
});

const AM_PM_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

const BREAK_HOUR_OPTIONS = Array.from({ length: 3 }, (_, i) => ({
  value: String(i),
  label: String(i),
}));

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
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export type ScWorkerOpenAttendance = {
  id: string;
  project_id: string;
  project_name?: string | null;
  clock_in_time?: string | null;
} | null;

export type SubcontractorWorkerClockModalLayerProps = {
  workerId: string;
  openAttendance: ScWorkerOpenAttendance;
  selectedDate: string;
  onSelectedDateChange: (date: string) => void;
  clockType: 'in' | 'out';
  projectId: string;
  onProjectIdChange: (id: string) => void;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onSuccess: () => void | Promise<void>;
};

export function SubcontractorWorkerClockModalLayer({
  workerId,
  openAttendance,
  selectedDate,
  onSelectedDateChange,
  clockType,
  projectId,
  onProjectIdChange,
  onClose,
  onBusyChange,
  onSuccess,
}: SubcontractorWorkerClockModalLayerProps) {
  const confirm = useConfirm();

  const [selectedHour12, setSelectedHour12] = useState('');
  const [selectedMinute, setSelectedMinute] = useState('');
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');
  const [selectedTime, setSelectedTime] = useState('');
  const [submitting, setSubmittingInternal] = useState(false);
  const setSubmitting = useCallback(
    (v: boolean) => {
      setSubmittingInternal(v);
      onBusyChange?.(v);
    },
    [onBusyChange],
  );

  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const [hoursConfirm, setHoursConfirm] = useState(false);
  const [sigOut, setSigOut] = useState<string | null>(null);
  const [insertBreakTime, setInsertBreakTime] = useState(false);
  const [breakHours, setBreakHours] = useState('0');
  const [breakMinutes, setBreakMinutes] = useState('0');

  const { data: currentUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 0,
  });

  const hasUnrestrictedClock =
    (currentUser?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin') ||
    (currentUser?.permissions || []).includes('hr:timesheet:unrestricted_clock') ||
    (currentUser?.permissions || []).includes('timesheet:unrestricted_clock');

  const sigProjectId = projectId || openAttendance?.project_id || '';

  useEffect(() => {
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    getCurrentLocation();
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

  const resetLocal = useCallback(() => {
    setSelectedTime('');
    setSelectedHour12('');
    setSelectedMinute('');
    setGpsLocation(null);
    setGpsError('');
    setHoursConfirm(false);
    setSigOut(null);
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');
  }, []);

  const closeModal = useCallback(() => {
    resetLocal();
    onClose();
  }, [onClose, resetLocal]);

  const buildGpsNotes = () => {
    if (!gpsLocation) return undefined;
    return `GPS:${JSON.stringify({
      lat: gpsLocation.lat,
      lng: gpsLocation.lng,
      accuracy_m: gpsLocation.accuracy,
      mocked: false,
    })}`;
  };

  const clockSubmitBlockedReason = useMemo(() => {
    if (submitting) return 'Submitting…';
    if (clockType === 'in' && !projectId) return 'Select a project to continue.';
    if (clockType === 'out') {
      if (!sigProjectId) return 'Project is required to capture the clock-out signature.';
      if (!hoursConfirm) return 'Check the box to confirm that the recorded working hours are accurate.';
      if (!sigOut) return 'Clock-out requires a signature.';
    }
    return null;
  }, [submitting, clockType, projectId, sigProjectId, hoursConfirm, sigOut]);

  const performSubmit = async () => {
    if (clockType === 'in' && !projectId) {
      toast.error('Please select a project');
      return;
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
      return;
    }

    if (clockType === 'out' && openAttendance?.clock_in_time) {
      const clockInDate = new Date(openAttendance.clock_in_time);
      if (selectedDateTime <= clockInDate) {
        toast.error('Clock-out time must be after clock-in time.');
        return;
      }
      if (insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10);
        const totalMinutes = Math.floor((selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60));
        if (breakTotalMinutes >= totalMinutes) {
          toast.error(
            'Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.',
          );
          return;
        }
      }
    }

    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const time12h = formatTime12h(timeStr);
    const dateFormatted = formatDateShort(selectedDate);

    const projectLabel = await (async () => {
      if (clockType === 'out' && openAttendance?.project_name) return openAttendance.project_name;
      if (clockType === 'in' && projectId) {
        try {
          const meta = await api<{ name?: string; code?: string | null }>('GET', `/projects/${projectId}`);
          return meta?.code ? `${meta.code} — ${meta.name || ''}` : meta?.name || '';
        } catch {
          return '';
        }
      }
      return '';
    })();

    const confirmationMessage =
      clockType === 'out' && openAttendance?.clock_in_time
        ? (() => {
            const clockInTime = new Date(openAttendance.clock_in_time);
            const clockInHour = clockInTime.getHours();
            const clockInMin = clockInTime.getMinutes();
            const clockInTime12h = formatTime12h(
              `${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`,
            );
            const diffMs = selectedDateTime.getTime() - clockInTime.getTime();
            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const workedHours = Math.floor(totalMinutes / 60);
            const workedMinutes = totalMinutes % 60;
            const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;
            return (
              `You are about to clock out this subcontractor worker with:\n\n` +
              `Date: ${dateFormatted}\n` +
              `Clock In: ${clockInTime12h}\n` +
              `Clock Out: ${time12h}\n` +
              `Duration: ${hoursWorkedStr}${projectLabel ? `\nProject: ${projectLabel}` : ''}\n\n` +
              `Do you want to confirm?`
            );
          })()
        : `You are about to clock in this worker on ${dateFormatted} at ${time12h}${projectLabel ? ` for ${projectLabel}` : ''}.\n\nDo you want to confirm?`;

    const confirmationResult = await confirm({
      title: `Confirm Clock-${clockType === 'in' ? 'In' : 'Out'}`,
      message: confirmationMessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
    });

    if (confirmationResult !== 'confirm') return;

    setSubmitting(true);
    try {
      const clockIso = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
      const notes = buildGpsNotes();

      if (clockType === 'in') {
        await api('POST', '/subcontractors/attendance/clock-in', {
          worker_id: workerId,
          project_id: projectId,
          clock_in_time: clockIso,
          ...(notes ? { notes } : {}),
        });
        toast.success('Clock-in recorded');
      } else {
        if (!openAttendance?.id) {
          toast.error('No open attendance');
          return;
        }
        if (!sigOut) {
          toast.error('Signature is required for clock-out');
          return;
        }
        if (!hoursConfirm) {
          toast.error('Please confirm that the recorded working hours are accurate');
          return;
        }
        await api('POST', '/subcontractors/attendance/clock-out', {
          worker_id: workerId,
          project_id: openAttendance.project_id,
          attendance_id: openAttendance.id,
          clock_out_time: clockIso,
          clock_out_signature_file_id: sigOut,
          hours_accuracy_confirmed: hoursConfirm,
          ...(insertBreakTime
            ? { manual_break_minutes: parseInt(breakHours, 10) * 60 + parseInt(breakMinutes, 10) }
            : {}),
          ...(notes ? { notes } : {}),
        });
        toast.success('Clock-out recorded');
      }

      resetLocal();
      await onSuccess();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const clockSubmitDisabled =
    submitting ||
    (clockType === 'in' && !projectId) ||
    (clockType === 'out' && (!sigProjectId || !hoursConfirm || !sigOut));

  return (
    <AppFormModal
      open
      onClose={closeModal}
      title={`Clock ${clockType === 'in' ? 'In' : 'Out'}`}
      description={
        clockType === 'in'
          ? 'Record clock-in time and project for this worker.'
          : 'Record clock-out time for this worker.'
      }
      quickInfo={scWorkerClockQuickInfo(clockType)}
      footer={
        <div className="flex w-full flex-col gap-2">
          {clockSubmitBlockedReason ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {clockSubmitBlockedReason}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <AppButton type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              onClick={() => void performSubmit()}
              title={clockSubmitBlockedReason || undefined}
              disabled={clockSubmitDisabled}
              loading={submitting}
            >
              Submit
            </AppButton>
          </div>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppDatePicker
          id="sc-worker-clock-modal-date"
          label="Date"
          value={selectedDate}
          onChange={(e) => {
            const v = e.target.value;
            if (v) onSelectedDateChange(v);
          }}
          required
        />

        <div>
          <span className="mb-1.5 block text-xs font-medium text-gray-700">Time</span>
          {!hasUnrestrictedClock ? (
            <div className="flex items-center gap-2 pointer-events-none opacity-60">
              <AppSelect className="flex-1" value={selectedHour12} options={HOUR_OPTIONS} placeholder="Hour" disabled />
              <span className="font-medium text-gray-500">:</span>
              <AppSelect className="flex-1" value={selectedMinute} options={MINUTE_OPTIONS} placeholder="Min" disabled />
              <AppSelect className="flex-1" value={selectedAmPm} options={AM_PM_OPTIONS} disabled />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <AppSelect
                className="flex-1"
                value={selectedHour12}
                onChange={(e) => {
                  const hour12 = e.target.value;
                  setSelectedHour12(hour12);
                  updateTimeFrom12h(hour12, selectedMinute, selectedAmPm);
                }}
                options={HOUR_OPTIONS}
                placeholder="Hour"
                required
              />
              <span className="font-medium text-gray-500">:</span>
              <AppSelect
                className="flex-1"
                value={selectedMinute}
                onChange={(e) => {
                  const minute = e.target.value;
                  setSelectedMinute(minute);
                  updateTimeFrom12h(selectedHour12, minute, selectedAmPm);
                }}
                options={MINUTE_OPTIONS}
                placeholder="Min"
                required
              />
              <AppSelect
                className="flex-1"
                value={selectedAmPm}
                onChange={(e) => {
                  const amPm = e.target.value as 'AM' | 'PM';
                  setSelectedAmPm(amPm);
                  updateTimeFrom12h(selectedHour12, selectedMinute, amPm);
                }}
                options={AM_PM_OPTIONS}
                required
              />
            </div>
          )}
          {!hasUnrestrictedClock && (
            <p className="mt-1.5 text-xs text-gray-500">
              Time is locked to the current time (5-minute increments). Contact an administrator to enable time editing.
            </p>
          )}
        </div>

        {clockType === 'in' && (
          <ProjectSearchCombobox
            id="sc-worker-clock-project"
            value={projectId}
            onChange={onProjectIdChange}
            disabled={submitting}
          />
        )}

        {clockType === 'out' && openAttendance && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900">
            {openAttendance.project_name ? `Project: ${openAttendance.project_name}` : 'Open session'}
            {openAttendance.clock_in_time ? ` · Since ${new Date(openAttendance.clock_in_time).toLocaleString()}` : ''}
          </div>
        )}

        {clockType === 'out' && (
          <div className={uiSpacing.sectionStack}>
            <AppCheckbox
              label="I confirm that the recorded working hours are accurate."
              checked={hoursConfirm}
              onChange={setHoursConfirm}
            />
            <AppCheckbox label="Insert break time" checked={insertBreakTime} onChange={setInsertBreakTime} />
            {insertBreakTime && (
              <div className="flex flex-wrap items-end gap-3 pl-8">
                <AppSelect
                  label="Hours"
                  value={breakHours}
                  onChange={(e) => setBreakHours(e.target.value)}
                  options={BREAK_HOUR_OPTIONS}
                  className="min-w-[100px] flex-1"
                />
                <AppSelect
                  label="Minutes"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                  options={MINUTE_OPTIONS}
                  className="min-w-[100px] flex-1"
                />
              </div>
            )}
            {sigProjectId ? (
              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-medium text-gray-600">Signature</p>
                <SubcontractorSimpleSignature
                  projectId={sigProjectId}
                  disabled={submitting}
                  onUploaded={(fid) => setSigOut(fid)}
                  onClear={() => setSigOut(null)}
                />
              </div>
            ) : (
              <p className="text-xs text-amber-700">Missing project context for signature upload.</p>
            )}
          </div>
        )}

        <div>
          {gpsLocation ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                <span>Location captured</span>
              </div>
              <div className="mt-1 text-xs text-green-700">Accuracy: {Math.round(gpsLocation.accuracy)}m</div>
            </div>
          ) : gpsLoading ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Getting location…
            </div>
          ) : gpsError ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              {gpsError}{' '}
              <button type="button" onClick={getCurrentLocation} className="text-xs font-medium underline">
                Try again
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">No location data</div>
          )}
        </div>
      </div>
    </AppFormModal>
  );
}
