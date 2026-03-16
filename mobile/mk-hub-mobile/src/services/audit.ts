import { api } from "./api";
import type { ProjectAuditLogEntry } from "../types/projects";

interface GetProjectAuditLogsOptions {
  section?: string;
  month?: string;
  limit?: number;
  offset?: number;
}

export const getProjectAuditLogs = async (
  projectId: string,
  options: GetProjectAuditLogsOptions = {}
): Promise<ProjectAuditLogEntry[]> => {
  const response = await api.get<ProjectAuditLogEntry[]>(
    `/projects/${projectId}/audit-logs`,
    {
      params: {
        section: options.section,
        month: options.month,
        limit: options.limit,
        offset: options.offset
      }
    }
  );
  return response.data;
};
