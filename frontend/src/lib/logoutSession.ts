import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';

/** Clear token, React Query cache, and go to login (same effect as AppShell logout without unsaved prompt). */
export function logoutSession(queryClient: QueryClient, navigate: NavigateFunction) {
  localStorage.removeItem('user_token');
  queryClient.clear();
  navigate('/login', { replace: true });
}
