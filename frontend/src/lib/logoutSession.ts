import type { QueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router-dom';
import { revokeRefreshOnLogout } from '@/lib/api';

/** Clear tokens, React Query cache, and go to login (same effect as AppShell logout without unsaved prompt). */
export async function logoutSession(queryClient: QueryClient, navigate: NavigateFunction) {
  await revokeRefreshOnLogout();
  queryClient.clear();
  navigate('/login', { replace: true });
}
