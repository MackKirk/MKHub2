export interface TaskProjectInfo {
  id: string | null;
  name: string | null;
  code: string | null;
}

export interface TaskPermissions {
  can_start: boolean;
  can_conclude: boolean;
  can_block?: boolean;
  can_unblock?: boolean;
}

export interface TaskPersonInfo {
  id: string | null;
  name: string | null;
  division?: string | null;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: "accepted" | "in_progress" | "blocked" | "done" | string;
  priority: string | null;
  due_date: string | null;
  created_at?: string | null;
  started_at?: string | null;
  concluded_at?: string | null;
  project: TaskProjectInfo;
  origin: {
    type: string | null;
    reference: string | null;
    id: string | null;
  };
  requested_by?: TaskPersonInfo | null;
  assigned_to?: TaskPersonInfo | null;
  permissions: TaskPermissions;
}

export interface TaskLogEntry {
  id: string;
  task_id: string;
  type: string;
  message: string;
  actor?: { id?: string | null; name?: string | null } | null;
  created_at?: string | null;
}

export interface TaskGroupedResponse {
  accepted: TaskItem[];
  in_progress: TaskItem[];
  blocked: TaskItem[];
  done: TaskItem[];
}
