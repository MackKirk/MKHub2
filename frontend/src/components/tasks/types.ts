export type TaskStatus = 'accepted' | 'in_progress' | 'blocked' | 'done';

export type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: string;
  due_date?: string | null;
  requested_by?: { id?: string | null; name?: string | null } | null;
  assigned_to?: { id?: string | null; name?: string | null; division?: string | null } | null;
  project?: { id?: string | null; name?: string | null; code?: string | null } | null;
  origin?: { type?: string; reference?: string | null; id?: string | null } | null;
  request?: { id: string; title: string; status: string } | null;
  created_at: string;
  started_at?: string | null;
  started_by?: { id?: string | null; name?: string | null } | null;
  concluded_at?: string | null;
  concluded_by?: { id?: string | null; name?: string | null } | null;
  archived_at?: string | null;
  permissions: {
    can_start: boolean;
    can_conclude: boolean;
    can_block?: boolean;
    can_unblock?: boolean;
    can_archive?: boolean;
  };
};

export type TaskBuckets = {
  accepted: Task[];
  in_progress: Task[];
  blocked?: Task[];
  done: Task[];
};

