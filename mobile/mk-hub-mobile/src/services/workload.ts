import { api } from "./api";

export interface TimesheetEntry {
  id: string;
  project_id: string;
  user_id: string;
  user_name?: string;
  work_date?: string;
  start_time?: string;
  end_time?: string;
  minutes?: number;
  notes?: string;
  is_approved?: boolean;
}

// GET /projects/{project_id}/timesheet
export const getProjectTimesheet = async (
  projectId: string,
  month?: string
): Promise<TimesheetEntry[]> => {
  const params: Record<string, any> = {};
  if (month) {
    params.month = month;
  }
  
  const response = await api.get<TimesheetEntry[]>(`/projects/${projectId}/timesheet`, {
    params
  });
  return response.data;
};

