import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string;
  metadata?: any;
}

export default function Notifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ['notifications-all', filter],
    queryFn: async () => {
      try {
        const params = filter === 'unread' ? '?unread_only=true' : '';
        const data = await api<Notification[]>('GET', `/notifications${params}`);
        return data || [];
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
        return [];
      }
    },
  });

  const markAsRead = async (notificationId: string) => {
    try {
      await api('POST', `/notifications/${notificationId}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api('POST', '/notifications/mark-all-read');
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  const cleanupEmpty = async () => {
    try {
      await api('DELETE', '/notifications/cleanup-empty');
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    } catch (e) {
      console.error('Failed to cleanup empty notifications:', e);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await api('DELETE', `/notifications/${notificationId}`);
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
      // Remove from selection if it was selected
      setSelectedNotifications((prev) => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    } catch (e) {
      console.error('Failed to delete notification:', e);
    }
  };

  const deleteSelected = async () => {
    if (selectedNotifications.size === 0) return;
    
    try {
      const ids = Array.from(selectedNotifications);
      await api('POST', '/notifications/delete-multiple', { notification_ids: ids });
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      setSelectedNotifications(new Set());
      refetch();
    } catch (e) {
      console.error('Failed to delete selected notifications:', e);
    }
  };

  const toggleSelection = (notificationId: string) => {
    setSelectedNotifications((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(notificationId)) {
        newSet.delete(notificationId);
      } else {
        newSet.add(notificationId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (notifications) {
      setSelectedNotifications(new Set(notifications.map((n) => n.id)));
    }
  };

  const deselectAll = () => {
    setSelectedNotifications(new Set());
  };

  const handleNotificationClick = (notif: Notification) => {
    if (notif.link) {
      navigate(notif.link);
      // Mark as read when clicked
      if (!notif.read) {
        markAsRead(notif.id);
      }
    }
  };

  const formatTimeAgo = (dateStr: string) => {
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
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'shift':
        return '👷';
      case 'task':
        return '✅';
      case 'message':
        return '💬';
      case 'attendance':
        return '⏰';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'shift':
        return 'bg-purple-100 text-purple-700';
      case 'task':
        return 'bg-blue-100 text-blue-700';
      case 'message':
        return 'bg-green-100 text-green-700';
      case 'attendance':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Group notifications by date
  const groupedNotifications = notifications?.reduce((acc, notif) => {
    const date = new Date(notif.created_at);
    const dateKey = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(notif);
    return acc;
  }, {} as Record<string, Notification[]>) || {};

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Notifications</h1>
        <p className="text-sm text-gray-600">Stay updated with your latest activities</p>
      </div>

      {/* Filters and Actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'unread'
                ? 'bg-brand-red text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unread {unreadCount > 0 && `(${unreadCount})`}
          </button>
          {selectedNotifications.size === 0 && notifications && notifications.length > 0 && (
            <button
              onClick={selectAll}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
            >
              Select All
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedNotifications.size > 0 && (
            <>
              <button
                onClick={deleteSelected}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
              >
                Delete Selected ({selectedNotifications.size})
              </button>
              <button
                onClick={deselectAll}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
              >
                Deselect All
              </button>
            </>
          )}
          {selectedNotifications.size === 0 && (
            <>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors"
                >
                  Mark All as Read
                </button>
              )}
              <button
                onClick={cleanupEmpty}
                className="px-4 py-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium transition-colors"
                title="Delete empty/old notifications"
              >
                Cleanup Empty
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-white p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : notifications && notifications.length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedNotifications).map(([dateKey, notifs]) => (
            <div key={dateKey}>
              <h2 className="text-sm font-semibold text-gray-500 mb-3 sticky top-0 bg-gray-50 py-2">
                {dateKey}
              </h2>
              <div className="space-y-2">
                {notifs.map((notif) => (
                  <div
                    key={notif.id}
                    className={`rounded-xl border bg-white p-4 hover:shadow-md transition-all ${
                      !notif.read ? 'border-blue-300 bg-blue-50' : ''
                    } ${selectedNotifications.has(notif.id) ? 'ring-2 ring-brand-red border-brand-red' : ''} ${
                      notif.link ? 'cursor-pointer' : ''
                    }`}
                    onClick={(e) => {
                      // Don't navigate if clicking on checkbox or buttons
                      const target = e.target as HTMLElement;
                      if (target.closest('input[type="checkbox"]') || target.closest('button')) {
                        return;
                      }
                      handleNotificationClick(notif);
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={selectedNotifications.has(notif.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelection(notif.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 w-4 h-4 text-brand-red border-gray-300 rounded focus:ring-brand-red cursor-pointer"
                      />
                      <div
                        className={`w-12 h-12 rounded-lg ${getNotificationColor(
                          notif.type || 'default'
                        )} flex items-center justify-center text-2xl flex-shrink-0`}
                      >
                        {getNotificationIcon(notif.type || 'default')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className={`font-semibold text-gray-900 ${notif.link ? 'hover:text-brand-red transition-colors' : ''}`}>
                                {notif.title || 'Notification'}
                              </h3>
                              {!notif.read && (
                                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{notif.message || ''}</p>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              <span>{formatTimeAgo(notif.created_at)}</span>
                              <span>•</span>
                              <span>{formatDate(notif.created_at)}</span>
                              {notif.link && (
                                <>
                                  <span>•</span>
                                  <span className="text-brand-red">Click to view</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {!notif.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notif.id);
                                }}
                                className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors"
                                title="Mark as read"
                              >
                                Mark as read
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notif.id);
                              }}
                              className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                              title="Delete notification"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications</h3>
          <p className="text-sm text-gray-600">
            {filter === 'unread'
              ? "You're all caught up! No unread notifications."
              : "You don't have any notifications yet."}
          </p>
        </div>
      )}
    </div>
  );
}

