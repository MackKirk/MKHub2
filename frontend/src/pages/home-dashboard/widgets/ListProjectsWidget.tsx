import { useQuery } from '@tanstack/react-query';
import { FolderKanban } from 'lucide-react';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { AppBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { resolveWidgetBusinessLine, getServicePathsForLine } from '../homeBusinessLine';
import type { MeForHomeWidgets } from '../widgetVisibility';
import {
  HomeWidgetList,
  HomeWidgetListEmpty,
  HomeWidgetListFooter,
  HomeWidgetListRow,
} from '../HomeWidgetList';

type Project = { id: string; code?: string; name?: string; slug?: string; status_label?: string };

type ListProjectsWidgetProps = {
  config?: { limit?: number; division_id?: string; business_line?: string };
};

export function ListProjectsWidget({ config }: ListProjectsWidgetProps) {
  const { ready } = useAnimationReady();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });
  const businessLine = resolveWidgetBusinessLine(config, me);
  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);
  const divisionId = config?.division_id;

  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('business_line', businessLine);
  if (divisionId) qs.set('division_id', divisionId);

  const projectBase = getServicePathsForLine(businessLine).projects;

  const { data, isLoading, error } = useQuery<Project[]>({
    queryKey: ['home-list-projects', businessLine, limit, divisionId],
    queryFn: () => api('GET', `/projects/business/projects?${qs.toString()}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="min-h-0 flex-1">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center">
        <div className="text-sm text-red-500">Failed to load projects</div>
      </div>
    );
  }

  const list = data && typeof data === 'object' && 'items' in data ? (data as { items: Project[] }).items : (Array.isArray(data) ? data : []);

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      <HomeWidgetList>
        {list.length === 0 ? (
          <HomeWidgetListEmpty icon={<FolderKanban className="h-5 w-5" />} title="No projects" />
        ) : (
          list.map((p) => (
            <HomeWidgetListRow
              key={p.id}
              to={`${projectBase}/${p.id}`}
              title={p.name || p.code || p.id}
              meta={p.code}
              trailing={
                p.status_label ? (
                  <AppBadge variant="neutral" className="normal-case tracking-normal">
                    {p.status_label}
                  </AppBadge>
                ) : undefined
              }
            />
          ))
        )}
      </HomeWidgetList>
      {list.length > 0 && (
        <HomeWidgetListFooter to={projectBase} label="View all projects →" />
      )}
    </FadeInOnMount>
  );
}
