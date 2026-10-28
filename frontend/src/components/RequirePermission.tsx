import { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { evaluatePermission } from '@/lib/permissionAccess';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import { matchRoutePermission } from '@/lib/routePermissions';
import NoAccessState from '@/components/NoAccessState';
import { AppCard, AppEmptyState, uiCx, uiSpacing } from '@/components/ui';

/**
 * Area-level route gate: same permission criteria as the nav menu.
 * Denies without mounting children (avoids unauthorized fetches).
 * Paths with no registry match are auth-only and always allowed.
 */
export default function RequirePermission({ children }: PropsWithChildren) {
  const location = useLocation();
  const requiredPermission = matchRoutePermission(location.pathname);

  const { data: me, isLoading: meLoading, isFetched: meFetched } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ roles?: string[]; permissions?: string[] }>('GET', '/auth/me'),
  });

  const needsSettingsPerms = requiredPermission === 'settings:access';
  const { data: settingsPerms, isLoading: settingsLoading } = useQuery({
    queryKey: ['me-settings-permissions'],
    queryFn: () => api<{ can_access_settings?: boolean }>('GET', '/auth/me/settings-permissions'),
    enabled: needsSettingsPerms && !!me,
  });

  if (!requiredPermission) {
    return <>{children}</>;
  }

  if (meLoading || !meFetched || (needsSettingsPerms && settingsLoading && !settingsPerms)) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppCard>
          <AppEmptyState title="Loading…" description="Checking your permissions." />
        </AppCard>
      </div>
    );
  }

  const isAdmin = isAdminRole(me?.roles);
  const permissionsSet = new Set((me?.permissions || []).map((p) => String(p)));
  const allowed = evaluatePermission(requiredPermission, permissionsSet, isAdmin, {
    canAccessSettings:
      settingsPerms != null ? !!settingsPerms.can_access_settings : undefined,
  });

  if (!allowed) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppCard>
          <NoAccessState />
        </AppCard>
      </div>
    );
  }

  return <>{children}</>;
}
