import { api } from "./api";
import type { TodayShiftInfo, ShiftAttendanceResponse, ShiftSummary } from "../types/shifts";

// Shift and attendance integration using dispatch router:
// - GET /dispatch/shifts?date_range=YYYY-MM-DD,YYYY-MM-DD
// - GET /dispatch/shifts/{shift_id}/attendance
// - POST /dispatch/attendance

export const getShifts = async (
  dateRange: string
): Promise<ShiftSummary[]> => {
  const response = await api.get<ShiftSummary[]>("/dispatch/shifts", {
    params: { date_range: dateRange }
  });
  return response.data;
};

export const getShiftAttendance = async (
  shiftId: string
): Promise<ShiftAttendanceResponse[]> => {
  const response = await api.get<ShiftAttendanceResponse[]>(
    `/dispatch/shifts/${shiftId}/attendance`
  );
  return response.data;
};

export const getTodayShiftAndAttendance = async (): Promise<TodayShiftInfo | null> => {
  const today = new Date().toISOString().slice(0, 10);
  const shifts = await getShifts(`${today},${today}`);
  const firstShift = shifts[0];
  if (!firstShift) {
    return null;
  }
  const attendance = await getShiftAttendance(firstShift.id);
  const current = attendance[attendance.length - 1] ?? null;

  return {
    shift: firstShift,
    currentAttendance: current,
    project: {
      id: firstShift.project_id,
      name: firstShift.project_name ?? ""
    }
  };
};

export interface PostAttendancePayload {
  shift_id: string;
  type: "in" | "out";
  time_selected_local: string;
}

export const postAttendance = async (
  payload: PostAttendancePayload
): Promise<void> => {
  await api.post("/dispatch/attendance", payload);
};


