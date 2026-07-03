import type { ProjectStatusBadgeVariant } from "./projectUi";

export type WorkOrderStatus =
  | "open"
  | "in_progress"
  | "pending_parts"
  | "closed"
  | "cancelled"
  | "not_approved";

export type WorkOrderCategory = "maintenance" | "repair" | "inspection" | "other";
export type WorkOrderUrgency = "low" | "normal" | "high" | "urgent";

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  open: "Pending",
  in_progress: "In progress",
  pending_parts: "Awaiting parts",
  closed: "Finished",
  cancelled: "Cancelled",
  not_approved: "Not approved"
};

export const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent"
};

export const CATEGORY_LABELS: Record<string, string> = {
  maintenance: "Maintenance",
  repair: "Repair",
  inspection: "Inspection",
  other: "Other"
};

export const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled"
};

export const INSPECTION_RESULT_LABELS: Record<string, string> = {
  pending: "Pending",
  pass: "Pass",
  fail: "Fail",
  conditional: "Conditional"
};

export const MANUAL_WORK_ORDER_STATUS_TRANSITIONS: Record<string, WorkOrderStatus[]> = {
  open: ["not_approved", "cancelled"],
  in_progress: ["pending_parts", "cancelled"],
  pending_parts: ["in_progress", "cancelled"]
};

export function getWorkOrderStatusVariant(status: string): ProjectStatusBadgeVariant {
  switch (status) {
    case "closed":
      return "success";
    case "in_progress":
      return "warning";
    case "pending_parts":
      return "warning";
    case "cancelled":
    case "not_approved":
      return "danger";
    case "open":
    default:
      return "neutral";
  }
}

export function getInspectionResultVariant(result: string): ProjectStatusBadgeVariant {
  switch (String(result).toLowerCase()) {
    case "pass":
      return "success";
    case "fail":
      return "danger";
    case "conditional":
      return "warning";
    default:
      return "neutral";
  }
}

export function getInspectionConditionVariant(condition: string): ProjectStatusBadgeVariant {
  switch (condition) {
    case "ok":
      return "success";
    case "damage":
      return "danger";
    case "conditional":
      return "warning";
    default:
      return "neutral";
  }
}

export function getUrgencyVariant(urgency: string): ProjectStatusBadgeVariant {
  switch (urgency) {
    case "urgent":
      return "danger";
    case "high":
      return "warning";
    case "low":
      return "info";
    default:
      return "neutral";
  }
}

export function formatFleetDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatFleetDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export function formatDurationMinutes(minutes?: number | null): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}min`;
  if (mins <= 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}
