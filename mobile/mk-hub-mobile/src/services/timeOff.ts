import { api } from "./api";
import type {
  CreateTimeOffPayload,
  TimeOffBalance,
  TimeOffHistoryItem,
  TimeOffRequest
} from "../types/timeOff";

const BASE = "/employees/me/time-off";

export async function fetchMyTimeOffBalances(): Promise<TimeOffBalance[]> {
  const response = await api.get<TimeOffBalance[]>(`${BASE}/balance`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function fetchMyTimeOffRequests(): Promise<TimeOffRequest[]> {
  const response = await api.get<TimeOffRequest[]>(`${BASE}/requests`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function fetchMyTimeOffHistory(): Promise<TimeOffHistoryItem[]> {
  const response = await api.get<TimeOffHistoryItem[]>(`${BASE}/history`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function submitMyTimeOffRequest(
  payload: CreateTimeOffPayload
): Promise<{ id: string; status: string }> {
  const response = await api.post<{ id: string; status: string }>(
    `${BASE}/requests`,
    payload
  );
  return response.data;
}

export async function cancelMyTimeOffRequest(requestId: string): Promise<void> {
  await api.patch(`${BASE}/requests/${requestId}`, { status: "cancelled" });
}

export function hoursToDays(hours: number): number {
  return hours / 8;
}

export function daysToHours(days: number): number {
  return days * 8;
}

export function isSickPolicy(name: string): boolean {
  return name.toLowerCase().includes("sick");
}

export function isVacationPolicy(name: string): boolean {
  const value = name.toLowerCase();
  return (
    value.includes("vacation") ||
    value.includes("holiday") ||
    value.includes("time off") ||
    value.includes("day off")
  );
}

export function resolvePolicyName(
  balances: TimeOffBalance[],
  kind: "vacation" | "sick"
): string {
  const match = balances.find((row) =>
    kind === "sick" ? isSickPolicy(row.policy_name) : isVacationPolicy(row.policy_name)
  );
  return match?.policy_name ?? (kind === "sick" ? "Sick Leave" : "Vacation");
}

export function countInclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
