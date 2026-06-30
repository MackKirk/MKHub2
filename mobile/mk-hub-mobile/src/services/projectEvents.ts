import { api } from "./api";

export interface ProjectEvent {
  id: string;
  name: string;
  location?: string;
  start_datetime: string;
  end_datetime: string;
  notes?: string;
  is_all_day?: boolean;
  timezone?: string;
  repeat_type?: string;
  repeat_config?: Record<string, unknown>;
  repeat_until?: string;
  repeat_count?: number;
  exceptions?: string[];
  extra_dates?: string[];
}

export async function getProjectEvents(
  projectId: string
): Promise<ProjectEvent[]> {
  const response = await api.get<ProjectEvent[]>(
    `/projects/${projectId}/events`
  );
  return response.data;
}
