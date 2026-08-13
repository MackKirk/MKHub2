export interface Geofence {
  lat: number;
  lng: number;
  radius_m: number;
}

export interface ShiftSummary {
  id: string;
  project_id: string;
  project_name?: string | null;
  worker_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  default_break_min?: number;
  geofences?: Geofence[];
  job_name?: string | null;
}

export interface ShiftAttendanceResponse {
  id: string;
  shift_id: string | null;
  worker_id: string;
  type: "in" | "out" | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  time_selected_utc: string | null;
  status: string;
  source?: string | null;
  reason_text?: string | null;
  job_type?: string | null;
  break_minutes?: number | null;
}

export interface TodayShiftInfo {
  shift: ShiftSummary;
  currentAttendance: ShiftAttendanceResponse | null;
  project: {
    id: string;
    name: string;
    address?: string;
  } | null;
}

/** Combined clock state for a date (shift + direct, matches web). */
export interface ClockDayState {
  date: string;
  shifts: ShiftSummary[];
  allShifts: ShiftSummary[];
  attendances: ShiftAttendanceResponse[];
  openAttendance: ShiftAttendanceResponse | null;
  openShift: ShiftSummary | null;
  nextPendingShift: ShiftSummary | null;
  completeAttendances: ShiftAttendanceResponse[];
}

/** @deprecated Use ClockDayState */
export type TodayClockState = ClockDayState;

export interface WeeklySummaryDay {
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
}

export interface WeeklySummary {
  week_start: string;
  week_end: string;
  days: WeeklySummaryDay[];
  total_minutes: number;
  total_hours_formatted: string;
  reg_minutes?: number;
  reg_hours_formatted?: string;
  total_break_minutes?: number;
  total_break_formatted?: string;
}

export interface AttendanceGpsPayload {
  lat: number;
  lng: number;
  accuracy_m: number;
  mocked?: boolean;
}
