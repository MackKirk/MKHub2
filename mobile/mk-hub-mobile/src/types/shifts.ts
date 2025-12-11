export interface Geofence {
  lat: number;
  lng: number;
  radius_m: number;
}

// Based on /dispatch/shifts and /dispatch/shifts/{id} response fields.
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

// Based on /dispatch/shifts/{shift_id}/attendance
export interface ShiftAttendanceResponse {
  id: string;
  shift_id: string;
  worker_id: string;
  type: "in" | "out" | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  time_selected_utc: string | null;
  status: string;
  source?: string | null;
  reason_text?: string | null;
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


