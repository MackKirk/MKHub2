export type ProjectCalendarPerson = {
  id: string;
  name?: string | null;
  avatar_file_id?: string | null;
};

export type ProjectCalendarOnsiteLead = ProjectCalendarPerson & {
  division_label?: string | null;
};

export type ProjectCalendarDivision = {
  id: string;
  label: string;
  color?: string | null;
};

export type ProjectCalendarShift = {
  id: string;
  worker_id?: string;
  worker_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  crew_group_id?: string | null;
  crew_role?: string | null;
  ack_status?: string | null;
  job_name?: string | null;
};

export type ProjectCalendarAppearance = 'in_range' | 'shift_only' | 'both' | 'scheduled';

export type ProjectCalendarDayEntry = {
  project_id: string;
  code?: string | null;
  name: string;
  status_label?: string | null;
  /** Hex from Settings project_statuses.value (or meta.color). */
  status_color?: string | null;
  client_display_name?: string | null;
  address?: string | null;
  appearance: ProjectCalendarAppearance;
  divisions: ProjectCalendarDivision[];
  primary_division?: ProjectCalendarDivision | null;
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
