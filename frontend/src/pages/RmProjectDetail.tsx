import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ProjectDetail from './ProjectDetail';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';

type Project = { id: string; is_bidding?: boolean; business_line?: string; is_leak_investigation?: boolean };

export default function RmProjectDetail() {
  const { id } = useParams();
  const { data: proj, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api<Project>('GET', `/projects/${id}`),
  });

  if (proj && proj.is_leak_investigation) {
    return <Navigate to={`/rm-leak-investigations/${id}`} replace />;
  }
  if (proj && proj.is_bidding) {
    return <Navigate to={`/rm-opportunities/${id}`} replace />;
  }
  if (proj && proj.business_line && proj.business_line !== BUSINESS_LINE_REPAIRS_MAINTENANCE) {
    return <Navigate to={`/projects/${id}`} replace />;
  }

  if (isLoading && !proj) {
    return null;
  }

  return <ProjectDetail />;
}
