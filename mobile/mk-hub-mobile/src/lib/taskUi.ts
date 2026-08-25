import type { TaskItem } from "../types/tasks";

export function statusMeta(status: string) {
  if (status === "in_progress") {
    return {
      label: "In Progress",
      color: "#1D4ED8",
      bg: "#DBEAFE",
      rail: ["#1D4ED8", "#60A5FA"] as const,
      icon: "play-circle-outline" as const
    };
  }
  if (status === "blocked") {
    return {
      label: "Paused",
      color: "#B45309",
      bg: "#FEF3C7",
      rail: ["#D97706", "#FBBF24"] as const,
      icon: "pause-circle-outline" as const
    };
  }
  if (status === "done") {
    return {
      label: "Done",
      color: "#166534",
      bg: "#DCFCE7",
      rail: ["#166534", "#4ADE80"] as const,
      icon: "checkmark-circle-outline" as const
    };
  }
  return {
    label: "To Do",
    color: "#C2410C",
    bg: "#FFEDD5",
    rail: ["#EA580C", "#FDBA74"] as const,
    icon: "document-text-outline" as const
  };
}

export function priorityMeta(priority?: string | null) {
  const key = (priority || "normal").toLowerCase();
  if (key === "urgent") return { label: "Urgent", color: "#DC2626" };
  if (key === "high") return { label: "High", color: "#EA580C" };
  if (key === "low") return { label: "Low", color: "#6B7280" };
  return { label: "Normal", color: "#2563EB" };
}

export function sourceLabel(task: TaskItem): string {
  const type = (task.origin?.type || "").toLowerCase();
  if (type === "bug") return "Bug";
  if (type.startsWith("system_")) return "System";
  if (type === "auto_task") return "Auto";
  if (type === "manual_request") return "Request";
  if (task.origin?.reference) return task.origin.reference;
  if (type) return type.replace(/_/g, " ");
  return "Manual";
}

export function formatDue(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return {
    label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    overdue: due.getTime() < today.getTime()
  };
}

export function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function primaryAction(task: TaskItem): { key: string; label: string } | null {
  if (task.status === "accepted" && task.permissions.can_start) {
    return { key: "start", label: "Start" };
  }
  if (task.status === "in_progress" && task.permissions.can_conclude) {
    return { key: "done", label: "Mark done" };
  }
  if (task.status === "blocked" && task.permissions.can_unblock) {
    return { key: "resume", label: "Resume" };
  }
  return null;
}

export function taskActions(task: TaskItem): Array<{ key: string; label: string }> {
  return [
    task.permissions.can_start ? { key: "start", label: "Start task" } : null,
    task.permissions.can_conclude ? { key: "done", label: "Mark done" } : null,
    task.permissions.can_block ? { key: "pause", label: "Pause" } : null,
    task.permissions.can_unblock ? { key: "resume", label: "Resume" } : null
  ].filter(Boolean) as Array<{ key: string; label: string }>;
}
