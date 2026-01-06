import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import EstimateBuilder from '@/components/EstimateBuilder';
import { useMemo } from 'react';

export default function EstimateEdit(){
  const { id } = useParams();
  const estimateId = id ? parseInt(id, 10) : undefined;
  
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
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
        <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Edit Estimate</div>
            <div className="text-sm text-gray-500 font-medium">Loading...</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>
      </div>
    );
  }
  
  if (!estimateData || !estimateData.estimate) {
    return (
      <div>
        <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Edit Estimate</div>
            <div className="text-sm text-gray-500 font-medium">Estimate not found</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Edit Estimate</div>
          <div className="text-sm text-gray-500 font-medium">Continue editing your estimate.</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-4">
        {estimateId && projectId ? (
          <EstimateBuilder estimateId={estimateId} projectId={projectId} statusLabel={project?.status_label||''} settings={settings||{}} isBidding={project?.is_bidding} />
        ) : (
          <div className="p-4 text-gray-600">Invalid estimate or project ID</div>
        )}
      </div>
    </div>
  );
}

