import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

type Project = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_end?:string, project_division_ids?:string[] };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

export default function Projects(){
  const [searchParams, setSearchParams] = useSearchParams();
  const divisionId = searchParams.get('division_id') || '';
  const statusId = searchParams.get('status') || '';
  const minValue = searchParams.get('min_value') || '';
  const queryParam = searchParams.get('q') || '';
  const [q, setQ] = useState(queryParam);
  const [selectedDivision, setSelectedDivision] = useState(divisionId);
  const [selectedStatus, setSelectedStatus] = useState(statusId);
  const [minValueInput, setMinValueInput] = useState(minValue);
  
  // Sync URL params with state when URL changes (e.g., from dashboard navigation)
  useEffect(() => {
    const urlDivision = searchParams.get('division_id') || '';
    const urlStatus = searchParams.get('status') || '';
    const urlMinValue = searchParams.get('min_value') || '';
    const urlQ = searchParams.get('q') || '';
    
    if (urlDivision !== selectedDivision) {
      setSelectedDivision(urlDivision);
    }
    if (urlStatus !== selectedStatus) {
      setSelectedStatus(urlStatus);
    }
    if (urlMinValue !== minValueInput) {
      setMinValueInput(urlMinValue);
    }
    if (urlQ !== q) {
      setQ(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedDivision) params.set('division_id', selectedDivision);
    if (selectedStatus) params.set('status', selectedStatus);
    if (minValueInput) params.set('min_value', minValueInput);
    return params.toString() ? '?' + params.toString() : '';
  }, [q, selectedDivision, selectedStatus, minValueInput]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['projects', qs], 
    queryFn: ()=> api<Project[]>('GET', `/projects/business/projects${qs}`)
  });
  
  const { data: projectDivisions } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  
  const { data: settings } = useQuery({ 
    queryKey:['settings'], 
    queryFn: ()=> api<any>('GET','/settings'), 
    staleTime: 300_000
  });
  
  const projectStatuses = settings?.project_statuses || [];
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    if (!newOpen) {
      document.body.style.overflow = '';
      return;
    }
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        setNewOpen(false);
        setName('');
        setClientId('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [newOpen]);

  const handleCreateProject = async () => {
    if (!name.trim() || !clientId.trim() || isCreatingProject) {
      if (!isCreatingProject) toast.error('Name and client ID are required');
      return;
    }
    try {
      setIsCreatingProject(true);
      const created: any = await api('POST', '/projects', { name: name.trim(), client_id: clientId.trim() });
      toast.success('Project created');
      setNewOpen(false);
      setName('');
      setClientId('');
      if (created?.id) {
        window.location.href = `/projects/${encodeURIComponent(String(created.id))}`;
        // Don't reset isCreatingProject here - navigation will handle it
        return; // Exit early to prevent finally from resetting state
      }
    } catch (e: any) {
      console.error('Failed to create project:', e);
      toast.error(e?.response?.data?.detail || 'Failed to create project');
      setIsCreatingProject(false); // Only reset on error
    }
  };

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Projects</div>
        <div className="text-sm opacity-90">List, search and manage projects.</div>
      </div>
      <div className="mb-3 rounded-xl border bg-white p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <div className="lg:col-span-2">
            <label className="text-xs text-gray-600">Search</label>
            <input 
              className="w-full border rounded px-3 py-2" 
              placeholder="code/name" 
              value={q} 
              onChange={e=>setQ(e.target.value)} 
              onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Division</label>
            <select 
              className="w-full border rounded px-3 py-2"
              value={selectedDivision}
              onChange={e=>setSelectedDivision(e.target.value)}
            >
              <option value="">All Divisions</option>
              {projectDivisions?.map((div: any) => (
                <optgroup key={div.id} label={div.label}>
                  <option value={div.id}>{div.label}</option>
                  {div.subdivisions?.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>{sub.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Status</label>
            <select 
              className="w-full border rounded px-3 py-2"
              value={selectedStatus}
              onChange={e=>setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {projectStatuses.map((status: any) => (
                <option key={status.id} value={status.id}>{status.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Min Value ($)</label>
            <input 
              type="number"
              className="w-full border rounded px-3 py-2" 
              placeholder="0.00" 
              value={minValueInput} 
              onChange={e=>setMinValueInput(e.target.value)} 
              onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={()=>{
              // Update URL params when applying filters
              const params = new URLSearchParams();
              if (q) params.set('q', q);
              if (selectedDivision) params.set('division_id', selectedDivision);
              if (selectedStatus) params.set('status', selectedStatus);
              if (minValueInput) params.set('min_value', minValueInput);
              setSearchParams(params);
              refetch();
            }} 
            className="px-4 py-2 rounded bg-brand-red text-white hover:bg-[#6d0d0d] transition-colors"
          >
            Apply Filters
          </button>
          <button 
            onClick={()=>{
              setQ('');
              setSelectedDivision('');
              setSelectedStatus('');
              setMinValueInput('');
              setSearchParams({});
              refetch();
            }} 
            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
          <button onClick={()=>setNewOpen(true)} className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 transition-colors">New Project</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading? (
          <>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </>
        ) : arr.map(p => (
          <ProjectListCard key={p.id} project={p} />
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
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
          <div className="w-[480px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b font-semibold">New Project</div>
            <div className="p-4">
              <div className="mb-3">
                <label className="block text-sm text-gray-700 mb-1">Project Name</label>
                <input 
                  type="text" 
                  className="w-full border rounded px-3 py-2" 
                  value={name} 
                  onChange={e=>setName(e.target.value)}
                  onKeyDown={(e)=>{
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    } else if (e.key === 'Escape') {
                      setNewOpen(false);
                      setName('');
                      setClientId('');
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="mb-3">
                <label className="block text-sm text-gray-700 mb-1">Client ID</label>
                <input 
                  type="text" 
                  className="w-full border rounded px-3 py-2" 
                  value={clientId} 
                  onChange={e=>setClientId(e.target.value)} 
                  placeholder="client uuid"
                  onKeyDown={(e)=>{
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateProject();
                    }
                  }}
                />
              </div>
            </div>
            <div className="p-3 flex items-center justify-end gap-2 border-t">
              <button className="px-3 py-2 rounded bg-gray-100" onClick={()=>{ setNewOpen(false); setName(''); setClientId(''); }}>Cancel</button>
              <button className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-50 disabled:cursor-not-allowed" onClick={handleCreateProject} disabled={isCreatingProject}>
                {isCreatingProject ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
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

function ProjectListCard({ project }:{ project: Project }){
  const navigate = useNavigate();
  const { data:files } = useQuery({ queryKey:['client-files-for-proj-card', project.client_id], queryFn: ()=> project.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(project.client_id))}/files`) : Promise.resolve([]), enabled: !!project.client_id, staleTime: 60_000 });
  const pfiles = useMemo(()=> (files||[]).filter((f:any)=> String((f as any).project_id||'')===String(project.id)), [files, project?.id]);
  const cover = pfiles.find((f:any)=> String(f.category||'')==='project-cover-derived') || pfiles.find((f:any)=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? `/files/${cover.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
  const { data:details } = useQuery({ queryKey:['project-detail-card', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const { data:reports } = useQuery({ queryKey:['project-reports-count-card', project.id], queryFn: async()=> { const r = await api<any[]>('GET', `/projects/${encodeURIComponent(String(project.id))}/reports`); return r?.length||0; }, staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['proj-client', project.client_id], queryFn: ()=> project.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(project.client_id||''))}`): Promise.resolve(null), enabled: !!project.client_id, staleTime: 300_000 });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data:projectEstimates } = useQuery({ queryKey:['project-estimates-card', project.id], queryFn: ()=> api<any[]>('GET', `/estimate/estimates?project_id=${encodeURIComponent(String(project.id))}`), enabled: !!project.id, staleTime: 60_000 });
  const { data:estimateData } = useQuery({ 
    queryKey: ['estimate-card', projectEstimates?.[0]?.id], 
    queryFn: () => projectEstimates?.[0]?.id ? api<any>('GET', `/estimate/estimates/${projectEstimates[0].id}`) : Promise.resolve(null),
    enabled: !!projectEstimates?.[0]?.id,
    staleTime: 60_000
  });
  const status = (project as any).status_label || details?.status_label || '';
  const progress = Math.max(0, Math.min(100, Number((project as any).progress ?? details?.progress ?? 0)));
  const start = (project.date_start || details?.date_start || project.created_at || '').slice(0,10);
  const eta = (details?.date_eta || project.date_end || '').slice(0,10);
  const est = details?.estimator_id || '';
  const lead = details?.onsite_lead_id || '';
  const actualValue = details?.cost_actual || (project as any).cost_actual || 0;
  const estimatedValue = details?.service_value || details?.cost_estimated || (project as any).service_value || (project as any).cost_estimated || 0;
  const clientName = client?.display_name || client?.name || '';
  const projectDivIds = (project as any).project_division_ids || details?.project_division_ids || [];
  
  // Calculate Grand Total from estimate (same logic as ProjectCostsSummary)
  const grandTotal = useMemo(() => {
    if (!estimateData || !projectEstimates?.length) return 0;
    const items = estimateData?.items || [];
    const markup = estimateData?.estimate?.markup || estimateData?.markup || 0;
    const pstRate = estimateData?.pst_rate ?? 0;
    const gstRate = estimateData?.gst_rate ?? 0;
    const profitRate = estimateData?.profit_rate ?? 20;
    const sectionOrder = estimateData?.section_order || [];
    
    // Parse UI state for item extras
    const itemExtrasMap: Record<string, any> = {};
    try {
      const notes = estimateData?.estimate?.notes || estimateData?.notes;
      if (notes) {
        const uiState = JSON.parse(notes);
        Object.assign(itemExtrasMap, uiState.item_extras || {});
      }
    } catch {}
    
    // Calculate total with markup for all items
    const totalWithMarkupAll = items.reduce((acc: number, it: any) => {
      const m = itemExtrasMap[`item_${it.id}`]?.markup !== undefined && itemExtrasMap[`item_${it.id}`].markup !== null ? itemExtrasMap[`item_${it.id}`].markup : markup;
      let itemTotal = 0;
      const section = it.section || 'Miscellaneous';
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
      
      if (!isLabourSection) {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      } else {
        if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
          const extras = itemExtrasMap[`item_${it.id}`];
          if (extras.labour_journey_type === 'contract') {
            itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
          } else {
            itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
          }
        } else {
          itemTotal = (it.quantity || 0) * (it.unit_price || 0);
        }
      }
      return acc + (itemTotal * (1 + (m/100)));
    }, 0);
    
    // Calculate total without markup
    const totalWithoutMarkup = items.reduce((acc: number, it: any) => {
      let itemTotal = 0;
      const section = it.section || 'Miscellaneous';
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
      
      if (!isLabourSection) {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      } else {
        if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
          const extras = itemExtrasMap[`item_${it.id}`];
          if (extras.labour_journey_type === 'contract') {
            itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
          } else {
            itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
          }
        } else {
          itemTotal = (it.quantity || 0) * (it.unit_price || 0);
        }
      }
      return acc + itemTotal;
    }, 0);
    
    const sectionsMarkup = totalWithMarkupAll - totalWithoutMarkup;
    
    // Group items by section
    const groupedItems: Record<string, any[]> = {};
    items.forEach((it: any) => {
      const section = it.section || 'Miscellaneous';
      if(!groupedItems[section]) groupedItems[section] = [];
      groupedItems[section].push(it);
    });
    
    // Calculate section subtotals
    const calculateSectionSubtotal = (sectionName: string): number => {
      const sectionItems = groupedItems[sectionName] || [];
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(sectionName) || 
                            sectionName.startsWith('Labour Section') || 
                            sectionName.startsWith('Sub-Contractor Section') || 
                            sectionName.startsWith('Shop Section') || 
                            sectionName.startsWith('Miscellaneous Section');
      return sectionItems.reduce((sum, it) => {
        const m = itemExtrasMap[`item_${it.id}`]?.markup !== undefined && itemExtrasMap[`item_${it.id}`].markup !== null ? itemExtrasMap[`item_${it.id}`].markup : markup;
        let itemTotal = 0;
        if (!isLabourSection) {
          itemTotal = (it.quantity || 0) * (it.unit_price || 0);
        } else {
          if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
            const extras = itemExtrasMap[`item_${it.id}`];
            if (extras.labour_journey_type === 'contract') {
              itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
            } else {
              itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
            }
          } else {
            itemTotal = (it.quantity || 0) * (it.unit_price || 0);
          }
        }
        return sum + (itemTotal * (1 + (m/100)));
      }, 0);
    };
    
    const totalProductsCosts = sectionOrder
      .filter(section => !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) && 
                    !section.startsWith('Labour Section') && 
                    !section.startsWith('Sub-Contractor Section') && 
                    !section.startsWith('Shop Section') && 
                    !section.startsWith('Miscellaneous Section'))
      .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
    
    const totalLabourCosts = calculateSectionSubtotal('Labour') + 
             sectionOrder
               .filter(s => s.startsWith('Labour Section'))
               .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
    
    const totalSubContractorsCosts = calculateSectionSubtotal('Sub-Contractors') + 
             sectionOrder
               .filter(s => s.startsWith('Sub-Contractor Section'))
               .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
    
    const totalShopCosts = calculateSectionSubtotal('Shop') + 
             sectionOrder
               .filter(s => s.startsWith('Shop Section'))
               .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
    
    const totalMiscellaneousCosts = calculateSectionSubtotal('Miscellaneous') + 
             sectionOrder
               .filter(s => s.startsWith('Miscellaneous Section'))
               .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0);
    
    const totalDirectProjectCosts = totalProductsCosts + totalLabourCosts + totalSubContractorsCosts + totalShopCosts + totalMiscellaneousCosts;
    
    // Calculate taxable total (only taxable items) with markup
    const taxableTotal = items.reduce((acc: number, it: any) => {
      const extras = itemExtrasMap[`item_${it.id}`];
      if (extras?.taxable === false) return acc;
      const m = extras?.markup !== undefined && extras.markup !== null ? extras.markup : markup;
      let itemTotal = 0;
      const section = it.section || 'Miscellaneous';
      const isLabourSection = ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) ||
                            section.startsWith('Labour Section') ||
                            section.startsWith('Sub-Contractor Section') ||
                            section.startsWith('Shop Section') ||
                            section.startsWith('Miscellaneous Section');
      
      if (!isLabourSection) {
        itemTotal = (it.quantity || 0) * (it.unit_price || 0);
      } else {
        if (it.item_type === 'labour' && itemExtrasMap[`item_${it.id}`]?.labour_journey_type) {
          const extras = itemExtrasMap[`item_${it.id}`];
          if (extras.labour_journey_type === 'contract') {
            itemTotal = (extras.labour_journey || 0) * (it.unit_price || 0);
          } else {
            itemTotal = (extras.labour_journey || 0) * (extras.labour_men || 0) * (it.unit_price || 0);
          }
        } else {
          itemTotal = (it.quantity || 0) * (it.unit_price || 0);
        }
      }
      return acc + (itemTotal * (1 + (m/100)));
    }, 0);
    
    const pst = taxableTotal * (pstRate / 100);
    const subtotal = totalDirectProjectCosts + pst;
    const profitValue = subtotal * (profitRate / 100);
    const finalTotal = subtotal + profitValue;
    const gst = finalTotal * (gstRate / 100);
    return finalTotal + gst;
  }, [estimateData, projectEstimates]);
  
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

  // Tab icons and navigation
  const tabButtons = [
    { key: 'reports', icon: '📝', label: 'Reports', tab: 'reports' },
    { key: 'dispatch', icon: '👷', label: 'Workload', tab: 'dispatch' },
    { key: 'timesheet', icon: '⏰', label: 'Timesheet', tab: 'timesheet' },
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'estimate', icon: '💰', label: 'Estimate', tab: 'estimate' },
    { key: 'orders', icon: '🛒', label: 'Orders', tab: 'orders' },
  ];

  return (
    <Link 
      to={`/projects/${encodeURIComponent(String(project.id))}`} 
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
            <img className="w-full h-full object-cover" src={src} alt={project.name || 'Project'} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          </div>
        </div>
        
        {/* Header and Progress on the right */}
        <div className="flex-1 p-4 flex flex-col min-w-0">
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1 truncate">{clientName || 'No client'}</div>
            <div className="font-bold text-lg text-gray-900 group-hover:text-[#7f1010] transition-colors truncate mb-1">
              {project.name || 'Project'}
            </div>
            <div className="text-xs text-gray-600 truncate mb-2">{project.code || '—'}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Tab shortcut buttons */}
              {tabButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/projects/${encodeURIComponent(String(project.id))}?tab=${btn.tab}`);
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

      {/* Bottom section: Start Date, ETA, Estimator, On-site Lead, Actual Value, Tab Buttons, Division Icons */}
      <div className="px-4 pb-4">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <div className="text-xs text-gray-500">Start Date</div>
            <div className="font-medium text-gray-900">{start || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">ETA</div>
            <div className="font-medium text-gray-900">{eta || '—'}</div>
          </div>
          <div className="truncate" title={est}>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900 text-xs">{est ? <UserInline id={est} /> : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-medium text-gray-900">
              {grandTotal > 0 ? `$${grandTotal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : estimatedValue > 0 ? `$${estimatedValue.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>
        {actualValue > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-500">Actual Value</div>
            <div className="font-semibold text-[#7f1010]">${actualValue.toLocaleString()}</div>
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

function UserInline({ id }:{ id:string }){
  const { data } = useQuery({ queryKey:['user-inline', id], queryFn: ()=> api<any>('GET', `/auth/users/${encodeURIComponent(String(id))}/profile`), enabled: !!id, staleTime: 300_000 });
  const fn = data?.profile?.preferred_name || data?.profile?.first_name || '';
  const ln = data?.profile?.last_name || '';
  const label = `${fn} ${ln}`.trim() || '';
  return <span className="font-medium">{label||'—'}</span>;
}


