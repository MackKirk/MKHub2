import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';

type Project = { 
  id:string, 
  code?:string, 
  name?:string, 
  slug?:string, 
  client_id?:string, 
  created_at?:string, 
  date_start?:string, 
  date_end?:string, 
  project_division_ids?:string[],
  cover_image_url?:string,
  client_name?:string,
  client_display_name?:string,
  progress?:number,
  status_label?:string,
  estimator_id?:string,
  onsite_lead_id?:string,
  cost_actual?:number,
  service_value?:number,
};
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

// Helper functions for currency formatting (CAD)
const formatCurrency = (value: string): string => {
  if (!value) return '';
  // Remove all non-numeric characters except decimal point
  const numericValue = value.replace(/[^0-9.]/g, '');
  if (!numericValue) return '';
  
  const num = parseFloat(numericValue);
  if (isNaN(num)) return numericValue; // Return raw if can't parse
  
  // Format with Canadian locale
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const parseCurrency = (value: string): string => {
  // Remove currency symbols and keep only numbers and decimal point
  const parsed = value.replace(/[^0-9.]/g, '');
  // Handle multiple decimal points - keep only the first one
  const parts = parsed.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return parsed;
};

export default function Projects(){
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const divisionId = searchParams.get('division_id') || '';
  const statusId = searchParams.get('status') || '';
  const minValue = searchParams.get('min_value') || '';
  const queryParam = searchParams.get('q') || '';
  const clientIdParam = searchParams.get('client_id') || '';
  const dateStartParam = searchParams.get('date_start') || '';
  const dateEndParam = searchParams.get('date_end') || '';
  
  const [q, setQ] = useState(queryParam);
  const [selectedDivision, setSelectedDivision] = useState(divisionId);
  const [selectedStatus, setSelectedStatus] = useState(statusId);
  const [minValueInput, setMinValueInput] = useState(minValue);
  const [minValueDisplay, setMinValueDisplay] = useState(minValue ? formatCurrency(minValue) : '');
  const [minValueFocused, setMinValueFocused] = useState(false);
  const [selectedClient, setSelectedClient] = useState(clientIdParam);
  const [dateStart, setDateStart] = useState(dateStartParam);
  const [dateEnd, setDateEnd] = useState(dateEndParam);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  
  // Sync URL params with state when URL changes (e.g., from dashboard navigation)
  useEffect(() => {
    const urlDivision = searchParams.get('division_id') || '';
    const urlStatus = searchParams.get('status') || '';
    const urlMinValue = searchParams.get('min_value') || '';
    const urlQ = searchParams.get('q') || '';
    const urlClient = searchParams.get('client_id') || '';
    const urlDateStart = searchParams.get('date_start') || '';
    const urlDateEnd = searchParams.get('date_end') || '';
    
    if (urlDivision !== selectedDivision) setSelectedDivision(urlDivision);
    if (urlStatus !== selectedStatus) setSelectedStatus(urlStatus);
    if (urlMinValue !== minValueInput) setMinValueInput(urlMinValue);
    if (urlQ !== q) setQ(urlQ);
    if (urlClient !== selectedClient) setSelectedClient(urlClient);
    if (urlDateStart !== dateStart) setDateStart(urlDateStart);
    if (urlDateEnd !== dateEnd) setDateEnd(urlDateEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-apply filters when they change
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedDivision) params.set('division_id', selectedDivision);
    if (selectedStatus) params.set('status', selectedStatus);
    if (minValueInput) params.set('min_value', minValueInput);
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    setSearchParams(params);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedDivision, selectedStatus, minValueInput, selectedClient, dateStart, dateEnd]);
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedDivision) params.set('division_id', selectedDivision);
    if (selectedStatus) params.set('status', selectedStatus);
    if (minValueInput) params.set('min_value', minValueInput);
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    return params.toString() ? '?' + params.toString() : '';
  }, [q, selectedDivision, selectedStatus, minValueInput, selectedClient, dateStart, dateEnd]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['projects', qs], 
    queryFn: ()=> api<Project[]>('GET', `/projects/business/projects${qs}`)
  });
  
  // Load project divisions in parallel (shared across all cards, no individual loading)
  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  
  // Show loading until both projects and divisions are loaded
  const isInitialLoading = (isLoading && !data) || (divisionsLoading && !projectDivisions);
  
  const { data: settings } = useQuery({ 
    queryKey:['settings'], 
    queryFn: ()=> api<any>('GET','/settings'), 
    staleTime: 300_000
  });
  
  // Get clients for filter
  const { data: clientsData } = useQuery({ 
    queryKey:['clients-for-filter'], 
    queryFn: ()=> api<any>('GET','/clients?limit=500'), 
    staleTime: 300_000
  });
  
  const projectStatuses = settings?.project_statuses || [];
  const clients = clientsData?.items || clientsData || [];
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:projects:write');

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div>
          <div className="text-2xl font-extrabold">Projects</div>
          <div className="text-sm opacity-90">List, search and manage projects.</div>
        </div>
      </div>
      {/* Advanced Search Panel */}
      <div className="mb-3 rounded-xl border bg-white shadow-sm overflow-hidden relative">
        {/* Main Search Bar */}
        {isFiltersCollapsed ? (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-700">Show Filters</div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white border-b">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Projects</label>
                <div className="relative">
                  <input 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent text-gray-900" 
                    placeholder="Search by project name, code, or client name..." 
                    value={q} 
                    onChange={e=>setQ(e.target.value)} 
                    onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex items-end gap-2 pt-6">
                <button 
                  onClick={()=>setShowAdvanced(!showAdvanced)}
                  className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  Advanced Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Filters Row */}
        {!isFiltersCollapsed && (
          <div className="p-4 border-b bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Division</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
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
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={selectedStatus}
                  onChange={e=>setSelectedStatus(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {projectStatuses.map((status: any) => (
                    <option key={status.id} value={status.id}>{status.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Filters (Collapsible) */}
        {!isFiltersCollapsed && showAdvanced && (
          <div className="p-4 bg-gray-50 border-t animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Client</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={selectedClient}
                  onChange={e=>setSelectedClient(e.target.value)}
                >
                  <option value="">All Clients</option>
                  {clients.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.display_name || client.name || client.code || client.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Min Value ($)</label>
                <input 
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  placeholder="$0.00" 
                  value={minValueFocused ? minValueDisplay : (minValueInput ? formatCurrency(minValueInput) : '')}
                  onFocus={() => {
                    setMinValueFocused(true);
                    setMinValueDisplay(minValueInput || '');
                  }}
                  onBlur={() => {
                    setMinValueFocused(false);
                    const parsed = parseCurrency(minValueDisplay);
                    setMinValueInput(parsed);
                    setMinValueDisplay(parsed);
                  }}
                  onChange={e=>{
                    const raw = e.target.value;
                    setMinValueDisplay(raw);
                  }}
                  onKeyDown={e=>{ if(e.key==='Enter') { e.currentTarget.blur(); refetch(); } }} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date (From)</label>
                <input 
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  value={dateStart} 
                  onChange={e=>setDateStart(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">End Date (To)</label>
                <input 
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  value={dateEnd} 
                  onChange={e=>setDateEnd(e.target.value)} 
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isFiltersCollapsed && (
          <div className="p-4 bg-white border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {arr.length > 0 && (
                <span>Found {arr.length} project{arr.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pr-10">
              <button 
                onClick={()=>{
                  setQ('');
                  setSelectedDivision('');
                  setSelectedStatus('');
                  setMinValueInput('');
                  setSelectedClient('');
                  setDateStart('');
                  setDateEnd('');
                  setSearchParams({});
                  refetch();
                }} 
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Collapse/Expand button - bottom right corner */}
        <button
          onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
          title={isFiltersCollapsed ? "Expand filters" : "Collapse filters"}
        >
          <svg 
            className={`w-4 h-4 text-gray-600 transition-transform ${!isFiltersCollapsed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <LoadingOverlay isLoading={isInitialLoading} text="Loading projects...">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 gap-4">
          {isLoading && !arr.length ? (
            <>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
              ))}
            </>
          ) : arr.length > 0 ? (
            arr.map(p => (
              <ProjectListCard key={p.id} project={p} projectDivisions={projectDivisions} />
            ))
          ) : (
            <div className="col-span-2 p-8 text-center text-gray-500 rounded-xl border bg-white">
              No projects found matching your criteria.
            </div>
          )}
        </div>
      </LoadingOverlay>
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

function ProjectListCard({ project, projectDivisions }:{ project: Project, projectDivisions?: any[] }){
  const navigate = useNavigate();
  
  // Use cover image URL from project data (same image as General Information)
  const src = project.cover_image_url || '/ui/assets/placeholders/project.png';
  
  // Use client name from project data
  const clientName = project.client_display_name || project.client_name || '';
  
  // Use project divisions from parent (passed as prop, no individual loading)
  // This prevents "popping" updates after initial render
  // Use only data from backend - no additional queries to prevent "popping"
  const status = project.status_label || '';
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const start = (project.date_start || project.created_at || '').slice(0,10);
  const eta = (project.date_end || '').slice(0,10);
  const est = project.estimator_id || '';
  const lead = project.onsite_lead_id || '';
  const actualValue = project.cost_actual || 0;
  const estimatedValue = project.service_value || 0;
  const projectDivIds = project.project_division_ids || [];
  
  // Get division icons and labels (only if projectDivisions is already loaded)
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
      className="group rounded-xl border bg-white hover:border-gray-200 hover:shadow-md block h-full transition-all relative"
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Top row: thumb + title */}
        <div className="flex gap-4">
          {/* Image (smaller) */}
          <div className="w-24 h-20 flex-shrink-0">
            <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
              <img className="w-full h-full object-cover" src={src} alt={project.name || 'Project'} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 truncate min-w-0">{clientName || 'No client'}</div>
            <div className="min-w-0">
              <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
                {project.name || 'Project'}
              </div>
              <div className="text-xs text-gray-600 break-words">{project.code || '—'}</div>
            </div>

            {/* Icons row (right below code) */}
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {tabButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/projects/${encodeURIComponent(String(project.id))}?tab=${btn.tab}`);
                  }}
                  className="relative group/btn w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 flex items-center justify-center text-xs transition-all hover:scale-[1.05]"
                  title={btn.label}
                >
                  {btn.icon}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none z-20">
                    {btn.label}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm font-semibold text-gray-700 w-12 text-right">{progress}%</span>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Fields (same info as before, simple text) */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Start Date</div>
            <div className="font-medium text-gray-900 truncate">{start || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">ETA</div>
            <div className="font-medium text-gray-900 truncate">{eta || '—'}</div>
          </div>
          <div className="min-w-0 truncate" title={est}>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900 text-xs">{est ? <UserInline id={est} /> : '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-medium text-gray-900 truncate">
              {estimatedValue > 0 ? `$${estimatedValue.toLocaleString()}` : '—'}
            </div>
          </div>
        </div>
        {actualValue > 0 && (
          <div>
            <div className="text-xs text-gray-500">Actual Value</div>
            <div className="font-semibold text-[#7f1010]">${actualValue.toLocaleString()}</div>
          </div>
        )}

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Bottom row: divisions (left) + status (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {divisionIcons.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {divisionIcons.map((div, idx) => (
                  <div key={idx} className="relative group/icon" title={div.label}>
                    <div className="text-xl cursor-pointer hover:scale-110 transition-transform">
                      {div.icon}
                    </div>
                    <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                      {div.label}
                      <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                ))}
                {projectDivIds.length > 5 && (
                  <div className="relative group/icon">
                    <div className="text-sm text-gray-400 cursor-pointer" title={`${projectDivIds.length - 5} more divisions`}>
                      +{projectDivIds.length - 5}
                    </div>
                    <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                      {projectDivIds.length - 5} more divisions
                      <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-400">No division</div>
            )}
          </div>

          <div className="relative flex-shrink-0">
            <span
              className={[
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] leading-4 font-medium border shadow-sm',
                'bg-white/90 backdrop-blur-sm border-gray-200 text-gray-800',
              ].join(' ')}
              title={status}
            >
              <span className="truncate max-w-[10rem]">{status || '—'}</span>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function UserInline({ id }:{ id:string }){
  // Disable query to prevent "popping" - show ID or placeholder instead
  // Can be enabled later if needed, or fetch user names in backend batch
  return <span className="font-medium">—</span>;
}


