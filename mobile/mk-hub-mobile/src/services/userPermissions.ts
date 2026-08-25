import { api } from "./api";
import type {
  HubPermissionTemplate,
  HubUserPermissionsResponse
} from "../types/users";

export async function getUserPermissions(
  userId: string
): Promise<HubUserPermissionsResponse> {
  const response = await api.get<HubUserPermissionsResponse>(
    `/permissions/users/${userId}`
  );
  return response.data;
}

export async function updateUserPermissions(
  userId: string,
  permissions: Record<string, boolean>
): Promise<void> {
  await api.put(`/permissions/users/${userId}`, permissions);
}

export async function listPermissionTemplates(): Promise<HubPermissionTemplate[]> {
  const response = await api.get<HubPermissionTemplate[]>("/permissions/templates");
  return response.data;
}
