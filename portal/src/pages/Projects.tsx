import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HardHat } from 'lucide-react';
import { portalApi } from '@/lib/api';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/lib/ui';

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  status_label?: string | null;
  progress?: number | null;
  participation: 'owner' | 'awarded';
  membership_client_name?: string | null;
  address_city?: string | null;
};

export default function Projects() {
  const [items, setItems] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [meName, setMeName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await portalApi<{ name?: string; email?: string }>('GET', '/portal/hub/auth/me');
        if (!cancelled) setMeName(me.name || me.email || null);
        const data = await portalApi<{ items: ProjectRow[] }>('GET', '/portal/hub/projects');
        if (!cancelled) setItems(data.items || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="My projects"
        subtitle={meName ? `Signed in as ${meName}` : 'Projects where your company is owner or awarded'}
        icon={<HardHat className="h-4 w-4" />}
      />

      {loading ? (
        <AppCard>
          <p className={uiTypography.helper}>Loading projects…</p>
        </AppCard>
      ) : items.length === 0 ? (
        <AppEmptyState
          title="No projects yet"
          description="No projects are available for your company yet."
        />
      ) : (
        <ul className={uiSpacing.sectionStack}>
          {items.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block">
                <AppCard className="transition hover:border-brand-red/30">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className={uiTypography.sectionTitle}>{p.name}</div>
                      <div className={uiCx(uiTypography.helper, 'mt-0.5')}>{p.code}</div>
                    </div>
                    <AppBadge variant={p.participation === 'owner' ? 'info' : 'warning'}>
                      {p.participation === 'owner' ? 'Owner' : 'Awarded'}
                    </AppBadge>
                  </div>
                  <div className={uiCx('mt-3 flex flex-wrap gap-3', uiTypography.helper)}>
                    {p.status_label && <span>{p.status_label}</span>}
                    {typeof p.progress === 'number' && <span>{p.progress}% complete</span>}
                    {p.membership_client_name && <span>via {p.membership_client_name}</span>}
                    {p.address_city && <span>{p.address_city}</span>}
                  </div>
                </AppCard>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
