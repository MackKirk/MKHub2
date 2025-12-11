import { api } from "./api";
import type { TaskGroupedResponse, TaskItem } from "../types/tasks";

// Tasks API:
// - GET /tasks -> grouped by status (accepted, in_progress, done)
// - GET /tasks/{task_id}
// - POST /tasks/{task_id}/start
// - POST /tasks/{task_id}/conclude

export const getMyTasks = async (): Promise<TaskGroupedResponse> => {
  const response = await api.get<TaskGroupedResponse>("/tasks");
  return response.data;
};

export const getTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.get<TaskItem>(`/tasks/${taskId}`);
  return response.data;
};

export const startTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post<TaskItem>(`/tasks/${taskId}/start`);
  return response.data;
};

export const concludeTask = async (taskId: string): Promise<TaskItem> => {
  const response = await api.post<TaskItem>(`/tasks/${taskId}/conclude`);
  return response.data;
};


