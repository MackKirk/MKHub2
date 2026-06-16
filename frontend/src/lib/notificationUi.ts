import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  HardHat,
  Megaphone,
  MessageSquare,
} from 'lucide-react';

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string;
  metadata?: unknown;
}

export const NOTIFICATION_ICON: Record<string, { Icon: LucideIcon; className: string }> = {
  shift: { Icon: HardHat, className: 'bg-orange-100 text-orange-700' },
  task: { Icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700' },
  message: { Icon: MessageSquare, className: 'bg-blue-100 text-blue-700' },
  attendance: { Icon: Clock, className: 'bg-amber-100 text-amber-700' },
  community_post: { Icon: Megaphone, className: 'bg-indigo-100 text-indigo-700' },
  community_mention: { Icon: Megaphone, className: 'bg-indigo-100 text-indigo-700' },
  community_comment_reply: { Icon: Megaphone, className: 'bg-indigo-100 text-indigo-700' },
  community_urgent: { Icon: AlertTriangle, className: 'bg-red-100 text-red-700' },
  community_required: { Icon: ClipboardList, className: 'bg-purple-100 text-purple-700' },
};

export function getNotificationIconMeta(type: string) {
  return NOTIFICATION_ICON[type] ?? { Icon: Bell, className: 'bg-gray-100 text-gray-600' };
}

export function formatNotificationTimeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function formatNotificationDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function groupNotificationsByDate(notifications: NotificationRecord[]) {
  return notifications.reduce<Record<string, NotificationRecord[]>>((acc, notif) => {
    const dateKey = new Date(notif.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(notif);
    return acc;
  }, {});
}

export function resolveNotificationLink(notif: NotificationRecord) {
  if (!notif.link) return undefined;
  return notif.type === 'shift' ? '/schedule' : notif.link;
}
