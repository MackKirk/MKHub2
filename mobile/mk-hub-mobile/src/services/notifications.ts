import { api } from "./api";
import type { InboxNotification } from "../types/inbox";

export async function registerDeviceToken(
  token: string,
  platform: "ios" | "android"
): Promise<void> {
  await api.post("/notifications/device-token", { token, platform });
}

export async function unregisterDeviceToken(token: string): Promise<void> {
  await api.delete("/notifications/device-token", { params: { token } });
}

export async function listNotifications(opts?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<InboxNotification[]> {
  const params: Record<string, string | number | boolean> = {
    limit: opts?.limit ?? 40
  };
  if (opts?.unreadOnly) params.unread_only = true;
  const response = await api.get<InboxNotification[]>("/notifications", { params });
  return Array.isArray(response.data) ? response.data : [];
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const response = await api.get<{ count: number }>("/notifications/unread-count");
    return Number(response.data?.count) || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/mark-all-read");
}
