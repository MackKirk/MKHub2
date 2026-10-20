import { CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import { uiCx, uiRadius } from '@/components/ui';
import { canAccessTutorial, getTutorial, tutorialPath } from './registry';
import type { TutorialId } from './types';

type ViewTutorialLinkProps = {
  tutorialId: TutorialId;
  className?: string;
};

function useMePermissions() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const permissions = new Set<string>(Array.isArray(me?.permissions) ? me.permissions.map(String) : []);
  const isAdmin = isAdminRole(me?.roles);
  return { permissions, isAdmin, ready: me != null };
}

/** Ghost link to the hub tutorial detail; hidden when the user cannot access it. */
export function ViewTutorialLink({ tutorialId, className }: ViewTutorialLinkProps) {
  const { permissions, isAdmin, ready } = useMePermissions();
  const tutorial = getTutorial(tutorialId);
  if (!ready || !tutorial || !canAccessTutorial(tutorial, permissions, isAdmin)) return null;

  return (
    <Link
      to={tutorialPath(tutorialId)}
      className={uiCx(
        'inline-flex h-8 shrink-0 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors',
        'border border-transparent bg-transparent text-gray-700 hover:bg-gray-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300',
        uiRadius.control,
        className,
      )}
    >
      <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
      View tutorial
    </Link>
  );
}
