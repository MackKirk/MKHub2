import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';

type Opportunity = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_end?:string, is_bidding?:boolean, project_division_ids?:string[] };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

export default function Opportunities(){
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const divisionId = searchParams.get('division_id') || '';
  const [q, setQ] = useState('');
  const qs = useMemo(()=> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (divisionId) params.set('division_id', divisionId);
    return params.toString() ? '?' + params.toString() : '';
  }, [q, divisionId]);
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['opportunities', qs], 
    queryFn: ()=>divisionId 
      ? api<Opportunity[]>('GET', `/projects/business/opportunities${qs}`)
      : api<Opportunity[]>('GET', `/projects?is_bidding=true${qs}`)
  });
  const { data: projectDivisions } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000,
    enabled: !!divisionId
  });
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);
  
  // Get division name from ID
  const divisionName = useMemo(() => {
    if (!divisionId || !projectDivisions) return divisionId;
    for (const div of (projectDivisions || [])) {
      if (String(div.id) === String(divisionId)) {
        return div.label;
      }
      for (const sub of (div.subdivisions || [])) {
        if (String(sub.id) === String(divisionId)) {
          return `${div.label} - ${sub.label}`;
        }
      }
    }
    return divisionId;
  }, [divisionId, projectDivisions]);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Opportunities</div>
        <div className="text-sm opacity-90">Create, edit and track bids and quotes.</div>
      </div>
      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="flex items-end gap-2 mb-2">
          <div className="flex-1 max-w-[420px]">
            <label className="text-xs text-gray-600">Search</label>
            <input 
              className="w-full border rounded px-3 py-2" 
              placeholder="code/name" 
              value={q} 
              onChange={e=>setQ(e.target.value)} 
              onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
            />
          </div>
          <button onClick={()=>refetch()} className="px-3 py-2 rounded bg-brand-red text-white">Apply</button>
          <Link to="/projects/new?is_bidding=true" state={{ backgroundLocation: location }} className="px-3 py-2 rounded bg-black text-white">New Opportunity</Link>
        </div>
        {divisionId && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Filtered by division:</span>
            <span className="px-2 py-1 bg-[#7f1010]/10 text-[#7f1010] rounded border border-[#7f1010]/20 font-medium">
              {divisionName}
            </span>
            <Link 
              to="/opportunities" 
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filter
            </Link>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading? (
          <>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </>
        ) : arr.map(p => (
          <OpportunityListCard key={p.id} opportunity={p} />
        ))}
      </div>
      {pickerOpen?.open && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(null)} clientId={String(pickerOpen?.clientId||'')} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            // Upload derived cover and associate to client (category project-cover-derived)
            const up:any = await api('POST','/files/upload',{ project_id: pickerOpen?.projectId||null, client_id: pickerOpen?.clientId||null, employee_id:null, category_id:'project-cover-derived', original_name: 'project-cover.jpg', content_type: 'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            if (pickerOpen?.clientId){ await api('POST', `/clients/${pickerOpen.clientId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`); }
            toast.success('Cover updated');
            setPickerOpen(null);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(null); }
        }} />
      )}
    </div>
  );
}

// Icon mapping for divisions
const getDivisionIcon = (label: string): string => {
  const iconMap: Record<string, string> = {
    'Roofing': '🏠',
    'Concrete Restoration & Waterproofing': '🏗️',
    'Cladding & Exterior Finishes': '🧱',
    'Repairs & Maintenance': '🔧',
    'Mack Kirk Metals': '⚙️',
    'Mechanical': '🔩',
    'Electrical': '⚡',
    'Carpentry': '🪵',
    'Welding & Custom Fabrication': '🔥',
    'Structural Upgrading': '📐',
    'Solar PV': '☀️',
    'Green Roofing': '🌱',
  };
  return iconMap[label] || '📦';
};

function OpportunityListCard({ opportunity }:{ opportunity: Opportunity }){
  const navigate = useNavigate();
  const { data:files } = useQuery({ queryKey:['client-files-for-opportunity-card', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id))}/files`) : Promise.resolve([]), enabled: !!opportunity.client_id, staleTime: 60_000 });
  const pfiles = useMemo(()=> (files||[]).filter((f:any)=> String((f as any).project_id||'')===String(opportunity.id)), [files, opportunity?.id]);
  const cover = pfiles.find((f:any)=> String(f.category||'')==='project-cover-derived') || pfiles.find((f:any)=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? `/files/${cover.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
  const { data:details } = useQuery({ queryKey:['opportunity-detail-card', opportunity.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['opportunity-client', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), enabled: !!opportunity.client_id, staleTime: 300_000 });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const status = (opportunity as any).status_label || details?.status_label || '';
  const progress = Math.max(0, Math.min(100, Number((opportunity as any).progress ?? details?.progress ?? 0)));
  const start = (opportunity.date_start || details?.date_start || opportunity.created_at || '').slice(0,10);
  const estimatedValue = details?.cost_estimated || (opportunity as any).cost_estimated || 0;
  const clientName = client?.display_name || client?.name || '';
  const projectDivIds = (opportunity as any).project_division_ids || details?.project_division_ids || [];
  
  // Get division icons and labels
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: string; label: string }> = [];
    for (const divId of projectDivIds.slice(0, 5)) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ icon: getDivisionIcon(div.label), label: div.label });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ icon: getDivisionIcon(div.label), label: `${div.label} - ${sub.label}` });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].label.includes(String(divId))) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions]);

  // Tab icons and navigation (for opportunities: files, proposal, estimate)
  const tabButtons = [
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'estimate', icon: '💰', label: 'Estimate', tab: 'estimate' },
  ];

  return (
    <Link 
      to={`/opportunities/${encodeURIComponent(String(opportunity.id))}`} 
      className="group rounded-xl border bg-white hover:shadow-lg transition-all overflow-hidden block flex flex-col h-full relative"
    >
      {/* Status badge at top right */}
      <div className="absolute top-3 right-3 z-10">
        <span className="px-2 py-1 rounded-full text-xs font-medium border bg-white/95 backdrop-blur-sm text-gray-800 shadow-sm" title={status}>
          {status || '—'}
        </span>
      </div>

      {/* Top section: Image + Header/Progress */}
      <div className="flex">
        {/* Image on the left */}
        <div className="w-40 h-40 flex-shrink-0 p-4">
          <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
            <img className="w-full h-full object-cover" src={src} alt={opportunity.name || 'Opportunity'} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          </div>
        </div>
        
        {/* Header and Progress on the right */}
        <div className="flex-1 p-4 flex flex-col min-w-0">
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1 truncate">{clientName || 'No client'}</div>
            <div className="font-bold text-lg text-gray-900 group-hover:text-[#7f1010] transition-colors truncate mb-1">
              {opportunity.name || 'Opportunity'}
            </div>
            <div className="text-xs text-gray-600 truncate mb-2">{opportunity.code || '—'}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Tab shortcut buttons */}
              {tabButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/opportunities/${encodeURIComponent(String(opportunity.id))}?tab=${btn.tab}`);
                  }}
                  className="relative group/btn w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 flex items-center justify-center text-sm transition-all hover:scale-110"
                  title={btn.label}
                >
                  {btn.icon}
                  {/* Tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-20">
                    {btn.label}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar - same style as project detail page */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-sm font-semibold text-gray-700 w-12 text-right">{progress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section: Start Date, ETA, Estimator, On-site Lead, Estimated Value, Tab Buttons, Division Icons */}
      <div className="px-4 pb-4">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <div className="text-xs text-gray-500">Start Date</div>
            <div className="font-medium text-gray-900">{start || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">ETA</div>
            <div className="font-medium text-gray-900">—</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900">—</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">On-site Lead</div>
            <div className="font-medium text-gray-900">—</div>
          </div>
        </div>
        {estimatedValue > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-semibold text-[#7f1010]">${estimatedValue.toLocaleString()}</div>
          </div>
        )}

        {/* Division icons */}
        {divisionIcons.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 flex-wrap">
              {divisionIcons.map((div, idx) => (
                <div
                  key={idx}
                  className="relative group/icon"
                  title={div.label}
                >
                  <div className="text-2xl cursor-pointer hover:scale-110 transition-transform">
                    {div.icon}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                    {div.label}
                    <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              ))}
              {projectDivIds.length > 5 && (
                <div className="relative group/icon">
                  <div className="text-lg text-gray-400 cursor-pointer" title={`${projectDivIds.length - 5} more divisions`}>
                    +{projectDivIds.length - 5}
                  </div>
                  <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                    {projectDivIds.length - 5} more divisions
                    <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

