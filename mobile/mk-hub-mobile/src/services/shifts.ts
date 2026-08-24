import { api } from "./api";
import { formatDateLocal } from "../lib/dateUtils";
import type {
  AttendanceGpsPayload,
  ClockDayState,
  ServiceItemOption,
  ShiftAttendanceResponse,
  ShiftSummary,
  TodayShiftInfo,
  WeeklySummary
} from "../types/shifts";

export const getShifts = async (
  dateRange: string,
  opts?: { workerId?: string; status?: string }
): Promise<ShiftSummary[]> => {
  const params: Record<string, string> = { date_range: dateRange };
  if (opts?.workerId) params.worker_id = opts.workerId;
  if (opts?.status) params.status = opts.status;
  const response = await api.get<ShiftSummary[]>("/dispatch/shifts", { params });
  return response.data ?? [];
};

export const getShiftAttendance = async (
  shiftId: string
): Promise<ShiftAttendanceResponse[]> => {
  const response = await api.get<ShiftAttendanceResponse[]>(
    `/dispatch/shifts/${shiftId}/attendance`
  );
  return response.data ?? [];
};

export const getDirectAttendances = async (
  date: string
): Promise<ShiftAttendanceResponse[]> => {
  try {
    const response = await api.get<ShiftAttendanceResponse[]>(
      `/dispatch/attendance/direct/${date}`
    );
    return response.data ?? [];
  } catch {
    return [];
  }
};

export const getWeeklyAttendanceSummary = async (
  weekStart: string,
  workerId?: string
): Promise<WeeklySummary> => {
  const params: Record<string, string> = { week_start: weekStart };
  if (workerId) params.worker_id = workerId;
  const response = await api.get<WeeklySummary>(
    "/dispatch/attendance/weekly-summary",
    { params }
  );
  return response.data;
};

function isHoursWorked(a: ShiftAttendanceResponse): boolean {
  return !!a.reason_text && a.reason_text.includes("HOURS_WORKED:");
}

export function getJobTypeFromAttendance(
  a: ShiftAttendanceResponse
): string | null {
  if (a.job_type) return a.job_type;
  if (a.reason_text?.startsWith("JOB_TYPE:")) {
    const part = a.reason_text.split("|")[0] ?? "";
    return part.replace("JOB_TYPE:", "") || null;
  }
  return null;
}

export function getServiceItemFromAttendance(
  a: ShiftAttendanceResponse
): string | null {
  if (a.service_item) return a.service_item;
  if (!a.reason_text) return null;
  for (const part of a.reason_text.split("|")) {
    if (part.startsWith("SERVICE_ITEM:")) {
      return part.replace("SERVICE_ITEM:", "").trim() || null;
    }
  }
  return null;
}

export type { ServiceItemOption } from "../types/shifts";

const FALLBACK_SERVICE_ITEMS: ServiceItemOption[] = [
  { id: "regular", label: "Regular", value: "regular" }
];

export async function getServiceItems(): Promise<ServiceItemOption[]> {
  try {
    const response = await api.get<ServiceItemOption[]>(
      "/dispatch/attendance/service-items"
    );
    const rows = response.data ?? [];
    if (!rows.length) return FALLBACK_SERVICE_ITEMS;
    return rows.map((row) => ({
      id: String(row.id),
      label: row.label || row.value || "Regular",
      value: row.value || row.label || "regular"
    }));
  } catch {
    return FALLBACK_SERVICE_ITEMS;
  }
}

function findOpenAttendance(
  attendances: ShiftAttendanceResponse[]
): ShiftAttendanceResponse | null {
  const events = attendances
    .filter((a) => !!(a.clock_in_time || a.clock_out_time))
    .map((a) => ({
      a,
      tMs: new Date((a.clock_in_time || a.clock_out_time)!).getTime()
    }))
    .sort((x, y) => x.tMs - y.tMs);

  const openStack: ShiftAttendanceResponse[] = [];
  for (const { a } of events) {
    if (isHoursWorked(a)) continue;
    if (a.clock_in_time && a.clock_out_time) continue;
    if (a.clock_in_time && !a.clock_out_time) {
      openStack.push(a);
      continue;
    }
    if (a.clock_out_time && !a.clock_in_time && openStack.length) {
      openStack.pop();
    }
  }
  return openStack.length ? openStack[openStack.length - 1] : null;
}

function findNextPendingShift(
  scheduledShifts: ShiftSummary[],
  attendances: ShiftAttendanceResponse[]
): ShiftSummary | null {
  const completedByShift = new Map<string, boolean>();
  for (const a of attendances) {
    if (!a.shift_id) continue;
    if (a.clock_in_time && a.clock_out_time) {
      completedByShift.set(a.shift_id, true);
    }
  }
  for (const s of scheduledShifts) {
    if (!completedByShift.get(s.id)) return s;
  }
  return null;
}

/** Local time rounded down to 15 minutes. */
export function buildRoundedTimeHHMM(now = new Date()): string {
  const hours = now.getHours();
  const minutes = Math.floor(now.getMinutes() / 15) * 15;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildTimeSelectedLocal(
  date: string,
  timeHHMM?: string,
  now = new Date()
): string {
  const time = timeHHMM && timeHHMM.includes(":") ? timeHHMM : buildRoundedTimeHHMM(now);
  return `${date}T${time}:00`;
}

export function getWeekStartSunday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatDateLocal(dt);
}

export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === "--:--" || timeStr === "-") return timeStr || "--:--";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return timeStr;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

export function formatClockTimestamp(iso: string | null | undefined): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

export function formatShortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatMinutesLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

export const getClockStateForDate = async (
  date: string,
  workerId?: string
): Promise<ClockDayState> => {
  const dateRange = `${date},${date}`;
  const workerOpts = workerId ? { workerId } : undefined;

  const [allShifts, scheduledRaw] = await Promise.all([
    getShifts(dateRange, workerOpts),
    getShifts(dateRange, { ...workerOpts, status: "scheduled" })
  ]);

  const scheduledShifts = scheduledRaw.filter((s) => s.status === "scheduled");
  const attendances: ShiftAttendanceResponse[] = [];

  await Promise.all(
    allShifts.map(async (shift) => {
      try {
        const rows = await getShiftAttendance(shift.id);
        attendances.push(...rows);
      } catch {
        // ignore
      }
    })
  );

  const direct = await getDirectAttendances(date);
  attendances.push(...direct);

  const openAttendance = findOpenAttendance(attendances);
  const openShift = openAttendance?.shift_id
    ? allShifts.find((s) => s.id === openAttendance.shift_id) ?? null
    : null;

  const completeAttendances = attendances
    .filter((a) => a.clock_in_time && a.clock_out_time && !isHoursWorked(a))
    .sort((a, b) => {
      const aT = new Date(a.clock_in_time || "").getTime();
      const bT = new Date(b.clock_in_time || "").getTime();
      return aT - bT;
    });

  return {
    date,
    shifts: scheduledShifts,
    allShifts,
    attendances,
    openAttendance,
    openShift,
    nextPendingShift: findNextPendingShift(scheduledShifts, attendances),
    completeAttendances
  };
};

export const getTodayClockState = async (
  workerId?: string
): Promise<ClockDayState> => {
  return getClockStateForDate(formatDateLocal(new Date()), workerId);
};

export const getTodayShiftAndAttendance = async (): Promise<TodayShiftInfo | null> => {
  const state = await getTodayClockState();
  const shift = state.nextPendingShift ?? state.shifts[0];
  if (!shift) return null;
  const rows = state.attendances.filter((a) => a.shift_id === shift.id);
  const current =
    state.openAttendance?.shift_id === shift.id
      ? state.openAttendance
      : rows[rows.length - 1] ?? null;

  return {
    shift,
    currentAttendance: current,
    project: {
      id: shift.project_id,
      name: shift.project_name ?? ""
    }
  };
};

export interface PostAttendancePayload {
  shift_id: string;
  type: "in" | "out";
  time_selected_local: string;
  clock_out_time_local?: string;
  manual_break_minutes?: number;
  gps?: AttendanceGpsPayload;
  reason_text?: string;
  service_item?: string;
}

export interface PostDirectAttendancePayload {
  type: "in" | "out";
  time_selected_local: string;
  clock_out_time_local?: string;
  job_type: string;
  manual_break_minutes?: number;
  gps?: AttendanceGpsPayload;
  reason_text?: string;
  service_item?: string;
}

export const postAttendance = async (
  payload: PostAttendancePayload
): Promise<{ status?: string }> => {
  const response = await api.post<{ status?: string }>(
    "/dispatch/attendance",
    payload
  );
  return response.data ?? {};
};

export const postDirectAttendance = async (
  payload: PostDirectAttendancePayload
): Promise<{ status?: string }> => {
  const response = await api.post<{ status?: string }>(
    "/dispatch/attendance/direct",
    payload
  );
  return response.data ?? {};
};

export interface UpdateAttendancePayload {
  clock_in_time?: string;
  clock_out_time?: string;
  manual_break_minutes?: number;
  reason_text?: string;
}

export const updateAttendance = async (
  attendanceId: string,
  payload: UpdateAttendancePayload
): Promise<{ status?: string }> => {
  const response = await api.put<{ status?: string }>(
    `/settings/attendance/${attendanceId}`,
    payload
  );
  return response.data ?? {};
};

export const deleteAttendance = async (
  attendanceId: string
): Promise<{ status?: string }> => {
  const response = await api.delete<{ status?: string }>(
    `/settings/attendance/${attendanceId}`
  );
  return response.data ?? {};
};

export function isAttendanceHrLocked(
  attendance: { status?: string | null; approved_by?: string | null; can_edit?: boolean },
  userId?: string | null
): boolean {
  if (typeof attendance.can_edit === "boolean") return !attendance.can_edit;
  const status = (attendance.status || "").toLowerCase();
  if (status !== "approved" || !attendance.approved_by || !userId) return false;
  return String(attendance.approved_by) !== String(userId);
}

export function getNotesFromAttendance(reasonText?: string | null): string {
  if (!reasonText) return "";
  return reasonText
    .split("|")
    .filter(
      (part) =>
        !part.startsWith("JOB_TYPE:") &&
        !part.startsWith("SERVICE_ITEM:") &&
        !part.startsWith("HOURS_WORKED:")
    )
    .join("|")
    .trim();
}

export function composeAttendanceReasonText(opts: {
  jobType?: string | null;
  serviceItem?: string | null;
  notes?: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (opts.jobType) parts.push(`JOB_TYPE:${opts.jobType}`);
  if (opts.serviceItem) parts.push(`SERVICE_ITEM:${opts.serviceItem}`);
  const notes = (opts.notes || "").trim();
  if (notes) parts.push(notes);
  return parts.length ? parts.join("|") : undefined;
}

export function isoToLocalHHMM(iso: string): string {
  const d = new Date(iso);
  const hours = d.getHours();
  const minutes = String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, "0");
  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

export function resolveAttendanceJobLabel(
  attendance: ShiftAttendanceResponse,
  shifts: ShiftSummary[],
  fallbackJobType?: string | null
): string | null {
  if (attendance.shift_id) {
    const shift = shifts.find((s) => s.id === attendance.shift_id);
    if (shift?.project_name) return shift.project_name;
  }
  const jobType = fallbackJobType ?? getJobTypeFromAttendance(attendance);
  if (!jobType) return null;
  // Caller can enrich with predefined/project names
  return jobType;
}
