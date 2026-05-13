import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import OverlayPortal from '@/components/OverlayPortal';
import SubcontractorSimpleSignature from '@/components/SubcontractorSimpleSignature';
import { useConfirm } from '@/components/ConfirmProvider';
import { ProjectSearchCombobox } from '@/components/ProjectSearchCombobox';

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

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
        <div
          className="max-w-md w-full min-w-0 max-h-[90vh] flex flex-col rounded-xl border border-gray-200 bg-gray-100 shadow-xl overflow-hidden"
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
                  {clockType === 'in'
                    ? 'Record clock-in time and project for this worker'
                    : 'Record clock-out time for this worker'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-w-0">
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 min-w-0">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Date *</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) onSelectedDateChange(v);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  required
                />
              </div>

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
                    Time is locked to the current time (5-minute increments). Contact an administrator to enable time editing.
                  </p>
                )}
              </div>

              {clockType === 'in' && (
                <div>
                  <ProjectSearchCombobox
                    id="sc-worker-clock-project"
                    value={projectId}
                    onChange={onProjectIdChange}
                    disabled={submitting}
                  />
                </div>
              )}

              {clockType === 'out' && openAttendance && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-900">
                  {openAttendance.project_name ? `Project: ${openAttendance.project_name}` : 'Open session'}
                  {openAttendance.clock_in_time ? ` · Since ${new Date(openAttendance.clock_in_time).toLocaleString()}` : ''}
                </div>
              )}

              {clockType === 'out' && (
                <div className="space-y-3">
                  <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hoursConfirm}
                      onChange={(e) => setHoursConfirm(e.target.checked)}
                      className="mt-0.5 w-3.5 h-3.5 text-brand-red border-gray-300 rounded focus:ring-brand-red"
                    />
                    <span>I confirm that the recorded working hours are accurate.</span>
                  </label>
                  <div>
                    <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={insertBreakTime}
                        onChange={(e) => setInsertBreakTime(e.target.checked)}
                        className="mt-0.5 w-3.5 h-3.5 text-brand-red border-gray-300 rounded focus:ring-brand-red"
                      />
                      <span>Insert break time</span>
                    </label>
                    {insertBreakTime && (
                      <div className="ml-6 mt-2 flex flex-wrap gap-2 items-center text-xs">
                        <span className="text-gray-500">Hours</span>
                        <select
                          value={breakHours}
                          onChange={(e) => setBreakHours(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
                        >
                          {Array.from({ length: 3 }, (_, i) => (
                            <option key={i} value={String(i)}>
                              {i}
                            </option>
                          ))}
                        </select>
                        <span className="text-gray-500">Minutes</span>
                        <select
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
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
                    )}
                  </div>
                  {sigProjectId ? (
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Signature *</p>
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

          <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex flex-col gap-2 rounded-b-xl">
            {clockSubmitBlockedReason ? (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {clockSubmitBlockedReason}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void performSubmit()}
                title={clockSubmitBlockedReason || undefined}
                disabled={
                  submitting ||
                  (clockType === 'in' && !projectId) ||
                  (clockType === 'out' && (!sigProjectId || !hoursConfirm || !sigOut))
                }
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-brand-red hover:bg-[#aa1212] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
