import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import EstimateBuilder from '@/components/EstimateBuilder';

export default function EstimateEdit(){
  const { id } = useParams();
  const estimateId = id ? parseInt(id, 10) : undefined;
  
  const { data: estimateData, isLoading } = useQuery({
    queryKey: ['estimate', estimateId],
    queryFn: () => estimateId ? api<any>('GET', `/estimate/estimates/${estimateId}`) : Promise.resolve(null),
    enabled: !!estimateId
  });
  
  const projectId = String(estimateData?.estimate?.project_id || '');
  const { data: project } = useQuery({ queryKey:['project', projectId], queryFn: ()=> projectId? api<any>('GET', `/projects/${projectId}`): Promise.resolve(null), enabled: !!projectId });
  const { data: settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  
  if (isLoading) {
    return (
      <div>
        <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
          <div className="text-2xl font-extrabold">Edit Estimate</div>
          <div className="text-sm opacity-90">Loading...</div>
        </div>
      </div>
    );
  }
  
  if (!estimateData || !estimateData.estimate) {
    return (
      <div>
        <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
          <div className="text-2xl font-extrabold">Edit Estimate</div>
          <div className="text-sm opacity-90">Estimate not found</div>
        </div>
      </div>
    );
  }
  
  const projectId = String(estimateData.estimate.project_id || '');
  
  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Edit Estimate</div>
        <div className="text-sm opacity-90">Continue editing your estimate.</div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        {estimateId && projectId ? (
          <EstimateBuilder estimateId={estimateId} projectId={projectId} statusLabel={project?.status_label||''} settings={settings||{}} />
        ) : (
          <div className="p-4 text-gray-600">Invalid estimate or project ID</div>
        )}
      </div>
    </div>
  );
}

