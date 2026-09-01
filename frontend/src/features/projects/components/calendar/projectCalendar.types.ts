export type ProjectCalendarPerson = {
  id: string;
  name?: string | null;
  avatar_file_id?: string | null;
};

export type ProjectCalendarOnsiteLead = ProjectCalendarPerson & {
  division_label?: string | null;
};

export type ProjectCalendarShift = {
  id: string;
  worker_id?: string;
  worker_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type ProjectCalendarAppearance = 'in_range' | 'shift_only' | 'both' | 'scheduled';

export type ProjectCalendarDayEntry = {
  project_id: string;
  code?: string | null;
  name: string;
  status_label?: string | null;
  client_display_name?: string | null;
  appearance: ProjectCalendarAppearance;
  estimators: ProjectCalendarPerson[];
  project_admin?: ProjectCalendarPerson | null;
  onsite_leads: ProjectCalendarOnsiteLead[];
  shifts: ProjectCalendarShift[];
  shift_count: number;
  workers_visible: boolean;
};

export type ProjectCalendarResponse = {
  days: Record<string, ProjectCalendarDayEntry[]>;
  meta: {
    start: string;
    end: string;
    project_count: number;
    days_with_activity: number;
  };
};
