import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness } from 'lucide-react';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { AppBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { getServicePathsForLine, resolveWidgetBusinessLine } from '../homeBusinessLine';
import type { MeForHomeWidgets } from '../widgetVisibility';import {
  HomeWidgetList,
  HomeWidgetListEmpty,
  HomeWidgetListFooter,
  HomeWidgetListRow,
} from '../HomeWidgetList';

type Opportunity = {
  id: string;
  code?: string;
  name?: string;
  slug?: string;
  status_label?: string;
};

type ListOpportunitiesWidgetProps = {
  config?: { limit?: number; division_id?: string; business_line?: string };
};

export function ListOpportunitiesWidget({ config }: ListOpportunitiesWidgetProps) {
  const { ready } = useAnimationReady();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<MeForHomeWidgets>('GET', '/auth/me'),
  });
  const businessLine = resolveWidgetBusinessLine(config, me);  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);
  const divisionId = config?.division_id;

  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  qs.set('business_line', businessLine);
  if (divisionId) qs.set('division_id', divisionId);

  const oppBase = getServicePathsForLine(businessLine).opportunities;
  const { data, isLoading, error } = useQuery<Opportunity[]>({
    queryKey: ['home-list-opportunities', businessLine, limit, divisionId],
    queryFn: () => api('GET', `/projects/business/opportunities?${qs.toString()}`),
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
        <div className="text-sm text-red-500">Failed to load opportunities</div>
      </div>
    );
  }

  const list = data && typeof data === 'object' && 'items' in data ? (data as { items: Opportunity[] }).items : (Array.isArray(data) ? data : []);

  return (
    <FadeInOnMount enabled={ready} className="flex h-full min-h-0 w-full flex-col">
      <HomeWidgetList>
        {list.length === 0 ? (
          <HomeWidgetListEmpty icon={<BriefcaseBusiness className="h-5 w-5" />} title="No opportunities" />
        ) : (
          list.map((o) => (
            <HomeWidgetListRow
              key={o.id}
              to={`${oppBase}/${o.id}`}
              title={o.name || o.code || o.id}
              meta={o.code}
              trailing={
                o.status_label ? (
                  <AppBadge variant="neutral" className="normal-case tracking-normal">
                    {o.status_label}
                  </AppBadge>
                ) : undefined
              }
            />
          ))
        )}
      </HomeWidgetList>
      {list.length > 0 && (
        <HomeWidgetListFooter to={oppBase} label="View all opportunities →" />
      )}
    </FadeInOnMount>
  );
}
