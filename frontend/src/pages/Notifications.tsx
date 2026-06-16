import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatNotificationDateTime,
  formatNotificationTimeAgo,
  getNotificationIconMeta,
  groupNotificationsByDate,
  resolveNotificationLink,
  type NotificationRecord,
} from '@/lib/notificationUi';
import {
  AppButton,
  AppCard,
  AppCheckboxControl,
  AppEmptyState,
  AppListRowIconButton,
  AppPageHeader,
  AppQuickFilterRow,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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
        const data = await api<NotificationRecord[]>('GET', `/notifications${params}`);
        return data || [];
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
        return [];
      }
    },
  });

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      try {
        const data = await api<{ count: number }>('GET', '/notifications/unread-count');
        return data?.count || 0;
      } catch {
        return 0;
      }
    },
  });

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api('POST', `/notifications/${notificationId}/read`);
      invalidateNotifications();
      refetch();
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api('POST', '/notifications/mark-all-read');
      invalidateNotifications();
      refetch();
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    }
  };

  const cleanupEmpty = async () => {
    try {
      await api('DELETE', '/notifications/cleanup-empty');
      invalidateNotifications();
      refetch();
    } catch (e) {
      console.error('Failed to cleanup empty notifications:', e);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await api('DELETE', `/notifications/${notificationId}`);
      invalidateNotifications();
      refetch();
      setSelectedNotifications((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
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
      invalidateNotifications();
      setSelectedNotifications(new Set());
      refetch();
    } catch (e) {
      console.error('Failed to delete selected notifications:', e);
    }
  };

  const toggleSelection = (notificationId: string) => {
    setSelectedNotifications((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) next.delete(notificationId);
      else next.add(notificationId);
      return next;
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

  const handleNotificationClick = (notif: NotificationRecord) => {
    const targetLink = resolveNotificationLink(notif);
    if (!targetLink) return;
    navigate(targetLink);
    if (!notif.read) {
      void markAsRead(notif.id);
    }
  };

  const groupedNotifications = useMemo(
    () => groupNotificationsByDate(notifications ?? []),
    [notifications],
  );

  const hasNotifications = Boolean(notifications && notifications.length > 0);
  const selectionActive = selectedNotifications.size > 0;

  const filterSegments = [
    {
      key: 'all',
      label: 'All',
      active: filter === 'all',
      onClick: () => setFilter('all'),
    },
    {
      key: 'unread',
      label: 'Unread',
      active: filter === 'unread',
      count: unreadCount > 0 ? unreadCount : undefined,
      onClick: () => setFilter('unread'),
    },
  ];

  return (
    <div className={uiCx('min-h-full w-full min-w-0 overflow-x-hidden bg-gray-50', uiSpacing.pageStack)}>
      <AppPageHeader
        title="Notifications"
        subtitle="Stay updated with your latest activities"
        icon={<Bell className="h-4 w-4" aria-hidden />}
      />

      <AppCard className={uiShadows.card} bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'justify-between gap-3')}>
          <div className={uiLayout.actionsRow}>
            {hasNotifications && !selectionActive ? (
              <AppButton type="button" variant="secondary" size="sm" onClick={selectAll}>
                Select all
              </AppButton>
            ) : null}
          </div>
          <div className={uiLayout.actionsRow}>
            {selectionActive ? (
              <>
                <AppButton type="button" variant="danger" size="sm" onClick={deleteSelected}>
                  Delete selected ({selectedNotifications.size})
                </AppButton>
                <AppButton type="button" variant="ghost" size="sm" onClick={deselectAll}>
                  Deselect all
                </AppButton>
              </>
            ) : (
              <>
                {unreadCount > 0 ? (
                  <AppButton type="button" variant="secondary" size="sm" onClick={markAllAsRead}>
                    Mark all as read
                  </AppButton>
                ) : null}
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cleanupEmpty}
                  title="Delete empty/old notifications"
                >
                  Cleanup empty
                </AppButton>
              </>
            )}
          </div>
        </div>

        <AppQuickFilterRow segments={filterSegments} label="Show:" />

        {isLoading ? (
          <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={uiCx('h-24 animate-pulse bg-gray-100', uiRadius.card, uiBorders.subtle)}
              />
            ))}
          </div>
        ) : hasNotifications ? (
          <div className={uiCx('mt-4', uiSpacing.sectionStack)}>
            {Object.entries(groupedNotifications).map(([dateKey, notifs]) => (
              <section key={dateKey}>
                <h2
                  className={uiCx(
                    uiTypography.overline,
                    'sticky top-0 z-[1] mb-2 bg-white py-2',
                  )}
                >
                  {dateKey}
                </h2>
                <div className={uiSpacing.sectionStack}>
                  {notifs.map((notif) => {
                    const { Icon, className } = getNotificationIconMeta(notif.type || 'default');
                    const targetLink = resolveNotificationLink(notif);
                    const isSelected = selectedNotifications.has(notif.id);

                    return (
                      <div
                        key={notif.id}
                        className={uiCx(
                          uiRadius.card,
                          uiBorders.subtle,
                          'bg-white p-4 transition-colors hover:bg-gray-50/80',
                          !notif.read && 'border-brand-red/25 bg-brand-red/[0.03]',
                          isSelected && 'ring-2 ring-brand-red/40',
                          targetLink && 'cursor-pointer',
                        )}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button') || target.closest('label')) return;
                          handleNotificationClick(notif);
                        }}
                        onKeyDown={
                          targetLink
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleNotificationClick(notif);
                                }
                              }
                            : undefined
                        }
                        role={targetLink ? 'button' : undefined}
                        tabIndex={targetLink ? 0 : undefined}
                      >
                        <div className="flex items-start gap-3">
                          <AppCheckboxControl
                            checked={isSelected}
                            aria-label={`Select ${notif.title || 'notification'}`}
                            onChange={() => toggleSelection(notif.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1"
                          />
                          <div
                            className={uiCx(
                              'flex h-10 w-10 shrink-0 items-center justify-center',
                              uiRadius.control,
                              className,
                            )}
                          >
                            <Icon className="h-5 w-5" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h3
                                    className={uiCx(
                                      uiTypography.sectionTitle,
                                      targetLink && 'group-hover:text-brand-red',
                                    )}
                                  >
                                    {notif.title || 'Notification'}
                                  </h3>
                                  {!notif.read ? (
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full bg-brand-red"
                                      aria-label="Unread"
                                    />
                                  ) : null}
                                </div>
                                {notif.message ? (
                                  <p className={uiCx('mt-1', uiTypography.body)}>{notif.message}</p>
                                ) : null}
                                <div
                                  className={uiCx(
                                    'mt-2 flex flex-wrap items-center gap-x-2 gap-y-1',
                                    uiTypography.helper,
                                  )}
                                >
                                  <span>{formatNotificationTimeAgo(notif.created_at)}</span>
                                  <span aria-hidden>•</span>
                                  <span>{formatNotificationDateTime(notif.created_at)}</span>
                                  {targetLink ? (
                                    <>
                                      <span aria-hidden>•</span>
                                      <span className="font-medium text-brand-red">Click to view</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                              <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
                                {!notif.read ? (
                                  <AppButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void markAsRead(notif.id);
                                    }}
                                  >
                                    Mark as read
                                  </AppButton>
                                ) : null}
                                <AppListRowIconButton
                                  preset="delete"
                                  label="Delete notification"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteNotification(notif.id);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <AppEmptyState
            className="mt-4 border-0 bg-transparent p-0 shadow-none"
            icon={<Bell className="h-5 w-5" aria-hidden />}
            title="No notifications"
            description={
              filter === 'unread'
                ? "You're all caught up! No unread notifications."
                : "You don't have any notifications yet."
            }
          />
        )}
      </AppCard>
    </div>
  );
}
