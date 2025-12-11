import { api } from "./api";

export interface ProjectReport {
  id: string;
  project_id: string;
  title?: string;
  category_id?: string;
  description?: string;
  images?: any;
  status?: string;
  created_at?: string;
}

// GET /projects/{project_id}/reports
export const getProjectReports = async (projectId: string): Promise<ProjectReport[]> => {
  const response = await api.get<ProjectReport[]>(`/projects/${projectId}/reports`);
  return response.data;
};

// POST /projects/{project_id}/reports
export interface CreateReportPayload {
  title: string;
  category_id?: string;
  description: string;
  images?: {
    attachments: Array<{
      file_object_id: string;
      original_name: string;
      content_type: string;
    }>;
  };
}

export const createProjectReport = async (
  projectId: string,
  payload: CreateReportPayload
): Promise<{ id: string }> => {
  const response = await api.post<{ id: string }>(`/projects/${projectId}/reports`, payload);
  return response.data;
};

