import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import FadeInOnMount from '@/components/FadeInOnMount';
import LoadingOverlay from '@/components/LoadingOverlay';
import { useAnimationReady } from '@/contexts/AnimationReadyContext';
import { api } from '@/lib/api';

type Project = { id: string; code?: string; name?: string; slug?: string; status_label?: string };

type ListProjectsWidgetProps = {
  config?: { limit?: number; division_id?: string };
};

export function ListProjectsWidget({ config }: ListProjectsWidgetProps) {
  const { ready } = useAnimationReady();
  const limit = Math.min(Math.max(1, config?.limit ?? 5), 20);
  const divisionId = config?.division_id;

  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (divisionId) qs.set('division_id', divisionId);

  const { data, isLoading, error } = useQuery<Project[]>({
    queryKey: ['home-list-projects', limit, divisionId],
    queryFn: () => api('GET', `/projects/business/projects?${qs.toString()}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <LoadingOverlay isLoading minHeight="min-h-[120px]" className="flex-1 min-h-0">
          <div className="min-h-[120px]" />
        </LoadingOverlay>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col min-h-0 h-full w-full">
        <div className="flex-1 min-h-0 flex items-center justify-center p-3">
          <div className="rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm text-red-600">
            Failed to load projects
          </div>
        </div>
      </div>
    );
  }

  const list = Array.isArray(data) ? data : [];

  const itemStyle = { padding: 'clamp(0.375rem, 3cqh, 0.75rem)' };
  const titleStyle = { fontSize: 'clamp(0.625rem, 5cqh, 0.875rem)' };
  const metaStyle = { fontSize: 'clamp(0.5rem, 3.5cqh, 0.625rem)' };
  const viewAllStyle = { fontSize: 'clamp(0.5rem, 4cqh, 0.75rem)' };

  return (
    <FadeInOnMount enabled={ready} className="flex flex-col min-h-0 h-full w-full">
      <ul className="flex-1 min-h-0 flex flex-col overflow-y-auto pr-1" style={{ gap: 'clamp(0.25rem, 2cqh, 0.5rem)' }}>
      {list.length === 0 ? (
        <li className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 text-center text-gray-500 shrink-0" style={{ ...itemStyle, paddingBlock: 'clamp(0.5rem, 4cqh, 1rem)' }}>
          No projects
        </li>
      ) : (
        list.map((p) => (
          <li key={p.id} className="shrink-0">
            <Link
              to={`/projects/${p.id}`}
              className="block rounded-lg border border-gray-200 bg-white shadow-sm transition-all hover:border-brand-red/30 hover:shadow-md hover:bg-gray-50/50"
              style={itemStyle}
            >
              <div className="font-medium text-gray-900 truncate text-sm" style={titleStyle}>
                {p.name || p.code || p.id}
              </div>
              {(p.code || p.status_label) && (
                <div className="flex flex-wrap items-center gap-1 shrink-0" style={{ marginTop: 'clamp(0.125rem, 1cqh, 0.375rem)', gap: 'clamp(0.125rem, 1cqh, 0.25rem)' }}>
                  {p.code && <span className="font-medium text-gray-500" style={metaStyle}>{p.code}</span>}
                  {p.status_label && (
                    <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700" style={metaStyle}>
                      {p.status_label}
                    </span>
                  )}
                </div>
              )}
            </Link>
          </li>
        ))
      )}
      {list.length > 0 && (
        <li className="pt-0.5 shrink-0">
          <Link to="/projects" className="inline-block font-medium text-brand-red hover:underline" style={viewAllStyle}>
            View all projects →
          </Link>
        </li>
      )}
    </ul>
    </FadeInOnMount>
  );
}
