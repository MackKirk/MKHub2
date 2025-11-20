import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Project = { id:string, is_bidding?:boolean };

// OpportunityDetail redirects to ProjectDetail which handles opportunity display
export default function OpportunityDetail(){
  const { id } = useParams();
  const { data:proj } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  
  // Ensure it's an opportunity, if not redirect to projects
  if (proj && !proj.is_bidding) {
    return <Navigate to={`/projects/${id}`} replace />;
  }
  
  // Redirect to ProjectDetail which will handle opportunity display
  return <Navigate to={`/projects/${id}`} replace />;
}

