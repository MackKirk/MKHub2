import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import ProjectDetail from './ProjectDetail';

type Project = { id:string, is_bidding?:boolean };

// OpportunityDetail renders ProjectDetail directly to maintain /opportunities/:id URL
// This ensures the sidebar keeps "Opportunities" highlighted instead of switching to "Projects"
export default function OpportunityDetail(){
  const { id } = useParams();
  const { data:proj, isLoading } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  
  // If project is loaded and it's not an opportunity, redirect to projects
  if (proj && !proj.is_bidding) {
    return <Navigate to={`/projects/${id}`} replace />;
  }
  
  // If still loading, show nothing (ProjectDetail will handle loading state)
  if (isLoading && !proj) {
    return null;
  }
  
  // Render ProjectDetail directly to maintain /opportunities/:id URL
  // ProjectDetail will detect is_bidding and display as opportunity
  return <ProjectDetail />;
}

