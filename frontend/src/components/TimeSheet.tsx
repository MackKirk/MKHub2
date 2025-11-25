/**
 * TimeSheet component for clock-in/out with shift-based attendance tracking
 * Integrates with Dispatch system for validation (GPS, tolerance, geofencing)
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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

interface Shift {
  id: string;
  project_id: string;
  worker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  job_name?: string;
  geofences?: Array<{ lat: number; lng: number; radius_m: number }>;
}

interface Attendance {
  id: string;
  shift_id: string;
  type?: 'in' | 'out'; // For backward compatibility
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  time_selected_utc?: string | null; // For backward compatibility
  status: 'approved' | 'pending' | 'rejected';
  source: 'app' | 'supervisor' | 'kiosk' | 'system';
  reason_text?: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_accuracy_m?: number;
  created_at?: string;
}

interface TimeSheetProps {
  projectId: string;
  userId?: string; // Optional: for viewing other user's timesheet (supervisor/admin)
}

export default function TimeSheet({ projectId, userId }: TimeSheetProps) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocal());
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);

  // Get current user info to determine if viewing own timesheet
  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      try {
        return await api<any>('GET', '/auth/me');
      } catch {
        return null;
      }
    },
  });

  const targetUserId = userId || currentUser?.id;

  // Fetch shifts for the selected date
  const dateRange = useMemo(() => {
    return `${selectedDate},${selectedDate}`;
  }, [selectedDate]);

  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts', projectId, dateRange, targetUserId],
    queryFn: async () => {
      try {
        const allShifts = await api<Shift[]>('GET', `/dispatch/projects/${projectId}/shifts?date_range=${dateRange}`);
        // Filter by worker if userId is specified, otherwise filter by current user
        if (targetUserId) {
          return allShifts.filter((s: Shift) => s.worker_id === targetUserId && s.status === 'scheduled');
        }
        return allShifts.filter((s: Shift) => s.status === 'scheduled');
      } catch {
        return [];
      }
    },
  });

  // Fetch attendance records for shifts
  const { data: attendances, refetch: refetchAttendances } = useQuery({
    queryKey: ['attendances', projectId, selectedDate, targetUserId],
    queryFn: async () => {
      if (!shifts || shifts.length === 0) return [];
      try {
        // Fetch attendance for each shift
        const attendancePromises = shifts.map((shift: Shift) =>
          api<Attendance[]>('GET', `/dispatch/shifts/${shift.id}/attendance`).catch(() => [])
        );
        const results = await Promise.all(attendancePromises);
        return results.flat();
      } catch {
        return [];
      }
    },
    enabled: !!shifts && shifts.length > 0,
  });

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

  // Round time to 15 minutes
  const roundTo15Minutes = (timeStr: string): string => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const roundedMinutes = Math.round(minutes / 15) * 15;
    if (roundedMinutes >= 60) {
      return `${String(hours + 1).padStart(2, '0')}:00`;
    }
    return `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  };

  // Handle clock-in/out
  const handleClockInOut = async (shift: Shift, type: 'in' | 'out') => {
    if (!shift) {
      toast.error('No shift selected');
      return;
    }

    // Set selected shift and type
    setSelectedShift(shift);
    setClockType(type);
    setReasonText('');
    setGpsError('');

    // Set default time to now (rounded to 15 min)
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(Math.round(now.getMinutes() / 15) * 15).padStart(2, '0');
    setSelectedTime(`${hours}:${minutes}`);

    // Try to get GPS location (don't block on failure)
    setGpsLoading(true);
    try {
      await getCurrentLocation();
    } catch (error) {
      // GPS failed, but we'll still allow submission
      console.warn('GPS location failed:', error);
    } finally {
      setGpsLoading(false);
    }

    // Show modal
    setShowReasonModal(true);
  };

  // Submit attendance
  const submitAttendance = async () => {
    if (!selectedShift || !clockType) {
      toast.error('Invalid shift or clock type');
      return;
    }

    if (!selectedTime) {
      toast.error('Please select a time');
      return;
    }

    // Round time to 15 minutes
    const roundedTime = roundTo15Minutes(selectedTime);
    setSelectedTime(roundedTime);

    // Combine date and time
    const [hours, minutes] = roundedTime.split(':').map(Number);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(hours, minutes, 0, 0);
    
    // Format as ISO string for local time (backend will convert to UTC)
    const year = selectedDateTime.getFullYear();
    const month = String(selectedDateTime.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDateTime.getDate()).padStart(2, '0');
    const timeStr = roundedTime;
    const timeSelectedLocal = `${year}-${month}-${day}T${timeStr}:00`;

    setSubmitting(true);

    try {
      const payload: any = {
        shift_id: selectedShift.id,
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add GPS data if available
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false, // Browser API doesn't provide this, assume false
        };
      }

      // Add reason text if provided (backend will require it if outside rules)
      if (reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      // Reset form
      setSelectedShift(null);
      setClockType(null);
      setSelectedTime('');
      setReasonText('');
      setGpsLocation(null);
      setGpsError('');
      setShowReasonModal(false);

      // Refetch data
      await refetchShifts();
      await refetchAttendances();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to submit attendance';
      toast.error(errorMsg);

      // If error is about requiring reason, keep modal open
      if (errorMsg.includes('reason') || errorMsg.includes('Reason')) {
        // Modal is already open, just show error
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Get attendance for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): Attendance | undefined => {
    const att = (attendances || []).find((a: Attendance) => a.shift_id === shiftId);
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
        return <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">Approved</span>;
      case 'pending':
        return <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-800">Pending</span>;
      case 'rejected':
        return <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">Rejected</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border rounded px-3 py-2"
        />
      </div>

      {/* Shifts list */}
      <div className="space-y-2">
        {!shifts || shifts.length === 0 ? (
          <div className="p-4 text-center text-gray-500 bg-gray-50 rounded">
            No shifts scheduled for this date
          </div>
        ) : (
          shifts.map((shift: Shift) => {
            // NEW MODEL: Get the attendance record (which may have both clock_in and clock_out)
            const attendance = (attendances || []).find((a: Attendance) => a.shift_id === shift.id);
            const clockIn = attendance?.clock_in_time ? attendance : undefined;
            const clockOut = attendance?.clock_out_time ? attendance : undefined;
            // Can clock in if there's no clock_in_time or if it's rejected
            const canClockIn = !attendance?.clock_in_time || attendance.status === 'rejected';
            // Can clock out if there's a clock_in_time (approved or pending) but no clock_out_time
            const canClockOut = attendance?.clock_in_time && (attendance.status === 'approved' || attendance.status === 'pending') && !attendance.clock_out_time;

            return (
              <div key={shift.id} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-gray-900">
                        {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                      </span>
                      {shift.job_name && (
                        <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                          {shift.job_name}
                        </span>
                      )}
                    </div>

                    {/* Clock In Status */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-600">Clock In:</span>
                      {clockIn ? (
                        <div className="flex items-center gap-2">
                          {getStatusBadge(clockIn.status)}
                          <span className="text-sm text-gray-700">
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
                            <span className="text-xs text-gray-500">(Registered by Supervisor)</span>
                          )}
                          {clockIn.reason_text && (
                            <span className="text-xs text-gray-500" title={clockIn.reason_text}>
                              ℹ️
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not clocked in</span>
                      )}
                    </div>

                    {/* Clock Out Status */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Clock Out:</span>
                      {clockOut ? (
                        <div className="flex items-center gap-2">
                          {getStatusBadge(clockOut.status)}
                          <span className="text-sm text-gray-700">
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
                            <span className="text-xs text-gray-500">(Registered by Supervisor)</span>
                          )}
                          {clockOut.reason_text && (
                            <span className="text-xs text-gray-500" title={clockOut.reason_text}>
                              ℹ️
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Not clocked out</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleClockInOut(shift, 'in')}
                      disabled={!canClockIn || submitting}
                      className={`px-4 py-2 rounded text-sm font-medium ${
                        canClockIn
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Clock In
                    </button>
                    <button
                      onClick={() => handleClockInOut(shift, 'out')}
                      disabled={!canClockOut || submitting}
                      className={`px-4 py-2 rounded text-sm font-medium ${
                        canClockOut
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Clock Out
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reason/Time Modal */}
      {showReasonModal && selectedShift && clockType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              Clock {clockType === 'in' ? 'In' : 'Out'}
            </h3>

            {/* Time selector (15 min increments) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => {
                  const rounded = roundTo15Minutes(e.target.value);
                  setSelectedTime(rounded);
                }}
                step="900"
                className="w-full border rounded px-3 py-2"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Time will be rounded to 15-minute increments
              </p>
            </div>

            {/* GPS Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <button
                  type="button"
                  onClick={getCurrentLocation}
                  disabled={gpsLoading}
                  className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                >
                  {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                </button>
              </div>
              {gpsLocation ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                  <div className="text-green-800">✓ Location captured</div>
                  <div className="text-xs text-green-600 mt-1">
                    Accuracy: {Math.round(gpsLocation.accuracy)}m
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

            {/* Reason text (required if GPS fails or outside rules) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason {(!gpsLocation || gpsError) && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry (required if location cannot be validated)..."
                className="w-full border rounded px-3 py-2 h-24"
                minLength={15}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(!gpsLocation || gpsError) ? (
                  <span className="text-red-600 font-medium">
                    Required (minimum 15 characters): Location cannot be validated. Please describe why you're clocking {clockType} off-site or without GPS.
                  </span>
                ) : (
                  'Optional, but recommended. Required if location cannot be validated or time is outside tolerance window (±30 minutes).'
                )}
              </p>
            </div>

            {/* Privacy notice */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
              <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setShowReasonModal(false);
                  setSelectedShift(null);
                  setClockType(null);
                  setReasonText('');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={submitAttendance}
                disabled={
                  submitting ||
                  !selectedTime ||
                  ((!gpsLocation || gpsError) && (!reasonText.trim() || reasonText.trim().length < 15))
                }
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

