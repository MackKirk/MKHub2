import { api } from "./api";
import type {
  HubUserListItem,
  HubUserProfileResponse,
  HubUsersListResponse,
  HubUsersTabCounts
} from "../types/users";

export interface ListUsersParams {
  q?: string;
  page?: number;
  limit?: number;
  status?: "active" | "inactive";
  is_admin?: boolean;
}

export async function listUsers(
  params: ListUsersParams = {}
): Promise<HubUsersListResponse> {
  const response = await api.get<HubUsersListResponse>("/users", {
    params: {
      q: params.q?.trim() || undefined,
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      status: params.status,
      is_admin: params.is_admin ? "1" : undefined
    }
  });
  return response.data;
}

export async function getUsersTabCounts(q?: string): Promise<HubUsersTabCounts> {
  const response = await api.get<HubUsersTabCounts>("/users/tab-counts", {
    params: { q: q?.trim() || undefined }
  });
  return response.data;
}

export async function getUserProfile(
  userId: string
): Promise<HubUserProfileResponse> {
  const response = await api.get<HubUserProfileResponse>(
    `/auth/users/${userId}/profile`
  );
  return response.data;
}

export async function getUser(userId: string): Promise<HubUserListItem> {
  const response = await api.get<HubUserListItem>(`/users/${userId}`);
  return response.data;
}

export async function patchUser(
  userId: string,
  payload: { roles?: string[]; is_active?: boolean }
): Promise<HubUserListItem> {
  const response = await api.patch<HubUserListItem>(`/users/${userId}`, payload);
  return response.data;
}
