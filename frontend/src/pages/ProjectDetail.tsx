import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import EstimateBuilder, { type EstimateBuilderRef } from '@/components/EstimateBuilder';
import ProposalForm from '@/components/ProposalForm';
import { useConfirm } from '@/components/ConfirmProvider';
import CalendarMock from '@/components/CalendarMock';
import DispatchTab from '@/components/DispatchTab';
import OrdersTab from '@/components/OrdersTab';
import { formatDateLocal, getCurrentMonthLocal } from '@/lib/dateUtils';

// Helper function to calculate and format time since status change
function getTimeSinceStatusChange(project: any): string {
  if (!project) return '';
  
  // Don't show timer for certain statuses:
  // - "Refused" for Opportunities (is_bidding = true)
  // - "Finished" for Projects (is_bidding = false)
  const statusLabel = (project as any).status_label || '';
  const isBidding = (project as any).is_bidding || false;
  
  if (isBidding && statusLabel.toLowerCase().trim() === 'refused') {
    return ''; // Don't show timer for Refused opportunities
  }
  
  if (!isBidding && statusLabel.toLowerCase().trim() === 'finished') {
    return ''; // Don't show timer for Finished projects
  }
  
  // Use status_changed_at if available (this is when status was last changed)
  // If status_changed_at is not set, it means status was never changed, so don't show timer
  const statusChangedAt = (project as any).status_changed_at;
  if (!statusChangedAt) return '';
  
  const now = new Date();
  const changedAt = new Date(statusChangedAt);
  
  // Debug: log if the date parsing fails
  if (isNaN(changedAt.getTime())) {
    console.warn('Invalid status_changed_at date:', statusChangedAt);
    return '';
  }
  
  const diffMs = now.getTime() - changedAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffYears > 0) {
    return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  } else if (diffMonths > 0) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  } else if (diffWeeks > 0) {
    return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
  } else if (diffDays > 0) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return 'Just now';
  }
}

// Component to display status timer
function StatusTimer({ project }: { project: any }) {
  const [timeSince, setTimeSince] = useState(getTimeSinceStatusChange(project));
  
  useEffect(() => {
    // Update immediately when project changes
    setTimeSince(getTimeSinceStatusChange(project));
    
    // Then update every minute
    const interval = setInterval(() => {
      setTimeSince(getTimeSinceStatusChange(project));
    }, 60000);
    
    return () => clearInterval(interval);
  }, [project?.status_changed_at, project?.status_label, project?.is_bidding]); // Depend on status fields to trigger updates
  
  if (!timeSince) return null;
  
  return (
    <div className="text-xs text-gray-500 mt-1">
      {timeSince}
    </div>
  );
}

// Helper function to convert 24h time (HH:MM:SS or HH:MM) to 12h format (h:mm AM/PM)
function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === '--:--' || timeStr === '-') return timeStr || '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

// Helper to format date as "day, month dd"
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const month = months[date.getMonth()];
  const day = date.getDate();
  return `${month} ${day}`;
}


// Helper function to format hours and minutes in a readable format (e.g., "8h30min")
function formatHoursMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0h';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h${minutes}min`;
}

type Project = { id:string, code?:string, name?:string, client_id?:string, client_display_name?:string, client_name?:string, address?:string, address_city?:string, address_province?:string, address_country?:string, address_postal_code?:string, description?:string, status_id?:string, division_id?:string, division_ids?:string[], project_division_ids?:string[], estimator_id?:string, onsite_lead_id?:string, division_onsite_leads?:Record<string, string>, contact_id?:string, contact_name?:string, contact_email?:string, contact_phone?:string, date_start?:string, date_eta?:string, date_end?:string, cost_estimated?:number, cost_actual?:number, service_value?:number, progress?:number, site_id?:string, site_name?:string, site_address_line1?:string, site_address_line2?:string, site_city?:string, site_province?:string, site_country?:string, site_postal_code?:string, status_label?:string, status_changed_at?:string, is_bidding?:boolean };
type ProjectFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, category?:string, original_name?:string, uploaded_at?:string };
type Update = { id:string, timestamp?:string, text?:string, images?:any };
type Report = { id:string, title?:string, category_id?:string, division_id?:string, description?:string, images?:any, status?:string, created_at?:string, created_by?:string, financial_value?:number, financial_type?:string, estimate_data?:any, approval_status?:string, approved_by?:string, approved_at?:string };
type Proposal = { id:string, title?:string, order_number?:string, created_at?:string, data?:any };

export default function ProjectDetail(){
  const location = useLocation();
  const nav = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const { data:proj, isLoading } = useQuery({ queryKey:['project', id], queryFn: ()=>api<Project>('GET', `/projects/${id}`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['projectFiles', id], queryFn: ()=>api<ProjectFile[]>('GET', `/projects/${id}/files`) });
  const { data:clientFiles } = useQuery({ queryKey:['clientFilesForContacts-project', proj?.client_id||''], queryFn: ()=> proj?.client_id? api<any[]>('GET', `/clients/${encodeURIComponent(String(proj?.client_id||''))}/files`) : Promise.resolve([]), enabled: !!proj?.client_id });
  const { data:updates, refetch: refetchUpdates } = useQuery({ queryKey:['projectUpdates', id], queryFn: ()=>api<Update[]>('GET', `/projects/${id}/updates`) });
  const { data:reports, refetch: refetchReports } = useQuery({ queryKey:['projectReports', id], queryFn: ()=>api<Report[]>('GET', `/projects/${id}/reports`) });
  const { data:proposals } = useQuery({ queryKey:['projectProposals', id], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(id||''))}`) });
  const { data:projectEstimates } = useQuery({ queryKey:['projectEstimates', id], queryFn: ()=>api<any[]>('GET', `/estimate/estimates?project_id=${encodeURIComponent(String(id||''))}`) });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  // Check for tab query parameter
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|'orders'|null) || null;
  const [tab, setTab] = useState<'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|'orders'|null>(initialTab);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showOnSiteLeadsModal, setShowOnSiteLeadsModal] = useState(false);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const estimateBuilderRef = useRef<EstimateBuilderRef>(null);
  
  // Check user permissions (moved before useEffect that uses them)
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasEditPermission = isAdmin || permissions.has('business:projects:write');
  const canEditEstimate = isAdmin || permissions.has('business:projects:estimate:write');
  const hasAdministratorAccess = isAdmin || permissions.has('users:write');
  
  // Helper to check if user has permission for a tab
  const hasTabPermission = useMemo(() => {
    return (tabKey: string): boolean => {
      if (isAdmin) return true;
      const permissionMap: Record<string, string> = {
        'reports': 'business:projects:reports:read',
        'dispatch': 'business:projects:workload:read',
        'timesheet': 'business:projects:timesheet:read',
        'files': 'business:projects:files:read',
        'proposal': 'business:projects:proposal:read',
        'estimate': 'business:projects:estimate:read',
        'orders': 'business:projects:orders:read',
      };
      const requiredPerm = permissionMap[tabKey];
      return !requiredPerm || permissions.has(requiredPerm);
    };
  }, [isAdmin, permissions]);
  
  // Update tab when URL search params change
  useEffect(() => {
    // Don't check permissions if user data is still loading
    if (me === undefined) {
      return;
    }
    
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'overview'|'general'|'reports'|'dispatch'|'timesheet'|'files'|'photos'|'proposal'|'estimate'|'orders'|null;
    if (tabParam && ['overview','general','reports','dispatch','timesheet','files','photos','proposal','estimate','orders'].includes(tabParam)) {
      // Check permission before setting tab
      if (tabParam === 'overview' || hasTabPermission(tabParam)) {
        setTab(tabParam);
      } else {
        setTab(null);
        toast.error('You do not have permission to access this tab');
      }
    } else {
      setTab(null);
    }
  }, [location.search, hasTabPermission, me]);
  
  const cover = useMemo(()=>{
    const arr = (files||[]) as ProjectFile[];

    // 1) Manual legacy cover (what users were already setting before)
    const legacyPreferredCategories = new Set([
      'project-cover-derived',
      'project-cover',
      'cover',
      'hero-cover',
      'opportunity-cover-derived',
      'opportunity-cover',
    ]);
    const legacy = arr.find(f => legacyPreferredCategories.has(String(f.category||'')) && (f.is_image===true || String(f.content_type||'').startsWith('image/')));
    if (legacy?.file_object_id) return `/files/${legacy.file_object_id}/thumbnail?w=1000`;

    // 2) Manual new field (General Info image picker)
    if ((proj as any)?.image_manually_set && (proj as any)?.image_file_object_id) {
      return `/files/${(proj as any).image_file_object_id}/thumbnail?w=1000`;
    }

    // 3) Synced from proposal (project.image_file_object_id) OR latest proposal cover
    if ((proj as any)?.image_file_object_id) {
      return `/files/${(proj as any).image_file_object_id}/thumbnail?w=1000`;
    }
    const latest = (proposals||[]).slice().sort((a,b)=>{
      const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bd-ad;
    })[0];
    const proposalCoverFo = latest?.data?.cover_file_object_id;
    if (proposalCoverFo) return `/files/${proposalCoverFo}/thumbnail?w=1000`;

    // 4) Default blueprint
    return '/ui/assets/placeholders/project.png';
  }, [files, proj, proposals]);
  const overlayUrl = useMemo(()=>{
    const branding = (settings?.branding||[]) as any[];
    const row = branding.find((i:any)=> ['project_hero_overlay_url','hero_overlay_url','project hero overlay','hero overlay'].includes(String(i.label||'').toLowerCase()));
    return row?.value || '';
  }, [settings]);
  const [overlayResolved, setOverlayResolved] = useState<string>('');
  const [showAuditLogModal, setShowAuditLogModal] = useState(false);
  const [auditLogSection, setAuditLogSection] = useState<'timesheet' | 'reports' | 'schedule' | 'files' | 'photos' | 'proposal' | 'estimate'>('timesheet');
  const [editStatusModal, setEditStatusModal] = useState(false);
  const [editProgressModal, setEditProgressModal] = useState(false);
  const [editProjectNameModal, setEditProjectNameModal] = useState(false);
  const [editSiteModal, setEditSiteModal] = useState(false);
  const [editEstimatorModal, setEditEstimatorModal] = useState(false);
  useEffect(()=>{
    (async()=>{
      try{
        if(!overlayUrl){ setOverlayResolved(''); return; }
        if(overlayUrl.startsWith('/files/')){
          const r:any = await api('GET', overlayUrl);
          setOverlayResolved(r.download_url||'');
        } else {
          setOverlayResolved(overlayUrl);
        }
      }catch{ setOverlayResolved(''); }
    })();
  }, [overlayUrl]);

  // Base available tabs
  const baseAvailableTabs = proj?.is_bidding 
    ? (['overview','reports','files','proposal','estimate'] as const)
    : (['overview','reports','dispatch','timesheet','files','proposal','estimate','orders'] as const);
  
  // Filter tabs based on permissions (only when user data is loaded)
  const availableTabs = useMemo(() => {
    // If user data is still loading, return all base tabs to avoid permission errors
    if (me === undefined) {
      return baseAvailableTabs;
    }
    return baseAvailableTabs.filter(tab => {
      if (tab === 'overview') return true; // Overview is always available
      return hasTabPermission(tab);
    });
  }, [baseAvailableTabs, hasTabPermission, me]);

  const handleTabClick = async (newTab: typeof availableTabs[number]) => {
    // Check permission for the tab being accessed
    if (newTab !== 'overview' && !hasTabPermission(newTab)) {
      toast.error('You do not have permission to access this tab');
      return;
    }
    // If leaving estimate tab and there are unsaved changes, show confirmation
    if (tab === 'estimate' && newTab !== 'estimate' && estimateBuilderRef.current?.hasUnsavedChanges()) {
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes in the Estimate tab. What would you like to do?',
        confirmText: 'Save and Continue',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'confirm') {
        // Save before leaving
        const saved = await estimateBuilderRef.current?.save();
        if (saved) {
          setTab(newTab);
          nav(`${location.pathname}?tab=${newTab}`, { replace: true });
        }
      } else if (result === 'discard') {
        // Discard changes and leave
        setTab(newTab);
        nav(`${location.pathname}?tab=${newTab}`, { replace: true });
      }
      // If cancelled, do nothing (stay on estimate tab)
    } else {
      // No unsaved changes or not leaving estimate tab, proceed normally
      setTab(newTab);
      nav(`${location.pathname}?tab=${newTab}`, { replace: true });
    }
  };

  const handleBackToCards = () => {
    setTab(null);
    nav(location.pathname, { replace: true });
  };

  const estimator = employees?.find((e:any) => String(e.id) === String(proj?.estimator_id));
  const statusLabel = String((proj as any)?.status_label||'').trim();
  const statusColor = ((settings||{}).project_statuses||[]).find((s:any)=>s.label===statusLabel)?.value || '#e5e7eb';

  return (
    <div>
      {/* Title Bar */}
      <div className="mb-4 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">{proj?.is_bidding ? 'Opportunity Information' : 'Project Information'}</div>
        <div className="text-sm opacity-90">{proj?.is_bidding ? 'Overview, files, proposal and estimate.' : 'Overview, files, schedule and contacts.'}</div>
      </div>
      <div className="mb-3">
        <button
          onClick={() => nav(proj?.is_bidding ? '/opportunities' : '/projects')}
          className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center gap-2"
          title={proj?.is_bidding ? 'Back to Opportunities' : 'Back to Projects'}
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm text-gray-700 font-medium">{proj?.is_bidding ? 'Back to Opportunities' : 'Back to Projects'}</span>
        </button>
      </div>

      {/* Hero Section - Based on Mockup */}
      {isHeroCollapsed ? (
        /* Collapsed View - Single Line */
        <div className="mb-4 rounded-xl border bg-white overflow-hidden relative">
          <div className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 truncate">{proj?.name||'—'}</h3>
              </div>
              <div className="flex items-center gap-6 flex-shrink-0 pr-10">
                {/* Progress - only show for projects, not opportunities */}
                {!proj?.is_bidding && (
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${Math.max(0,Math.min(100,Number(proj?.progress||0)))}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right">{Math.max(0,Math.min(100,Number(proj?.progress||0)))}%</span>
                  </div>
                )}
                {/* Estimator */}
                {estimator ? (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs">
                      {(estimator.name||estimator.username||'E')[0].toUpperCase()}
                    </div>
                    <div className="text-sm font-medium text-gray-700">{estimator.name||estimator.username}</div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">—</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Expand button - bottom right corner of card */}
          <button
            onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
            title="Expand"
          >
            <svg 
              className="w-4 h-4 text-gray-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      ) : (
        /* Expanded View - Full Hero Section */
        <div className="mb-4 rounded-xl border bg-white overflow-hidden relative">
          <div className="p-6">
            <div className="flex gap-6 items-start">
              {/* Left Section - Image (not square) */}
              <div className="w-64 h-48 rounded-xl border overflow-hidden flex-shrink-0 group relative">
                <img src={cover} className="w-full h-full object-cover" />
                <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">✏️ Change</button>
              </div>
              
              {/* Middle Section - General Information */}
              <div className="flex-1 min-w-0">
                <div className="mb-4">
                  <h3 className="font-semibold text-lg mb-2">General Information</h3>
                  {proj?.client_id && (
                    <div className="text-sm">
                      <span className="text-gray-600">Customer: </span>
                      <Link 
                        to={`/customers/${encodeURIComponent(String(proj.client_id))}`}
                        className="text-[#7f1010] hover:text-[#a31414] hover:underline font-medium"
                      >
                        {proj?.client_display_name || proj?.client_name || 'View Customer'}
                      </Link>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-gray-600 block">Project Name</label>
                      {hasEditPermission && (
                        <button
                          onClick={() => setEditProjectNameModal(true)}
                          className="text-gray-400 hover:text-[#7f1010] transition-colors"
                          title="Edit Project Name"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-medium break-words">{proj?.name||'—'}</div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 block mb-1">Code</label>
                    <div className="text-sm font-medium">{proj?.code||'—'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-gray-600 block">Site</label>
                      {hasEditPermission && (
                        <button
                          onClick={() => setEditSiteModal(true)}
                          className="text-gray-400 hover:text-[#7f1010] transition-colors"
                          title="Edit Site"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {(() => {
                        const siteName = proj?.site_name;
                        const addressLine1 = proj?.site_address_line1 || proj?.address;
                        const addressLine2 = proj?.site_address_line2;
                        const city = proj?.address_city||proj?.site_city;
                        const province = proj?.address_province||proj?.site_province;
                        const postal = proj?.address_postal_code||proj?.site_postal_code;
                        const country = proj?.address_country||proj?.site_country;
                        
                        // Build full address for tooltip
                        const addressParts = [];
                        if (addressLine1) addressParts.push(addressLine1);
                        if (addressLine2) addressParts.push(addressLine2);
                        if (city) addressParts.push(city);
                        if (province) addressParts.push(province);
                        if (postal) addressParts.push(postal);
                        if (country) addressParts.push(country);
                        const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;
                        
                        // Display name (just site name or fallback)
                        const displayName = siteName || (city && province ? `${city}, ${province}` : city || province || '—');
                        
                        // If we have a full address, show tooltip on hover
                        if (fullAddress && displayName !== '—') {
                          return (
                            <div className="relative group inline-block">
                              <span className="cursor-help underline decoration-dotted decoration-gray-400 hover:decoration-gray-600 transition-colors">
                                {displayName}
                              </span>
                              {/* Tooltip overlay */}
                              <div className="absolute left-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl whitespace-normal max-w-xs opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
                                {siteName && (
                                  <div className="font-semibold mb-1.5 text-white">{siteName}</div>
                                )}
                                <div className="text-gray-200 leading-relaxed">{fullAddress}</div>
                                {/* Arrow */}
                                <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 rotate-45"></div>
                              </div>
                            </div>
                          );
                        }
                        
                        return displayName;
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Progress and Status moved here */}
                <div className={proj?.is_bidding ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <label className="text-xs text-gray-600 block">Status</label>
                      {hasEditPermission && (
                        <button
                          onClick={() => setEditStatusModal(true)}
                          className="text-gray-400 hover:text-[#7f1010] transition-colors"
                          title="Edit Status"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <span className="px-3 py-1.5 rounded text-sm font-medium inline-block" style={{ backgroundColor: statusColor, color: '#000' }}>{statusLabel||'—'}</span>
                    {statusLabel && <StatusTimer project={proj} />}
                  </div>
                  {/* Progress - only show for projects, not opportunities */}
                  {!proj?.is_bidding && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <label className="text-xs text-gray-600 block">Progress</label>
                        {hasEditPermission && (
                          <button
                            onClick={() => setEditProgressModal(true)}
                            className="text-gray-400 hover:text-[#7f1010] transition-colors"
                            title="Edit Progress"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${Math.max(0,Math.min(100,Number(proj?.progress||0)))}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-12 text-right">{Math.max(0,Math.min(100,Number(proj?.progress||0)))}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Right Section - Estimator, On-site Leads, ETA */}
              <div className="w-80 flex-shrink-0">
                <div className="mb-6">
                  <div className="flex items-center gap-1.5 mb-2">
                    <label className="text-xs text-gray-600 block">Estimator</label>
                    {hasEditPermission && (
                      <button
                        onClick={() => setEditEstimatorModal(true)}
                        className="text-gray-400 hover:text-[#7f1010] transition-colors"
                        title="Edit Estimator"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {estimator ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold">
                        {(estimator.name||estimator.username||'E')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{estimator.name||estimator.username}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">—</div>
                  )}
                </div>

                {!proj?.is_bidding && (
                  <div className="mb-6">
                    <label className="text-xs text-gray-600 block mb-2">On-site Leads</label>
                    <button
                      onClick={() => setShowOnSiteLeadsModal(true)}
                      className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2"
                    >
                      <span>Manage On-site Leads</span>
                      {proj?.division_onsite_leads && Object.keys(proj.division_onsite_leads).length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                          {Object.keys(proj.division_onsite_leads).length}
                        </span>
                      )}
                    </button>
                  </div>
                )}

                {/* Project Divisions */}
                <ProjectDivisionsHeroSection projectId={String(id)} proj={proj} hasEditPermission={hasEditPermission} />
                
                {proj?.date_eta && (
                  <div>
                    <label className="text-xs text-gray-600 block mb-2">ETA</label>
                    <div className="text-sm font-medium text-gray-900">{proj.date_eta.slice(0,10)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Collapse button - bottom right corner of card */}
          <button
            onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
            title="Collapse"
          >
            <svg 
              className="w-4 h-4 text-gray-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Tab Cards */}
      {!tab && (
        <>
          <div className="mb-4">
            <ProjectTabCards availableTabs={availableTabs} onTabClick={handleTabClick} proj={proj} />
          </div>

          {/* Calendar and Costs Cards */}
          {!proj?.is_bidding && (
            <>
              <div className="mb-4 grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-3">Workload</h4>
                  <CalendarMock title="Project Calendar" projectId={String(id)} hasEditPermission={hasEditPermission} />
                </div>
                <div className="rounded-xl border bg-white p-4">
                  <h4 className="font-semibold mb-3">Costs Summary</h4>
                  <ProjectCostsSummary projectId={String(id)} estimates={projectEstimates||[]} />
                </div>
              </div>
              
              {/* Last Reports and Project Team Cards */}
              <div className="mb-4 grid md:grid-cols-2 gap-4">
                <LastReportsCard reports={reports||[]} />
                <ProjectTeamCard projectId={String(id)} employees={employees||[]} />
              </div>
            </>
          )}
        </>
      )}

      {/* Convert to Project Button (for opportunities) */}
      {!tab && proj?.is_bidding && hasEditPermission && (() => {
        // Check if all required fields are filled
        const hasName = !!proj?.name?.trim();
        const hasSite = !!proj?.site_id;
        const hasEstimator = !!proj?.estimator_id;
        const hasDivisions = Array.isArray(proj?.project_division_ids) && proj.project_division_ids.length > 0;
        
        const isComplete = hasName && hasSite && hasEstimator && hasDivisions;
        
        // Build missing fields message
        const missingFields: string[] = [];
        if (!hasName) missingFields.push('Project Name');
        if (!hasSite) missingFields.push('Site');
        if (!hasEstimator) missingFields.push('Estimator');
        if (!hasDivisions) missingFields.push('Project Divisions');
        
        const missingMessage = missingFields.length > 0 
          ? `Please complete the following fields before converting: ${missingFields.join(', ')}`
          : '';
        
        return (
          <div className="mb-4">
            <button 
              onClick={async()=>{
                if (!isComplete) {
                  toast.error(missingMessage);
                  return;
                }
                const result = await confirm({
                  title: 'Convert to Project',
                  message: `Are you sure you want to convert "${proj?.name||'this opportunity'}" to an active project? This will enable all project features including workload, timesheet and orders. Be careful, this action cannot be undone.`,
                  confirmText: 'Convert',
                  cancelText: 'Cancel'
                });
                if (result !== 'confirm') return;
                try {
                  const response = await api('POST', `/projects/${encodeURIComponent(String(id||''))}/convert-to-project`);
                  if (response) {
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ['project', id] }),
                      queryClient.invalidateQueries({ queryKey: ['clientProjects'] }),
                      queryClient.invalidateQueries({ queryKey: ['clientOpportunities'] }),
                      queryClient.invalidateQueries({ queryKey: ['projects'] }),
                      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
                    ]);
                    toast.success('Opportunity converted to project');
                    nav(`/projects/${encodeURIComponent(String(id||''))}`, { replace: true });
                  }
                } catch (e: any) {
                  console.error('Failed to convert opportunity:', e);
                  toast.error(e?.response?.data?.detail || e?.message || 'Failed to convert opportunity');
                }
              }} 
              disabled={!isComplete}
              className={`w-full px-6 py-4 rounded-xl font-semibold text-base shadow-md transition-all duration-200 flex items-center justify-center gap-3 ${
                isComplete 
                  ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white hover:shadow-lg cursor-pointer' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={missingMessage || 'Convert this opportunity to an active project'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span>Convert to Project</span>
            </button>
            {!isComplete && (
              <p className="mt-2 text-xs text-gray-600 text-center">
                {missingMessage}
              </p>
            )}
          </div>
        );
      })()}

      {/* Danger Zone */}
      {!tab && hasAdministratorAccess && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900 mb-3">Danger Zone</h3>
          <div className="flex gap-3">
            <button onClick={async()=>{
              const result = await confirm({ 
                title: proj?.is_bidding ? 'Delete Opportunity' : 'Delete Project', 
                message: `Are you sure you want to delete "${proj?.name||(proj?.is_bidding ? 'this opportunity' : 'this project')}"? This action cannot be undone.${proj?.is_bidding ? '' : ' All related data (updates, reports, timesheets) will also be deleted.'}`,
                confirmText: 'Delete',
                cancelText: 'Cancel'
              });
              if (result !== 'confirm') return;
              try{
                await api('DELETE', `/projects/${encodeURIComponent(String(id||''))}`);
                toast.success(proj?.is_bidding ? 'Opportunity deleted' : 'Project deleted');
                if(proj?.client_id){
                  nav(`/customers/${encodeURIComponent(String(proj?.client_id))}`);
                } else {
                  nav(proj?.is_bidding ? '/opportunities' : '/projects');
                }
              }catch(_e){ toast.error(proj?.is_bidding ? 'Failed to delete opportunity' : 'Failed to delete project'); }
            }} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium">{proj?.is_bidding ? 'Delete Opportunity' : 'Delete Project'}</button>
            <button 
              onClick={() => setShowAuditLogModal(true)}
              className="px-4 py-2 rounded border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-medium"
            >
              Audit Log
            </button>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {isLoading? <div className="h-24 bg-gray-100 animate-pulse rounded"/> : (
        <>
          {tab ? (
            // Show tab content
            <>
              {tab==='overview' && (
                <div className="grid md:grid-cols-3 gap-4">
                  <ProjectGeneralInfoCard projectId={String(id)} proj={proj||{}} files={files||[]} />
                  <ProjectQuickEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                  <ProjectContactCard projectId={String(id)} proj={proj||{}} clientId={proj?.client_id ? String(proj.client_id) : undefined} clientFiles={clientFiles||[]} />
                  <div className="rounded-xl border bg-white p-4">
                    <h4 className="font-semibold mb-2">Estimated Time of Completion</h4>
                    <ProjectEtaEdit projectId={String(id)} proj={proj||{}} settings={settings||{}} />
                  </div>
                  <ProjectCostsSummary projectId={String(id)} estimates={projectEstimates||[]} />
                  {!proj?.is_bidding && (
                    <div className="md:col-span-3 rounded-xl border bg-white p-4">
                      <h4 className="font-semibold mb-2">Workload</h4>
                      <CalendarMock title="Project Calendar" projectId={String(id)} hasEditPermission={hasEditPermission} />
                    </div>
                  )}
                </div>
              )}

              {tab==='reports' && (
                <ReportsTabEnhanced projectId={String(id)} items={reports||[]} onRefresh={refetchReports} />
              )}

              {tab==='dispatch' && (
                <DispatchTab projectId={String(id)} statusLabel={proj?.status_label||''} />
              )}

              {tab==='timesheet' && (
                <TimesheetTab projectId={String(id)} statusLabel={proj?.status_label||''} />
              )}

              {tab==='files' && (
                <ProjectFilesTabEnhanced projectId={String(id)} files={files||[]} onRefresh={refetchFiles} />
              )}

              {tab==='proposal' && (
                <ProjectProposalTab projectId={String(id)} clientId={String(proj?.client_id||'')} siteId={String(proj?.site_id||'')} proposals={proposals||[]} statusLabel={proj?.status_label||''} settings={settings||{}} />
              )}

              {tab==='estimate' && (
                <div className="space-y-4">
                  {/* Minimalist header */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleBackToCards}
                        className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
                        title="Back to Overview"
                      >
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                      </button>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Estimate</h3>
                        <p className="text-xs text-gray-500">Cost estimates and budgets</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="rounded-xl border bg-white p-4">
                    <EstimateBuilder ref={estimateBuilderRef} projectId={String(id)} statusLabel={proj?.status_label||''} settings={settings||{}} isBidding={proj?.is_bidding} canEdit={canEditEstimate} />
                  </div>
                </div>
              )}

              {tab==='orders' && (
                <OrdersTab projectId={String(id)} project={proj||{id: String(id)}} statusLabel={proj?.status_label||''} />
              )}
            </>
          ) : null}
        </>
      )}

      {showOnSiteLeadsModal && !proj?.is_bidding && (
        <OnSiteLeadsModal
          projectId={String(id||'')}
          originalDivisions={Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []}
          divisionLeads={proj?.division_onsite_leads || {}}
          settings={settings||{}}
          projectDivisions={projectDivisions||[]}
          employees={employees||[]}
          canEdit={hasEditPermission}
          onClose={() => setShowOnSiteLeadsModal(false)}
          onUpdate={async (updatedLeads, updatedDivisions) => {
            try {
              await api('PATCH', `/projects/${encodeURIComponent(String(id||''))}`, { 
                division_onsite_leads: updatedLeads
                // Note: updatedDivisions is not used anymore since divisions come from project_division_ids
              });
              await queryClient.invalidateQueries({ queryKey: ['project', id] });
              toast.success('On-site leads updated');
            } catch (e: any) {
              toast.error('Failed to update on-site leads');
            }
          }}
        />
      )}

      {pickerOpen && (
        <ImagePicker isOpen={true} onClose={()=>setPickerOpen(false)} clientId={String(proj?.client_id||'')} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id:id, client_id:proj?.client_id||null, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/projects/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
            toast.success('Cover updated');
            await refetchFiles();
            setPickerOpen(false);
          }catch(e){ toast.error('Failed to update cover'); setPickerOpen(false); }
        }} />
      )}

      {/* Audit Log Modal */}
      {showAuditLogModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Audit Log</h2>
              <button 
                onClick={() => setShowAuditLogModal(false)} 
                className="text-2xl font-bold text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden flex">
              {/* Left side - Section buttons */}
              <div className="w-48 border-r bg-gray-50 p-4">
                <div className="space-y-2">
                  {(['timesheet', 'reports', 'schedule', 'files', 'photos', 'proposal', 'estimate'] as const).map((section) => (
                    <button
                      key={section}
                      onClick={() => setAuditLogSection(section)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        auditLogSection === section
                          ? 'bg-blue-100 text-blue-800 font-medium'
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {section[0].toUpperCase() + section.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Right side - Log content */}
              <div className="flex-1 overflow-y-auto p-6">
                {auditLogSection === 'timesheet' && (
                  <TimesheetAuditSection projectId={String(id)} />
                )}
                {auditLogSection === 'reports' && (
                  <div className="text-center text-gray-500 py-8">
                    Reports audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'schedule' && (
                  <div className="text-center text-gray-500 py-8">
                    Workload audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'files' && (
                  <div className="text-center text-gray-500 py-8">
                    Files audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'photos' && (
                  <div className="text-center text-gray-500 py-8">
                    Photos audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'proposal' && (
                  <div className="text-center text-gray-500 py-8">
                    Proposal audit log coming soon...
                  </div>
                )}
                {auditLogSection === 'estimate' && (
                  <div className="text-center text-gray-500 py-8">
                    Estimate audit log coming soon...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editStatusModal && (
        <EditStatusModal
          projectId={String(id)}
          currentStatus={proj?.status_id || ''}
          currentStatusLabel={statusLabel}
          settings={settings}
          isBidding={proj?.is_bidding}
          onClose={() => setEditStatusModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            setEditStatusModal(false);
          }}
        />
      )}

      {/* Edit Progress Modal */}
      {editProgressModal && (
        <EditProgressModal
          projectId={String(id)}
          currentProgress={Number(proj?.progress || 0)}
          onClose={() => setEditProgressModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            setEditProgressModal(false);
          }}
        />
      )}

      {/* Edit Project Name Modal */}
      {editProjectNameModal && (
        <EditProjectNameModal
          projectId={String(id)}
          currentName={proj?.name || ''}
          onClose={() => setEditProjectNameModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            setEditProjectNameModal(false);
          }}
        />
      )}

      {/* Edit Site Modal */}
      {editSiteModal && (
        <EditSiteModal
          projectId={String(id)}
          project={proj}
          onClose={() => setEditSiteModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            setEditSiteModal(false);
          }}
        />
      )}

      {/* Edit Estimator Modal */}
      {editEstimatorModal && (
        <EditEstimatorModal
          projectId={String(id)}
          currentEstimatorId={proj?.estimator_id || ''}
          employees={employees||[]}
          onClose={() => setEditEstimatorModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', id] });
            setEditEstimatorModal(false);
          }}
        />
      )}
    </div>
  );
}

function UpdatesTab({ projectId, items, onRefresh }:{ projectId:string, items: Update[], onRefresh: ()=>any }){
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">New Update</h4>
        <input className="w-full border rounded px-3 py-2 mb-2" placeholder="Category (optional)" value={category} onChange={e=>setCategory(e.target.value)} />
        <textarea className="w-full border rounded px-3 py-2 h-28" placeholder="What happened?" value={text} onChange={e=>setText(e.target.value)} />
        <div className="mt-2 text-right"><button onClick={async()=>{ try{ await api('POST', `/projects/${projectId}/updates`, { text, category }); setText(''); setCategory(''); await onRefresh(); toast.success('Update added'); }catch(_e){ toast.error('Failed'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Add Update</button></div>
      </div>
      <div className="md:col-span-2 rounded-xl border bg-white divide-y">
        {items.length? items.map(u=> (
          <div key={u.id} className="p-3 text-sm flex items-start justify-between">
            <div>
              <div className="text-[11px] text-gray-500">{(u.timestamp||'').slice(0,19).replace('T',' ')}</div>
              <div className="text-gray-800 whitespace-pre-wrap">{u.text||''}</div>
            </div>
            <button onClick={async()=>{ if(!confirm('Delete this update?')) return; try{ await api('DELETE', `/projects/${projectId}/updates/${u.id}`); await onRefresh(); toast.success('Deleted'); }catch(_e){ toast.error('Failed'); } }} className="px-2 py-1 rounded bg-gray-100">Delete</button>
          </div>
        )) : <div className="p-3 text-sm text-gray-600">No updates yet</div>}
      </div>
    </div>
  );
}

function ReportsTabEnhanced({ projectId, items, onRefresh }:{ projectId:string, items: Report[], onRefresh: ()=>any }){
  const confirm = useConfirm();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{file_object_id: string, original_name: string, content_type: string}|null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>(''); // Empty string = all categories
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any>('GET','/employees') });
  
  // Check permissions for reports (using local scope variables)
  const { data: meReports } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdminReports = (meReports?.roles||[]).includes('admin');
  const permissionsReports = new Set(meReports?.permissions || []);
  const canEditReports = isAdminReports || permissionsReports.has('business:projects:reports:write');
  
  const reportCategories = (settings?.report_categories || []) as any[];

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
  
  const financialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'financial';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);

  // Calculate counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Count "All" (total reports)
    counts[''] = items.length;
    // Count by category
    items.forEach(report => {
      const catId = report.category_id || '';
      counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [items]);

  // Filter and sort reports
  const sortedReports = useMemo(() => {
    let filtered = [...items];
    
    // Apply category filter
    if (selectedCategoryFilter) {
      filtered = filtered.filter(r => r.category_id === selectedCategoryFilter);
    }
    
    // Sort by date (newest first)
    return filtered.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [items, selectedCategoryFilter]);

  const selectedReport = useMemo(() => {
    return selectedReportId ? sortedReports.find(r => r.id === selectedReportId) : null;
  }, [selectedReportId, sortedReports]);

  // Auto-select first report if none selected and reports exist
  // Also reset selection if current selected report is not in filtered list
  useEffect(() => {
    if (sortedReports.length > 0) {
      if (!selectedReportId) {
        setSelectedReportId(sortedReports[0].id);
      } else {
        // Check if selected report is still in the filtered list
        const isSelectedReportInList = sortedReports.some(r => r.id === selectedReportId);
        if (!isSelectedReportInList) {
          setSelectedReportId(sortedReports[0].id);
        }
      }
    } else {
      // No reports in filtered list, clear selection
      setSelectedReportId(null);
    }
  }, [sortedReports, selectedReportId]);

  const getPreviewText = (text: string, maxLength: number = 100) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };

  const getAuthorInfo = (createdBy: string | null | undefined) => {
    if (!createdBy || !employees) return { name: 'Unknown', avatar: '/ui/assets/login/logo-light.svg' };
    const author = employees.find((e: any) => e.id === createdBy);
    if (!author) return { name: 'Unknown', avatar: '/ui/assets/login/logo-light.svg' };
    return {
      name: author.name || author.username || 'Unknown',
      avatar: author.profile_photo_file_id ? `/files/${author.profile_photo_file_id}/thumbnail?w=40` : '/ui/assets/login/logo-light.svg'
    };
  };

  const getAttachmentIcon = (contentType: string, originalName: string) => {
    const isImage = contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(originalName);
    if (isImage) return '📷';
    if (contentType?.includes('pdf')) return '📄';
    if (contentType?.includes('word') || /\.(doc|docx)$/i.test(originalName)) return '📝';
    if (contentType?.includes('excel') || /\.(xls|xlsx)$/i.test(originalName)) return '📊';
    return '📎';
  };

  const handleAttachmentClick = async (attachment: any) => {
    try {
      const isImage = attachment.content_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.original_name);
      if (isImage) {
        setPreviewAttachment(attachment);
      } else {
        const r: any = await api('GET', `/files/${attachment.file_object_id}/download`);
        if (r.download_url) {
          window.open(r.download_url, '_blank');
        }
      }
    } catch (e: any) {
      toast.error('Failed to open attachment');
    }
  };

  const location = useLocation();
  const nav = useNavigate();
  const handleBackToOverview = () => {
    nav(location.pathname, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Minimalist header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToOverview}
              className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
              title="Back to Overview"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Project Reports</h3>
              <p className="text-xs text-gray-500">Daily updates and site events</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Category Filter Dropdown */}
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent min-w-[200px]"
            >
              <option value="">All Reports ({categoryCounts[''] || 0})</option>
              {commercialCategories.length > 0 && (
                <optgroup label="📌 Commercial">
                  {commercialCategories.map(cat => {
                    const count = categoryCounts[cat.value || ''] || 0;
                    return (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                        {cat.label} ({count})
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {productionCategories.length > 0 && (
                <optgroup label="📌 Production / Execution">
                  {productionCategories.map(cat => {
                    const count = categoryCounts[cat.value || ''] || 0;
                    return (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                        {cat.label} ({count})
                      </option>
                    );
                  })}
                </optgroup>
              )}
              {financialCategories.length > 0 && (
                <optgroup label="📌 Financial">
                  {financialCategories.map(cat => {
                    const count = categoryCounts[cat.value || ''] || 0;
                    return (
                      <option key={cat.id || cat.value || cat.label} value={cat.value || cat.label}>
                        {cat.label} ({count})
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
            {canEditReports && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2"
              >
                <span>+</span>
                <span>New Report</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left sidebar - Reports list (30%) */}
        <div className="w-[30%] flex flex-col border rounded-xl bg-white overflow-hidden">
          <div className="overflow-y-auto flex-1 divide-y">
            {sortedReports.length ? sortedReports.map(r => {
              const reportDate = r.created_at ? new Date(r.created_at) : null;
              const attachments = r.images?.attachments || [];
              const isSelected = selectedReportId === r.id;
              const authorInfo = getAuthorInfo(r.created_by);
              const preview = getPreviewText(r.description || '');
              
              return (
                <div 
                  key={r.id} 
                  className={`p-3 hover:bg-gray-50 transition-colors cursor-pointer border-l-2 ${
                    isSelected ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent'
                  }`}
                  onClick={() => setSelectedReportId(r.id)}
                >
                  <div className="flex items-start gap-2">
                    <img src={authorInfo.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt={authorInfo.name} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm mb-1 ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
                        {r.title || 'Untitled Report'}
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {authorInfo.name}
                      </div>
                      {preview && (
                        <div className="text-xs text-gray-600 line-clamp-2 mb-1">
                          {preview}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span>
                          {reportDate ? reportDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </span>
                        {attachments.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{attachments.length} 📎</span>
                          </>
                        )}
                        {r.category_id && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px]">
                              {reportCategories.find(c => (c.value || c.label) === r.category_id)?.label || r.category_id}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="p-8 text-center text-gray-500">
                <div className="text-sm mb-2">No reports yet</div>
                {canEditReports && (
                  <div className="text-xs">Click "New Report" to create your first project report</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Report content (70%) */}
        <div className="flex-1 border rounded-xl bg-white overflow-hidden flex flex-col">
          {selectedReport ? (() => {
            const reportDate = selectedReport.created_at ? new Date(selectedReport.created_at) : null;
            const attachments = selectedReport.images?.attachments || [];
            const authorInfo = getAuthorInfo(selectedReport.created_by);
            const categoryLabel = reportCategories.find(c => c.value === selectedReport.category_id)?.label || selectedReport.category_id || 'General';
            
            return (
              <>
                {/* Header */}
                <div className="p-4 border-b bg-gray-50 flex-shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-gray-900 mb-2">
                        {selectedReport.title || 'Untitled Report'}
                      </h2>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <img src={authorInfo.avatar} className="w-8 h-8 rounded-full" alt={authorInfo.name} />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{authorInfo.name}</div>
                            <div className="text-xs text-gray-500">
                              {reportDate ? reportDate.toLocaleDateString('en-US', { 
                                weekday: 'long',
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit', 
                                minute: '2-digit' 
                              }) : ''}
                            </div>
                          </div>
                        </div>
                        {selectedReport.category_id && (
                          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                            {categoryLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedReport.financial_type === 'estimate-changes' && selectedReport.approval_status === 'pending' && canEditReports && (
                        <button
                          onClick={async () => {
                            const result = await confirm({
                              title: 'Approve Estimate Changes',
                              message: `Are you sure you want to approve this Estimate Changes report? The items will be added to the project's estimate.`,
                              confirmText: 'Approve',
                              cancelText: 'Cancel'
                            });
                            if (result !== 'confirm') return;
                            try {
                              await api('POST', `/projects/${projectId}/reports/${selectedReport.id}/approve`);
                              await onRefresh();
                              toast.success('Report approved and items added to estimate');
                            } catch (_e: any) {
                              toast.error(_e.message || 'Failed to approve report');
                            }
                          }}
                          className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-sm flex-shrink-0"
                          title="Approve report"
                        >
                          ✓ Approve
                        </button>
                      )}
                      {selectedReport.financial_type === 'estimate-changes' && selectedReport.approval_status && (
                        <span className={`px-3 py-1.5 rounded text-sm flex-shrink-0 ${
                          selectedReport.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                          selectedReport.approval_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {selectedReport.approval_status === 'approved' ? '✓ Approved' :
                           selectedReport.approval_status === 'pending' ? '⏳ Pending' :
                           'Rejected'}
                        </span>
                      )}
                      {canEditReports && (
                        <button
                          onClick={async () => {
                            const result = await confirm({
                              title: 'Delete Report',
                              message: `Are you sure you want to delete "${selectedReport.title || 'this report'}"? This action cannot be undone.`,
                              confirmText: 'Delete',
                              cancelText: 'Cancel'
                            });
                            if (result !== 'confirm') return;
                            try {
                              await api('DELETE', `/projects/${projectId}/reports/${selectedReport.id}`);
                              await onRefresh();
                              setSelectedReportId(null);
                              toast.success('Report deleted');
                            } catch (_e) {
                              toast.error('Failed to delete report');
                            }
                          }}
                          className="px-3 py-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 text-sm flex-shrink-0"
                          title="Delete report"
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                  {/* Financial value display */}
                  {(selectedReport.financial_type === 'additional-income' || selectedReport.financial_type === 'additional-expense') && selectedReport.financial_value !== undefined && (
                    <div className={`mb-4 p-4 rounded-lg border ${
                      selectedReport.financial_type === 'additional-expense' 
                        ? 'bg-red-50 border-red-200' 
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="text-sm font-semibold text-gray-700 mb-1">
                        {selectedReport.financial_type === 'additional-income' ? 'Additional Income' : 'Additional Expense'}
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        ${(selectedReport.financial_value || 0).toFixed(2)}
                      </div>
                    </div>
                  )}
                  
                  {/* Estimate Changes display */}
                  {selectedReport.financial_type === 'estimate-changes' && selectedReport.estimate_data && (() => {
                    const estimateData = selectedReport.estimate_data;
                    const items = estimateData?.items || [];
                    const sectionOrder = estimateData?.section_order || [];
                    const sectionNames = estimateData?.section_names || {};
                    
                    // Calculate item total base (without markup)
                    const calculateItemTotal = (item: any): number => {
                      if (item.item_type === 'labour' && item.labour_journey_type) {
                        if (item.labour_journey_type === 'contract') {
                          return (item.labour_journey || 0) * (item.unit_price || 0);
                        } else {
                          return (item.labour_journey || 0) * (item.labour_men || 0) * (item.unit_price || 0);
                        }
                      }
                      return (item.quantity || 0) * (item.unit_price || 0);
                    };
                    
                    // Calculate item total with markup applied
                    const calculateItemTotalWithMarkup = (item: any): number => {
                      const itemTotal = calculateItemTotal(item);
                      const itemMarkup = item.markup !== undefined && item.markup !== null ? item.markup : (estimateData?.markup || 0);
                      return itemTotal * (1 + (itemMarkup / 100));
                    };
                    
                    const grandTotal = items.reduce((sum: number, item: any) => sum + calculateItemTotalWithMarkup(item), 0);
                    
                    // Group items by section
                    const itemsBySection: Record<string, any[]> = {};
                    items.forEach((item: any) => {
                      const section = item.section || 'other';
                      if (!itemsBySection[section]) {
                        itemsBySection[section] = [];
                      }
                      itemsBySection[section].push(item);
                    });
                    
                    // Get ordered sections
                    const orderedSections = sectionOrder.length > 0 
                      ? sectionOrder.filter((s: string) => itemsBySection[s])
                      : Object.keys(itemsBySection).sort();
                    
                    return (
                      <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-semibold text-gray-700">Estimate Changes Summary</div>
                          {selectedReport.approval_status === 'approved' && (
                            <span className="text-xs text-green-600 font-medium">✓ Items have been added to the project estimate</span>
                          )}
                        </div>
                        
                        {items.length === 0 ? (
                          <div className="text-xs text-gray-500">No items in this estimate change.</div>
                        ) : (
                          <div className="space-y-4">
                            {orderedSections.map((section: string) => {
                              const sectionItems = itemsBySection[section] || [];
                              const sectionName = sectionNames[section] || section || 'Other';
                              const sectionTotal = sectionItems.reduce((sum: number, item: any) => sum + calculateItemTotalWithMarkup(item), 0);
                              
                              return (
                                <div key={section} className="border border-gray-200 rounded bg-white">
                                  <div className="px-3 py-2 bg-gray-100 border-b border-gray-200">
                                    <div className="text-xs font-semibold text-gray-700">{sectionName}</div>
                                  </div>
                                  <div className="divide-y divide-gray-100">
                                    {sectionItems.map((item: any, idx: number) => {
                                      const itemTotal = calculateItemTotalWithMarkup(item);
                                      return (
                                        <div key={idx} className="px-3 py-2">
                                          <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium text-gray-900 mb-1">
                                                {item.name || 'Unnamed Item'}
                                              </div>
                                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                                                <span>
                                                  <span className="font-medium">Qty:</span> {item.quantity || 0} {item.unit || ''}
                                                </span>
                                                {item.item_type === 'labour' && item.labour_journey && (
                                                  <>
                                                    <span>
                                                      <span className="font-medium">Journey:</span> {item.labour_journey} {item.labour_journey_type || 'hours'}
                                                    </span>
                                                    {item.labour_men && item.labour_men > 0 && (
                                                      <span>
                                                        <span className="font-medium">Men:</span> {item.labour_men}
                                                      </span>
                                                    )}
                                                  </>
                                                )}
                                                <span>
                                                  <span className="font-medium">Unit Price:</span> ${(item.unit_price || 0).toFixed(2)}
                                                </span>
                                                {item.item_type && (
                                                  <span>
                                                    <span className="font-medium">Type:</span> {item.item_type}
                                                  </span>
                                                )}
                                                {item.supplier_name && (
                                                  <span>
                                                    <span className="font-medium">Supplier:</span> {item.supplier_name}
                                                  </span>
                                                )}
                                                {item.markup !== undefined && item.markup !== null && item.markup > 0 && (
                                                  <span>
                                                    <span className="font-medium">Markup:</span> {item.markup.toFixed(1)}%
                                                  </span>
                                                )}
                                                {item.taxable && (
                                                  <span className="text-green-600 font-medium">Taxable</span>
                                                )}
                                              </div>
                                              {item.description && (
                                                <div className="text-xs text-gray-500 mt-1 italic">
                                                  {item.description}
                                                </div>
                                              )}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                                              ${itemTotal.toFixed(2)}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {sectionItems.length > 1 && (
                                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex justify-end">
                                      <div className="text-xs font-semibold text-gray-700">
                                        Section Total: ${sectionTotal.toFixed(2)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            
                            <div className="pt-2 border-t border-gray-300">
                              <div className="flex justify-end">
                                <div className="text-sm font-bold text-gray-900">
                                  Grand Total: ${grandTotal.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  
                  <div className="prose max-w-none">
                    <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {selectedReport.description || 'No description provided.'}
                    </div>
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="mt-6 pt-6 border-t">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Attachments ({attachments.length})</h3>
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((a: any, i: number) => (
                          <button
                            key={i}
                            onClick={() => handleAttachmentClick(a)}
                            className="flex items-center gap-2 px-3 py-2 rounded border bg-white hover:bg-gray-50 text-sm text-gray-700 transition-colors"
                          >
                            <span className="text-lg">{getAttachmentIcon(a.content_type || '', a.original_name || '')}</span>
                            <span>{a.original_name || 'attachment'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })() : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-lg mb-2">Select a report to view</div>
                <div className="text-sm">Choose a report from the list on the left</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <CreateReportModal
          projectId={projectId}
          reportCategories={reportCategories}
          onClose={() => setShowCreateModal(false)}
          onSuccess={async () => {
            setShowCreateModal(false);
            await onRefresh();
            toast.success('Report created');
          }}
        />
      )}

      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewAttachment(null)}>
          <div className="max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">{previewAttachment.original_name}</h3>
              <button
                onClick={() => setPreviewAttachment(null)}
                className="text-2xl font-bold text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={`/files/${previewAttachment.file_object_id}/thumbnail?w=1200`}
                alt={previewAttachment.original_name}
                className="max-w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateReportModal({ projectId, reportCategories, onClose, onSuccess }: {
  projectId: string,
  reportCategories: any[],
  onClose: () => void,
  onSuccess: () => Promise<void>
}){
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<File|null>(null);
  const [financialValue, setFinancialValue] = useState<number>(0);
  const estimateBuilderRef = useRef<EstimateBuilderRef>(null);
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
  
  const financialCategories = useMemo(() => {
    return reportCategories
      .filter(cat => {
        const meta = cat.meta || {};
        return meta.group === 'financial';
      })
      .sort((a, b) => (a.sort_index || 0) - (b.sort_index || 0));
  }, [reportCategories]);
  
  // If it's an opportunity (is_bidding), show only commercial categories
  const isBidding = project?.is_bidding === true;

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if ((category === 'additional-income' || category === 'additional-expense') && financialValue <= 0) {
      toast.error('Please enter a valid value');
      return;
    }
    if (!desc.trim()) {
      toast.error('Please enter a description');
      return;
    }
    if (category === 'estimate-changes') {
      // Validate estimate has items
      if (!estimateBuilderRef.current) {
        toast.error('Estimate builder not ready');
        return;
      }
      const estimateData = estimateBuilderRef.current.getEstimateData();
      if (!estimateData || !estimateData.items || estimateData.items.length === 0) {
        toast.error('Please add at least one item to the estimate');
        return;
      }
    }
    try {
      let imgMeta: any = undefined;
      if (file) {
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
        imgMeta = {
          file_object_id: conf.id,
          original_name: file.name,
          content_type: file.type || 'application/octet-stream'
        };
      }
      
      // Get estimate data if it's estimate-changes
      let estimateDataPayload: any = undefined;
      if (category === 'estimate-changes') {
        const estimateData = estimateBuilderRef.current?.getEstimateData();
        if (estimateData) {
          // Format estimate data to match backend expectations
          estimateDataPayload = {
            markup: estimateData.markup,
            pst_rate: estimateData.pstRate,
            gst_rate: estimateData.gstRate,
            profit_rate: estimateData.profitRate,
            section_order: estimateData.sectionOrder,
            section_names: estimateData.sectionNames,
            items: estimateData.items.map(it => ({
              material_id: it.material_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              section: it.section,
              description: it.description,
              item_type: it.item_type,
              name: it.name,
              unit: it.unit,
              markup: it.markup,
              taxable: it.taxable,
              qty_required: it.qty_required,
              unit_required: it.unit_required,
              supplier_name: it.supplier_name,
              unit_type: it.unit_type,
              units_per_package: it.units_per_package,
              coverage_sqs: it.coverage_sqs,
              coverage_ft2: it.coverage_ft2,
              coverage_m2: it.coverage_m2,
              labour_journey: it.labour_journey,
              labour_men: it.labour_men,
              labour_journey_type: it.labour_journey_type
            }))
          };
        }
      }
      
      const payload: any = {
        title: title.trim(),
        category_id: category || null,
        description: desc,
        images: imgMeta ? { attachments: [imgMeta] } : undefined
      };
      
      if (category === 'additional-income' || category === 'additional-expense') {
        payload.financial_value = financialValue;
        payload.financial_type = category;
      } else if (category === 'estimate-changes') {
        payload.financial_type = 'estimate-changes';
        payload.estimate_data = estimateDataPayload;
      }
      
      await api('POST', `/projects/${projectId}/reports`, payload);
      setTitle('');
      setCategory('');
      setDesc('');
      setFile(null);
      setFinancialValue(0);
      await onSuccess();
    } catch (_e) {
      toast.error('Failed to create report');
    }
  };

  const isEstimateChanges = category === 'estimate-changes';
  
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl ${isEstimateChanges ? 'max-w-7xl' : 'max-w-2xl'} w-full max-h-[90vh] overflow-hidden flex flex-col`}>
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
                {!isBidding && financialCategories.length > 0 && (
                  <optgroup label="Financial">
                    {financialCategories.map(cat => (
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
            {category === 'additional-income' || category === 'additional-expense' ? (
              <div>
                <label className="text-xs text-gray-600 block mb-1">Value *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Enter amount..."
                  value={financialValue}
                  onChange={e => setFinancialValue(e.target.value ? parseFloat(e.target.value) : 0)}
                />
              </div>
            ) : null}
            {category === 'estimate-changes' ? (
              <div className="border rounded p-4">
                <label className="text-xs text-gray-600 block mb-2">Estimate Changes</label>
                <div className="max-h-[400px] overflow-y-auto">
                  <EstimateBuilder
                    ref={estimateBuilderRef}
                    projectId=""
                    estimateId={undefined}
                    settings={project?.settings}
                    isBidding={project?.is_bidding}
                    canEdit={true}
                    hideFooter={true}
                  />
                </div>
              </div>
            ) : null}
            {category !== 'estimate-changes' && (
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
            )}
            {category === 'estimate-changes' && (
              <div>
                <label className="text-xs text-gray-600 block mb-1">Description *</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows={4}
                  placeholder="Additional notes about these estimate changes..."
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 block mb-1">Attachment (optional)</label>
              <input
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full border rounded px-3 py-2 text-sm"
                accept="image/*,.pdf,.doc,.docx"
              />
              {file && (
                <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
                  <span>📎</span>
                  <span>{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-red-600 hover:text-red-700">×</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded bg-brand-red hover:bg-red-700 text-white text-sm font-medium"
          >
            Create Report
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectFilesTab({ projectId, files, onRefresh }:{ projectId:string, files: ProjectFile[], onRefresh: ()=>any }){
  const [which, setWhich] = useState<'docs'|'pics'>('docs');
  const docs = useMemo(()=> files.filter(f=> !(f.is_image===true) && !String(f.content_type||'').startsWith('image/')), [files]);
  const pics = useMemo(()=> files.filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/')), [files]);
  const [file, setFile] = useState<File|null>(null);
  const iconFor = (f:ProjectFile)=>{
    const name = String(f.original_name||'');
    const ext = (name.includes('.')? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type||'').toLowerCase();
    const is = (x:string)=> ct.includes(x) || ext===x;
    if (is('pdf')) return { label:'PDF', color:'bg-red-500' };
    if (['xlsx','xls','csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label:'XLS', color:'bg-green-600' };
    if (['doc','docx'].includes(ext) || ct.includes('word')) return { label:'DOC', color:'bg-blue-600' };
    if (['ppt','pptx'].includes(ext) || ct.includes('powerpoint')) return { label:'PPT', color:'bg-orange-500' };
    if (['zip','rar','7z'].includes(ext) || ct.includes('zip')) return { label:'ZIP', color:'bg-gray-700' };
    if (is('txt')) return { label:'TXT', color:'bg-gray-500' };
    return { label: (ext||'FILE').toUpperCase().slice(0,4), color:'bg-gray-600' };
  };
  const fetchDownloadUrl = async (fid:string)=>{
    try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; }
  };
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <select className="border rounded px-3 py-2" value={which} onChange={e=>setWhich(e.target.value as any)}>
          <option value="docs">Documents</option>
          <option value="pics">Pictures</option>
        </select>
        <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)} />
        <button onClick={async()=>{
          if(!file) return; try{
            const category = which==='pics'? 'project-photos' : 'project-docs';
            const up:any = await api('POST','/files/upload',{ project_id: projectId, client_id:null, employee_id:null, category_id:category, original_name:file.name, content_type: file.type||'application/octet-stream' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': file.type||'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' }, body: file });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: file.size, checksum_sha256:'na', content_type: file.type||'application/octet-stream' });
            await api('POST', `/projects/${projectId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(category)}&original_name=${encodeURIComponent(file.name)}`);
            toast.success('Uploaded'); setFile(null); await onRefresh();
          }catch(_e){ toast.error('Upload failed'); }
        }} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
      </div>
      {which==='docs' ? (
        <div className="rounded-xl border overflow-hidden divide-y">
          {docs.length? docs.map(f=> {
            const icon = iconFor(f); const name = f.original_name||f.file_object_id;
            return (
              <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded grid place-items-center text-[10px] font-bold text-white ${icon.color}`}>{icon.label}</div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{name}</div>
                    <div className="text-[11px] text-gray-500">{(f.uploaded_at||'').slice(0,10)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async()=>{ const url = await fetchDownloadUrl(f.file_object_id); if(url) window.open(url,'_blank'); }} className="px-2 py-1 rounded bg-gray-100">Download</button>
                </div>
              </div>
            );
          }) : <div className="p-3 text-sm text-gray-600 bg-white">No documents</div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {pics.length? pics.map(f=> (
            <div key={f.id} className="relative group">
              <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=600`} />
              <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
                <button onClick={async()=>{ const url = await fetchDownloadUrl(f.file_object_id); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</button>
              </div>
            </div>
          )) : <div className="text-sm text-gray-600">No pictures</div>}
        </div>
      )}
    </div>
  );
}

function ProjectFilesTabEnhanced({ projectId, files, onRefresh }:{ projectId:string, files: ProjectFile[], onRefresh: ()=>any }){
  const location = useLocation();
  const nav = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{id:string, file:File, progress:number, status:'pending'|'uploading'|'success'|'error', error?:string}>>([]);
  const [previewImage, setPreviewImage] = useState<{ url:string, name:string }|null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  
  // Check permissions for files
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const canEditFiles = isAdmin || permissions.has('business:projects:files:write');
  
  const { data: categories } = useQuery({
    queryKey: ['file-categories'],
    queryFn: ()=>api<any[]>('GET', '/clients/file-categories')
  });
  
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: ()=>api<any>('GET', `/projects/${projectId}`)
  });

  const handleBackToOverview = () => {
    nav(location.pathname, { replace: true });
  };

  // Organize files by category
  const filesByCategory = useMemo(() => {
    const grouped: Record<string, ProjectFile[]> = { 'all': [], 'uncategorized': [] };
    files.forEach(f => {
      const cat = f.category || 'uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped['all'].push(f);
    });
    return grouped;
  }, [files]);

  const currentFiles = useMemo(() => {
    return filesByCategory[selectedCategory] || [];
  }, [filesByCategory, selectedCategory]);

  const iconFor = (f:ProjectFile)=>{
    const name = String(f.original_name||'');
    const ext = (name.includes('.')? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type||'').toLowerCase();
    const is = (x:string)=> ct.includes(x) || ext===x;
    if (is('pdf')) return { label:'PDF', color:'bg-red-500' };
    if (['xlsx','xls','csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label:'XLS', color:'bg-green-600' };
    if (['doc','docx'].includes(ext) || ct.includes('word')) return { label:'DOC', color:'bg-blue-600' };
    if (['ppt','pptx'].includes(ext) || ct.includes('powerpoint')) return { label:'PPT', color:'bg-orange-500' };
    if (['zip','rar','7z'].includes(ext) || ct.includes('zip')) return { label:'ZIP', color:'bg-gray-700' };
    if (is('txt')) return { label:'TXT', color:'bg-gray-500' };
    return { label: (ext||'FILE').toUpperCase().slice(0,4), color:'bg-gray-600' };
  };

  const fetchDownloadUrl = async (fid:string)=>{
    try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; }
  };

  const uploadMultiple = async (fileList: File[], targetCategory?: string) => {
    const category = targetCategory !== undefined 
      ? (targetCategory === 'uncategorized' ? null : targetCategory)
      : (selectedCategory === 'all' || selectedCategory === 'uncategorized' ? undefined : selectedCategory);
    const newQueue = Array.from(fileList).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      file,
      progress: 0,
      status: 'pending' as const
    }));
    setUploadQueue(prev => [...prev, ...newQueue]);

    for (const item of newQueue) {
      try {
        setUploadQueue(prev => prev.map(u => u.id === item.id ? { ...u, status: 'uploading' } : u));
        
        const up: any = await api('POST', '/files/upload', {
          project_id: projectId,
          client_id: project?.client_id || null,
          employee_id: null,
          category_id: 'project-files',
          original_name: item.file.name,
          content_type: item.file.type || 'application/octet-stream'
        });
        
        await fetch(up.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': item.file.type || 'application/octet-stream',
            'x-ms-blob-type': 'BlockBlob'
          },
          body: item.file
        });
        
        const conf: any = await api('POST', '/files/confirm', {
          key: up.key,
          size_bytes: item.file.size,
          checksum_sha256: 'na',
          content_type: item.file.type || 'application/octet-stream'
        });
        
        await api('POST', `/projects/${projectId}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(category || '')}&original_name=${encodeURIComponent(item.file.name)}`);
        
        setUploadQueue(prev => prev.map(u => u.id === item.id ? { ...u, status: 'success', progress: 100 } : u));
      } catch (e: any) {
        setUploadQueue(prev => prev.map(u => u.id === item.id ? { ...u, status: 'error', error: e.message || 'Upload failed' } : u));
      }
    }
    
    await onRefresh();
    setTimeout(() => {
      setUploadQueue(prev => prev.filter(u => !newQueue.find(nq => nq.id === u.id)));
    }, 2000);
  };

  const handleMoveFile = async (fileId: string, newCategory: string) => {
    try {
      await api('PUT', `/projects/${projectId}/files/${fileId}`, {
        category: newCategory === 'uncategorized' ? null : newCategory
      });
      await onRefresh();
      toast.success('File moved');
    } catch (_e) {
      toast.error('Failed to move file');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;
    try {
      await api('DELETE', `/projects/${projectId}/files/${fileId}`);
      await onRefresh();
      toast.success('File deleted');
    } catch (_e) {
      toast.error('Failed to delete file');
    }
  };

  return (
    <div className="space-y-4">
      {/* Minimalist header with back button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToOverview}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Back to Overview"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Project Files</h3>
            <p className="text-xs text-gray-500">Organize files by category</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="flex h-[calc(100vh-300px)]">
          {/* Left Sidebar - Categories */}
          <div className="w-64 border-r bg-gray-50 flex flex-col">
            <div className="p-4 border-b">
              <div className="text-sm font-semibold text-gray-700 mb-2">File Categories</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ${
                  selectedCategory === 'all' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>📁</span>
                  <span>All Files</span>
                  <span className="ml-auto text-xs text-gray-500">({filesByCategory['all']?.length || 0})</span>
                </div>
              </button>
              {(categories || []).map((cat: any) => {
                const count = filesByCategory[cat.id]?.length || 0;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    onDragOver={canEditFiles ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(true);
                    } : undefined}
                    onDragLeave={canEditFiles ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                    } : undefined}
                    onDrop={canEditFiles ? async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDragging(false);
                      
                      // Check if dropping files from system (upload)
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        await uploadMultiple(Array.from(e.dataTransfer.files), cat.id);
                        return;
                      }
                      
                      // Check if moving existing file
                      if (draggedFileId) {
                        await handleMoveFile(draggedFileId, cat.id);
                        setDraggedFileId(null);
                      }
                    } : undefined}
                    className={`w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ${
                      selectedCategory === cat.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                    } ${isDragging ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{cat.icon || '📁'}</span>
                      <span>{cat.name}</span>
                      <span className="ml-auto text-xs text-gray-500">({count})</span>
                    </div>
                  </button>
                );
              })}
              {filesByCategory['uncategorized']?.length > 0 && (
                <button
                  onClick={() => setSelectedCategory('uncategorized')}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-white transition-colors ${
                    selectedCategory === 'uncategorized' ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>📦</span>
                    <span>Uncategorized</span>
                    <span className="ml-auto text-xs text-gray-500">({filesByCategory['uncategorized']?.length || 0})</span>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Right Content Area */}
          <div 
            className={`flex-1 overflow-y-auto p-4 ${isDragging && canEditFiles ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
            onDragOver={canEditFiles ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(true);
            } : undefined}
            onDragLeave={canEditFiles ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
            } : undefined}
            onDrop={canEditFiles ? async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragging(false);
              
              // Check if dropping files from system (upload)
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const category = selectedCategory === 'all' ? undefined : (selectedCategory === 'uncategorized' ? null : selectedCategory);
                await uploadMultiple(Array.from(e.dataTransfer.files), category);
                return;
              }
              
              // Check if moving existing file
              if (draggedFileId && selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
                await handleMoveFile(draggedFileId, selectedCategory);
                setDraggedFileId(null);
              }
            } : undefined}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">
                {selectedCategory === 'all' ? 'All Files' : 
                 selectedCategory === 'uncategorized' ? 'Uncategorized Files' :
                 categories?.find((c: any) => c.id === selectedCategory)?.name || 'Files'}
                <span className="ml-2 text-gray-500">({currentFiles.length})</span>
              </div>
              {canEditFiles && (
                <button
                  onClick={() => setShowUpload(true)}
                  className="px-3 py-1.5 rounded bg-brand-red text-white text-sm"
                >
                  + Upload File
                </button>
              )}
            </div>

            <div className="rounded-lg border overflow-hidden bg-white">
              {currentFiles.length > 0 ? (
                <div className="divide-y">
                  {currentFiles.map((f) => {
                    const icon = iconFor(f);
                    const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                    const name = f.original_name || f.file_object_id;
                    
                    return (
                      <div
                        key={f.id}
                        draggable={canEditFiles}
                        onDragStart={() => canEditFiles && setDraggedFileId(f.id)}
                        onDragEnd={() => setDraggedFileId(null)}
                        className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${canEditFiles ? 'cursor-move' : ''}`}
                      >
                        {isImg ? (
                          <div 
                            className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 cursor-pointer flex-shrink-0"
                            onClick={async () => {
                              try {
                                const r: any = await api('GET', `/files/${f.file_object_id}/download`);
                                const url = r.download_url || '';
                                if (url) {
                                  setPreviewImage({ url, name });
                                }
                              } catch (_e) {
                                toast.error('Preview not available');
                              }
                            }}
                          >
                            <img 
                              src={`/files/${f.file_object_id}/thumbnail?w=64`}
                              alt={name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className={`w-10 h-12 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold select-none flex-shrink-0`}>
                            {icon.label}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{name}</div>
                          <div className="text-[11px] text-gray-500">
                            {(f.uploaded_at || '').slice(0, 10)}
                            {f.category && (
                              <span className="ml-2">• {categories?.find((c: any) => c.id === f.category)?.name || f.category}</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            onClick={async () => {
                              const url = await fetchDownloadUrl(f.file_object_id);
                              if (url) window.open(url, '_blank');
                            }}
                            title="Download"
                            className="p-2 rounded hover:bg-gray-100"
                          >
                            ⬇️
                          </button>
                          {canEditFiles && (
                            <>
                              <button
                                onClick={() => {
                                  const newCat = prompt('Move to category (leave empty for uncategorized):');
                                  if (newCat !== null) {
                                    handleMoveFile(f.id, newCat || 'uncategorized');
                                  }
                                }}
                                title="Move to category"
                                className="p-2 rounded hover:bg-gray-100"
                              >
                                📦
                              </button>
                              <button
                                onClick={() => handleDeleteFile(f.id)}
                                title="Delete"
                                className="p-2 rounded hover:bg-red-50 text-red-600"
                              >
                                🗑️
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-8 text-center text-gray-500">
                  <div className="text-4xl mb-3">📁</div>
                  <div className="text-sm">No files in this category</div>
                  {canEditFiles && (
                    <div className="text-xs mt-1">Drag and drop files here or click "Upload File"</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold mb-2">Upload Files</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600 mb-1">Files (multiple files supported)</div>
                <input
                  type="file"
                  multiple
                  onChange={async (e) => {
                    const fileList = e.target.files;
                    if (fileList && fileList.length > 0) {
                      setShowUpload(false);
                      await uploadMultiple(Array.from(fileList));
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="text-xs text-gray-500">
                You can also drag and drop files directly onto the category area
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowUpload(false)}
                className="px-3 py-2 rounded border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <div className="font-semibold text-sm">Upload Progress</div>
            <button
              onClick={() => setUploadQueue([])}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              Clear
            </button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className="p-3 border-b">
                <div className="flex items-start gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                    <div className="text-[10px] text-gray-500">
                      {(u.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <div className="text-xs">
                    {u.status === 'pending' && '⏳'}
                    {u.status === 'uploading' && '⏳'}
                    {u.status === 'success' && '✅'}
                    {u.status === 'error' && '❌'}
                  </div>
                </div>
                {u.status === 'uploading' && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === 'error' && (
                  <div className="text-[10px] text-red-600 mt-1" title={u.error}>{u.error || 'Upload failed'}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setPreviewImage(null)}>
          <div className="max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">{previewImage.name}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-2xl font-bold text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectProposalTab({ projectId, clientId, siteId, proposals, statusLabel, settings }:{ projectId:string, clientId:string, siteId?:string, proposals: Proposal[], statusLabel:string, settings:any }){
  const queryClient = useQueryClient();
  
  // Check permissions for proposals
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasEditProposalPermission = isAdmin || permissions.has('business:projects:proposal:write');
  
  // Get the first (and only) proposal for this project
  const proposal = (proposals||[])[0];
  
  // Fetch full proposal data if it exists
  const { data: proposalData, isLoading: isLoadingProposal, refetch: refetchProposal } = useQuery({
    queryKey: ['proposal', proposal?.id],
    queryFn: () => proposal?.id ? api<any>('GET', `/proposals/${proposal.id}`) : Promise.resolve(null),
    enabled: !!proposal?.id
  });
  
  // Refetch proposals list when needed
  const { refetch: refetchProposals } = useQuery({ 
    queryKey:['projectProposals', projectId], 
    queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId||''))}`) 
  });
  
  // Check if editing is allowed based on status and permissions
  // Only allow editing if status is "prospecting" AND user has edit permission
  const canEdit = useMemo(()=>{
    if (!hasEditProposalPermission) return false; // No permission = no edit
    if (!statusLabel) return true; // Default to allow if no status
    // Only allow editing if status is "prospecting"
    return statusLabel.toLowerCase() === 'prospecting';
  }, [statusLabel, hasEditProposalPermission]);
  
  const location = useLocation();
  const nav = useNavigate();
  const handleBackToOverview = () => {
    nav(location.pathname, { replace: true });
  };

  return (
    <div className="space-y-4">
      {/* Minimalist header */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToOverview}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Back to Overview"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Proposal</h3>
            <p className="text-xs text-gray-500">Project proposals</p>
          </div>
        </div>
      </div>
      
      {isLoadingProposal && proposal ? (
        <div className="h-24 bg-gray-100 animate-pulse rounded"/>
      ) : (
        <ProposalForm 
          mode={proposal ? 'edit' : 'new'} 
          clientId={clientId} 
          siteId={siteId} 
          projectId={projectId} 
          initial={proposalData || null}
          disabled={!canEdit}
          showRestrictionWarning={!canEdit && !!statusLabel}
          restrictionMessage={!canEdit && statusLabel ? `This project has status "${statusLabel}" which does not allow editing proposals or estimates.` : undefined}
          onSave={async ()=>{
            // Always refetch proposals list after save to get the updated/created proposal
            await refetchProposals();
            // Force refetch of project proposals to ensure UI updates
            queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
            // If we now have a proposal, refetch its full data
            const updatedProposals = await api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId))}`);
            if (Array.isArray(updatedProposals) && updatedProposals.length > 0) {
              const updatedProposal = updatedProposals[0];
              // Invalidate the proposal query to trigger refetch
              queryClient.invalidateQueries({ queryKey: ['proposal', updatedProposal.id] });
              // Force a refetch of the proposal data
              queryClient.refetchQueries({ queryKey: ['proposal', updatedProposal.id] });
            }
            // Also refetch the proposals list query
            queryClient.refetchQueries({ queryKey: ['projectProposals', projectId] });
          }}
        />
      )}
    </div>
  );
}

function ClientName({ clientId }:{ clientId:string }){
  const { data } = useQuery({ queryKey:['client-name', clientId], queryFn: ()=> clientId? api<any>('GET', `/clients/${clientId}`): Promise.resolve(null) });
  const name = data?.display_name || data?.name || clientId || '-';
  return <div className="text-sm text-gray-700">{name}</div>;
}

function AddDivisionDropdown({ divisions, selected, onAdd }:{ divisions:any[], selected:string[], onAdd:(id:string)=>void }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = (divisions||[]).filter((d:any)=>{
    const id = String(d.id||d.label||d.value);
    const txt = (String(d.label||'') + ' ' + String(d.meta?.abbr||'')).toLowerCase();
    return !selected.includes(id) && txt.includes(q.toLowerCase());
  });
  return (
    <div className="relative">
      <button onClick={()=>setOpen(v=>!v)} className="px-2 py-1 rounded-full border text-xs bg-white">+ Add Division</button>
      {open && (
        <div className="absolute z-50 mt-2 w-56 rounded-lg border bg-white shadow-lg p-2">
          <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
          <div className="max-h-56 overflow-auto">
            {list.length? list.map((d:any)=>{
              const id = String(d.id||d.label||d.value);
              const bg = d.meta?.color || '#eef2f7';
              return (
                <button key={id} onClick={()=>{ onAdd(id); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: bg }} />
                  <span className="text-sm">{d.meta?.abbr || d.label}</span>
                </button>
              );
            }) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeSelect({ label, value, onChange, employees }:{ label:string, value?:string, onChange:(v:string)=>void, employees:any[] }){
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const containerRef = useRef<HTMLDivElement|null>(null);
  const current = (employees||[]).find((e:any)=> String(e.id)===String(value||''));
  const filtered = (employees||[]).filter((e:any)=>{
    const t = (String(e.name||'') + ' ' + String(e.username||'')).toLowerCase();
    return t.includes(q.toLowerCase());
  });
  useEffect(()=>{
    if(!open) return;
    const handleClick = (event: MouseEvent)=>{
      if(!containerRef.current) return;
      if(!containerRef.current.contains(event.target as Node)){
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return ()=> document.removeEventListener('mousedown', handleClick);
  }, [open]);
  return (
    <div ref={containerRef}>
      <label className="text-xs text-gray-600">{label}</label>
      <div className="relative">
        <button onClick={()=>setOpen(v=>!v)} className="w-full border rounded px-2 py-1.5 flex items-center gap-2 bg-white">
          {current?.profile_photo_file_id ? (<img src={`/files/${current.profile_photo_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
          <span className="text-sm truncate">{current? (current.name || current.username) : 'Select...'}</span>
        </button>
        {open && (
          <div className="absolute z-50 mt-1 w-72 rounded-lg border bg-white shadow-lg p-2">
            <input className="w-full border rounded px-2 py-1 text-sm mb-2" placeholder="Search" value={q} onChange={e=>setQ(e.target.value)} />
            <div className="max-h-60 overflow-auto">
              {filtered.length? filtered.map((e:any)=> (
                <button key={e.id} onClick={()=>{ onChange(String(e.id)); setOpen(false); setQ(''); }} className="w-full text-left px-2 py-1 rounded flex items-center gap-2 hover:bg-gray-50">
                  {e.profile_photo_file_id ? (<img src={`/files/${e.profile_photo_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full object-cover"/>) : (<span className="w-6 h-6 rounded-full bg-gray-200 inline-block" />)}
                  <span className="text-sm">{e.name || e.username}</span>
                </button>
              )) : <div className="text-sm text-gray-600 px-2 py-1">No results</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimesheetTab({ projectId, statusLabel }:{ projectId:string; statusLabel?: string }){
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const location = useLocation();
  const nav = useNavigate();
  const [month, setMonth] = useState<string>(getCurrentMonthLocal());
  const [userFilter, setUserFilter] = useState<string>('');
  
  // Edit time entry modal state
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [editBreakMinutes, setEditBreakMinutes] = useState<string>('0');
  
  // Fetch project details for confirmation messages
  const { data: projectData } = useQuery({ 
    queryKey: ['project', projectId], 
    queryFn: () => api<Project>('GET', `/projects/${projectId}`) 
  });
  
  // Check if editing is restricted based on status (On Hold and Finished restrict editing for timesheet)
  const isEditingRestricted = useMemo(() => {
    if (!statusLabel) return false;
    const statusLower = String(statusLabel).trim().toLowerCase();
    return statusLower === 'on hold' || statusLower === 'finished';
  }, [statusLabel]);
  
  const handleBackToOverview = () => {
    nav(location.pathname, { replace: true });
  };
  
  const qs = useMemo(()=>{
    const p = new URLSearchParams();
    if (month) p.set('month', month);
    if (userFilter) p.set('user_id', userFilter);
    const s = p.toString();
    return s? ('?'+s): '';
  }, [month, userFilter]);
  const { data, refetch } = useQuery({ queryKey:['timesheet', projectId, qs], queryFn: ()=> api<any[]>(`GET`, `/projects/${projectId}/timesheet${qs}`), refetchInterval: 10000 });
  const entries = data||[];
  const [workDate, setWorkDate] = useState<string>(formatDateLocal(new Date()));
  
  // Get timesheet settings for default break
  const { data: settings } = useQuery({ queryKey:['settings-bundle'], queryFn: ()=>api<Record<string, any[]>>('GET','/settings') });
  const defaultBreakMin = useMemo(() => {
    const timesheetItems = (settings?.timesheet || []) as any[];
    const breakItem = timesheetItems.find((i: any) => i.label === 'default_break_minutes');
    return breakItem?.value ? parseInt(breakItem.value, 10) : 30;
  }, [settings]);
  
  // Fetch all shifts for the project to get break minutes for each entry
  // We need to fetch shifts for the month range to get break minutes
  const monthRange = useMemo(() => {
    if (!month) return null;
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const firstDay = new Date(year, monthNum - 1, 1);
      const lastDay = new Date(year, monthNum, 0);
      return `${formatDateLocal(firstDay)},${formatDateLocal(lastDay)}`;
    } catch {
      return null;
    }
  }, [month]);
  
  const { data: allShifts } = useQuery({
    queryKey: ['dispatch-shifts-all', projectId, monthRange],
    queryFn: () => api<any[]>('GET', `/dispatch/projects/${projectId}/shifts${monthRange ? `?date_range=${monthRange}` : ''}`),
    enabled: !!projectId
  });

  // Timesheet audit logs (read-permitted source used as fallback for View Timesheet users)
  const logsMonth = useMemo(() => {
    const d = String(workDate || '').slice(0, 7);
    if (d) return d;
    return String(month || '').slice(0, 7) || getCurrentMonthLocal();
  }, [workDate, month]);
  const logsQs = useMemo(() => {
    const p = new URLSearchParams();
    if (logsMonth) p.set('month', logsMonth);
    p.set('limit', '500');
    p.set('offset', '0');
    const s = p.toString();
    return s ? ('?' + s) : '';
  }, [logsMonth]);
  const { data: timesheetLogs } = useQuery({
    queryKey: ['timesheetLogsMini', projectId, logsQs],
    queryFn: () => api<any[]>('GET', `/projects/${projectId}/timesheet/logs${logsQs}`),
    enabled: !!projectId
  });
  
  // Create a map of shifts by user_id and work_date for quick lookup
  const shiftsByUserAndDate = useMemo(() => {
    const map: Record<string, any> = {};
    if (allShifts) {
      allShifts.forEach((shift: any) => {
        const key = `${shift.worker_id}_${shift.date}`;
        if (!map[key] || !Array.isArray(map[key])) {
          map[key] = [];
        }
        map[key].push(shift);
      });
    }
    return map;
  }, [allShifts]);

  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });

  // Find latest attendance-related log for a worker/date/type (clock-in / clock-out)
  const findAttendanceLog = useCallback((workerId: any, dateStr: string, type: 'in'|'out') => {
    const logs = (timesheetLogs || []) as any[];
    if (!logs.length || !workerId || !dateStr) return null;
    const day = String(dateStr).slice(0, 10);
    const wantType = type === 'in' ? 'clock-in' : 'clock-out';
    const worker = (employees || []).find((e: any) => String(e.id) === String(workerId));
    const workerName = worker?.name || worker?.username || '';
    const matches = logs.filter((l: any) => {
      const ch = l?.changes || {};
      if (!ch?.attendance_type) return false;
      if (String(ch.attendance_type) !== wantType) return false;
      if (ch.work_date && String(ch.work_date).slice(0, 10) !== day) return false;
      if (ch.worker_id && String(ch.worker_id) === String(workerId)) return true;
      if (workerName && ch.worker_name && String(ch.worker_name).toLowerCase() === String(workerName).toLowerCase()) return true;
      return false;
    });
    if (!matches.length) return null;
    matches.sort((a: any, b: any) => {
      const aT = new Date(a?.changes?.time_entered || a?.changes?.time_selected || a?.timestamp || 0).getTime();
      const bT = new Date(b?.changes?.time_entered || b?.changes?.time_selected || b?.timestamp || 0).getTime();
      return bT - aT;
    });
    return matches[0];
  }, [timesheetLogs, employees]);

  const formatTimeFromIsoToHHMMSSLocal = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}:00`;
  };

  // Read-only derived entries from logs (so View Timesheet users can still see history)
  const displayEntries = useMemo(() => {
    if (entries && entries.length) return entries;
    const logs = (timesheetLogs || []) as any[];
    if (!logs.length) return entries;
    const rows: any[] = [];
    const seen = new Set<string>();

    // Prefer shifts (project-scoped) to build per-worker/day rows
    const keys = Object.keys(shiftsByUserAndDate || {});
    for (const key of keys) {
      const parts = key.split('_');
      const workerId = parts[0];
      const workDateStr = parts.slice(1).join('_');
      if (!workerId || !workDateStr) continue;
      if (month && String(workDateStr).slice(0,7) !== String(month).slice(0,7)) continue;
      if (userFilter && String(userFilter) !== String(workerId)) continue;

      const clockInLog = findAttendanceLog(workerId, workDateStr, 'in');
      const clockOutLog = findAttendanceLog(workerId, workDateStr, 'out');
      if (!clockInLog && !clockOutLog) continue;

      const clockInIso = clockInLog?.changes?.time_selected || clockInLog?.changes?.time_entered || null;
      const clockOutIso = clockOutLog?.changes?.time_selected || clockOutLog?.changes?.time_entered || null;

      let minutes = 0;
      if (clockInIso && clockOutIso) {
        const a = new Date(clockInIso).getTime();
        const b = new Date(clockOutIso).getTime();
        if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) minutes = Math.floor((b - a) / 60000);
      }

      const emp = (employees || []).find((e: any) => String(e.id) === String(workerId));
      const rowId = `attendance-${workerId}-${String(workDateStr).slice(0,10)}`;
      if (seen.has(rowId)) continue;
      seen.add(rowId);

      rows.push({
        id: rowId,
        user_id: workerId,
        user_name: emp?.name || emp?.username || (clockInLog?.changes?.worker_name || clockOutLog?.changes?.worker_name || ''),
        user_avatar_file_id: emp?.profile_photo_file_id || null,
        work_date: String(workDateStr).slice(0,10),
        start_time: formatTimeFromIsoToHHMMSSLocal(clockInIso),
        end_time: formatTimeFromIsoToHHMMSSLocal(clockOutIso),
        minutes,
        break_minutes: 0,
        is_from_attendance: true,
        notes: 'Clock-in via attendance system'
      });
    }

    return rows;
  }, [entries, timesheetLogs, shiftsByUserAndDate, employees, month, userFilter, findAttendanceLog]);

  // Calculate total minutes with break deduction
  // Use break_minutes from backend (already calculated using same function as attendance table)
  const { minutesTotal, breakTotal } = useMemo(() => {
    let total = 0;
    let breakTotal = 0;
    (displayEntries || []).forEach((e: any) => {
      // e.minutes is already net minutes (after break deduction) for attendance entries
      const entryMinutes = Number(e.minutes || 0);
      total += entryMinutes;
      const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? e.break_minutes : 0;
      breakTotal += breakMin;
    });
    return { minutesTotal: total, breakTotal };
  }, [displayEntries]);
  
  const hoursTotalMinutes = minutesTotal; // Already net (after break)
  
  // Get current user info to check if supervisor/admin
  const { data: currentUser } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  
  // Check permissions for timesheet
  const isAdmin = (currentUser?.roles||[]).includes('admin');
  const permissions = new Set(currentUser?.permissions || []);
  const hasEditTimesheetPermission = isAdmin || permissions.has('business:projects:timesheet:write');
  const canEditTimesheet = hasEditTimesheetPermission && !isEditingRestricted;
  const canEditAttendance = isAdmin || permissions.has('hr:attendance:write') || permissions.has('hr:users:edit:timesheet') || permissions.has('users:write');
  
  // Check if user is supervisor or admin
  const isSupervisorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roles = currentUser.roles || [];
    const permissions = currentUser.permissions || [];
    return roles.includes('admin') || roles.includes('supervisor') || permissions.includes('dispatch:write');
  }, [currentUser]);

  // Check if user is on-site lead of the project
  const isOnSiteLead = useMemo(() => {
    if (!currentUser || !projectData) return false;
    const userId = String(currentUser.id);
    
    // Check division_onsite_leads
    if (projectData.division_onsite_leads) {
      for (const divisionId in projectData.division_onsite_leads) {
        const leadId = projectData.division_onsite_leads[divisionId];
        if (String(leadId) === userId) {
          return true;
        }
      }
    }
    
    // Check legacy onsite_lead_id field
    if (projectData.onsite_lead_id && String(projectData.onsite_lead_id) === userId) {
      return true;
    }
    
    return false;
  }, [currentUser, projectData]);

  // In Projects > Timesheet, clock-in/out actions are allowed for admins/supervisors/on-site leads
  // as long as they have attendance edit permissions (or business timesheet write).
  // Also restricted by project status (On Hold and Finished)
  const canProjectClockActions = useMemo(() => {
    if (isEditingRestricted) return false;
    return !!(canEditTimesheet || (canEditAttendance && (isSupervisorOrAdmin || isOnSiteLead)));
  }, [canEditTimesheet, canEditAttendance, isSupervisorOrAdmin, isOnSiteLead, isEditingRestricted]);
  
  // Fetch shifts for the selected date
  const dateRange = useMemo(() => {
    return `${workDate},${workDate}`;
  }, [workDate]);

  const { data: shifts, refetch: refetchShifts } = useQuery({
    queryKey: ['shifts', projectId, dateRange],
    queryFn: async () => {
      try {
        const allShifts = await api<any[]>('GET', `/dispatch/projects/${projectId}/shifts?date_range=${dateRange}`);
        // Return all shifts (not just scheduled) to show all shifts including those with attendances
        return allShifts;
      } catch {
        return [];
      }
    },
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Fetch attendance records for shifts
  const { data: attendances, refetch: refetchAttendances } = useQuery({
    queryKey: ['attendances', projectId, workDate, shifts?.map((s: any) => s.id).join(',')],
    queryFn: async () => {
      if (!shifts || shifts.length === 0) return [];
      try {
        const attendancePromises = shifts.map((shift: any) =>
          api<any[]>('GET', `/dispatch/shifts/${shift.id}/attendance`).catch(() => [])
        );
        const results = await Promise.all(attendancePromises);
        return results.flat();
      } catch {
        return [];
      }
    },
    enabled: !!shifts && shifts.length > 0,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Clock-in/out state
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [clockType, setClockType] = useState<'in' | 'out' | null>(null);
  const [selectedTime, setSelectedTime] = useState<string>(''); // Stores time in 24h format (HH:MM) for backend
  const [selectedHour12, setSelectedHour12] = useState<string>(''); // Stores hour in 12h format (1-12)
  const [selectedMinute, setSelectedMinute] = useState<string>(''); // Stores minute in 5-minute increments (00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55)
  const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM'); // Stores AM/PM
  const [reasonText, setReasonText] = useState<string>('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showClockModal, setShowClockModal] = useState(false);
  const [geofenceStatus, setGeofenceStatus] = useState<{ inside: boolean; distance?: number; radius?: number } | null>(null);
  
  // Manual break time (only for clock out)
  const [insertBreakTime, setInsertBreakTime] = useState<boolean>(false);
  const [breakHours, setBreakHours] = useState<string>('0');
  const [breakMinutes, setBreakMinutes] = useState<string>('0');

  // Haversine distance calculation (same as backend)
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    
    const a =
      Math.sin(deltaPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  };

  // Check if GPS location is inside geofence
  const checkGeofence = (lat: number, lng: number, geofences: any[] | null | undefined) => {
    if (!geofences || geofences.length === 0) {
      setGeofenceStatus(null); // No geofence - don't set status, message won't show
      return;
    }

    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      
      if (distance <= radiusM) {
        setGeofenceStatus({ inside: true, distance: Math.round(distance), radius: radiusM });
        return;
      }
    }
    
    // Find the closest geofence to show distance
    let minDistance = Infinity;
    let closestRadius = 150;
    for (const geofence of geofences) {
      const geofenceLat = parseFloat(geofence.lat);
      const geofenceLng = parseFloat(geofence.lng);
      const radiusM = parseFloat(geofence.radius_m) || 150;
      const distance = haversineDistance(lat, lng, geofenceLat, geofenceLng);
      if (distance < minDistance) {
        minDistance = distance;
        closestRadius = radiusM;
      }
    }
    
    setGeofenceStatus({ inside: false, distance: Math.round(minDistance), radius: closestRadius });
  };

  // Get GPS location
  const getCurrentLocation = (shiftForGeofence?: any): Promise<{ lat: number; lng: number; accuracy: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      setGpsLoading(true);
      setGpsError('');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLoading(false);
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
          };
          setGpsLocation(location);
          
          // Check geofence if shift has geofences
          // Use shiftForGeofence if provided, otherwise use selectedShift
          const shiftToCheck = shiftForGeofence || selectedShift;
          if (shiftToCheck?.geofences && shiftToCheck.geofences.length > 0) {
            checkGeofence(location.lat, location.lng, shiftToCheck.geofences);
          } else {
            setGeofenceStatus(null); // No geofence - don't set status, message won't show
          }
          
          resolve(location);
        },
        (error) => {
          setGpsLoading(false);
          const errorMsg =
            error.code === 1
              ? 'Location permission denied'
              : error.code === 2
              ? 'Location unavailable'
              : error.code === 3
              ? 'Location request timeout'
              : 'Failed to get location';
          setGpsError(errorMsg);
          setGpsLocation(null);
          setGeofenceStatus(null);
          reject(new Error(errorMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Helper function to convert 24h to 12h format
  const convert24hTo12h = (hour24: number): { hour12: number; amPm: 'AM' | 'PM' } => {
    if (hour24 === 0) return { hour12: 12, amPm: 'AM' };
    if (hour24 === 12) return { hour12: 12, amPm: 'PM' };
    if (hour24 < 12) return { hour12: hour24, amPm: 'AM' };
    return { hour12: hour24 - 12, amPm: 'PM' };
  };

  // Helper function to convert 12h to 24h format
  const convert12hTo24h = (hour12: number, amPm: 'AM' | 'PM'): number => {
    if (amPm === 'AM') {
      if (hour12 === 12) return 0;
      return hour12;
    } else {
      if (hour12 === 12) return 12;
      return hour12 + 12;
    }
  };

  // Update selectedTime (24h format) when 12h format changes
  const updateTimeFrom12h = (hour12: string, minute: string, amPm: 'AM' | 'PM') => {
    if (hour12 && minute) {
      const hour12Num = parseInt(hour12, 10);
      if (!isNaN(hour12Num) && hour12Num >= 1 && hour12Num <= 12) {
        const hour24 = convert12hTo24h(hour12Num, amPm);
        const time24h = `${String(hour24).padStart(2, '0')}:${minute}`;
        setSelectedTime(time24h);
      }
    } else {
      // Clear selectedTime if fields are incomplete
      setSelectedTime('');
    }
  };

  // Handle clock-in/out
  const handleClockInOut = async (shift: any, type: 'in' | 'out') => {
    setSelectedShift(shift);
    setClockType(type);
    setReasonText('');
    setGpsError('');
    setGpsLocation(null); // Clear previous location
    setGeofenceStatus(null);
    setInsertBreakTime(false);
    setBreakHours('0');
    setBreakMinutes('0');

    // Set default time to now (rounded to 5 min) in 12h format
    const now = new Date();
    const hour24 = now.getHours();
    const minutes = Math.round(now.getMinutes() / 5) * 5;
    const { hour12, amPm } = convert24hTo12h(hour24);
    
    setSelectedHour12(String(hour12));
    setSelectedMinute(String(minutes).padStart(2, '0'));
    setSelectedAmPm(amPm);
    
    // Also set in 24h format for backend
    const roundedTime = `${String(hour24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSelectedTime(roundedTime);

    // Open modal first so user can see it
    setShowClockModal(true);

    // Try to get GPS location automatically when modal opens
    // Pass shift directly to ensure geofence check uses the correct shift
    setGpsLoading(true);
    try {
      await getCurrentLocation(shift);
    } catch (error) {
      console.warn('GPS location failed:', error);
      // Error is already set by getCurrentLocation, so user will see it in the modal
    } finally {
      setGpsLoading(false);
    }
  };

  // Submit attendance
  const submitAttendance = async () => {
    if (!selectedShift || !clockType) {
      toast.error('Invalid shift or clock type');
      return;
    }

    if (!selectedTime || !selectedTime.includes(':')) {
      toast.error('Please select a time');
      return;
    }

    // Ensure time is in valid format (HH:MM) with 5-minute increments
    const [hours, minutes] = selectedTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes % 5 !== 0 || minutes < 0 || minutes > 59) {
      toast.error('Please select a valid time in 5-minute increments');
      return;
    }

    // Use shift date, not workDate, to ensure correct date is used
    const shiftDate = selectedShift.date; // Format: YYYY-MM-DD
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    const timeSelectedLocal = `${shiftDate}T${timeStr}:00`;

    // Check if user is supervisor/on-site lead doing clock-in/out for another worker
    // This check happens before the 4-minute validation to allow supervisors/on-site leads to set future times
    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
    const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
    // For frontend validation, check both supervisor and on-site lead status
    // Backend will also check on-site lead status, so supervisors and on-site leads can set future times
    const isAuthorizedSupervisor = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;

    // Validate: Allow future times with 4 minute margin
    // This restriction only applies to personal clock-in/out (not when supervisor/on-site lead is clocking in for another worker)
    // When supervisor or on-site lead is clocking in for another worker in Projects > Timesheet, allow any future time
    if (!isAuthorizedSupervisor) {
      // Create date using local timezone explicitly to avoid timezone issues
      const [year, month, day] = shiftDate.split('-').map(Number);
      const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
      const now = new Date();
      const maxFutureMs = 4 * 60 * 1000; // 4 minutes buffer for future times
      if (selectedDateTime.getTime() > (now.getTime() + maxFutureMs)) {
        toast.error('Clock-in/out cannot be more than 4 minutes in the future. Please select a valid time.');
        return;
      }
    }

    // Validate: If clocking out, check that clock-out time is not before or equal to clock-in time
    if (clockType === 'out' && selectedShift) {
      // Find the most recent open clock-in for this shift (one with clock_in_time but no clock_out_time)
      const openClockIn = attendances?.find(
        (a: any) => a.shift_id === selectedShift.id && a.clock_in_time && !a.clock_out_time
      );
      
      if (openClockIn && openClockIn.clock_in_time) {
        const [year, month, day] = shiftDate.split('-').map(Number);
        const selectedDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        const clockInDate = new Date(openClockIn.clock_in_time);
        
        // Compare dates in the same timezone (both are local)
        if (selectedDateTime <= clockInDate) {
          toast.error('Clock-out time must be after clock-in time. Please select a valid time.');
          return;
        }
        
        // Validate break time: break cannot be greater than or equal to total time
        if (insertBreakTime) {
          const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          const totalMinutes = Math.floor((selectedDateTime.getTime() - clockInDate.getTime()) / (1000 * 60));
          
          if (breakTotalMinutes >= totalMinutes) {
            toast.error('Break time cannot be greater than or equal to the total attendance time. Please adjust the break or clock-out time.');
            return;
          }
        }
      }
    }

    // Prepare confirmation message
    const time12h = formatTime12h(timeStr);
    const dateFormatted = formatDate(shiftDate);
    const projectName = projectData?.name || projectData?.code || 'Unknown Project';
    
    // Get worker name if supervisor is doing for another worker
    let workerName = '';
    if (isSupervisorDoingForOther && selectedShift?.worker_id) {
      const worker = employees?.find((e: any) => String(e.id) === String(selectedShift.worker_id));
      workerName = worker?.display_name || worker?.name || 'Unknown Worker';
    }
    
    // Build confirmation message
    let confirmationMessage = '';
    if (clockType === 'out' && selectedShift) {
      // Find the open clock-in for detailed confirmation
      const openClockIn = attendances?.find(
        (a: any) => a.shift_id === selectedShift.id && a.clock_in_time && !a.clock_out_time
      );
      
      if (openClockIn && openClockIn.clock_in_time) {
        // Detailed confirmation for clock-out
        const clockInTime = new Date(openClockIn.clock_in_time);
        // Format clock-in time in local timezone
        const clockInHour = clockInTime.getHours();
        const clockInMin = clockInTime.getMinutes();
        const clockInTime12h = formatTime12h(
          `${String(clockInHour).padStart(2, '0')}:${String(clockInMin).padStart(2, '0')}`
        );
        
        // Calculate break information first
        let breakTotalMinutes = 0;
        let breakInfo = '';
        if (insertBreakTime) {
          breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
          if (breakTotalMinutes > 0) {
            const breakH = Math.floor(breakTotalMinutes / 60);
            const breakM = breakTotalMinutes % 60;
            breakInfo = breakM > 0 ? `Break: ${breakH}h ${breakM}min` : `Break: ${breakH}h`;
          }
        }
        
        // Calculate hours worked
        const [year, month, day] = shiftDate.split('-').map(Number);
        const clockOutDateTime = new Date(year, month - 1, day, hours, minutes, 0);
        const clockInDateTime = new Date(clockInTime);
        const diffMs = clockOutDateTime.getTime() - clockInDateTime.getTime();
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        
        // Subtract break from total minutes to get net hours worked
        const netMinutes = Math.max(0, totalMinutes - breakTotalMinutes);
        const workedHours = Math.floor(netMinutes / 60);
        const workedMinutes = netMinutes % 60;
        const hoursWorkedStr = workedMinutes > 0 ? `${workedHours}h ${workedMinutes}min` : `${workedHours}h`;
        
        // Build message with worker name if supervisor
        const workerInfo = isSupervisorDoingForOther && workerName ? `Worker: ${workerName}\n` : '';
        
        confirmationMessage = `You are about to clock out with the following details:\n\n` +
          `${workerInfo}Date: ${dateFormatted}\n` +
          `Clock In: ${clockInTime12h}\n` +
          `Clock Out: ${time12h}${breakInfo ? `\n${breakInfo}` : ''}\n` +
          `Hours Worked: ${hoursWorkedStr}\n` +
          `Project: ${projectName}\n\n` +
          `Do you want to confirm?`;
      } else {
        // Fallback if no open clock-in found
        if (isSupervisorDoingForOther && workerName) {
          confirmationMessage = `You are about to clock out for ${workerName} on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
        } else {
          confirmationMessage = `You are about to clock out on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
        }
      }
    } else {
      // Simple confirmation for clock-in
      if (isSupervisorDoingForOther && workerName) {
        confirmationMessage = `You are about to clock in for ${workerName} on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
      } else {
        confirmationMessage = `You are about to clock in on ${dateFormatted} at ${time12h} for project ${projectName}.\n\nDo you want to confirm?`;
      }
    }
    
    // Show confirmation dialog
    const confirmationResult = await confirm({
      title: `Confirm Clock-${clockType === 'in' ? 'In' : 'Out'}`,
      message: confirmationMessage,
      confirmText: 'Confirm',
      cancelText: 'Cancel'
    });
    
    if (confirmationResult !== 'confirm') {
      setSubmitting(false);
      return;
    }

    setSubmitting(true);

    try {
      const payload: any = {
        shift_id: selectedShift.id,
        type: clockType,
        time_selected_local: timeSelectedLocal,
      };

      // Add manual break time if checkbox is checked (only for clock out)
      if (clockType === 'out' && insertBreakTime) {
        const breakTotalMinutes = parseInt(breakHours) * 60 + parseInt(breakMinutes);
        payload.manual_break_minutes = breakTotalMinutes;
      }

      // Add GPS location if available
      if (gpsLocation) {
        payload.gps = {
          lat: gpsLocation.lat,
          lng: gpsLocation.lng,
          accuracy_m: gpsLocation.accuracy,
          mocked: false,
        };
      }

      // Check if supervisor or on-site lead is doing for another worker
      const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
      const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
      const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
      const isDoingForOther = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
      
      // Add reason text if provided
      if (isDoingForOther) {
        if (!reasonText || !reasonText.trim() || reasonText.trim().length < 15) {
          toast.error('Reason text is required (minimum 15 characters) when clocking in/out for another user');
          setSubmitting(false);
          return;
        }
        payload.reason_text = reasonText.trim();
      } else if (reasonText && reasonText.trim()) {
        payload.reason_text = reasonText.trim();
      }

      // Use regular attendance endpoint
      const result = await api('POST', '/dispatch/attendance', payload);

      if (result.status === 'approved') {
        toast.success(`Clock-${clockType} approved successfully`);
      } else if (result.status === 'pending') {
        toast.success(`Clock-${clockType} submitted for approval`);
      }

      setSelectedShift(null);
      setClockType(null);
      setSelectedTime('');
      setSelectedHour12('');
      setSelectedMinute('');
      setReasonText('');
      setInsertBreakTime(false);
      setBreakHours('0');
      setBreakMinutes('0');
      setGpsLocation(null);
      setGpsError('');
      setShowClockModal(false);

      // Refetch both shifts and attendances immediately
      await Promise.all([
        refetchShifts(),
        refetchAttendances(),
        refetch()
      ]);
      
      // Invalidate all related queries to ensure UI updates immediately
      queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['timesheetLogsMini', projectId] });
      queryClient.invalidateQueries({ queryKey: ['attendances'] });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    } catch (error: any) {
      console.error('Error submitting attendance:', error);
      // Extract error message from the error object
      let errorMsg = 'Failed to submit attendance';
      if (error.message) {
        errorMsg = error.message;
      } else if (error.response?.data?.detail) {
        errorMsg = error.response.data.detail;
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      toast.error(errorMsg);
      // Log full error for debugging
      console.error('Full error object:', error);
      if (error.response?.data) {
        console.error('Error response:', error.response.data);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Get attendance for a shift - NEW MODEL: Each record is a complete event
  const getAttendanceForShift = (shiftId: string, type: 'in' | 'out'): any => {
    const att = (attendances || []).find((a: any) => a.shift_id === shiftId);
    if (!att) return undefined;
    
    // Return the attendance if it has the requested time field
    if (type === 'in' && att.clock_in_time) return att;
    if (type === 'out' && att.clock_out_time) return att;
    
    // For backward compatibility, check type field
    if (att.type === type) return att;
    
    return undefined;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-800">Approved</span>;
      case 'pending':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">Pending</span>;
      case 'rejected':
        return <span className="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-800">Rejected</span>;
      default:
        return null;
    }
  };

  const csvExport = async()=>{
    try{
      const qs = new URLSearchParams();
      if (month) qs.set('month', month);
      if (userFilter) qs.set('user_id', userFilter);
      const rows:any[] = await api('GET', `/projects/${projectId}/timesheet?${qs.toString()}`);
      const header = ['Date','User','Hours','Break','Hours (after break)','Notes'];
      const csv = [header.join(',')].concat(rows.map(r=> {
        const key = `${r.user_id}_${r.work_date}`;
        const shiftsForEntry = shiftsByUserAndDate[key] || [];
        const breakMin = shiftsForEntry.length > 0 && shiftsForEntry[0].default_break_min 
          ? shiftsForEntry[0].default_break_min 
          : defaultBreakMin;
        const hoursAfterBreak = Math.max(0, (r.minutes || 0) - breakMin);
        return [r.work_date, JSON.stringify(r.user_name||''), (r.minutes/60).toFixed(2), breakMin, formatHoursMinutes(hoursAfterBreak), JSON.stringify(r.notes||'')].join(',');
      })).join('\n');
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `timesheet_${projectId}_${month||'all'}.csv`; a.click(); URL.revokeObjectURL(url);
    }catch(_e){ toast.error('Export failed'); }
  };
  
  return (
    <div className="space-y-4">
      {/* Editing Restricted Warning */}
      {isEditingRestricted && statusLabel && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Editing Restricted:</strong> This project has status "{statusLabel}" which does not allow editing timesheet.
        </div>
      )}
      
      {/* Minimalist header */}
      <div className="mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToOverview}
            className="p-2 rounded-lg border hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Back to Overview"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Timesheet</h3>
            <p className="text-xs text-gray-500">Time tracking and hours</p>
          </div>
        </div>
      </div>
      
      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">Add Time Entry</h4>
        <div className="grid gap-2 text-sm">
          <div><label className="text-xs text-gray-600">Date</label><input type="date" className="w-full border rounded px-3 py-2" value={workDate} onChange={e=>setWorkDate(e.target.value)} /></div>
          
          {/* Clock In/Out for Shifts */}
          {shifts && shifts.length > 0 ? (
            <div>
              <label className="text-xs text-gray-600 mb-2 block font-medium">Clock In/Out</label>
              <div className="space-y-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {shifts.map((shift: any) => {
                  const directClockIn = getAttendanceForShift(shift.id, 'in');
                  const directClockOut = getAttendanceForShift(shift.id, 'out');
                  const clockInLog = !directClockIn ? findAttendanceLog(shift.worker_id, shift.date || workDate, 'in') : null;
                  const clockOutLog = !directClockOut ? findAttendanceLog(shift.worker_id, shift.date || workDate, 'out') : null;
                  const clockIn = directClockIn || (clockInLog ? {
                    status: clockInLog?.changes?.status,
                    source: clockInLog?.changes?.performed_by || clockInLog?.changes?.source || 'system',
                    clock_in_time: clockInLog?.changes?.time_selected || clockInLog?.changes?.time_entered || null,
                    time_selected_utc: clockInLog?.changes?.time_selected || null
                  } : undefined);
                  const clockOut = directClockOut || (clockOutLog ? {
                    status: clockOutLog?.changes?.status,
                    source: clockOutLog?.changes?.performed_by || clockOutLog?.changes?.source || 'system',
                    clock_out_time: clockOutLog?.changes?.time_selected || clockOutLog?.changes?.time_entered || null,
                    time_selected_utc: clockOutLog?.changes?.time_selected || null
                  } : undefined);
                  const canClockIn = !clockIn || clockIn.status === 'rejected';
                  const canClockOut = clockIn && (clockIn.status === 'approved' || clockIn.status === 'pending') && (!clockOut || clockOut.status === 'rejected');
                  const worker = employees?.find((e: any) => e.id === shift.worker_id);

                  return (
                    <div key={shift.id} className="p-2 border rounded bg-gray-50 text-xs">
                      <div className="font-medium mb-1.5 text-gray-900">
                        {formatTime12h(shift.start_time)} - {formatTime12h(shift.end_time)}
                        {shift.job_name && <span className="ml-1 text-gray-500 font-normal">({shift.job_name})</span>}
                        {worker && <span className="ml-1 text-gray-600 font-normal">- {worker.name || worker.username}</span>}
                      </div>
                      <div className="space-y-1 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 w-8">In:</span>
                          {clockIn ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              {getStatusBadge(clockIn.status)}
                              <span className="text-gray-700">
                                {clockIn.clock_in_time ? new Date(clockIn.clock_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 
                                 (clockIn.time_selected_utc ? new Date(clockIn.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--')}
                              </span>
                              {clockIn.source === 'supervisor' && (
                                <span className="text-gray-500 text-[10px]">(Supervisor)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Not clocked in</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 w-8">Out:</span>
                          {clockOut ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              {getStatusBadge(clockOut.status)}
                              <span className="text-gray-700">
                                {clockOut.clock_out_time ? new Date(clockOut.clock_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 
                                 (clockOut.time_selected_utc ? new Date(clockOut.time_selected_utc).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--')}
                              </span>
                              {clockOut.source === 'supervisor' && (
                                <span className="text-gray-500 text-[10px]">(Supervisor)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Not clocked out</span>
                          )}
                        </div>
                      </div>
                      {canProjectClockActions && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleClockInOut(shift, 'in')}
                            disabled={!canClockIn || submitting}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                              canClockIn
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Clock In
                          </button>
                          <button
                            onClick={() => handleClockInOut(shift, 'out')}
                            disabled={!canClockOut || submitting}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                              canClockOut
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Clock Out
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded">
              No shifts scheduled for this date
            </div>
          )}
        </div>
        </div>
        
        <div className="md:col-span-2 rounded-xl border bg-white">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Month</label><input type="month" className="border rounded px-2 py-1" value={month} onChange={e=>{ setMonth(e.target.value); }} /></div>
          <div className="flex items-center gap-2"><label className="text-xs text-gray-600">Employee</label><select className="border rounded px-2 py-1 text-sm" value={userFilter} onChange={e=>setUserFilter(e.target.value)}><option value="">All</option>{(employees||[]).map((emp:any)=> <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>)}</select></div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-700">Total: {formatHoursMinutes(hoursTotalMinutes)} <span className="text-xs text-gray-500">(after break)</span></div>
            <button onClick={csvExport} className="px-2 py-1 rounded bg-gray-100 text-sm">Export CSV</button>
          </div>
        </div>
        <div className="border-t">
          {/* Header row */}
          <div className="px-3 py-2 text-xs font-medium text-gray-600 border-b bg-gray-50 flex items-center gap-3">
            <div className="w-6"></div>
            <div className="w-24">Employee</div>
            <div className="w-12">Date</div>
            <div className="w-20">Time</div>
            <div className="w-20">Hours</div>
            <div className="w-16">Break</div>
            <div className="flex-1">Notes</div>
            <div className="w-24"></div>
          </div>
        </div>
        <div className="divide-y">
          {displayEntries.length? displayEntries.map((e:any)=> {
            const now = new Date();
            const endDt = e.end_time? new Date(`${e.work_date}T${e.end_time}`) : new Date(`${e.work_date}T23:59:00`);
            const created = e.created_at? new Date(e.created_at) : null;
            const future = endDt.getTime() > now.getTime();
            let offIcon = '';
            if(created){
              const wdEnd = new Date(`${e.work_date}T23:59:00`);
              const diffH = (created.getTime()-wdEnd.getTime())/3600000;
              if(diffH>0){ if(diffH<=12) offIcon='🟢'; else if(diffH<=24) offIcon='🟡'; else offIcon='🔴'; }
            }
            const futIcon = future? '⏳' : '';
            // Use break_minutes from backend (already calculated using same function as attendance table)
            // If not provided (for manual entries), use 0
            const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? e.break_minutes : 0;
            // Hours already has break deducted in the backend (e.minutes is net minutes)
            const hoursAfterBreak = e.minutes;
            
            // Format time - use clock_in_time/clock_out_time if from attendance, otherwise use start_time/end_time
            let timeDisplay = '--:-- - --:--';
            if (e.is_from_attendance && e.start_time && e.end_time) {
              // For attendance entries, times are already in HH:MM:SS format
              timeDisplay = `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}`;
            } else if (e.start_time && e.end_time) {
              // For manual entries, use existing format
              timeDisplay = `${formatTime12h(e.start_time)} - ${formatTime12h(e.end_time)}`;
            }
            
            return (
            <div key={e.id} className="px-3 py-2 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                {e.user_avatar_file_id? <img src={`/files/${e.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                <div className="w-24 text-gray-700 truncate">{e.user_name||''}</div>
                <div className="w-12 text-gray-600">{String(e.work_date).slice(5,10)}</div>
                <div className="w-20 text-gray-600">{timeDisplay}</div>
                <div className="w-20 font-medium">{formatHoursMinutes(hoursAfterBreak)}</div>
                <div className="w-16 font-medium">{breakMin > 0 ? `${breakMin}m` : '--'}</div>
                <div className="flex-1 text-gray-600 truncate">{e.notes||''}</div>
                {(futIcon||offIcon) && <span title={future? 'Future time': 'Logged after day end'}>{futIcon}{offIcon}</span>}
                {e.shift_deleted && (
                  <span 
                    className="text-yellow-600 ml-1" 
                    title={e.shift_deleted_by ? `The shift related to this attendance was deleted by ${e.shift_deleted_by}${e.shift_deleted_at ? ` on ${new Date(e.shift_deleted_at).toLocaleDateString()}` : ''}` : 'The shift related to this attendance was deleted'}
                  >
                    <svg className="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </span>
                )}
              </div>
              {(() => {
                const isAttendanceRow = !!e.is_from_attendance;
                const hasAttendanceId = !!e.attendance_id || (typeof e.id === 'string' && e.id.startsWith('attendance_'));
                // Also check editing restriction for attendance rows
                const canModify = isEditingRestricted ? false : (isAttendanceRow ? (canEditAttendance && hasAttendanceId) : canEditTimesheet);
                if (!canModify) return null;
                return (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setEditingEntry(e);
                      // Extract time from HH:MM:SS format to HH:MM
                      const startTime = e.start_time ? e.start_time.slice(0, 5) : '';
                      const endTime = e.end_time ? e.end_time.slice(0, 5) : '';
                      const breakMin = e.break_minutes !== undefined && e.break_minutes !== null ? String(e.break_minutes) : '0';
                      setEditStartTime(startTime);
                      setEditEndTime(endTime);
                      setEditBreakMinutes(breakMin);
                    }} 
                    className="px-2 py-1 rounded bg-gray-100"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={async() => {
                      const result = await confirm({
                        title: 'Delete Time Entry',
                        message: 'Are you sure you want to delete this time entry?',
                        confirmText: 'Delete',
                        cancelText: 'Cancel'
                      });
                      if (result !== 'confirm') return;
                      try {
                        // Attendance rows come from backend with id "attendance_{uuid}".
                        // Log-derived placeholder rows don't have a deletable id; those are hidden by canModify above.
                        await api('DELETE', `/projects/${projectId}/timesheet/${e.id}`);
                        await refetch();
                        await refetchAttendances();
                        await refetchShifts();
                        queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
                        toast.success('Time entry deleted');
                      } catch (err: any) {
                        const msg = String(err?.message || '');
                        if (msg.toLowerCase().includes('do not have permission') || msg.includes('403')) {
                          toast.error('You do not have permission to delete this attendance/time entry');
                        } else {
                          toast.error('Failed to delete time entry');
                        }
                      }
                    }} 
                    className="px-2 py-1 rounded bg-gray-100"
                  >
                    Delete
                  </button>
                </div>
                );
              })()}
            </div>
          );
          }) : <div className="p-3 text-sm text-gray-600">No time entries</div>}
        </div>
        </div>
      </div>
      {/* Edit Time Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">Edit Time Entry</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="time"
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="time"
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Break (minutes)</label>
              <input
                type="number"
                min="0"
                value={editBreakMinutes}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || (!isNaN(Number(val)) && Number(val) >= 0)) {
                    setEditBreakMinutes(val);
                  }
                }}
                className="w-full border rounded px-3 py-2"
                placeholder="0"
              />
              <p className="text-xs text-gray-500 mt-1">Break time in minutes (will be deducted from total hours)</p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setEditingEntry(null);
                  setEditStartTime('');
                  setEditEndTime('');
                  setEditBreakMinutes('0');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editStartTime || !editEndTime) {
                    toast.error('Start time and end time are required');
                    return;
                  }
                  
                  try {
                    // Calculate minutes from start and end time
                    const [startH, startM] = editStartTime.split(':').map(Number);
                    const [endH, endM] = editEndTime.split(':').map(Number);
                    const startMinutes = startH * 60 + startM;
                    const endMinutes = endH * 60 + endM;
                    const minutes = endMinutes - startMinutes;
                    
                    if (minutes <= 0) {
                      toast.error('End time must be after start time');
                      return;
                    }
                    
                    // Validate break: break cannot be greater than or equal to total time
                    const breakMin = editBreakMinutes === '' ? 0 : parseInt(editBreakMinutes, 10);
                    if (isNaN(breakMin) || breakMin < 0) {
                      toast.error('Break minutes must be a valid non-negative number');
                      return;
                    }
                    if (breakMin >= minutes) {
                      toast.error('Break time cannot be greater than or equal to total time');
                      return;
                    }
                    
                    const payload: any = {
                      start_time: `${editStartTime}:00`,
                      end_time: `${editEndTime}:00`,
                      minutes: minutes
                    };
                    
                    // Only include break_minutes if it's a valid number (even if 0)
                    if (!isNaN(breakMin)) {
                      payload.break_minutes = breakMin;
                    }
                    
                    await api('PATCH', `/projects/${projectId}/timesheet/${editingEntry.id}`, payload);
                    
                    await refetch();
                    await refetchAttendances();
                    await refetchShifts();
                    queryClient.invalidateQueries({ queryKey: ['timesheetLogs', projectId] });
                    toast.success('Time entry updated');
                    
                    setEditingEntry(null);
                    setEditStartTime('');
                    setEditEndTime('');
                    setEditBreakMinutes('0');
                  } catch (_e) {
                    toast.error('Failed to update time entry');
                  }
                }}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clock In/Out Modal */}
      {showClockModal && selectedShift && clockType && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              Clock {clockType === 'in' ? 'In' : 'Out'}
            </h3>

            {/* Time selector (12h format with AM/PM) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
              <div className="flex gap-2 items-center">
                <select
                  value={selectedHour12}
                  onChange={(e) => {
                    const hour12 = e.target.value;
                    setSelectedHour12(hour12);
                    updateTimeFrom12h(hour12, selectedMinute, selectedAmPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="">Hour</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </option>
                  ))}
                </select>
                <span className="text-gray-500 font-medium">:</span>
                <select
                  value={selectedMinute}
                  onChange={(e) => {
                    const minute = e.target.value;
                    setSelectedMinute(minute);
                    updateTimeFrom12h(selectedHour12, minute, selectedAmPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="">Min</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = i * 5;
                    return (
                      <option key={m} value={String(m).padStart(2, '0')}>
                        {String(m).padStart(2, '0')}
                      </option>
                    );
                  })}
                </select>
                <select
                  value={selectedAmPm}
                  onChange={(e) => {
                    const amPm = e.target.value as 'AM' | 'PM';
                    setSelectedAmPm(amPm);
                    updateTimeFrom12h(selectedHour12, selectedMinute, amPm);
                  }}
                  className="flex-1 border rounded px-3 py-2"
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            {/* Manual Break Time (only for Clock Out) */}
            {clockType === 'out' && (
              <div>
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={insertBreakTime}
                    onChange={(e) => setInsertBreakTime(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-red focus:ring-brand-red"
                  />
                  <span className="text-sm font-medium text-gray-700">Insert Break Time</span>
                </label>
                {insertBreakTime && (
                  <div className="ml-6 space-y-2">
                    <div className="flex gap-2 items-center">
                      <label className="text-xs text-gray-600 w-12">Hours:</label>
                      <select
                        value={breakHours}
                        onChange={(e) => setBreakHours(e.target.value)}
                        className="flex-1 border rounded px-3 py-2"
                      >
                        {Array.from({ length: 3 }, (_, i) => (
                          <option key={i} value={String(i)}>
                            {i}
                          </option>
                        ))}
                      </select>
                      <label className="text-xs text-gray-600 w-12 ml-2">Minutes:</label>
                      <select
                        value={breakMinutes}
                        onChange={(e) => setBreakMinutes(e.target.value)}
                        className="flex-1 border rounded px-3 py-2"
                      >
                        {Array.from({ length: 12 }, (_, i) => {
                          const m = i * 5;
                          return (
                            <option key={m} value={String(m).padStart(2, '0')}>
                              {String(m).padStart(2, '0')}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* GPS Status */}
            <div>
              {gpsLocation ? (
                <>
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-green-800">✓ Location captured</div>
                        <div className="text-xs text-green-600 mt-1">
                          Accuracy: {Math.round(gpsLocation.accuracy)}m
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => getCurrentLocation(selectedShift)}
                        disabled={gpsLoading}
                        className="text-xs px-2 py-1 rounded border hover:bg-gray-50 bg-white"
                      >
                        {gpsLoading ? 'Getting location...' : 'Try GPS again'}
                      </button>
                    </div>
                  </div>
                  {selectedShift?.geofences && selectedShift.geofences.length > 0 ? (
                    geofenceStatus && (
                      <div className={`p-3 border rounded text-sm mt-2 ${
                        geofenceStatus.inside
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-orange-50 border-orange-200 text-orange-800'
                      }`}>
                        {geofenceStatus.inside ? (
                          <div>
                            <div className="font-medium">✓ Great! You are at the right site to clock-in/out</div>
                            {geofenceStatus.distance !== undefined && (
                              <div className="text-xs mt-1 opacity-75">
                                Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius)
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">ℹ You are not at the correct site</div>
                            {geofenceStatus.distance !== undefined && (
                              <div className="text-xs mt-1 opacity-75">
                                Distance from site: {geofenceStatus.distance}m (within {geofenceStatus.radius}m radius). Location is captured but not mandatory.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800 mt-2">
                      <div className="font-medium">ℹ Location captured (not mandatory)</div>
                      <div className="text-xs mt-1 opacity-75">
                        No geofence is defined for this shift. Your location has been captured but is not mandatory for clock-in/out.
                      </div>
                    </div>
                  )}
                </>
              ) : gpsLoading ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-800"></div>
                    <span>Getting location...</span>
                  </div>
                </div>
              ) : gpsError ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                  {gpsError}
                </div>
              ) : (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-600">
                  No location data
                </div>
              )}
            </div>

            {/* Reason text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason {
                  (() => {
                    // Check if supervisor or on-site lead is doing for another worker
                    const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                    const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                    const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
                    
                    // Require reason if: supervisor or on-site lead doing for other worker
                    const requiresReason = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
                    return requiresReason && <span className="text-red-500">*</span>;
                  })()
                }
              </label>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Describe the reason for this attendance entry..."
                className="w-full border rounded px-3 py-2 h-24"
                minLength={15}
              />
              <p className="text-xs text-gray-500 mt-1">
                {(() => {
                  // Check if supervisor or on-site lead is doing for another worker
                  const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                  const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                  const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
                  const isDoingForOther = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
                  
                  if (isDoingForOther) {
                    return (
                      <span className="text-red-600 font-medium">
                        Required (minimum 15 characters): You must provide a reason when clocking in/out for another user.
                      </span>
                    );
                  }
                  
                  // Check if clock-in/out is on a different day than TODAY or in the future
                  let isDifferentDayFromToday = false;
                  let isFutureTime = false;
                  if (selectedShift && selectedTime && selectedHour12 && selectedMinute) {
                    try {
                      const shiftDate = selectedShift.date; // YYYY-MM-DD
                      const hour24 = selectedAmPm === 'PM' && parseInt(selectedHour12) !== 12 
                        ? parseInt(selectedHour12) + 12 
                        : selectedAmPm === 'AM' && parseInt(selectedHour12) === 12 
                        ? 0 
                        : parseInt(selectedHour12);
                      
                      // Create date using local timezone explicitly to avoid timezone issues
                      const [year, month, day] = shiftDate.split('-').map(Number);
                      const selectedDateTime = new Date(year, month - 1, day, hour24, parseInt(selectedMinute), 0);
                      
                      const now = new Date();
                      const todayStr = formatDateLocal(now);
                      const selectedDateStr = formatDateLocal(selectedDateTime);
                      
                      // Check if selected date is different from TODAY
                      isDifferentDayFromToday = selectedDateStr !== todayStr;
                      
                      // Check if time is in the future (with 1 minute buffer for timezone differences)
                      const bufferMs = 60 * 1000; // 1 minute buffer
                      isFutureTime = selectedDateTime.getTime() > (now.getTime() + bufferMs);
                    } catch (e) {
                      // Ignore errors in calculation
                    }
                  }
                  
                  // Reason is required ONLY when supervisor clocks in/out for another worker
                  // Location is captured but not mandatory
                  // Show warning if different day from today OR future time
                  if (isFutureTime) {
                    return (
                      <span className="text-red-600 font-medium">
                        ⚠ Clock-in/out cannot be in the future. Please select a valid time.
                      </span>
                    );
                  }
                  
                  if (isDifferentDayFromToday) {
                    return (
                      <span className="text-orange-600 font-medium">
                        ℹ Clock-in/out on a different day than today will require supervisor approval. Reason is optional.
                      </span>
                    );
                  }
                  
                  // Location is captured but not mandatory
                  if (!gpsLocation || gpsError) {
                    return (
                      <span className="text-gray-600">
                        Optional: Location is captured but not mandatory. Reason is optional.
                      </span>
                    );
                  }
                  
                  // Reason is optional for workers doing their own clock-in/out
                  // isWorkerOwner is already defined above in the same scope
                  if (isWorkerOwner) {
                    return 'Optional: Reason is not required for your own clock-in/out on the same day as the shift.';
                  }
                  return 'Optional: Reason is not required for your own clock-in/out on the same day as the shift.';
                })()}
              </p>
            </div>

            {/* Privacy notice */}
            <p className="text-xs text-gray-500 mt-2">
              <strong>Privacy Notice:</strong> Your location is used only for attendance validation at the time of clock-in/out.
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => {
                  setShowClockModal(false);
                  setSelectedShift(null);
                  setClockType(null);
                  setSelectedTime('');
                  setSelectedHour12('');
                  setSelectedMinute('');
                  setReasonText('');
                }}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                onClick={submitAttendance}
                disabled={(() => {
                  if (submitting || !selectedTime || !selectedHour12 || !selectedMinute) return true;
                  
                  // Check if reason is required
                  const isWorkerOwner = currentUser && selectedShift?.worker_id && String(currentUser.id) === String(selectedShift.worker_id);
                  const isSupervisorDoingForOther = isSupervisorOrAdmin && selectedShift && !isWorkerOwner;
                  const isOnSiteLeadDoingForOther = isOnSiteLead && selectedShift && !isWorkerOwner;
                  const isReasonRequired = isSupervisorDoingForOther || isOnSiteLeadDoingForOther;
                  
                  if (isReasonRequired && (!reasonText.trim() || reasonText.trim().length < 15)) {
                    return true;
                  }
                  
                  return false;
                })()}
                className="px-4 py-2 rounded bg-brand-red text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimesheetAuditSection({ projectId }:{ projectId:string }){
  const [month, setMonth] = useState<string>(getCurrentMonthLocal());
  const [offset, setOffset] = useState<number>(0);
  const limit = 50;
  const qs = (()=>{ const p = new URLSearchParams(); if(month) p.set('month', month); p.set('limit', String(limit)); p.set('offset', String(offset)); const s=p.toString(); return s? ('?'+s): ''; })();
  const { data, refetch, isFetching } = useQuery({ queryKey:['timesheetLogs', projectId, month, offset], queryFn: ()=> api<any[]>('GET', `/projects/${projectId}/timesheet/logs${qs}`) });
  const logs = data||[];
  return (
    <div>
      {/* Month filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Month:</label>
        <input
          type="month"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setOffset(0);
          }}
          className="border rounded px-3 py-1 text-sm"
        />
      </div>
      
      <div className="border rounded-lg divide-y bg-white">
        {isFetching && (
          <div className="p-3 text-right bg-gray-50">
            <span className="text-[11px] text-gray-500">Loading...</span>
          </div>
        )}
        <div className="divide-y">
          {logs.length? logs.map((l:any)=> {
            const ch = l.changes||{};
            const before = ch.before||{}; const after = ch.after||{};
            const bMin = typeof before.minutes==='number'? (before.minutes/60).toFixed(2): null;
            const aMin = typeof after.minutes==='number'? (after.minutes/60).toFixed(2): null;
            
            // Extract attendance information
            const attendanceType = ch.attendance_type;
            const workerName = ch.worker_name;
            const performedBy = ch.performed_by;
            const timeSelected = ch.time_selected;
            const timeEntered = ch.time_entered;
            const reasonText = ch.reason_text;
            const status = ch.status;
            const insideGeofence = ch.inside_geofence;
            const gpsAccuracy = ch.gps_accuracy_m;
            
            // Determine if this is an attendance log
            const isAttendanceLog = !!attendanceType;
            
            return (
              <div key={l.id} className="px-3 py-3 text-sm border-b">
                <div className="flex items-start gap-2">
                  {l.user_avatar_file_id? <img src={`/files/${l.user_avatar_file_id}/thumbnail?w=64`} className="w-6 h-6 rounded-full"/> : <span className="w-6 h-6 rounded-full bg-gray-200 inline-block"/>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-[11px] text-gray-500">
                        {new Date(l.timestamp).toLocaleString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </div>
                      <span className="text-gray-400">·</span>
                      <div className="text-[11px] text-gray-500 font-medium">{l.user_name||''}</div>
                      {isAttendanceLog && workerName && workerName !== l.user_name && (
                        <>
                          <span className="text-gray-400">·</span>
                          <div className="text-[11px] text-blue-600 font-medium">
                            for {workerName}
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="text-gray-800 font-medium capitalize mb-2">
                      {isAttendanceLog ? `${attendanceType === 'clock-in' ? 'Clock-In' : 'Clock-Out'}` : l.action}
                    </div>
                    
                    {/* Attendance-specific information */}
                    {isAttendanceLog && (
                      <div className="mt-2 space-y-2 bg-gray-50 p-3 rounded border">
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Time Selected</div>
                            <div className="text-gray-800">
                              {timeSelected ? new Date(timeSelected).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Time Entered</div>
                            <div className="text-gray-800">
                              {timeEntered ? new Date(timeEntered).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Status</div>
                            <div className="text-gray-800">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${
                                status === 'approved' ? 'bg-green-100 text-green-800' :
                                status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {status || '-'}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 font-medium mb-0.5">Location</div>
                            <div className="text-gray-800">
                              {insideGeofence === true ? (
                                <span className="text-green-600">✓ Inside geofence</span>
                              ) : insideGeofence === false ? (
                                <span className="text-red-600">✗ Outside geofence</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                              {gpsAccuracy && (
                                <span className="text-gray-500 ml-1">({gpsAccuracy.toFixed(0)}m accuracy)</span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Hours worked */}
                        {(before.minutes !== undefined || after.minutes !== undefined || ch.minutes !== undefined) && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-gray-500 font-medium mb-0.5 text-[11px]">Hours Worked</div>
                            <div className="text-gray-800 text-sm font-medium">
                              {l.action === 'update' ? (
                                <>{bMin ?? '-'} → {aMin ?? '-'}h</>
                              ) : (
                                <>{ch.minutes !== undefined ? (Number(ch.minutes)/60).toFixed(2) : '-'}h</>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Reason text */}
                        {reasonText && (
                          <div className="mt-2 pt-2 border-t">
                            <div className="text-gray-500 font-medium mb-1 text-[11px]">Reason</div>
                            <div className="text-gray-800 text-xs bg-white p-2 rounded border">
                              {reasonText}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Regular timesheet entry changes (non-attendance) */}
                    {!isAttendanceLog && (
                      <>
                        {(l.action==='update' && (before||after)) && (
                          <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-gray-700">
                            <div>
                              <div className="text-gray-500">Date</div>
                              <div>{(before.work_date||'') ? String(before.work_date).slice(0,10) : '-' } → {(after.work_date||'') ? String(after.work_date).slice(0,10) : '-'}</div>
                            </div>
                            <div>
                              <div className="text-gray-500">Hours</div>
                              <div>{bMin??'-'} → {aMin??'-'}</div>
                            </div>
                            <div className="col-span-3 md:col-span-1">
                              <div className="text-gray-500">Notes</div>
                              <div className="truncate" title={`${before.notes||''} → ${after.notes||''}`}>{(before.notes||'-') + ' → ' + (after.notes||'-')}</div>
                            </div>
                            {(before.start_time || after.start_time) && (
                              <div>
                                <div className="text-gray-500">Start Time</div>
                                <div>{formatTime12h(before.start_time || null) || '-'} → {formatTime12h(after.start_time || null) || '-'}</div>
                              </div>
                            )}
                            {(before.end_time || after.end_time) && (
                              <div>
                                <div className="text-gray-500">End Time</div>
                                <div>{formatTime12h(before.end_time || null) || '-'} → {formatTime12h(after.end_time || null) || '-'}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {(l.action!=='update' && l.changes) && (
                          <div className="mt-1 text-[11px] text-gray-700">
                            {(() => {
                              // Try to format the changes in a more readable way
                              if (typeof l.changes === 'object' && l.changes !== null) {
                                const formatted: string[] = [];
                                // Show message if available (for deletion logs)
                                if (l.changes.message) {
                                  formatted.push(l.changes.message);
                                }
                                if (l.changes.work_date) formatted.push(`Date: ${String(l.changes.work_date).slice(0,10)}`);
                                if (l.changes.minutes !== undefined) formatted.push(`Hours: ${(Number(l.changes.minutes)/60).toFixed(2)}h`);
                                if (l.changes.hours_worked !== undefined) formatted.push(`Hours: ${Number(l.changes.hours_worked).toFixed(2)}h`);
                                if (l.changes.break_minutes !== undefined && l.changes.break_minutes > 0) formatted.push(`Break: ${l.changes.break_minutes}m`);
                                if (l.changes.start_time) formatted.push(`Start: ${formatTime12h(l.changes.start_time)}`);
                                if (l.changes.end_time) formatted.push(`End: ${formatTime12h(l.changes.end_time)}`);
                                if (l.changes.notes) formatted.push(`Notes: ${l.changes.notes}`);
                                if (formatted.length > 0) {
                                  return formatted.join(' • ');
                                }
                              }
                              return JSON.stringify(l.changes);
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }) : <div className="p-3 text-sm text-gray-600">No changes yet</div>}
        </div>
        <div className="p-3 text-right bg-gray-50">
          <button onClick={()=>{ setOffset(o=> Math.max(0, o - limit)); refetch(); }} disabled={offset<=0} className="px-2 py-1 rounded bg-gray-100 text-sm mr-2 disabled:opacity-50">Prev</button>
          <button onClick={()=>{ setOffset(o=> o + limit); refetch(); }} className="px-2 py-1 rounded bg-gray-100 text-sm">Load more</button>
        </div>
      </div>
    </div>
  );
}

function OnSiteLeadsModal({ projectId, originalDivisions, divisionLeads, settings, projectDivisions, employees, canEdit, onClose, onUpdate }: {
  projectId: string,
  originalDivisions: string[],
  divisionLeads: Record<string, string>,
  settings: any,
  projectDivisions: any[],
  employees: any[],
  canEdit: boolean,
  onClose: () => void,
  onUpdate: (updatedLeads: Record<string, string>, updatedDivisions: string[]) => Promise<void>
}){
  const [localDivisions, setLocalDivisions] = useState<string[]>(originalDivisions);
  const [localLeads, setLocalLeads] = useState<Record<string, string>>(divisionLeads);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalDivisions(originalDivisions);
    setLocalLeads(divisionLeads);
  }, [originalDivisions, divisionLeads]);

  const handleLeadChange = async (divId: string, leadId: string) => {
    if (!canEdit) return;
    const updated = { ...localLeads, [divId]: leadId };
    setLocalLeads(updated);
    setIsSaving(true);
    try {
      // Pass the same divisions (they come from project_division_ids and cannot be changed here)
      await onUpdate(updated, localDivisions);
    } finally {
      setIsSaving(false);
    }
  };

  // Divisions come from project_division_ids and cannot be modified in this modal
  // No add/remove functionality - only edit leads
  if (localDivisions.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col on-site-leads-modal">
        <div className="bg-gradient-to-br from-[#7f1010] to-[#a31414] p-6 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-white">On-site Leads by Division</h2>
          <button
            onClick={onClose}
            className="text-2xl font-bold text-white hover:text-gray-200 w-8 h-8 flex items-center justify-center rounded hover:bg-white/20"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600">
              {localDivisions.length} division{localDivisions.length !== 1 ? 's' : ''} from Project Divisions
            </div>
            <div className="flex items-center gap-2">
              {isSaving && <span className="text-xs text-gray-500">Saving...</span>}
            </div>
          </div>
          <div className="space-y-3">
            {localDivisions.map((divId: string) => {
          // Find division in projectDivisions (check main divisions and subdivisions)
          // Format: "Division" for main division, "Division - Subdivision" for subdivisions
          let divLabel = '';
          let divIcon = '';
          let mainDivisionLabel = ''; // For getting the icon from main division
          
          for (const div of (projectDivisions || [])) {
            if (String(div.id) === String(divId)) {
              // Main division
              divLabel = div.label || divId;
              mainDivisionLabel = div.label || '';
              divIcon = getDivisionIcon(div.label || '');
              break;
            }
            // Check subdivisions - format as "Division - Subdivision"
            for (const sub of (div.subdivisions || [])) {
              if (String(sub.id) === String(divId)) {
                divLabel = `${div.label} - ${sub.label}`;
                mainDivisionLabel = div.label || '';
                divIcon = getDivisionIcon(div.label || '');
                break;
              }
            }
            if (divLabel) break;
          }
          
          // Fallback if not found
          if (!divLabel) {
            divLabel = divId;
            divIcon = '';
          }
          
          const leadId = localLeads[divId] || '';
          const lead = leadId ? employees.find((e:any) => String(e.id) === String(leadId)) : null;
          return (
            <div key={divId} className="space-y-2">
              <div className="flex items-center gap-2">
                {divIcon && <span className="text-lg">{divIcon}</span>}
                <span className="text-sm font-medium text-gray-900">{divLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={leadId}
                  onChange={(e) => handleLeadChange(divId, e.target.value)}
                  disabled={!canEdit}
                  className={`flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                >
                  <option value="">Select lead...</option>
                  {employees.map((emp:any) => (
                    <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>
                  ))}
                </select>
                {lead && (
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                    {(lead.name||lead.username||'L')[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 flex-shrink-0 relative z-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function LastReportsCard({ reports }: { reports: Report[] }){
  const recentReports = useMemo(() => {
    return (reports||[]).slice(0, 5).sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [reports]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-3">Last Reports</h4>
      {recentReports.length > 0 ? (
        <div className="space-y-2">
          {recentReports.map((report) => (
            <div key={report.id} className="p-2 rounded border hover:bg-gray-50 transition-colors">
              <div className="text-sm font-medium text-gray-900">{report.title || 'Untitled Report'}</div>
              {report.description && (
                <div className="text-xs text-gray-600 mt-1 line-clamp-2">{report.description}</div>
              )}
              {report.created_at && (
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(report.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">No reports yet</div>
      )}
    </div>
  );
}

function ProjectTeamCard({ projectId, employees }: { projectId: string, employees: any[] }){
  const { data: shifts = [] } = useQuery({
    queryKey: ['projectShifts', projectId],
    queryFn: () => projectId ? api<any[]>('GET', `/dispatch/projects/${projectId}/shifts`) : Promise.resolve([]),
    enabled: !!projectId,
  });

  // Extract unique worker IDs from shifts
  const workerIds = useMemo(() => {
    const ids = new Set<string>();
    shifts.forEach((shift: any) => {
      if (shift.worker_id) {
        ids.add(String(shift.worker_id));
      }
    });
    return Array.from(ids);
  }, [shifts]);

  // Get employee details for these IDs
  const teamMembers = useMemo(() => {
    return workerIds.map(wid => employees.find((e: any) => String(e.id) === String(wid))).filter(Boolean);
  }, [workerIds, employees]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-3">Project Team</h4>
      {teamMembers.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {teamMembers.map((member: any) => (
            <div key={member.id} className="flex items-center gap-2 p-2 rounded border hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                {(member.name||member.username||'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{member.name||member.username}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">No team members assigned yet</div>
      )}
    </div>
  );
}

function ProjectTabCards({ availableTabs, onTabClick, proj }: { 
  availableTabs: readonly ('overview'|'reports'|'dispatch'|'timesheet'|'files'|'proposal'|'estimate'|'orders')[], 
  onTabClick: (tab: typeof availableTabs[number]) => void,
  proj: any 
}){
  const tabConfig: Record<string, { label: string, icon: string, description: string, color: string }> = {
    reports: { label: 'Reports', icon: '📝', description: 'Project reports and updates', color: 'bg-green-100 text-green-600' },
    dispatch: { label: 'Workload', icon: '👷', description: 'Employee shifts and workload management', color: 'bg-purple-100 text-purple-600' },
    timesheet: { label: 'Timesheet', icon: '⏰', description: 'Time tracking and hours', color: 'bg-orange-100 text-orange-600' },
    files: { label: 'Files', icon: '📁', description: 'Documents, photos and files', color: 'bg-gray-100 text-gray-600' },
    proposal: { label: 'Proposal', icon: '📄', description: 'Project proposals', color: 'bg-indigo-100 text-indigo-600' },
    estimate: { label: 'Estimate', icon: '💰', description: 'Cost estimates and budgets', color: 'bg-yellow-100 text-yellow-600' },
    orders: { label: 'Orders', icon: '🛒', description: 'Purchase orders and supplies', color: 'bg-red-100 text-red-600' },
  };

  // Filter out 'overview' from available tabs since we're already on overview
  const tabsToShow = availableTabs.filter(t => t !== 'overview');

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      {tabsToShow.map(tabKey => {
        const config = tabConfig[tabKey];
        if (!config) return null;
        return (
          <button
            key={tabKey}
            onClick={() => onTabClick(tabKey)}
            className="rounded-lg border bg-white p-4 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-lg ${config.color} flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform`}>
                {config.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-gray-900 mb-0.5">{config.label}</div>
                <div className="text-xs text-gray-500 line-clamp-1">{config.description}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProjectQuickEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const [status, setStatus] = useState<string>(proj?.status_label||'');
  const [divs, setDivs] = useState<string[]>(Array.isArray(proj?.division_ids)? proj.division_ids : []);
  const [progress, setProgress] = useState<number>(Number(proj?.progress||0));
  const [estimator, setEstimator] = useState<string>(proj?.estimator_id||'');
  const [divisionLeads, setDivisionLeads] = useState<Record<string, string>>(proj?.division_onsite_leads || {});
  const [projectDivs, setProjectDivs] = useState<string[]>(Array.isArray(proj?.project_division_ids)? proj.project_division_ids : []);
  const statuses = (settings?.project_statuses||[]) as any[];
  const divisions = (settings?.divisions||[]) as any[];
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=>api<any[]>('GET','/employees') });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  
  useEffect(()=>{
    setProjectDivs(Array.isArray(proj?.project_division_ids)? proj.project_division_ids : []);
  }, [proj?.project_division_ids]);
  const toggleDiv = (id:string)=> {
    setDivs(prev=> {
      const newDivs = prev.includes(id)? prev.filter(x=>x!==id) : [...prev, id];
      // Remove lead for division if division is removed
      if (prev.includes(id) && !newDivs.includes(id)) {
        setDivisionLeads(prevLeads => {
          const newLeads = { ...prevLeads };
          delete newLeads[id];
          return newLeads;
        });
      }
      return newDivs;
    });
  };
  const setDivisionLead = (divisionId: string, leadId: string) => {
    setDivisionLeads(prev => ({ ...prev, [divisionId]: leadId }));
  };
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-2">Quick Edit</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="text-xs text-gray-600">Status</label>
          <select className="w-full border rounded px-2 py-1.5" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">Select...</option>
            {statuses.map((s:any)=> <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600">Progress</label>
          <div className="flex items-center gap-2"><input type="range" min={0} max={100} value={progress} onChange={e=>setProgress(Number(e.target.value||0))} className="flex-1" /><span className="w-10 text-right">{progress}%</span></div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-600">Divisions</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {divs.map((id)=>{
              const d = divisions.find((x:any)=> String(x.id||x.label||x.value)===id);
              const bg = d?.meta?.color || '#eef2f7';
              const ab = d?.meta?.abbr || d?.label || id;
              return (
                <span key={id} className="px-2 py-1 rounded-full border text-xs flex items-center gap-1" style={{ backgroundColor: bg }}>
                  {ab}
                  <button onClick={()=> setDivs(prev=> prev.filter(x=>x!==id))} className="ml-1 text-[10px]">✕</button>
                </span>
              );
            })}
            <AddDivisionDropdown divisions={divisions} selected={divs} onAdd={(id)=> setDivs(prev=> prev.includes(id)? prev : [...prev, id])} />
          </div>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-600 mb-2 block">Project Divisions</label>
          <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
            {(projectDivisions||[]).map((div:any)=>{
              const divId = String(div.id);
              const divSelected = projectDivs.includes(divId);
              const subdivisions = div.subdivisions || [];
              
              return (
                <div key={divId} className="border rounded p-2">
                  <button
                    type="button"
                    onClick={()=> setProjectDivs(prev=> prev.includes(divId)? prev.filter(x=>x!==divId) : [...prev, divId])}
                    className={`w-full text-left px-2 py-1 rounded text-sm font-medium flex items-center gap-2 ${
                      divSelected? 'bg-[#7f1010] text-white': 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{getDivisionIcon(div.label)}</span>
                    <span>{div.label}</span>
                  </button>
                  {subdivisions.length > 0 && (
                    <div className="mt-1 pl-6 space-y-1">
                      {subdivisions.map((sub:any)=>{
                        const subId = String(sub.id);
                        const subSelected = projectDivs.includes(subId);
                        return (
                          <button
                            key={subId}
                            type="button"
                            onClick={()=> setProjectDivs(prev=> prev.includes(subId)? prev.filter(x=>x!==subId) : [...prev, subId])}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                              subSelected? 'bg-[#a31414] text-white': 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <span className="text-base">{getDivisionIcon(div.label)}</span>
                            <span>• {sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {(!projectDivisions || projectDivisions.length === 0) && (
              <div className="text-xs text-gray-500">No project divisions available.</div>
            )}
          </div>
        </div>
        <EmployeeSelect label="Estimator" value={estimator} onChange={setEstimator} employees={employees||[]} />
        {!proj?.is_bidding && divs.length > 0 && (
          <div className="col-span-2">
            <label className="text-xs text-gray-600 mb-2 block">On-site Leads by Division</label>
            <div className="space-y-2">
              {divs.map((divId) => {
                const div = divisions.find((d:any) => String(d.id||d.label||d.value) === divId);
                const divLabel = div?.meta?.abbr || div?.label || divId;
                const divColor = div?.meta?.color || '#eef2f7';
                return (
                  <div key={divId} className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded text-xs border flex-shrink-0" style={{ backgroundColor: divColor, minWidth: '60px', textAlign: 'center' }}>{divLabel}</span>
                    <select 
                      className="flex-1 border rounded px-2 py-1.5 text-sm" 
                      value={divisionLeads[divId] || ''} 
                      onChange={e => setDivisionLead(divId, e.target.value)}
                    >
                      <option value="">Select on-site lead...</option>
                      {(employees||[]).map((emp:any) => (
                        <option key={emp.id} value={emp.id}>{emp.name||emp.username}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="col-span-2 text-right">
          <button onClick={async()=>{ 
            try{ 
              // Clean up division_onsite_leads to only include divisions that are still selected
              const cleanedLeads: Record<string, string> = {};
              divs.forEach(divId => {
                if (divisionLeads[divId]) {
                  cleanedLeads[divId] = divisionLeads[divId];
                }
              });
              const payload: any = { 
                status_label: status||null, 
                division_ids: divs, // Legacy
                project_division_ids: projectDivs.length > 0 ? projectDivs : null, // New
                progress, 
                estimator_id: estimator||null
              };
              // Only include division_onsite_leads if not a bidding
              if (!proj?.is_bidding) {
                payload.division_onsite_leads = cleanedLeads;
              }
              await api('PATCH', `/projects/${projectId}`, payload); 
              toast.success('Saved'); 
              location.reload(); 
            }catch(_e){ 
              toast.error('Failed to save'); 
            } 
          }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
        </div>
      </div>
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

// Edit Status Modal Component
function EditStatusModal({ projectId, currentStatus, currentStatusLabel, settings, isBidding, onClose, onSave }: {
  projectId: string;
  currentStatus: string;
  currentStatusLabel: string;
  settings: any;
  isBidding?: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [selectedStatusId, setSelectedStatusId] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const allProjectStatuses = (settings?.project_statuses || []) as any[];
  
  // For opportunities, only show: Prospecting, Sent to Customer, Refused
  // For projects, show all statuses except "Prospecting"
  const projectStatuses = useMemo(() => {
    if (isBidding) {
      // Filter to only show the 3 allowed statuses for opportunities
      // Use case-insensitive comparison and trim to handle variations
      const allowedLabels = ['Prospecting', 'Sent to Customer', 'Refused'].map(l => l.toLowerCase().trim());
      const filtered = allProjectStatuses.filter((status: any) => {
        const statusLabel = String(status.label || '').toLowerCase().trim();
        return allowedLabels.includes(statusLabel);
      });
      
      // If no statuses found, log for debugging
      if (filtered.length === 0 && allProjectStatuses.length > 0) {
        console.warn('No matching opportunity statuses found. Available statuses:', allProjectStatuses.map((s: any) => s.label));
      }
      
      return filtered;
    } else {
      // For projects, hide "Prospecting", "Sent to Customer", and "Refused"
      const excludedLabels = ['prospecting', 'sent to customer', 'refused'].map(l => l.toLowerCase().trim());
      return allProjectStatuses.filter((status: any) => {
        const statusLabel = String(status.label || '').toLowerCase().trim();
        return !excludedLabels.includes(statusLabel);
      });
    }
  }, [allProjectStatuses, isBidding]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const selectedStatus = projectStatuses.find((s: any) => String(s.id) === String(selectedStatusId));
      await api('PATCH', `/projects/${projectId}`, {
        status_id: selectedStatusId || null,
        status_label: selectedStatus?.label || null
      });
      toast.success('Status updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Status</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Status</label>
          {projectStatuses.length === 0 ? (
            <div className="text-sm text-gray-500 mb-4">
              No statuses available. Please ensure the following statuses exist in settings: {isBidding ? 'Prospecting, Sent to Customer, Refused' : 'All statuses except Prospecting'}
            </div>
          ) : (
            <select
              value={selectedStatusId}
              onChange={(e) => setSelectedStatusId(e.target.value)}
              className="w-full border rounded px-3 py-2 mb-4"
            >
              {projectStatuses.map((status: any) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Project Name Modal Component
function EditProjectNameModal({ projectId, currentName, onClose, onSave }: {
  projectId: string;
  currentName: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [projectName, setProjectName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjectName(currentName);
  }, [currentName]);

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast.error('Project name cannot be empty');
      return;
    }

    if (projectName.trim() === currentName) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        name: projectName.trim()
      });
      toast.success('Project name updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Project Name</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Enter project name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                } else if (e.key === 'Escape') {
                  onClose();
                }
              }}
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <div className="font-medium mb-1">Important Information</div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Changing the project name will automatically update the associated folder name in the file system.</li>
                  <li>The project code (e.g., MK-00001/00001-2025) cannot be changed and will remain the same.</li>
                  <li>This change will be reflected across all project views and reports.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !projectName.trim()}
              className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Site Modal Component
function EditSiteModal({ projectId, project, onClose, onSave }: {
  projectId: string;
  project: any;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [siteId, setSiteId] = useState(project?.site_id || '');
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);

  useEffect(() => {
    setSiteId(project?.site_id || '');
  }, [project?.site_id]);

  // Load sites when modal opens
  useEffect(() => {
    if (project?.client_id) {
      setLoadingSites(true);
      api<any[]>('GET', `/clients/${encodeURIComponent(String(project.client_id))}/sites`)
        .then(data => {
          setSites(data || []);
        })
        .catch(() => {
          setSites([]);
        })
        .finally(() => {
          setLoadingSites(false);
        });
    }
  }, [project?.client_id]);

  const selectedSite = sites.find(s => String(s.id) === String(siteId));
  const currentSite = sites.find(s => String(s.id) === String(project?.site_id));

  const handleSave = async () => {
    if (siteId === (project?.site_id || '')) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        site_id: siteId || null
      });
      toast.success('Project site updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project site');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Project Site</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Select Site</label>
            {loadingSites ? (
              <div className="text-sm text-gray-500 py-2">Loading sites...</div>
            ) : (
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">No Site</option>
                {sites.map((site: any) => (
                  <option key={site.id} value={site.id}>
                    {site.site_name || site.site_address_line1 || site.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSite && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Site Information</div>
              <div className="space-y-2 text-sm">
                {selectedSite.site_name && (
                  <div>
                    <span className="text-gray-600 font-medium">Name:</span>
                    <span className="ml-2 text-gray-900">{selectedSite.site_name}</span>
                  </div>
                )}
                {selectedSite.site_address_line1 && (
                  <div>
                    <span className="text-gray-600 font-medium">Address:</span>
                    <span className="ml-2 text-gray-900">{selectedSite.site_address_line1}</span>
                    {selectedSite.site_address_line2 && (
                      <div className="ml-20 text-gray-700">{selectedSite.site_address_line2}</div>
                    )}
                  </div>
                )}
                {(selectedSite.site_city || selectedSite.site_province || selectedSite.site_postal_code) && (
                  <div>
                    <span className="text-gray-600 font-medium">Location:</span>
                    <span className="ml-2 text-gray-900">
                      {[selectedSite.site_city, selectedSite.site_province, selectedSite.site_postal_code].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {selectedSite.site_country && (
                  <div>
                    <span className="text-gray-600 font-medium">Country:</span>
                    <span className="ml-2 text-gray-900">{selectedSite.site_country}</span>
                  </div>
                )}
                {selectedSite.site_notes && (
                  <div>
                    <span className="text-gray-600 font-medium">Notes:</span>
                    <div className="ml-2 text-gray-900 mt-1">{selectedSite.site_notes}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentSite && siteId !== (project?.site_id || '') && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <div className="font-medium mb-1">Changing Site</div>
                  <div className="text-xs">You are changing from <strong>{currentSite.site_name || currentSite.site_address_line1 || 'current site'}</strong> to <strong>{selectedSite?.site_name || selectedSite?.site_address_line1 || 'new site'}</strong>. This will update the project's location information.</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Estimator Modal Component
function EditEstimatorModal({ projectId, currentEstimatorId, employees, onClose, onSave }: {
  projectId: string;
  currentEstimatorId: string;
  employees: any[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [estimatorId, setEstimatorId] = useState(currentEstimatorId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEstimatorId(currentEstimatorId);
  }, [currentEstimatorId]);

  const selectedEstimator = employees.find((e: any) => String(e.id) === String(estimatorId));
  const currentEstimator = employees.find((e: any) => String(e.id) === String(currentEstimatorId));

  const handleSave = async () => {
    if (estimatorId === currentEstimatorId) {
      onClose();
      return;
    }

    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, {
        estimator_id: estimatorId || null
      });
      toast.success('Project estimator updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update project estimator');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Project Estimator</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Select Estimator</label>
            <select
              value={estimatorId}
              onChange={(e) => setEstimatorId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">No Estimator</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name || emp.username || emp.id}
                </option>
              ))}
            </select>
          </div>

          {selectedEstimator && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-900 mb-3">Estimator Information</div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-lg">
                  {(selectedEstimator.name||selectedEstimator.username||'E')[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{selectedEstimator.name || selectedEstimator.username || 'Unknown'}</div>
                  {selectedEstimator.email && (
                    <div className="text-sm text-gray-600">{selectedEstimator.email}</div>
                  )}
                  {selectedEstimator.phone && (
                    <div className="text-sm text-gray-600">{selectedEstimator.phone}</div>
                  )}
                </div>
              </div>
              {selectedEstimator.roles && selectedEstimator.roles.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-gray-600 font-medium">Roles:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedEstimator.roles.map((role: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentEstimator && estimatorId !== currentEstimatorId && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-yellow-800">
                  <div className="font-medium mb-1">Changing Estimator</div>
                  <div className="text-xs">You are changing from <strong>{currentEstimator.name || currentEstimator.username || 'current estimator'}</strong> to <strong>{selectedEstimator?.name || selectedEstimator?.username || 'new estimator'}</strong>. The new estimator will be responsible for project estimates and cost calculations.</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Edit Progress Modal Component
function EditProgressModal({ projectId, currentProgress, onClose, onSave }: {
  projectId: string;
  currentProgress: number;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [progress, setProgress] = useState(currentProgress);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const progressValue = Math.max(0, Math.min(100, Number(progress)));
      await api('PATCH', `/projects/${projectId}`, {
        progress: progressValue
      });
      toast.success('Progress updated');
      await onSave();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to update progress');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Progress</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Progress (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full border rounded px-3 py-2 mb-2"
          />
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <span className="text-sm font-semibold text-gray-700 w-12 text-right">{Math.max(0, Math.min(100, progress))}%</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectDivisionsHeroSection({ projectId, proj, hasEditPermission }: { projectId: string, proj: any, hasEditPermission?: boolean }){
  const queryClient = useQueryClient();
  const [showEditModal, setShowEditModal] = useState(false);
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });

  const projectDivIds = Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : [];

  // Get division icons and labels
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: string; label: string; id: string }> = [];
    for (const divId of projectDivIds) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ icon: getDivisionIcon(div.label), label: div.label, id: String(div.id) });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ icon: getDivisionIcon(div.label), label: `${div.label} - ${sub.label}`, id: String(sub.id) });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].id === String(divId)) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions]);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-600 block">Project Divisions</label>
          {hasEditPermission && (
            <button
              onClick={() => setShowEditModal(true)}
              className="text-gray-400 hover:text-[#7f1010] transition-colors"
              title="Edit Divisions"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
        </div>
        <div>
          {divisionIcons.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              {divisionIcons.map((div) => (
                <div
                  key={div.id}
                  className="relative group/icon"
                  title={div.label}
                >
                  <div className="text-2xl cursor-pointer hover:scale-110 transition-transform">
                    {div.icon}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                    {div.label}
                    <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">No divisions assigned</div>
          )}
        </div>
      </div>

      {/* Edit Divisions Modal */}
      {showEditModal && (
        <EditDivisionsModal
          projectId={projectId}
          currentDivisions={projectDivIds}
          projectDivisions={projectDivisions || []}
          onClose={() => setShowEditModal(false)}
          onSave={async () => {
            await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
            setShowEditModal(false);
          }}
        />
      )}
    </>
  );
}

// Edit Divisions Modal Component
function EditDivisionsModal({ projectId, currentDivisions, projectDivisions, onClose, onSave }: {
  projectId: string;
  currentDivisions: string[];
  projectDivisions: any[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [projectDivs, setProjectDivs] = useState<string[]>(currentDivisions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjectDivs(currentDivisions);
  }, [currentDivisions]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, { 
        project_division_ids: projectDivs.length > 0 ? projectDivs : null
      });
      toast.success('Divisions saved');
      await onSave();
    } catch (_e) {
      toast.error('Failed to save divisions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Project Divisions</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {projectDivisions.map((div: any) => {
              const divId = String(div.id);
              const divSelected = projectDivs.includes(divId);
              const subdivisions = div.subdivisions || [];
              
              return (
                <div key={divId} className="border rounded p-2 bg-white">
                  <button
                    type="button"
                    onClick={() => setProjectDivs(prev => prev.includes(divId) ? prev.filter(x => x !== divId) : [...prev, divId])}
                    className={`w-full text-left px-2 py-1 rounded text-sm font-medium flex items-center gap-2 ${
                      divSelected ? 'bg-[#7f1010] text-white' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{getDivisionIcon(div.label)}</span>
                    <span>{div.label}</span>
                  </button>
                  {subdivisions.length > 0 && (
                    <div className="mt-1 pl-6 space-y-1">
                      {subdivisions.map((sub: any) => {
                        const subId = String(sub.id);
                        const subSelected = projectDivs.includes(subId);
                        return (
                          <button
                            key={subId}
                            type="button"
                            onClick={() => setProjectDivs(prev => prev.includes(subId) ? prev.filter(x => x !== subId) : [...prev, subId])}
                            className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                              subSelected ? 'bg-[#a31414] text-white' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <span className="text-base">{getDivisionIcon(div.label)}</span>
                            <span>• {sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {projectDivisions.length === 0 && (
              <div className="text-xs text-gray-500 text-center py-4">No project divisions available.</div>
            )}
          </div>
        </div>
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded bg-[#7f1010] text-white disabled:opacity-60 font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border bg-white hover:bg-gray-50 text-gray-700 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectGeneralInfoCard({ projectId, proj, files }:{ projectId:string, proj:any, files: ProjectFile[] }){
  const queryClient = useQueryClient();
  const [description, setDescription] = useState<string>(proj?.description || '');
  const [projectName, setProjectName] = useState<string>(proj?.name || '');
  const [saving, setSaving] = useState(false);
  const [editingDivisions, setEditingDivisions] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [projectDivs, setProjectDivs] = useState<string[]>(Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=>api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const { data:proposals } = useQuery({ queryKey:['projectProposals', projectId], queryFn: ()=>api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId||''))}`) });

  useEffect(()=>{
    setDescription(proj?.description || '');
    setProjectName(proj?.name || '');
    setProjectDivs(Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : []);
  }, [proj?.description, proj?.name, proj?.project_division_ids]);

  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      const payload: any = { 
        description: description?.trim()? description : null,
        project_division_ids: projectDivs.length > 0 ? projectDivs : null
      };
      // Include name if it was edited
      if (editingName && projectName.trim() !== (proj?.name || '')) {
        payload.name = projectName.trim();
      }
      await api('PATCH', `/projects/${projectId}`, payload);
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setEditingDivisions(false);
      setEditingName(false);
    }catch(_e){
      toast.error('Failed to save');
    }finally{
      setSaving(false);
    }
  }, [projectId, description, projectDivs, projectName, editingName, proj?.name, queryClient]);

  // Get image URL priority:
  // 1) Manual image set by user (image_manually_set + image_file_object_id)
  // 2) Legacy manual image (existing project-cover-derived file)
  // 3) Cover from latest proposal
  // 4) Default blueprint
  const imageUrl = useMemo(() => {
    // If project has manually set image, use it
    if (proj?.image_file_object_id && proj?.image_manually_set) {
      return `/files/${proj.image_file_object_id}/thumbnail?w=800`;
    }
    // Legacy: if there is an existing cover image file, treat it as user-selected (manual)
    const legacyCover = (files||[]).find(f=> String(f.category||'') === 'project-cover-derived');
    if (legacyCover?.file_object_id) {
      return `/files/${legacyCover.file_object_id}/thumbnail?w=800`;
    }
    // If project has image (synced from proposal), use it
    if (proj?.image_file_object_id) {
      return `/files/${proj.image_file_object_id}/thumbnail?w=800`;
    }
    // Try to get from latest proposal
    if (proposals && proposals.length > 0) {
      // Sort by created_at descending to get latest
      const sortedProposals = [...proposals].sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      });
      const latestProposal = sortedProposals[0];
      if (latestProposal?.data?.cover_file_object_id) {
        return `/files/${latestProposal.data.cover_file_object_id}/thumbnail?w=800`;
      }
    }
    // Default blueprint image (served by backend static /ui)
    return '/ui/assets/placeholders/project.png';
  }, [proj?.image_file_object_id, proj?.image_manually_set, proposals, files]);

  const handleImageConfirm = useCallback(async (blob: Blob, originalFileObjectId?: string) => {
    try {
      setSaving(true);
      // Convert blob to File for upload
      const file = new File([blob], 'project-image.png', { type: 'image/png' });
      
      // Step 1: Get upload URL
      const up: any = await api('POST', '/files/upload', {
        project_id: projectId,
        client_id: proj?.client_id || null,
        employee_id: null,
        category_id: 'project-general-image',
        original_name: file.name,
        content_type: file.type || 'image/png'
      });
      
      // Step 2: Upload file to storage
      await fetch(up.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/png',
          'x-ms-blob-type': 'BlockBlob'
        },
        body: file
      });
      
      // Step 3: Confirm upload
      const conf: any = await api('POST', '/files/confirm', {
        key: up.key,
        size_bytes: file.size
      });
      
      // Step 4: Update project with the new image
      await api('PATCH', `/projects/${projectId}`, {
        image_file_object_id: conf.file_object_id,
        image_manually_set: true
      });
      
      toast.success('Image updated');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setPickerOpen(false);
    } catch (e) {
      toast.error('Failed to update image');
    } finally {
      setSaving(false);
    }
  }, [projectId, proj?.client_id, queryClient]);

  const city = proj?.address_city || proj?.site_city || '—';
  const province = proj?.address_province || proj?.site_province || proj?.site_state || '—';
  const country = proj?.address_country || proj?.site_country || '—';
  const postal = proj?.address_postal_code || proj?.postal_code || proj?.site_postal_code || proj?.site_zip || '—';
  const projectDivIds = Array.isArray(proj?.project_division_ids) ? proj.project_division_ids : [];

  // Get division icons and labels
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: string; label: string; id: string }> = [];
    for (const divId of projectDivIds) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ icon: getDivisionIcon(div.label), label: div.label, id: String(div.id) });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ icon: getDivisionIcon(div.label), label: `${div.label} - ${sub.label}`, id: String(sub.id) });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].id === String(divId)) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions]);

  const fields = useMemo(()=>[
    { label: 'City', value: city },
    { label: 'Province / State', value: province },
    { label: 'Country', value: country },
    { label: 'Postal Code', value: postal },
  ], [city, province, country, postal]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between mb-4">
        <h4 className="font-semibold">General Information</h4>
        {/* Division icons at top right */}
        {divisionIcons.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {divisionIcons.map((div) => (
              <div
                key={div.id}
                className="relative group/icon"
                title={div.label}
              >
                <div className="text-2xl cursor-pointer hover:scale-110 transition-transform">
                  {div.icon}
                </div>
                {/* Tooltip */}
                <div className="absolute right-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-10">
                  {div.label}
                  <div className="absolute -top-1 right-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-4 text-sm">
        {/* Project Image */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">Project Image</label>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-xs text-[#7f1010] hover:text-[#a31414] font-medium"
            >
              Change
            </button>
          </div>
          <div className="mt-1 rounded border overflow-hidden bg-gray-50">
            <img 
              src={imageUrl} 
              alt="Project" 
              className="w-full h-48 object-cover"
              onError={(e) => {
                // Only fallback to logo if it's not already the default image
                const currentSrc = (e.target as HTMLImageElement).src;
                if (!currentSrc.includes('/ui/assets/placeholders/project.png')) {
                  (e.target as HTMLImageElement).src = '/ui/assets/placeholders/project.png';
                }
              }}
            />
          </div>
        </div>

        {/* Project Name - Editable */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">Project Name</label>
            {!editingName && (
              <button
                onClick={() => setEditingName(true)}
                className="text-xs text-[#7f1010] hover:text-[#a31414] font-medium"
              >
                Edit
              </button>
            )}
          </div>
          {editingName ? (
            <div className="space-y-2">
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Project name"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !projectName.trim()}
                  className="px-3 py-1.5 rounded bg-brand-red text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setProjectName(proj?.name || '');
                  }}
                  disabled={saving}
                  className="px-3 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              <div className="text-[11px] text-gray-500">
                Note: Changing the project name will also update the associated folder name.
              </div>
            </div>
          ) : (
            <div className="mt-1 text-gray-800 font-medium">{proj?.name || proj?.site_name || '—'}</div>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          {fields.map((item)=> (
            <div key={item.label}>
              <div className="text-xs text-gray-600">{item.label}</div>
              <div className="mt-1 text-gray-800">{item.value}</div>
            </div>
          ))}
        </div>
        
        {/* Project Divisions Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-600">Project Divisions</label>
            <button
              onClick={() => setEditingDivisions(!editingDivisions)}
              className="text-xs text-[#7f1010] hover:text-[#a31414] font-medium"
            >
              {editingDivisions ? 'Cancel' : projectDivIds.length > 0 ? 'Edit' : 'Add Divisions'}
            </button>
          </div>
          
          {editingDivisions ? (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-3 bg-gray-50">
              {(projectDivisions||[]).map((div:any)=>{
                const divId = String(div.id);
                const divSelected = projectDivs.includes(divId);
                const subdivisions = div.subdivisions || [];
                
                return (
                  <div key={divId} className="border rounded p-2 bg-white">
                    <button
                      type="button"
                      onClick={()=> setProjectDivs(prev=> prev.includes(divId)? prev.filter(x=>x!==divId) : [...prev, divId])}
                      className={`w-full text-left px-2 py-1 rounded text-sm font-medium flex items-center gap-2 ${
                        divSelected? 'bg-[#7f1010] text-white': 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-lg">{getDivisionIcon(div.label)}</span>
                      <span>{div.label}</span>
                    </button>
                    {subdivisions.length > 0 && (
                      <div className="mt-1 pl-6 space-y-1">
                        {subdivisions.map((sub:any)=>{
                          const subId = String(sub.id);
                          const subSelected = projectDivs.includes(subId);
                          return (
                            <button
                              key={subId}
                              type="button"
                              onClick={()=> setProjectDivs(prev=> prev.includes(subId)? prev.filter(x=>x!==subId) : [...prev, subId])}
                              className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 ${
                                subSelected? 'bg-[#a31414] text-white': 'bg-gray-50 hover:bg-gray-100'
                              }`}
                            >
                              <span className="text-base">{getDivisionIcon(div.label)}</span>
                              <span>• {sub.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {(!projectDivisions || projectDivisions.length === 0) && (
                <div className="text-xs text-gray-500 text-center py-4">No project divisions available.</div>
              )}
            </div>
          ) : projectDivIds.length > 0 && projectDivisions ? (
            <div className="flex flex-wrap gap-2">
              {projectDivIds.map((divId: string) => {
                // Find division or subdivision
                let divLabel = '';
                let divIcon = '';
                let isSubdivision = false;
                for (const div of (projectDivisions || [])) {
                  if (String(div.id) === String(divId)) {
                    divLabel = div.label;
                    divIcon = getDivisionIcon(div.label);
                    break;
                  }
                  for (const sub of (div.subdivisions || [])) {
                    if (String(sub.id) === String(divId)) {
                      divLabel = sub.label;
                      divIcon = getDivisionIcon(div.label);
                      isSubdivision = true;
                      break;
                    }
                  }
                  if (divLabel) break;
                }
                if (!divLabel) return null;
                return (
                  <span
                    key={divId}
                    className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                      isSubdivision
                        ? 'bg-[#a31414]/10 text-[#a31414] border border-[#a31414]/20'
                        : 'bg-[#7f1010]/10 text-[#7f1010] border border-[#7f1010]/20'
                    }`}
                    title={divLabel}
                  >
                    <span>{divIcon}</span>
                    <span>{divLabel}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No divisions assigned</div>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-600">Description</label>
          <textarea
            className="mt-1 w-full border rounded px-3 py-2 text-sm min-h-[120px] resize-y"
            placeholder="Add notes or general information about this project..."
            value={description}
            onChange={e=>setDescription(e.target.value)}
          />
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectContactCard({ projectId, proj, clientId, clientFiles }:{ projectId:string, proj:any, clientId?:string, clientFiles:any[] }){
  const [contactId, setContactId] = useState<string>(proj?.contact_id || '');
  const { data:contacts } = useQuery({
    queryKey:['project-contact-options', clientId||''],
    queryFn: ()=> clientId ? api<any[]>('GET', `/clients/${encodeURIComponent(String(clientId))}/contacts`) : Promise.resolve([]),
    enabled: !!clientId
  });
  useEffect(()=>{
    setContactId(proj?.contact_id || '');
  }, [proj?.contact_id]);
  const currentContact = useMemo(()=> (contacts||[]).find((c:any)=> String(c.id) === String(contactId)) || null, [contacts, contactId]);
  const photoUrl = useMemo(()=>{
    if(!contactId) return '';
    const rec = (clientFiles||[]).find((f:any)=> String(f.category||'').toLowerCase() === `contact-photo-${String(contactId)}`.toLowerCase());
    return rec ? `/files/${rec.file_object_id}/thumbnail?w=160` : '';
  }, [clientFiles, contactId]);
  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async()=>{
    try{
      setSaving(true);
      await api('PATCH', `/projects/${projectId}`, { contact_id: contactId || null });
      toast.success('Contact updated');
    }catch(_e){
      toast.error('Failed to update contact');
    }finally{
      setSaving(false);
    }
  }, [projectId, contactId]);
  const displayName = currentContact?.name || proj?.contact_name || '—';
  const displayEmail = currentContact?.email || proj?.contact_email || '';
  const displayPhone = currentContact?.phone || proj?.contact_phone || '';
  return (
    <div className="rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-2">Contact</h4>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img className="w-12 h-12 rounded border object-cover" src={photoUrl} alt="Contact" />
          ) : (
            <span className="w-12 h-12 rounded bg-gray-200 inline-block" />
          )}
          <div>
            <div className="text-sm text-gray-700">{displayName}</div>
            {(displayEmail || displayPhone) ? (
              <div className="text-xs text-gray-600">
                {displayEmail}
                {displayEmail && displayPhone ? ' · ' : ''}
                {displayPhone}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No contact details</div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-600">Customer contact</label>
          <select
            className="w-full border rounded px-2 py-1.5 mt-1"
            value={contactId}
            onChange={e=>setContactId(e.target.value)}
            disabled={!contacts?.length}
          >
            <option value="">No contact</option>
            {(contacts||[]).map((c:any)=> (
              <option key={c.id} value={c.id}>{c.name || c.email || c.phone || c.id}</option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded bg-brand-red text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectEtaEdit({ projectId, proj, settings }:{ projectId:string, proj:any, settings:any }){
  const [isEditing, setIsEditing] = useState(false);
  const [eta, setEta] = useState<string>((proj?.date_eta||'').slice(0,10));
  const { data:projUpdated, refetch } = useQuery({ queryKey:['project', projectId], queryFn: ()=>api<Project>('GET', `/projects/${projectId}`) });
  const queryClient = useQueryClient();
  
  useEffect(()=>{
    if(projUpdated?.date_eta) setEta((projUpdated.date_eta||'').slice(0,10));
  }, [projUpdated?.date_eta]);
  
  const canEdit = useMemo(()=>{
    if (!proj?.status_label) return true;
    const statusLabelStr = String(proj.status_label).trim();
    const statusConfig = ((settings?.project_statuses||[]) as any[]).find((s:any)=> s.label === statusLabelStr);
    if (statusLabelStr.toLowerCase() === 'estimating') return true;
    const allowEdit = statusConfig?.meta?.allow_edit_proposal;
    return allowEdit === true || allowEdit === 'true' || allowEdit === 1;
  }, [proj?.status_label, settings]);
  
  if(!isEditing){
    return (
      <div className="flex items-center gap-2">
        <div className="text-sm text-gray-700 flex-1">{(proj?.date_eta||'').slice(0,10)||'-'}</div>
        {canEdit && (
          <button onClick={()=>setIsEditing(true)} className="text-gray-500 hover:text-gray-700" title="Edit ETA">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="flex-1 border rounded px-2 py-1 text-sm" value={eta} onChange={e=>setEta(e.target.value)} />
      <button onClick={async()=>{
        try{
          await api('PATCH', `/projects/${projectId}`, { date_eta: eta||null });
          queryClient.invalidateQueries({ queryKey:['project', projectId] });
          toast.success('ETA updated');
          setIsEditing(false);
        }catch(_e){ toast.error('Failed to update'); }
      }} className="px-2 py-1 rounded bg-brand-red text-white text-xs">Save</button>
      <button onClick={()=>{ setIsEditing(false); setEta((proj?.date_eta||'').slice(0,10)); }} className="px-2 py-1 rounded bg-gray-100 text-xs">Cancel</button>
    </div>
  );
}

function ProjectCostsSummary({ projectId, estimates }:{ projectId:string, estimates:any[] }){
  const { data:estimateData } = useQuery({ 
    queryKey: ['estimate', estimates[0]?.id], 
    queryFn: () => estimates[0]?.id ? api<any>('GET', `/estimate/estimates/${estimates[0].id}`) : Promise.resolve(null),
    enabled: !!estimates[0]?.id,
    refetchInterval: 2000 // Refetch every 2 seconds to update in real-time
  });
  
  // Extract data from estimateData (always extract, even if empty)
  const items = estimateData?.items || [];
  const markup = estimateData?.estimate?.markup || estimateData?.markup || 0;
  const pstRate = estimateData?.pst_rate ?? 0;
  const gstRate = estimateData?.gst_rate ?? 0;
  const profitRate = estimateData?.profit_rate ?? 20; // Default to 20%
  const sectionOrder = estimateData?.section_order || [];
  
  // Parse UI state for item extras
  const itemExtrasMap = useMemo(() => {
    const notes = estimateData?.estimate?.notes || estimateData?.notes;
    if (!notes) return {};
    try {
      const uiState = JSON.parse(notes);
      return uiState.item_extras || {};
    } catch {
      return {};
    }
  }, [estimateData]);
  
  // Group items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    items.forEach((it:any) => {
      const section = it.section || 'Miscellaneous';
      if(!groups[section]) groups[section] = [];
      groups[section].push(it);
    });
    return groups;
  }, [items]);
  
  // Helper function to calculate section subtotal (same as EstimateBuilder)
  const calculateSectionSubtotal = useCallback((sectionName: string): number => {
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
  }, [groupedItems, markup, itemExtrasMap]);
  
  // Calculate specific section costs (same as EstimateBuilder)
  const totalProductsCosts = useMemo(() => sectionOrder
    .filter(section => !['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous'].includes(section) && 
                      !section.startsWith('Labour Section') && 
                      !section.startsWith('Sub-Contractor Section') && 
                      !section.startsWith('Shop Section') && 
                      !section.startsWith('Miscellaneous Section'))
    .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalLabourCosts = useMemo(() => calculateSectionSubtotal('Labour') + 
           sectionOrder
             .filter(s => s.startsWith('Labour Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalSubContractorsCosts = useMemo(() => calculateSectionSubtotal('Sub-Contractors') + 
           sectionOrder
             .filter(s => s.startsWith('Sub-Contractor Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalShopCosts = useMemo(() => calculateSectionSubtotal('Shop') + 
           sectionOrder
             .filter(s => s.startsWith('Shop Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  const totalMiscellaneousCosts = useMemo(() => calculateSectionSubtotal('Miscellaneous') + 
           sectionOrder
             .filter(s => s.startsWith('Miscellaneous Section'))
             .reduce((sum, section) => sum + calculateSectionSubtotal(section), 0), [sectionOrder, calculateSectionSubtotal]);
  
  // Total Direct Project Costs (sum of all specific costs)
  const totalDirectProjectCosts = useMemo(() => totalProductsCosts + totalLabourCosts + totalSubContractorsCosts + totalShopCosts + totalMiscellaneousCosts, [totalProductsCosts, totalLabourCosts, totalSubContractorsCosts, totalShopCosts, totalMiscellaneousCosts]);
  
  // Calculate total without markup for all items
  const totalWithoutMarkup = useMemo(() => items.reduce((acc, it) => {
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
    return acc + itemTotal;
  }, 0), [items, markup, itemExtrasMap]);
  
  // Calculate total with markup for all items
  const totalWithMarkupAll = useMemo(() => items.reduce((acc, it) => {
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
  }, 0), [items, markup, itemExtrasMap]);
  
  // Sections Mark-up (difference between total with markup and total without markup)
  const sectionsMarkup = useMemo(() => totalWithMarkupAll - totalWithoutMarkup, [totalWithMarkupAll, totalWithoutMarkup]);
  
  // Calculate taxable total (only taxable items) with markup
  const taxableTotal = useMemo(() => items.reduce((acc, it) => {
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
  }, 0), [items, markup, itemExtrasMap]);
  
  const pst = useMemo(() => taxableTotal * (pstRate / 100), [taxableTotal, pstRate]);
  const subtotal = useMemo(() => totalDirectProjectCosts + pst, [totalDirectProjectCosts, pst]);
  const profitValue = useMemo(() => subtotal * (profitRate / 100), [subtotal, profitRate]);
  const finalTotal = useMemo(() => subtotal + profitValue, [subtotal, profitValue]);
  const gst = useMemo(() => finalTotal * (gstRate / 100), [finalTotal, gstRate]);
  const grandTotal = useMemo(() => finalTotal + gst, [finalTotal, gst]);
  
  // Calculate markup percentage (Sections Mark-up / Total Direct Project Costs * 100)
  const markupPercentage = useMemo(() => totalDirectProjectCosts > 0 ? (sectionsMarkup / totalDirectProjectCosts) * 100 : 0, [sectionsMarkup, totalDirectProjectCosts]);
  
  const summaryItems = useMemo(() => [
    { label: 'Subtotal', value: totalDirectProjectCosts },
    { label: `Markup (${markupPercentage.toFixed(1)}%)`, value: sectionsMarkup },
    { label: `PST (${pstRate}%)`, value: pst },
    { label: `Profit (${profitRate}%)`, value: profitValue },
    { label: `GST (${gstRate}%)`, value: gst },
  ], [totalDirectProjectCosts, markupPercentage, sectionsMarkup, pstRate, pst, profitRate, profitValue, gstRate, gst]);
  
  // Early return AFTER all hooks
  if(!estimateData || !estimates.length) {
    return (
      <div className="md:col-span-3 rounded-xl border bg-white p-4">
        <h4 className="font-semibold mb-2">Costs Summary</h4>
        <div className="text-sm text-gray-600">No estimate available</div>
      </div>
    );
  }
  
  return (
    <div className="md:col-span-3 rounded-xl border bg-white p-4">
      <h4 className="font-semibold mb-3">Costs Summary</h4>
      <div className="grid md:grid-cols-5 gap-4 text-sm">
        {summaryItems.map((item, idx)=> (
          <div key={idx}>
            <div className="text-xs text-gray-600 mb-1">{item.label}</div>
            <div className="text-lg font-semibold">${item.value.toFixed(2)}</div>
          </div>
        ))}
        <div className="md:col-span-5 pt-3 border-t mt-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Grand Total</div>
            <div className="text-2xl font-bold text-brand-red">${grandTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

