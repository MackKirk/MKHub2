import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

type Project = { id: string; code?: string; name?: string; slug?: string; status_label?: string };

type ListProjectsWidgetProps = {
  config?: { limit?: number; division_id?: string };
};

export function ListProjectsWidget({ config }: ListProjectsWidgetProps) {
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

  if (isLoading) return <div className="text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="text-sm text-red-500">Failed to load projects</div>;

  const list = Array.isArray(data) ? data : [];

  return (
    <ul className="space-y-1.5">
      {list.length === 0 ? (
        <li className="text-sm text-gray-500">No projects</li>
      ) : (
        list.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}`}
              className="block text-sm text-gray-800 hover:text-[#7f1010] hover:underline truncate"
            >
              {p.name || p.code || p.id}
            </Link>
            {(p.code || p.status_label) && (
              <div className="text-xs text-gray-500">
                {[p.code, p.status_label].filter(Boolean).join(' · ')}
              </div>
            )}
          </li>
        ))
      )}
      {list.length > 0 && (
        <li className="pt-1">
          <Link to="/projects" className="text-xs text-[#7f1010] hover:underline">
            View all projects →
          </Link>
        </li>
      )}
    </ul>
  );
}
