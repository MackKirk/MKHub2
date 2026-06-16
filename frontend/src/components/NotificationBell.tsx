import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatNotificationTimeAgo,
  getNotificationIconMeta,
  resolveNotificationLink,
  type NotificationRecord,
} from '@/lib/notificationUi';
import {
  AppBadge,
  AppButton,
  AppEmptyState,
  comboboxMenuStyle,
  uiBorders,
  uiCx,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
  useComboboxDropdown,
} from '@/components/ui';

const PANEL_OPTIONS = {
  menuWidth: 320,
  menuAlign: 'end' as const,
  preferredMaxHeight: 384,
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { anchorRef, portalListId, menuRect, closeDropdown } = useComboboxDropdown(isOpen, setIsOpen, PANEL_OPTIONS);

  const { data: notifications, refetch } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: async () => {
      try {
        const data = await api<NotificationRecord[]>('GET', '/notifications?limit=4&unread_only=false');
        return data || [];
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      try {
        const data = await api<{ count: number }>('GET', '/notifications/unread-count');
        return data?.count || 0;
      } catch {
        return 0;
      }
    },
    refetchInterval: 30000,
  });

  const unread = unreadCount ?? 0;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDropdown();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeDropdown]);

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

  const handleNotificationClick = (notif: NotificationRecord) => {
    if (!notif.read) {
      void markAsRead(notif.id);
    }
    closeDropdown();
    const targetLink = resolveNotificationLink(notif);
    if (targetLink) navigate(targetLink);
  };

  const panelShellClass = useMemo(
    () =>
      uiCx(
        'fixed z-[100050] flex flex-col overflow-hidden bg-white',
        uiRadius.dropdownMenu,
        uiBorders.subtle,
        uiShadows.elevated,
      ),
    [],
  );

  const panel =
    isOpen && menuRect ? (
      <div
        id={portalListId}
        role="dialog"
        aria-label="Notifications"
        className={panelShellClass}
        style={comboboxMenuStyle(menuRect)}
      >
        <div className={uiCx('shrink-0 border-b border-gray-100', uiSpacing.cardPadding)}>
          <div className="flex items-center justify-between gap-2">
            <h3 className={uiTypography.sectionTitle}>Notifications</h3>
            {unread > 0 ? <AppBadge variant="info">{unread} unread</AppBadge> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {notifications && notifications.length > 0 ? (
            <ul className="divide-y divide-gray-100">
              {notifications.map((notif) => {
                const { Icon, className } = getNotificationIconMeta(notif.type || 'default');
                return (
                  <li key={notif.id}>
                    <button
                      type="button"
                      className={uiCx(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                        !notif.read && 'bg-brand-red/[0.04]',
                      )}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div
                        className={uiCx(
                          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center',
                          uiRadius.control,
                          className,
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={uiCx('line-clamp-1', uiTypography.sectionTitle)}>
                            {notif.title || 'Notification'}
                          </p>
                          {!notif.read ? (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-red"
                              aria-label="Unread"
                            />
                          ) : null}
                        </div>
                        {notif.message ? (
                          <p className={uiCx('mt-1 line-clamp-2', uiTypography.helper)}>{notif.message}</p>
                        ) : null}
                        <p className={uiCx('mt-1', uiTypography.overline)}>
                          {formatNotificationTimeAgo(notif.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <AppEmptyState
              className="m-3 border-0 bg-transparent shadow-none"
              icon={<Bell className="h-5 w-5" aria-hidden />}
              title="No notifications"
            />
          )}
        </div>

        <div className={uiCx('shrink-0 border-t border-gray-100', uiSpacing.compactCardPadding)}>
          <AppButton
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => {
              closeDropdown();
              navigate('/notifications');
            }}
          >
            Show all notifications
          </AppButton>
        </div>
      </div>
    ) : null;

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/45 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        title="Notifications"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? portalListId : undefined}
      >
        <Bell className="h-5 w-5 text-white" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-brand-red px-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-gray-900/90">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
