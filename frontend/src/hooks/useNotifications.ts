import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CreateNotificationParams {
  user_id: string;
  title: string;
  message: string;
  type?: 'shift' | 'task' | 'message' | 'attendance' | 'default';
  link?: string;
  metadata?: any;
}

/**
 * Hook to create notifications programmatically from anywhere in the app.
 * 
 * @example
 * ```tsx
 * const { createNotification } = useNotifications();
 * 
 * await createNotification({
 *   user_id: 'user-123',
 *   title: 'New Shift Assigned',
 *   message: 'You have been assigned to work on Project X',
 *   type: 'shift',
 *   link: '/projects/123?tab=dispatch'
 * });
 * ```
 */
export function useNotifications() {
  const queryClient = useQueryClient();

  const createNotification = async (params: CreateNotificationParams) => {
    try {
      await api('POST', '/notifications', {
        user_id: params.user_id,
        title: params.title,
        message: params.message,
        type: params.type || 'default',
        link: params.link,
        metadata: params.metadata,
      });

      // Invalidate notification queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to create notification:', error);
      return { success: false, error: error.message || 'Failed to create notification' };
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api('POST', `/notifications/${notificationId}/read`);
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-all'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      return { success: true };
    } catch (error: any) {
      console.error('Failed to mark notification as read:', error);
      return { success: false, error: error.message || 'Failed to mark as read' };
    }
  };

  return {
    createNotification,
    markAsRead,
  };
}

