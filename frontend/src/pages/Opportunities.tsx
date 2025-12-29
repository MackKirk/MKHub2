import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';

type Opportunity = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_end?:string, is_bidding?:boolean, project_division_ids?:string[], cover_image_url?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };

export default function Opportunities(){
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const divisionId = searchParams.get('division_id') || '';
  const statusId = searchParams.get('status') || '';
  const queryParam = searchParams.get('q') || '';
  const clientIdParam = searchParams.get('client_id') || '';
  const dateStartParam = searchParams.get('date_start') || '';
  const dateEndParam = searchParams.get('date_end') || '';
  
  const [q, setQ] = useState(queryParam);
  const [selectedDivision, setSelectedDivision] = useState(divisionId);
  const [selectedStatus, setSelectedStatus] = useState(statusId);
  const [selectedClient, setSelectedClient] = useState(clientIdParam);
  const [dateStart, setDateStart] = useState(dateStartParam);
  const [dateEnd, setDateEnd] = useState(dateEndParam);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  
  // Sync URL params with state when URL changes (e.g., from dashboard navigation)
  useEffect(() => {
    const urlDivision = searchParams.get('division_id') || '';
    const urlStatus = searchParams.get('status') || '';
    const urlQ = searchParams.get('q') || '';
    const urlClient = searchParams.get('client_id') || '';
    const urlDateStart = searchParams.get('date_start') || '';
    const urlDateEnd = searchParams.get('date_end') || '';
    
    if (urlDivision !== selectedDivision) setSelectedDivision(urlDivision);
    if (urlStatus !== selectedStatus) setSelectedStatus(urlStatus);
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
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    setSearchParams(params);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedDivision, selectedStatus, selectedClient, dateStart, dateEnd]);
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (selectedDivision) params.set('division_id', selectedDivision);
    if (selectedStatus) params.set('status', selectedStatus);
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    return params.toString() ? '?' + params.toString() : '';
  }, [q, selectedDivision, selectedStatus, selectedClient, dateStart, dateEnd]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['opportunities', qs], 
    queryFn: ()=> api<Opportunity[]>('GET', `/projects/business/opportunities${qs}`)
  });
  
  // Load project divisions in parallel
  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  
  // Show loading until both opportunities and divisions are loaded
  const isInitialLoading = (isLoading && !data) || (divisionsLoading && !projectDivisions);
  
  const { data: settings } = useQuery({ 
    queryKey:['settings'], 
    queryFn: ()=> api<any>('GET','/settings'), 
    staleTime: 300_000
  });
  
  const reportCategories = (settings?.report_categories || []) as any[];
  
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
  const [reportModalOpen, setReportModalOpen] = useState<{ open:boolean, projectId?:string }|null>(null);

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:projects:write');

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Opportunities</div>
          <div className="text-sm opacity-90">Create, edit and track bids and quotes.</div>
        </div>
        {hasEditPermission && (
          <Link to="/projects/new?is_bidding=true" state={{ backgroundLocation: location }} className="px-4 py-2 rounded bg-white text-brand-red font-semibold">+ New Opportunity</Link>
        )}
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
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Opportunities</label>
                <div className="relative">
                  <input 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent text-gray-900" 
                    placeholder="Search by opportunity name, code, or client name..." 
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                <span>Found {arr.length} opportunit{arr.length !== 1 ? 'ies' : 'y'}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pr-10">
              <button 
                onClick={()=>{
                  setQ('');
                  setSelectedDivision('');
                  setSelectedStatus('');
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
      
      <LoadingOverlay isLoading={isInitialLoading} text="Loading opportunities...">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {arr.map(p => (
            <OpportunityListCard 
              key={p.id} 
              opportunity={p} 
              onOpenReportModal={(projectId) => setReportModalOpen({ open: true, projectId })} 
            />
          ))}
        </div>
        {!isInitialLoading && arr.length === 0 && (
          <div className="p-8 text-center text-gray-500 rounded-xl border bg-white">
            No opportunities found matching your criteria.
          </div>
        )}
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
      {reportModalOpen?.open && reportModalOpen?.projectId && (
        <CreateReportModal
          projectId={reportModalOpen.projectId}
          reportCategories={reportCategories}
          onClose={() => setReportModalOpen(null)}
          onSuccess={async () => {
            setReportModalOpen(null);
            toast.success('Report created successfully');
          }}
        />
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

function CreateReportModal({ projectId, reportCategories, onClose, onSuccess }: {
  projectId: string,
  reportCategories: any[],
  onClose: () => void,
  onSuccess: () => Promise<void>
}){
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { data:project } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<any>('GET', `/projects/${projectId}`) });
  
  // Separate categories into commercial and production based on meta.group
  const commercialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'commercial';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  const productionCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'production';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  // If it's an opportunity (is_bidding), show only commercial categories
  const isBidding = project?.is_bidding === true;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
    // Reset input to allow selecting the same file again
    if (e.target) {
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    
    setUploading(true);
    try {
      const attachments: any[] = [];
      
      // Upload all files
      for (const file of files) {
        const up: any = await api('POST', '/files/upload', {
          project_id: projectId,
          client_id: project?.client_id || null,
          employee_id: null,
          category_id: 'project-report',
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob'
          },
          body: file
        });
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: file.size,
          checksum_sha256: 'na',
          content_type: file.type || 'application/octet-stream'
        });
        attachments.push({
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        });
      }
      
      await api('POST', `/projects/${projectId}/reports`, {
        title: title.trim(),
        category_id: category || null,
        description: desc,
        images: attachments.length > 0 ? { attachments } : undefined
      });
      
      setTitle('');
      setCategory('');
      setDesc('');
      setFiles([]);
      await onSuccess();
    } catch (_e) {
      toast.error('Failed to create report');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">Create Project Report</h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-white hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-600 block mb-1">Title *</label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Enter report title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Category</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                <option value="">Select category...</option>
                {!isBidding && commercialCategories.length > 0 && (
                  <optgroup label="Commercial">
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {!isBidding && productionCategories.length > 0 && (
                  <optgroup label="Production / Execution">
                    {productionCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </optgroup>
                )}
                {isBidding && commercialCategories.length > 0 && (
                  <>
                    {commercialCategories.map(cat => (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>{cat.label}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Description *</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={6}
                placeholder="Describe what happened, how the day went, or any events on site..."
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 block mb-1">Images (optional - multiple allowed)</label>
              <input
                type="file"
                onChange={handleFileSelect}
                className="w-full border rounded px-3 py-2 text-sm"
                accept="image/*"
                multiple
              />
              {files.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {files.map((file, index) => {
                    const isImage = file.type.startsWith('image/');
                    const previewUrl = isImage ? URL.createObjectURL(file) : null;
                    return (
                      <div key={index} className="relative border rounded-lg overflow-hidden bg-gray-50">
                        {previewUrl ? (
                          <img src={previewUrl} alt={file.name} className="w-full h-32 object-cover" />
                        ) : (
                          <div className="w-full h-32 flex items-center justify-center text-gray-400">
                            📎 {file.name}
                          </div>
                        )}
                        <div className="p-2 bg-white border-t">
                          <div className="text-xs text-gray-600 truncate" title={file.name}>{file.name}</div>
                          <button
                            onClick={() => {
                              if (previewUrl) URL.revokeObjectURL(previewUrl);
                              removeFile(index);
                            }}
                            className="mt-1 text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={uploading}
            className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {uploading ? 'Creating...' : 'Create Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OpportunityListCard({ opportunity, onOpenReportModal }: { 
  opportunity: Opportunity;
  onOpenReportModal: (projectId: string) => void;
}){
  const navigate = useNavigate();
  // Card cover should match General Information: backend now provides cover_image_url with correct priority
  const src = opportunity.cover_image_url || '/ui/assets/placeholders/project.png';
  const { data:details } = useQuery({ queryKey:['opportunity-detail-card', opportunity.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['opportunity-client', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), enabled: !!opportunity.client_id, staleTime: 300_000 });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const status = (opportunity as any).status_label || details?.status_label || '';
  const start = (opportunity.date_start || details?.date_start || opportunity.created_at || '').slice(0,10);
  const estimatedValue = details?.cost_estimated || (opportunity as any).cost_estimated || 0;
  const clientName = client?.display_name || client?.name || '';
  const projectDivIds = (opportunity as any).project_division_ids || details?.project_division_ids || [];
  
  // Check for pending data (mobile-created opportunities may be missing key fields)
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    // Use details if available, otherwise fallback to opportunity data
    const estimatorId = details?.estimator_id;
    const siteId = details?.site_id;
    const hasDivisions = Array.isArray(projectDivIds) && projectDivIds.length > 0;
    
    if (!estimatorId) missing.push('Estimator');
    if (!siteId) missing.push('Site');
    if (!hasDivisions) missing.push('Division');
    
    return missing;
  }, [details, projectDivIds]);
  
  const hasPendingData = missingFields.length > 0;
  
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

  // Tab icons and navigation (for opportunities: files, proposal, estimate, reports)
  const tabButtons = [
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'estimate', icon: '💰', label: 'Estimate', tab: 'estimate' },
    { key: 'reports', icon: '📋', label: 'Report', tab: 'reports' },
  ];

  return (
    <Link 
      to={`/opportunities/${encodeURIComponent(String(opportunity.id))}`} 
      className="group rounded-xl border bg-white hover:shadow-lg transition-all overflow-hidden block flex flex-col h-full relative"
    >
      {/* Status badge at top right */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {hasPendingData && (
          <div className="relative group/pending">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold shadow-md hover:bg-amber-600 transition-colors cursor-help">
              ⚠️
            </div>
            {/* Tooltip showing missing fields */}
            <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/pending:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
              <div className="font-semibold mb-1">Pending Data:</div>
              <div className="space-y-0.5">
                {missingFields.map((field, idx) => (
                  <div key={idx}>• {field}</div>
                ))}
              </div>
              <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
            </div>
          </div>
        )}
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
                    if (btn.key === 'reports') {
                      onOpenReportModal(String(opportunity.id));
                    } else {
                      navigate(`/opportunities/${encodeURIComponent(String(opportunity.id))}?tab=${btn.tab}`);
                    }
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
            <div className={`font-medium ${details?.estimator_id ? 'text-gray-900' : 'text-amber-600'}`}>
              {details?.estimator_id ? (details?.estimator_name || '—') : '⚠️ Not set'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">On-site Lead</div>
            <div className={`font-medium ${details?.onsite_lead_id ? 'text-gray-900' : 'text-gray-400'}`}>
              {details?.onsite_lead_id ? (details?.onsite_lead_name || '—') : '—'}
            </div>
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

