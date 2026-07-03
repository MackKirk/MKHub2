import { api } from "./api";

export interface ReportAttachment {
  file_object_id: string;
  original_name?: string;
  content_type?: string;
}

export interface ProjectReport {
  id: string;
  project_id?: string;
  title?: string;
  category_id?: string;
  description?: string;
  images?: { attachments?: ReportAttachment[] } | null;
  status?: string;
  created_at?: string;
  created_by?: string;
  financial_value?: number;
  financial_type?: string;
  approval_status?: string;
}

export interface ReportCategoryPermissions {
  read_categories: string[] | null;
  write_categories: string[] | null;
}

export const getProjectReports = async (
  projectId: string
): Promise<ProjectReport[]> => {
  const response = await api.get<ProjectReport[]>(
    `/projects/${projectId}/reports`
  );
  return response.data;
};

export interface CreateReportPayload {
  title: string;
  category_id?: string | null;
  description: string;
  images?: {
    attachments: ReportAttachment[];
  };
  financial_value?: number;
  financial_type?: string;
}

export const createProjectReport = async (
  projectId: string,
  payload: CreateReportPayload
): Promise<{ id: string }> => {
  const response = await api.post<{ id: string }>(
    `/projects/${projectId}/reports`,
    payload
  );
  return response.data;
};

export const deleteProjectReport = async (
  projectId: string,
  reportId: string
): Promise<void> => {
  await api.delete(`/projects/${projectId}/reports/${reportId}`);
};

export const getReportCategoryPermissions = async (
  businessLine: string
): Promise<ReportCategoryPermissions> => {
  const response = await api.get<ReportCategoryPermissions>(
    "/auth/me/project-reports-category-permissions",
    { params: { business_line: businessLine } }
  );
  return response.data;
};

export async function uploadReportAttachment(
  projectId: string,
  file: { uri: string; name: string; type: string }
): Promise<ReportAttachment> {
  const form = new FormData();
  form.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.type
  } as unknown as Blob);
  form.append("original_name", file.name);
  form.append("content_type", file.type);
  form.append("project_id", projectId);
  form.append("client_id", "");
  form.append("employee_id", "");
  form.append("category_id", "project-report");

  const uploadResp = await api.post<{ id: string }>(
    "/files/upload-proxy",
    form,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  return {
    file_object_id: uploadResp.data.id,
    original_name: file.name,
    content_type: file.type
  };
}
