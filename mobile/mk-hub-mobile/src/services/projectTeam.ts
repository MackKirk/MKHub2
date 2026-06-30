import { api } from "./api";

export interface ProjectMember {
  id: string;
  user_id: string;
  name?: string;
  username?: string;
  member_role?: string;
  is_creator?: boolean;
}

export interface ProjectShift {
  id: string;
  worker_id?: string | null;
}

export async function getProjectMembers(
  projectId: string
): Promise<ProjectMember[]> {
  const response = await api.get<ProjectMember[]>(
    `/projects/${projectId}/members`
  );
  return response.data;
}

export async function getProjectShifts(
  projectId: string
): Promise<ProjectShift[]> {
  const response = await api.get<ProjectShift[]>(
    `/dispatch/projects/${projectId}/shifts`
  );
  return response.data;
}

export function extractScheduledWorkerIds(shifts: ProjectShift[]): string[] {
  const ids = new Set<string>();
  for (const shift of shifts) {
    if (shift.worker_id) ids.add(String(shift.worker_id));
  }
  return Array.from(ids);
}
