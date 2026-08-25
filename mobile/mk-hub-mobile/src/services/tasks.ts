import { api } from "./api";
import type {
  TaskGroupedResponse,
  TaskItem,
  TaskLogEntry,
  TaskPermissions,
  TaskPersonInfo
} from "../types/tasks";

const EMPTY_GROUPED: TaskGroupedResponse = {
  accepted: [],
  in_progress: [],
  blocked: [],
  done: []
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asPerson(value: unknown): TaskPersonInfo | null {
  const row = asRecord(value);
  const id = asString(row.id);
  const name = asString(row.name);
  const division = asString(row.division);
  if (!id && !name && !division) return null;
  return { id, name, division };
}

function normalizePermissions(raw: unknown): TaskPermissions {
  const row = asRecord(raw);
  return {
    can_start: Boolean(row.can_start ?? row.can_start),
    can_conclude: Boolean(row.can_conclude ?? row.can_conclude),
    can_block: Boolean(row.can_block ?? row.can_block),
    can_unblock: Boolean(row.can_unblock ?? row.can_unblock)
  };
}

export function normalizeTask(raw: unknown): TaskItem {
  const row = asRecord(raw);
  const project = asRecord(row.project);
  const origin = asRecord(row.origin);
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "Untitled task"),
    description: asString(row.description),
    status: String(row.status ?? "accepted"),
    priority: asString(row.priority),
    due_date: asString(row.due_date),
    created_at: asString(row.created_at),
    started_at: asString(row.started_at),
    concluded_at: asString(row.concluded_at),
    project: {
      id: asString(project.id),
      name: asString(project.name ?? project.name),
      code: asString(project.code ?? project.code)
    },
    origin: {
      type: asString(origin.type ?? origin.type),
      reference: asString(origin.reference ?? origin.reference),
      id: asString(origin.id)
    },
    requested_by: asPerson(row.requested_by),
    assigned_to: asPerson(row.assigned_to),
    permissions: normalizePermissions(row.permissions)
  };
}

function normalizeGrouped(raw: unknown): TaskGroupedResponse {
  const row = asRecord(raw);
  const mapList = (value: unknown) =>
    Array.isArray(value) ? value.map(normalizeTask).filter((task) => task.id) : [];
  return {
    accepted: mapList(row.accepted),
    in_progress: mapList(row.in_progress),
    blocked: mapList(row.blocked),
    done: mapList(row.done)
  };
}

export const getMyTasks = async (): Promise<TaskGroupedResponse> => {
  const response = await api.get("/tasks");
  return normalizeGrouped(response.data ?? EMPTY_GROUPED);
};

export const countOpenTasks = (
  grouped: TaskGroupedResponse | null | undefined
): number => {
  if (!grouped) return 0;
  return (
    (grouped.accepted?.length ?? 0) +
    (grouped.in_progress?.length ?? 0) +
    (grouped.blocked?.length ?? 0)
  );
};

export const getTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.get(`/tasks/${taskId}`);
  return normalizeTask(response.data);
};

export const getTaskLog = async (taskId: string): Promise<TaskLogEntry[]> => {
  const response = await api.get(`/tasks/${taskId}/log`);
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.map((row) => {
    const item = asRecord(row);
    const actor = asRecord(item.actor);
    return {
      id: String(item.id ?? ""),
      task_id: String(item.task_id ?? taskId),
      type: String(item.type ?? ""),
      message: String(item.message ?? ""),
      actor: {
        id: asString(actor.id),
        name: asString(actor.name)
      },
      created_at: asString(item.created_at)
    };
  });
};

export const startTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post(`/tasks/${taskId}/start`);
  return normalizeTask(response.data);
};

export const concludeTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post(`/tasks/${taskId}/conclude`);
  return normalizeTask(response.data);
};

export const blockTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post(`/tasks/${taskId}/block`);
  return normalizeTask(response.data);
};

export const unblockTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post(`/tasks/${taskId}/unblock`);
  return normalizeTask(response.data);
};

export function applyTaskUpdate(
  grouped: TaskGroupedResponse,
  updated: TaskItem
): TaskGroupedResponse {
  const next: TaskGroupedResponse = {
    accepted: [],
    in_progress: [],
    blocked: [],
    done: []
  };
  const all = [
    ...(grouped.accepted ?? []),
    ...(grouped.in_progress ?? []),
    ...(grouped.blocked ?? []),
    ...(grouped.done ?? [])
  ];
  let found = false;
  for (const task of all) {
    const value = task.id === updated.id ? updated : task;
    if (task.id === updated.id) found = true;
    const bucket = value.status;
    if (bucket === "in_progress") next.in_progress.push(value);
    else if (bucket === "blocked") next.blocked.push(value);
    else if (bucket === "done") next.done.push(value);
    else next.accepted.push(value);
  }
  if (!found) {
    if (updated.status === "in_progress") next.in_progress.push(updated);
    else if (updated.status === "blocked") next.blocked.push(updated);
    else if (updated.status === "done") next.done.push(updated);
    else next.accepted.push(updated);
  }
  return next;
}
