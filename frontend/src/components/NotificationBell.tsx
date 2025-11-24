import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch recent notifications (last 4 unread or recent)
  const { data: notifications, refetch } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: async () => {
      try {
        const data = await api<Notification[]>('GET', '/notifications?limit=4&unread_only=false');
        return data || [];
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
        return [];
      }
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch unread count
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      try {
        const data = await api<{ count: number }>('GET', '/notifications/unread-count');
        return data?.count || 0;
      } catch (e) {
        return 0;
      }
    },
    refetchInterval: 30000,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAsRead = async (notificationId: string) => {
    try {
      await api('POST', `/notifications/${notificationId}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      refetch();
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-700 transition-colors"
        title="Notifications"
      >
        <svg
          className="w-5 h-5 text-white"
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
        {unreadCount && unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border bg-white shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              {unreadCount && unreadCount > 0 && (
                <span className="text-xs text-gray-500">{unreadCount} unread</span>
              )}
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications && notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 hover:bg-gray-50 transition-colors cursor-pointer ${
                      !notif.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => {
                      if (!notif.read) {
                        markAsRead(notif.id);
                      }
                      setIsOpen(false);
                      // Navigate to link if available
                      if (notif.link) {
                        navigate(notif.link);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-xl flex-shrink-0">
                        {getNotificationIcon(notif.type || 'default')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 line-clamp-1">
                            {notif.title || 'Notification'}
                          </p>
                          {!notif.read && (
                            <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {notif.message || ''}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTimeAgo(notif.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-2 text-gray-300"
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
                <p className="text-sm">No notifications</p>
              </div>
            )}
          </div>

          <div className="p-3 border-t bg-gray-50">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="block w-full text-center px-4 py-2 rounded-lg bg-brand-red hover:bg-red-700 text-white text-sm font-medium transition-colors"
            >
              Show All Notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

