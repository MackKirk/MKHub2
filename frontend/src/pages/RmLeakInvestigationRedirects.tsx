import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { findLeakInvestigationDivisionId, PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/leakInvestigation';

/** Redirect legacy /rm-leak-investigations list to /rm-projects filtered by Leak Investigations division. */
export function RmLeakInvestigationsListRedirect() {
  const { data: divisions } = useQuery({
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
    queryFn: () => api<{ id: string; label?: string }[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
  });
  const leakDivId = findLeakInvestigationDivisionId(divisions);
  if (!leakDivId) {
    return <Navigate to="/rm-projects" replace />;
  }
  return <Navigate to={`/rm-projects?division_id=${encodeURIComponent(leakDivId)}`} replace />;
}

/** Redirect legacy /rm-leak-investigations/:id detail URLs to /rm-projects/:id. */
export function RmLeakInvestigationDetailRedirect() {
  const { id } = useParams();
  if (!id) return <Navigate to="/rm-projects" replace />;
  return <Navigate to={`/rm-projects/${encodeURIComponent(id)}`} replace />;
}
