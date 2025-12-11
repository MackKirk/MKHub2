export interface TaskProjectInfo {
  id: string | null;
  name: string | null;
  code: string | null;
}

export interface TaskPermissions {
  can_start: boolean;
  can_conclude: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: "accepted" | "in_progress" | "done" | string;
  priority: string | null;
  due_date: string | null;
  project: TaskProjectInfo;
  origin: {
    type: string | null;
    reference: string | null;
    id: string | null;
  };
  permissions: TaskPermissions;
}

export interface TaskGroupedResponse {
  accepted: TaskItem[];
  in_progress: TaskItem[];
  done: TaskItem[];
  [key: string]: TaskItem[];
}


