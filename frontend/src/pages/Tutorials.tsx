import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { isAdminRole } from '@/lib/projectLinePermissionKeys';
import {
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { listAccessibleTutorialGroups, tutorialPath } from '@/features/tutorials/registry';

export default function Tutorials() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<any>('GET', '/auth/me'),
    staleTime: 60_000,
  });
  const permissions = useMemo(
    () => new Set<string>(Array.isArray(me?.permissions) ? me.permissions.map(String) : []),
    [me?.permissions],
  );
  const isAdmin = isAdminRole(me?.roles);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const all = listAccessibleTutorialGroups(permissions, isAdmin);
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all
      .map((group) => ({
        ...group,
        tutorials: group.tutorials.filter(
          (t) =>
            t.title.toLowerCase().includes(needle) ||
            t.summary.toLowerCase().includes(needle) ||
            group.category.label.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.tutorials.length > 0);
  }, [permissions, isAdmin, q]);

  const hasAny = groups.some((g) => g.tutorials.length > 0);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Tutorials"
        subtitle="Learn how each area of the Hub works"
        icon={<BookOpen className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <AppInput
          placeholder="Search tutorials…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          aria-label="Search tutorials"
        />
      </AppCard>

      {isLoading ? (
        <p className={uiTypography.helper}>Loading tutorials…</p>
      ) : !hasAny ? (
        <AppEmptyState
          title={q.trim() ? 'No tutorials match your search' : 'No tutorials available'}
          description={
            q.trim()
              ? 'Try a different search term.'
              : 'Tutorials for areas you can access will show up here.'
          }
        />
      ) : (
        <div className={uiSpacing.sectionStack}>
          {groups.map((group) => (
            <section key={group.category.id} className="space-y-3">
              <h2 className={uiCx(uiTypography.overline, 'text-gray-600')}>{group.category.label}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.tutorials.map((tutorial) => (
                  <Link
                    key={tutorial.id}
                    to={tutorialPath(tutorial.id)}
                    className={uiCx(
                      'block rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50',
                    )}
                  >
                    <div className={uiCx(uiTypography.body, 'font-semibold text-gray-900')}>
                      {tutorial.title}
                    </div>
                    <p className={uiCx(uiTypography.helper, 'mt-1')}>{tutorial.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
