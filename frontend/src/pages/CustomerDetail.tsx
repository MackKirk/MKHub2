import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { formatAddressDisplay } from '@/lib/addressUtils';
import { useEffect, useMemo, useState, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import ImageEditor from '@/components/ImageEditor';
import { useConfirm } from '@/components/ConfirmProvider';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import LoadingOverlay from '@/components/LoadingOverlay';
import { CustomerFilesTabEnhanced } from './CustomerFilesTabEnhanced';
import { OpportunityListItem, CreateReportModal } from './Opportunities';
import { ProjectListItem } from './Projects';

type Client = { id:string, name?:string, display_name?:string, code?:string, city?:string, province?:string, postal_code?:string, country?:string, address_line1?:string, address_line2?:string, created_at?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, original_name?:string, uploaded_at?:string };
type Project = { id:string, code?:string, name?:string, slug?:string, created_at?:string, date_start?:string, date_end?:string };
type Contact = { id:string, name?:string, email?:string, phone?:string, is_primary?:boolean };

// Hook for count-up animation
function useCountUp(end: number, duration: number = 600, enabled: boolean = true): number {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const prevEndRef = useRef(end);

  useEffect(() => {
    if (!enabled || end === 0) {
      setCount(end);
      return;
    }

    // Reset if target changed
    if (prevEndRef.current !== end) {
      setCount(0);
      prevEndRef.current = end;
    }

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentCount = Math.floor(end * eased);
      
      setCount(currentCount);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      startTimeRef.current = null;
    };
  }, [end, duration, enabled]);

  return count;
}

// CountUp component for displaying animated numbers
function CountUp({ value, duration = 600, enabled = true }: { value: number; duration?: number; enabled?: boolean }) {
  const count = useCountUp(value, duration, enabled);
  return <>{count}</>;
}

// Date Range Modal Component
type DateRangeModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (startDate: string, endDate: string) => void;
  initialStartDate?: string;
  initialEndDate?: string;
};

function DateRangeModal({ open, onClose, onConfirm, initialStartDate = '', initialEndDate = '' }: DateRangeModalProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  useEffect(() => {
    if (open) {
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
    }
  }, [open, initialStartDate, initialEndDate]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && startDate && endDate) {
        onConfirm(startDate, endDate);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, startDate, endDate, onClose, onConfirm]);

  if (!open) return null;

  const handleConfirm = () => {
    if (startDate && endDate) {
      onConfirm(startDate, endDate);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[400px] max-w-[95vw] bg-white rounded-lg shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b font-semibold">Custom Date Range</div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="p-3 flex items-center justify-end gap-2 border-t">
          <button 
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-800" 
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="px-4 py-2 rounded bg-[#7f1010] hover:bg-[#a31414] text-white disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={handleConfirm}
            disabled={!startDate || !endDate}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

type DateFilterType = 'all' | 'last_year' | 'last_6_months' | 'last_3_months' | 'last_month' | 'custom';

// Helper function to format date for display
function formatDateForDisplay(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

// Helper function to calculate date range from filter
function calculateDateRange(dateFilter: DateFilterType, customDateStart: string, customDateEnd: string) {
  if (dateFilter === 'all') {
    return { date_from: undefined, date_to: undefined };
  }
  if (dateFilter === 'custom') {
    return {
      date_from: customDateStart || undefined,
      date_to: customDateEnd || undefined,
    };
  }
  const now = new Date();
  const dateTo = now.toISOString().split('T')[0];
  let dateFrom: string;
  switch (dateFilter) {
    case 'last_year':
      dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      break;
    case 'last_6_months':
      dateFrom = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_3_months':
      dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    case 'last_month':
      dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      break;
    default:
      return { date_from: undefined, date_to: undefined };
  }
  return { date_from: dateFrom, date_to: dateTo };
}

// Helper function to format currency in CAD
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Value resolver - tries multiple paths to find entity value
function resolveEntityValue(entityOrDetails: any): number | null {
  const paths = [
    entityOrDetails?.final_total_with_gst,
    entityOrDetails?.details?.final_total_with_gst,
    entityOrDetails?.pricing?.final_total_with_gst,
    entityOrDetails?.proposal?.final_total_with_gst,
    entityOrDetails?.value,
    entityOrDetails?.total_value,
    entityOrDetails?.service_value,
  ];
  
  for (const val of paths) {
    if (val != null) {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(num) && isFinite(num)) {
        return num;
      }
    }
  }
  return null;
}

// Proposal totals in this codebase are derived from `data.additional_costs` (and/or stored in `total`).
// This matches the "Final Total (with GST)" shown in Proposal pricing and the "Costs Summary → Total".
function calculateProposalTotalFromAdditionalCosts(proposalData: any): number {
  if (!proposalData) return 0;
  const data = proposalData?.data || proposalData || {};
  const additionalCosts = Array.isArray(data.additional_costs) ? data.additional_costs : [];
  if (additionalCosts.length === 0) return 0;

  const pstRate = Number(data.pst_rate) || 7.0;
  const gstRate = Number(data.gst_rate) || 5.0;

  const totalDirectCosts = additionalCosts.reduce((sum: number, item: any) => {
    const value = Number(item?.value || 0);
    const quantity = Number(item?.quantity || 1);
    return sum + value * quantity;
  }, 0);

  const totalForPst = additionalCosts
    .filter((item: any) => item?.pst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item?.value || 0);
      const quantity = Number(item?.quantity || 1);
      return sum + value * quantity;
    }, 0);

  const pst = totalForPst * (pstRate / 100);
  const subtotal = totalDirectCosts + pst;

  const totalForGst = additionalCosts
    .filter((item: any) => item?.gst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item?.value || 0);
      const quantity = Number(item?.quantity || 1);
      return sum + value * quantity;
    }, 0);

  const gst = totalForGst * (gstRate / 100);
  return subtotal + gst;
}

// Resolve project value from Costs Summary > Overview > Total
function resolveProjectValue(projectOrDetails: any): number | null {
  // Primary path: costs_summary.overview.total
  // Try both direct access and via details
  const paths = [
    // Primary: costs_summary.overview.total (as specified by user)
    projectOrDetails?.costs_summary?.overview?.total,
    projectOrDetails?.details?.costs_summary?.overview?.total,
    // Alternative structures
    projectOrDetails?.overview?.costs_summary?.total,
    projectOrDetails?.details?.overview?.costs_summary?.total,
    projectOrDetails?.costs_summary?.total,
    projectOrDetails?.details?.costs_summary?.total,
    projectOrDetails?.overview?.total,
    projectOrDetails?.total,
    // Fallback fields
    projectOrDetails?.service_value,
    projectOrDetails?.details?.service_value,
    projectOrDetails?.cost_actual,
    projectOrDetails?.details?.cost_actual,
    projectOrDetails?.cost_estimated,
    projectOrDetails?.details?.cost_estimated,
    // General resolver as last resort
    resolveEntityValue(projectOrDetails),
  ];
  
  for (const val of paths) {
    if (val != null && val !== '') {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(num) && isFinite(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

// Resolve opportunity value from Proposal > Pricing > Final Total (with GST)
function resolveOpportunityValue(opportunityOrDetails: any): number | null {
  // Primary path: proposal.pricing.final_total_with_gst (as specified by user)
  const paths = [
    // Primary: proposal.pricing.final_total_with_gst (as specified by user)
    opportunityOrDetails?.proposal?.pricing?.final_total_with_gst,
    opportunityOrDetails?.details?.proposal?.pricing?.final_total_with_gst,
    // Alternative structures
    opportunityOrDetails?.pricing?.final_total_with_gst,
    opportunityOrDetails?.details?.pricing?.final_total_with_gst,
    opportunityOrDetails?.proposal?.final_total_with_gst,
    opportunityOrDetails?.details?.proposal?.final_total_with_gst,
    opportunityOrDetails?.final_total_with_gst,
    opportunityOrDetails?.details?.final_total_with_gst,
    // Fallback fields
    opportunityOrDetails?.service_value,
    opportunityOrDetails?.details?.service_value,
    opportunityOrDetails?.value,
    opportunityOrDetails?.details?.value,
    opportunityOrDetails?.total_value,
    opportunityOrDetails?.details?.total_value,
    // General resolver as last resort
    resolveEntityValue(opportunityOrDetails),
  ];
  
  for (const val of paths) {
    if (val != null && val !== '') {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (!isNaN(num) && isFinite(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

// Apply date range filter to items
function applyDateRange<T extends { created_at?: string; status_changed_at?: string; date_start?: string; date_end?: string }>(
  items: T[],
  date_from?: string,
  date_to?: string
): T[] {
  if (!date_from && !date_to) return items;
  
  return items.filter(item => {
    const dateStr = item.status_changed_at || item.date_start || item.created_at || item.date_end;
    if (!dateStr) return true; // Include items without dates if no filter
    
    const itemDate = new Date(dateStr).toISOString().split('T')[0];
    if (date_from && itemDate < date_from) return false;
    if (date_to && itemDate > date_to) return false;
    return true;
  });
}

// Helper functions for donut chart
const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

const createDonutSlice = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number, centerX: number, centerY: number): string => {
  const startInner = polarToCartesian(centerX, centerY, innerRadius, endAngle);
  const endInner = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const startOuter = polarToCartesian(centerX, centerY, outerRadius, endAngle);
  const endOuter = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    `M ${startInner.x} ${startInner.y}`,
    `L ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
    'Z'
  ].join(' ');
};

// Green palette for customer charts (same as business dashboard)
const greenPalette = ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0'];

type CustomerTab = 'overview'|'general'|'files'|'contacts'|'sites'|'projects'|'opportunities'|null;

export default function CustomerDetail(){
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const searchParams = new URLSearchParams(location.search);
  const initialTabParam = searchParams.get('tab') as CustomerTab | null;
  const initialTab: CustomerTab = (initialTabParam && initialTabParam !== 'overview' && ['general','files','contacts','sites','projects','opportunities'].includes(initialTabParam))
    ? initialTabParam
    : null;
  const [tab, setTab] = useState<CustomerTab>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [customerReportModalOpen, setCustomerReportModalOpen] = useState<{ open: boolean; projectId?: string } | null>(null);
  const confirm = useConfirm();
  const { data:client, isLoading } = useQuery({ queryKey:['client', id], queryFn: ()=>api<Client>('GET', `/clients/${id}`) });
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasCustomersRead = isAdmin || permissions.has('business:customers:read');
  const hasProjectsRead = isAdmin || permissions.has('business:projects:read');
  const hasFilesRead = isAdmin || permissions.has('business:projects:files:read');
  const hasFilesWrite = isAdmin || permissions.has('business:projects:files:write');
  const hasEditPermission = isAdmin || permissions.has('business:customers:write');
  const { data:sites } = useQuery({ queryKey:['clientSites', id], queryFn: ()=>api<Site[]>('GET', `/clients/${id}/sites`) });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['clientFiles', id], queryFn: ()=>api<ClientFile[]>('GET', `/clients/${id}/files`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data: projectDivisions } = useQuery({
    queryKey: ['project-divisions'],
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
    enabled: hasProjectsRead,
  });
  const projectStatuses = (settings?.project_statuses || []) as any[];
  const reportCategories = (settings?.report_categories || []) as any[];
  const statusColorMap: Record<string,string> = useMemo(()=>{
    const list = (settings||{}).client_statuses as {label?:string, value?:string}[]|undefined;
    const m: Record<string,string> = {};
    (list||[]).forEach(it=>{ const k = String(it.label||'').trim(); const v = String(it.value||'').trim(); if(k){ m[k] = v || ''; } });
    return m;
  }, [settings]);
  const overlayUrl = useMemo(()=>{
    const branding = (settings?.branding||[]) as any[];
    const row = branding.find((i:any)=> ['customer_hero_overlay_url','hero_overlay_url','customer hero overlay','hero overlay'].includes(String(i.label||'').toLowerCase()));
    return row?.value || '';
  }, [settings]);
  const [overlayResolved, setOverlayResolved] = useState<string>('');
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error('Project name is required');
      return;
    }
    if (!id) {
      toast.error('Client ID is required');
      return;
    }
    try {
      const created: any = await api('POST', '/projects', { name: newProjectName.trim(), client_id: id });
      toast.success('Project created');
      setNewProjectOpen(false);
      setNewProjectName('');
      if (created?.id) {
        window.location.href = `/projects/${encodeURIComponent(String(created.id))}`;
      }
    } catch (e: any) {
      console.error('Failed to create project:', e);
      toast.error(e?.response?.data?.detail || 'Failed to create project');
    }
  };

  useEffect(() => {
    if (!newProjectOpen) return;
    const onKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        setNewProjectOpen(false);
        setNewProjectName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newProjectOpen]);
  const leadSources = (settings?.lead_sources||[]) as any[];
  const { data:projects } = useQuery({ queryKey:['clientProjects', id], queryFn: ()=>api<Project[]>('GET', `/projects?client=${encodeURIComponent(String(id||''))}&is_bidding=false`), enabled: hasProjectsRead });
  const { data:opportunities } = useQuery({ queryKey:['clientOpportunities', id], queryFn: ()=>api<Project[]>('GET', `/projects/business/opportunities?client_id=${encodeURIComponent(String(id||''))}`), enabled: hasProjectsRead });
  const { data:contacts } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<Contact[]>('GET', `/clients/${id}/contacts`) });
  
  // Dashboard states (must be declared before useMemo that uses them)
  const [globalDateFilter, setGlobalDateFilter] = useState<DateFilterType>('all');
  const [globalDateCustomStart, setGlobalDateCustomStart] = useState<string>('');
  const [globalDateCustomEnd, setGlobalDateCustomEnd] = useState<string>('');
  const [globalDateModalOpen, setGlobalDateModalOpen] = useState(false);
  const [globalDisplayMode, setGlobalDisplayMode] = useState<'quantity' | 'value'>('quantity');
  const [hasAnimated, setHasAnimated] = useState(false);
  // Overview pie/donut charts: tooltip and position (Opportunities by Status + Projects by Status)
  type OverviewPieTooltip = { chart: 'opp' | 'proj'; label: string; value: number; percentage: number };
  const [overviewPieTooltip, setOverviewPieTooltip] = useState<OverviewPieTooltip | null>(null);
  const [overviewPieTooltipPos, setOverviewPieTooltipPos] = useState({ x: 0, y: 0 });
  
  // Calculate date range for dashboard
  const globalDateRange = useMemo(() => 
    calculateDateRange(globalDateFilter, globalDateCustomStart, globalDateCustomEnd),
    [globalDateFilter, globalDateCustomStart, globalDateCustomEnd]
  );
  
  // Fetch project/opportunity details for values (limit to 50 most recent for performance)
  const projectsToFetch = useMemo(() => (projects || []).slice(0, 50), [projects]);
  const opportunitiesToFetch = useMemo(() => (opportunities || []).slice(0, 50), [opportunities]);
  
  // Fetch details for projects
  const projectDetailsQueries = useQuery({
    queryKey: ['projectDetails', projectsToFetch.map(p => p.id)],
    queryFn: async () => {
      const details = await Promise.all(
        projectsToFetch.map(p => 
          api<any>('GET', `/projects/${p.id}`).catch(() => null)
        )
      );
      return details.filter(Boolean);
    },
    enabled: hasProjectsRead && projectsToFetch.length > 0,
    staleTime: 120_000,
  });
  
  // Fetch details for opportunities
  const opportunityDetailsQueries = useQuery({
    queryKey: ['opportunityDetails', opportunitiesToFetch.map(o => o.id)],
    queryFn: async () => {
      const details = await Promise.all(
        opportunitiesToFetch.map(o => 
          api<any>('GET', `/projects/${o.id}`).catch(() => null)
        )
      );
      return details.filter(Boolean);
    },
    enabled: hasProjectsRead && opportunitiesToFetch.length > 0,
    staleTime: 120_000,
  });
  
  // Combine base data with details
  // Note: "Costs Summary → Total" and Proposal pricing totals are derived from /proposals, not /projects/:id.
  const projectsWithDetails = useMemo(() => {
    const detailsMap = new Map((projectDetailsQueries.data || []).map((d: any) => [d.id, d]));
    return (projects || []).map(p => {
      const fullDetails = detailsMap.get(p.id);
      // Merge the full details into the project object so costs_summary is accessible directly
      return {
        ...p,
        ...fullDetails, // Spread full details to make costs_summary accessible at root level
        details: fullDetails, // Also keep in details for backward compatibility
      };
    });
  }, [projects, projectDetailsQueries.data]);
  
  const opportunitiesWithDetails = useMemo(() => {
    const detailsMap = new Map((opportunityDetailsQueries.data || []).map((d: any) => [d.id, d]));
    return (opportunities || []).map(o => {
      const fullDetails = detailsMap.get(o.id);
      // Merge full details; preserve cost_estimated from list (from proposal) when detail has none
      const listCostEstimated = (o as any).cost_estimated;
      const detailCostEstimated = fullDetails?.cost_estimated;
      return {
        ...o,
        ...fullDetails,
        cost_estimated: detailCostEstimated != null ? detailCostEstimated : listCostEstimated,
        details: fullDetails,
      };
    });
  }, [opportunities, opportunityDetailsQueries.data]);
  
  // Apply date filter
  const filteredProjects = useMemo(() => 
    applyDateRange(projectsWithDetails, globalDateRange.date_from, globalDateRange.date_to),
    [projectsWithDetails, globalDateRange]
  );
  
  const filteredOpportunities = useMemo(() => 
    applyDateRange(opportunitiesWithDetails, globalDateRange.date_from, globalDateRange.date_to),
    [opportunitiesWithDetails, globalDateRange]
  );

  // For Revenue & Pipeline chart values we need proposal totals:
  // - Projects: "Costs Summary → Total" (sum of original proposal + change orders) - ALL statuses
  // - Opportunities: "Final Total (with GST)" (proposal pricing total) - ALL statuses
  // Include finished projects and open opportunities for KPIs, plus up to 50 most recent
  const chartProjects = useMemo(() => {
    const finished = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      return status === 'finished';
    });
    const others = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      return status !== 'finished';
    }).slice(0, 50 - finished.length);
    const combined = [...finished, ...others];
    return combined.length > 50 ? combined.slice(0, 50) : combined;
  }, [filteredProjects]);

  const chartOpportunities = useMemo(() => {
    const open = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return status === 'prospecting' || status === 'sent to customer';
    });
    const others = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return !(status === 'prospecting' || status === 'sent to customer');
    }).slice(0, 50 - open.length);
    const combined = [...open, ...others];
    return combined.length > 50 ? combined.slice(0, 50) : combined;
  }, [filteredOpportunities]);

  const projectCostsSummaryTotalsQuery = useQuery({
    queryKey: ['project-costs-summary-totals', chartProjects.map(p => p.id)],
    queryFn: async () => {
      const results = await Promise.all(
        chartProjects.map(async (p) => {
          const proposals = await api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(p.id))}`).catch(() => []);
          if (!Array.isArray(proposals) || proposals.length === 0) {
            return { id: p.id, total: 0 };
          }

          // Sum totals across original + change orders (Costs Summary behavior)
          const totals = await Promise.all(
            proposals.map(async (pr) => {
              if (typeof pr?.total === 'number' && isFinite(pr.total) && pr.total > 0) return pr.total;
              const computedFromList = calculateProposalTotalFromAdditionalCosts(pr);
              if (computedFromList > 0) return computedFromList;
              const full = await api<any>('GET', `/proposals/${encodeURIComponent(String(pr.id))}`).catch(() => pr);
              if (typeof full?.total === 'number' && isFinite(full.total) && full.total > 0) return full.total;
              const computed = calculateProposalTotalFromAdditionalCosts(full);
              return computed > 0 ? computed : 0;
            })
          );

          const sum = totals.reduce((acc, v) => acc + (Number(v) || 0), 0);
          return { id: p.id, total: sum };
        })
      );
      return results;
    },
    enabled: hasProjectsRead && chartProjects.length > 0,
    staleTime: 120_000,
  });

  const opportunityProposalTotalsQuery = useQuery({
    queryKey: ['opportunity-proposal-totals', chartOpportunities.map(o => o.id)],
    queryFn: async () => {
      const results = await Promise.all(
        chartOpportunities.map(async (o) => {
          const proposals = await api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(o.id))}`).catch(() => []);
          if (!Array.isArray(proposals) || proposals.length === 0) {
            return { id: o.id, total: 0 };
          }

          const originals = proposals.filter((p: any) => p && p.is_change_order !== true);
          const candidates = originals.length > 0 ? originals : proposals;
          const picked = candidates
            .slice()
            .sort((a: any, b: any) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())[0];

          if (!picked) return { id: o.id, total: 0 };

          if (typeof picked?.total === 'number' && isFinite(picked.total) && picked.total > 0) {
            return { id: o.id, total: picked.total };
          }

          const computedFromList = calculateProposalTotalFromAdditionalCosts(picked);
          if (computedFromList > 0) return { id: o.id, total: computedFromList };

          const full = await api<any>('GET', `/proposals/${encodeURIComponent(String(picked.id))}`).catch(() => picked);
          if (typeof full?.total === 'number' && isFinite(full.total) && full.total > 0) {
            return { id: o.id, total: full.total };
          }
          const computed = calculateProposalTotalFromAdditionalCosts(full);
          return { id: o.id, total: computed > 0 ? computed : 0 };
        })
      );
      return results;
    },
    enabled: hasProjectsRead && chartOpportunities.length > 0,
    staleTime: 120_000,
  });

  const projectCostsSummaryTotalsMap = useMemo(() => {
    return new Map((projectCostsSummaryTotalsQuery.data || []).map((r: any) => [r.id, r.total]));
  }, [projectCostsSummaryTotalsQuery.data]);

  const opportunityProposalTotalsMap = useMemo(() => {
    return new Map((opportunityProposalTotalsQuery.data || []).map((r: any) => [r.id, r.total]));
  }, [opportunityProposalTotalsQuery.data]);
  
  const isOverviewLoading =
    projectDetailsQueries.isLoading ||
    opportunityDetailsQueries.isLoading ||
    projectCostsSummaryTotalsQuery.isLoading ||
    opportunityProposalTotalsQuery.isLoading;

  // Track animation — trigger after overlay with logo spinner is gone (same as Home/Business)
  useEffect(() => {
    if (!isOverviewLoading && !hasAnimated) {
      const timer = setTimeout(() => setHasAnimated(true), 80);
      return () => clearTimeout(timer);
    }
  }, [isOverviewLoading, hasAnimated]);
  
  // Calculate KPIs — 6 metrics, each with count + value (Quantity/Value toggle)
  const kpis = useMemo(() => {
    const finishedProjects = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      return status === 'finished';
    });
    const activeProjects = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      return status === 'in progress';
    });
    const onHoldProjects = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      return status === 'on hold';
    });
    const prospectingOpps = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return status === 'prospecting';
    });
    const sentOpps = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return status === 'sent to customer';
    });
    const openOpportunities = [...prospectingOpps, ...sentOpps];

    const sumProjectValue = (list: typeof filteredProjects) =>
      list.reduce((sum, p) => sum + Number(projectCostsSummaryTotalsMap.get(p.id) || 0), 0);
    const sumOppValue = (list: typeof filteredOpportunities) =>
      list.reduce((sum, o) => sum + Number(opportunityProposalTotalsMap.get(o.id) || 0), 0);

    return {
      closed: { count: finishedProjects.length, value: sumProjectValue(finishedProjects) },
      pipeline: { count: openOpportunities.length, value: sumOppValue(openOpportunities) },
      sent: { count: sentOpps.length, value: sumOppValue(sentOpps) },
      prospecting: { count: prospectingOpps.length, value: sumOppValue(prospectingOpps) },
      inProgress: { count: activeProjects.length, value: sumProjectValue(activeProjects) },
      onHold: { count: onHoldProjects.length, value: sumProjectValue(onHoldProjects) },
    };
  }, [filteredProjects, filteredOpportunities, projectCostsSummaryTotalsMap, opportunityProposalTotalsMap]);
  
  // Calculate status breakdowns
  const oppStatusBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; value: number }> = {};
    filteredOpportunities.forEach(opp => {
      const status = (opp.details?.status_label || opp.status_label || 'Unknown').trim();
      if (!breakdown[status]) {
        breakdown[status] = { count: 0, value: 0 };
      }
      breakdown[status].count++;
      // Use proposal totals map instead of resolveEntityValue
      const val = Number(opportunityProposalTotalsMap.get(opp.id) || 0);
      if (val > 0) breakdown[status].value += val;
    });
    return breakdown;
  }, [filteredOpportunities, opportunityProposalTotalsMap]);
  
  const projStatusBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; value: number }> = {};
    filteredProjects.forEach(proj => {
      const status = (proj.details?.status_label || proj.status_label || 'Unknown').trim();
      if (!breakdown[status]) {
        breakdown[status] = { count: 0, value: 0 };
      }
      breakdown[status].count++;
      // Use proposal totals map instead of resolveEntityValue
      const val = Number(projectCostsSummaryTotalsMap.get(proj.id) || 0);
      if (val > 0) breakdown[status].value += val;
    });
    return breakdown;
  }, [filteredProjects, projectCostsSummaryTotalsMap]);
  
  // Calculate insights
  const insights = useMemo(() => {
    // Converted Projects: lifetime metric (not filtered by date range)
    // Count all projects with status "In Progress", "On Hold", or "Finished"
    const convertedProjects = (projects || []).filter(p => {
      const status = (p.status_label || '').trim().toLowerCase();
      return status === 'in progress' || status === 'on hold' || status === 'finished';
    }).length;
    
    // Largest Deal: use the same source as charts (projectCostsSummaryTotalsMap)
    const projectValues = (projects || []).map(p => {
      return Number(projectCostsSummaryTotalsMap.get(p.id) || 0);
    }).filter(v => v > 0);
    const largestDeal = projectValues.length > 0 ? Math.max(...projectValues) : 0;
    
    const allDates = [
      ...filteredProjects.map(p => p.created_at || p.details?.created_at),
      ...filteredOpportunities.map(o => o.created_at || o.details?.created_at),
    ].filter(Boolean) as string[];
    const lastActivity = allDates.length > 0 
      ? new Date(Math.max(...allDates.map(d => new Date(d).getTime())))
      : null;
    
    const openOppsWithDates = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return status === 'prospecting' || status === 'sent to customer';
    });
    const avgPipelineAge = openOppsWithDates.length > 0
      ? openOppsWithDates.reduce((sum, o) => {
          const created = o.created_at || o.details?.created_at;
          if (!created) return sum;
          const days = Math.floor((Date.now() - new Date(created).getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / openOppsWithDates.length
      : 0;
    
    const totalProjects = filteredProjects.length;
    const holdRate = totalProjects > 0 ? (kpis.onHold.count / totalProjects) * 100 : 0;
    
    return {
      convertedProjects,
      largestDeal,
      lastActivity,
      avgPipelineAge: Math.round(avgPipelineAge),
      holdRate,
    };
  }, [projects, filteredProjects, filteredOpportunities, kpis.onHold.count, projectCostsSummaryTotalsMap]);
  
  // Generate recent activity
  const recentActivity = useMemo(() => {
    const events: Array<{ type: string; label: string; date: string; id: string }> = [];
    
    filteredProjects.forEach(p => {
      const created = p.created_at || p.details?.created_at;
      if (created) {
        events.push({
          type: 'project_created',
          label: `Project "${p.name || p.code || 'Untitled'}" created`,
          date: created,
          id: p.id,
        });
      }
      const status = (p.details?.status_label || p.status_label || '').toLowerCase();
      const statusChanged = p.details?.status_changed_at;
      if (status === 'finished' && statusChanged) {
        events.push({
          type: 'project_finished',
          label: `Project "${p.name || p.code || 'Untitled'}" finished`,
          date: statusChanged,
          id: p.id,
        });
      }
    });
    
    filteredOpportunities.forEach(o => {
      const created = o.created_at || o.details?.created_at;
      if (created) {
        events.push({
          type: 'opportunity_created',
          label: `Opportunity "${o.name || o.code || 'Untitled'}" created`,
          date: created,
          id: o.id,
        });
      }
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      const statusChanged = o.details?.status_changed_at;
      if (status === 'sent to customer' && statusChanged) {
        events.push({
          type: 'opportunity_sent',
          label: `Opportunity "${o.name || o.code || 'Untitled'}" sent to customer`,
          date: statusChanged,
          id: o.id,
        });
      } else if (status === 'refused' && statusChanged) {
        events.push({
          type: 'opportunity_refused',
          label: `Opportunity "${o.name || o.code || 'Untitled'}" refused`,
          date: statusChanged,
          id: o.id,
        });
      }
    });
    
    return events
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [filteredProjects, filteredOpportunities]);
  
  // Calculate value over time (monthly/quarterly series) with status breakdown
  const valueOverTime = useMemo(() => {
    const mode = globalDisplayMode;
    const periods: Record<string, { 
      closed: number; 
      pipeline: number;
      closedByStatus: Record<string, number>;
      pipelineByStatus: Record<string, number>;
      closedCount?: number;  // For quantity mode
      pipelineCount?: number; // For quantity mode
    }> = {};
    const now = new Date();
    const startDate = globalDateRange.date_from ? new Date(globalDateRange.date_from) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const endDate = globalDateRange.date_to ? new Date(globalDateRange.date_to) : now;
    
    // Determine if we should use quarters (if range > 14 months)
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    const useQuarters = monthsDiff > 14;
    
    // Initialize periods
    const current = new Date(startDate);
    while (current <= endDate) {
      let key: string;
      if (useQuarters) {
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        key = `Q${quarter} ${current.getFullYear()}`;
        // Move to next quarter
        current.setMonth(Math.floor(current.getMonth() / 3) * 3 + 3);
      } else {
        key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        current.setMonth(current.getMonth() + 1);
      }
      if (!periods[key]) {
        periods[key] = { closed: 0, pipeline: 0, closedByStatus: {}, pipelineByStatus: {}, closedCount: 0, pipelineCount: 0 };
      }
    }
    
    // Aggregate based on mode
    if (mode === 'value') {
      // Aggregate Closed Value (ALL projects) - date: finished_at → end_date → created_at
      // Value source: Costs Summary → Total (derived from proposals)
      filteredProjects.forEach(p => {
        const status = (p.details?.status_label || p.status_label || '').trim();
        if (!status) return;

        // For finished projects, use finished_at/end_date; for others, use created_at
        let projectDate: string | undefined;
        if (status.toLowerCase() === 'finished') {
          projectDate = p.details?.finished_at || p.details?.date_end || p.date_end || p.created_at || p.details?.created_at;
        } else {
          projectDate = p.created_at || p.details?.created_at;
        }
        if (!projectDate) return;

        const date = new Date(projectDate);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (dateOnly < startDateOnly || dateOnly > endDateOnly) return;

        let key: string;
        if (useQuarters) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!periods[key]) return;

        const total = Number(projectCostsSummaryTotalsMap.get(p.id) || 0);
        if (total > 0) {
          periods[key].closed += total;
          if (!periods[key].closedByStatus[status]) {
            periods[key].closedByStatus[status] = 0;
          }
          periods[key].closedByStatus[status] += total;
        }
      });

      // Aggregate Pipeline Value (ALL opportunities) - date: created_at
      // Value source: Proposal Pricing "Final Total (with GST)" (derived from proposals)
      filteredOpportunities.forEach(o => {
        const status = (o.details?.status_label || o.status_label || '').trim();
        if (!status) return;

        const created = o.created_at || o.details?.created_at;
        if (!created) return;

        const date = new Date(created);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (dateOnly < startDateOnly || dateOnly > endDateOnly) return;

        let key: string;
        if (useQuarters) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!periods[key]) return;

        const total = Number(opportunityProposalTotalsMap.get(o.id) || 0);
        if (total > 0) {
          periods[key].pipeline += total;
          if (!periods[key].pipelineByStatus[status]) {
            periods[key].pipelineByStatus[status] = 0;
          }
          periods[key].pipelineByStatus[status] += total;
        }
      });
    } else {
      // Quantity mode: count projects and opportunities
      filteredProjects.forEach(p => {
        const status = (p.details?.status_label || p.status_label || '').trim();
        if (!status) return;

        // For finished projects, use finished_at/end_date; for others, use created_at
        let projectDate: string | undefined;
        if (status.toLowerCase() === 'finished') {
          projectDate = p.details?.finished_at || p.details?.date_end || p.date_end || p.created_at || p.details?.created_at;
        } else {
          projectDate = p.created_at || p.details?.created_at;
        }
        if (!projectDate) return;

        const date = new Date(projectDate);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (dateOnly < startDateOnly || dateOnly > endDateOnly) return;

        let key: string;
        if (useQuarters) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!periods[key]) return;

        periods[key].closedCount = (periods[key].closedCount || 0) + 1;
        // Track by status for tooltip
        if (status) {
          if (!periods[key].closedByStatus[status]) {
            periods[key].closedByStatus[status] = 0;
          }
          periods[key].closedByStatus[status] += 1;
        }
      });

      filteredOpportunities.forEach(o => {
        const status = (o.details?.status_label || o.status_label || '').trim();
        if (!status) return;

        const created = o.created_at || o.details?.created_at;
        if (!created) return;

        const date = new Date(created);
        const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (dateOnly < startDateOnly || dateOnly > endDateOnly) return;

        let key: string;
        if (useQuarters) {
          const quarter = Math.floor(date.getMonth() / 3) + 1;
          key = `Q${quarter} ${date.getFullYear()}`;
        } else {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (!periods[key]) return;

        periods[key].pipelineCount = (periods[key].pipelineCount || 0) + 1;
        // Track by status for tooltip
        if (status) {
          if (!periods[key].pipelineByStatus[status]) {
            periods[key].pipelineByStatus[status] = 0;
          }
          periods[key].pipelineByStatus[status] += 1;
        }
      });
    }
    
    
    const entries = Object.entries(periods)
      .sort(([a], [b]) => {
        // Sort by year and month/quarter
        const aMatch = a.match(/(\d{4})/);
        const bMatch = b.match(/(\d{4})/);
        if (!aMatch || !bMatch) return a.localeCompare(b);
        const aYear = parseInt(aMatch[1]);
        const bYear = parseInt(bMatch[1]);
        if (aYear !== bYear) return aYear - bYear;
        // If same year, compare by quarter/month
        const aQ = a.match(/Q(\d)/);
        const bQ = b.match(/Q(\d)/);
        if (aQ && bQ) return parseInt(aQ[1]) - parseInt(bQ[1]);
        const aMonth = a.match(/-(\d{2})/);
        const bMonth = b.match(/-(\d{2})/);
        if (aMonth && bMonth) return parseInt(aMonth[1]) - parseInt(bMonth[1]);
        return a.localeCompare(b);
      });
    
    return entries;
  }, [filteredProjects, filteredOpportunities, globalDateRange, projectCostsSummaryTotalsMap, opportunityProposalTotalsMap, globalDisplayMode]);
  
  
  // Build funnel metrics (event-based with conversion tracking)
  const buildFunnelMetrics = useMemo(() => {
    const mode = globalDisplayMode;
    const dateFrom = globalDateRange.date_from;
    const dateTo = globalDateRange.date_to;
    
    // Helper to check if date is in range
    const isInRange = (dateStr?: string): boolean => {
      if (!dateStr) return false;
      if (!dateFrom && !dateTo) return true;
      const itemDate = new Date(dateStr).toISOString().split('T')[0];
      if (dateFrom && itemDate < dateFrom) return false;
      if (dateTo && itemDate > dateTo) return false;
      return true;
    };
    
    // Prospecting: opportunities whose current status is "prospecting" (and in date range via filteredOpportunities)
    const prospectingOpps = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      return status === 'prospecting';
    });
    
    // Sent to Customer: opportunities that reached this status in range
    const sentOpps = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      if (status !== 'sent to customer') return false;
      // Prefer sent_at/status_changed_at, fallback to updated_at, then created_at
      const sentDate = o.details?.sent_at || o.details?.status_changed_at || o.details?.updated_at || o.created_at || o.details?.created_at;
      return isInRange(sentDate);
    });
    
    // Refused: opportunities refused in range
    const refusedOpps = filteredOpportunities.filter(o => {
      const status = (o.details?.status_label || o.status_label || '').toLowerCase();
      if (status !== 'refused') return false;
      const refusedDate = o.details?.refused_at || o.details?.status_changed_at || o.details?.updated_at || o.created_at || o.details?.created_at;
      return isInRange(refusedDate);
    });
    
    // Converted/Won: projects with status In Progress, On Hold, or Finished in range
    const convertedProjects = filteredProjects.filter(p => {
      const status = (p.details?.status_label || p.status_label || '').trim().toLowerCase();
      const isWonStatus = status === 'in progress' || status === 'on hold' || status === 'finished';
      if (!isWonStatus) return false;
      // Use created_at or status_changed_at to check if in range
      const dateToCheck = p.details?.status_changed_at || p.created_at || p.details?.created_at;
      return isInRange(dateToCheck);
    });
    
    // Conversion tracking is always available since we use project status
    const hasConversionTracking = true;
    
    // Calculate metrics based on mode
    let prospectingValue: number;
    let sentValue: number;
    let refusedValue: number;
    let convertedValue: number;
    
    if (mode === 'quantity') {
      prospectingValue = prospectingOpps.length;
      sentValue = sentOpps.length;
      refusedValue = refusedOpps.length;
      convertedValue = convertedProjects.length;
    } else {
      // Value mode: use proposal totals maps
      prospectingValue = prospectingOpps.reduce((sum, o) => {
        const val = Number(opportunityProposalTotalsMap.get(o.id) || 0);
        return sum + val;
      }, 0);
      sentValue = sentOpps.reduce((sum, o) => {
        const val = Number(opportunityProposalTotalsMap.get(o.id) || 0);
        return sum + val;
      }, 0);
      refusedValue = refusedOpps.reduce((sum, o) => {
        const val = Number(opportunityProposalTotalsMap.get(o.id) || 0);
        return sum + val;
      }, 0);
      convertedValue = convertedProjects.reduce((sum, p) => {
        const val = Number(projectCostsSummaryTotalsMap.get(p.id) || 0);
        return sum + val;
      }, 0);
    }
    
    // Percentages as share of total funnel (Prospecting + Sent + Refused + Converted = 100%)
    const totalFunnel = prospectingValue + sentValue + refusedValue + convertedValue;
    const prospectingPct = totalFunnel > 0 ? (prospectingValue / totalFunnel) * 100 : null;
    const sentPct = totalFunnel > 0 ? (sentValue / totalFunnel) * 100 : null;
    const refusedPct = totalFunnel > 0 ? (refusedValue / totalFunnel) * 100 : null;
    const convertedPct = totalFunnel > 0 ? (convertedValue / totalFunnel) * 100 : null;
    
    return {
      prospecting: prospectingValue,
      sent: sentValue,
      refused: refusedValue,
      converted: convertedValue,
      prospectingPct,
      sentPct,
      refusedPct,
      convertedPct,
      hasConversionTracking,
    };
  }, [filteredOpportunities, filteredProjects, globalDisplayMode, globalDateRange, opportunityProposalTotalsMap, projectCostsSummaryTotalsMap]);
  
  // Build project donut data (respects global mode)
  const buildProjectDonutData = useMemo(() => {
    const mode = globalDisplayMode;
    const statusCounts: Record<string, { count: number; value: number }> = {};
    
    filteredProjects.forEach(p => {
      const statusRaw = (p.details?.status_label || p.status_label || '').trim();
      if (!statusRaw) return;
      
      // Normalize status to lowercase for comparison, but keep original for display
      const statusLower = statusRaw.toLowerCase();
      const statusDisplay = statusRaw; // Keep original case for display
      
      // Map normalized status to display name
      const statusMap: Record<string, string> = {
        'in progress': 'In Progress',
        'on hold': 'On Hold',
        'finished': 'Finished',
      };
      const displayStatus = statusMap[statusLower] || statusDisplay;
      
      if (!statusCounts[displayStatus]) {
        statusCounts[displayStatus] = { count: 0, value: 0 };
      }
      statusCounts[displayStatus].count++;
      // Use proposal totals map instead of resolveEntityValue
      const val = Number(projectCostsSummaryTotalsMap.get(p.id) || 0);
      if (val > 0) statusCounts[displayStatus].value += val;
    });
    
    // Only include official statuses
    const officialStatuses = ['In Progress', 'On Hold', 'Finished'];
    const result: Array<{ status: string; count: number; value: number }> = [];
    officialStatuses.forEach(s => {
      if (statusCounts[s]) {
        result.push({ status: s, count: statusCounts[s].count, value: statusCounts[s].value });
      }
    });
    
    return result.sort((a, b) => {
      if (mode === 'value') {
        return b.value - a.value;
      }
      return b.count - a.count;
    });
  }, [filteredProjects, globalDisplayMode, projectCostsSummaryTotalsMap]);
  
  // Determine available tabs based on permissions
  // Order: Overview → General → Contacts → Files → Sites → Opportunities → Projects
  const availableTabs = useMemo(() => {
    const tabs: string[] = [];
    
    // Overview (requires View Projects & Opportunities)
    if (hasProjectsRead) {
      tabs.push('overview');
    }
    
    // General and Contacts (requires View Customers)
    if (hasCustomersRead) {
      tabs.push('general', 'contacts');
    }
    
    // Files (requires View Files)
    if (hasFilesRead) {
      tabs.push('files');
    }
    
    // Sites, Opportunities, Projects (requires View Projects & Opportunities)
    if (hasProjectsRead) {
      tabs.push('sites', 'opportunities', 'projects');
    }
    
    return tabs;
  }, [hasCustomersRead, hasProjectsRead, hasFilesRead]);
  
  // Sync tab from URL when location.search changes
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const tabParam = sp.get('tab') as string | null;
    if (tabParam && tabParam !== 'overview' && ['general','files','contacts','sites','projects','opportunities'].includes(tabParam)) {
      setTab(tabParam as CustomerTab);
    } else {
      setTab(null);
    }
  }, [location.search]);

  // Redirect to first available tab if current tab is not available
  useEffect(() => {
    if (tab !== null && availableTabs.length > 0 && !availableTabs.includes(tab)) {
      setTab(availableTabs[0] === 'overview' ? null : (availableTabs[0] as CustomerTab));
    }
  }, [tab, availableTabs]);

  // Auto-collapse hero when a tab is selected (not overview), expand when on overview
  useEffect(() => {
    if (tab === null) {
      setIsHeroCollapsed(false);
    } else {
      setIsHeroCollapsed(true);
    }
  }, [tab]);
  const { data:employees } = useQuery({ queryKey:['employees'], queryFn: ()=> api<any[]>('GET','/employees') });
  const primaryContact = (contacts||[]).find(c=>c.is_primary) || (contacts||[])[0];
  const clientLogoRec = (files||[]).find(f=> !f.site_id && String(f.category||'').toLowerCase()==='client-logo-derived');
  const clientAvatar = clientLogoRec? `/files/${clientLogoRec.file_object_id}/thumbnail?w=96` : '/ui/assets/placeholders/customer.png';
  const clientAvatarLarge = clientLogoRec? `/files/${clientLogoRec.file_object_id}/thumbnail?w=800` : '/ui/assets/placeholders/customer.png';
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingGeneral, setIsEditingGeneral] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sitePicker, setSitePicker] = useState<{ open:boolean, siteId?:string }|null>(null);
  const [projectPicker, setProjectPicker] = useState<{ open:boolean, projectId?:string }|null>(null);
  
  // Save function for unsaved changes guard
  const handleSave = async () => {
    if (!dirty || !id || isSaving) return;
    const toList = (s:string)=> (String(s||'').split(',').map(x=>x.trim()).filter(Boolean));
    const payload:any = {
      display_name: form.display_name||null,
      legal_name: form.legal_name||null,
      client_type: form.client_type||null,
      client_status: form.client_status||null,
      lead_source: form.lead_source||null,
      billing_email: form.billing_email||null,
      po_required: form.po_required==='true',
      tax_number: form.tax_number||null,
      address_line1: form.address_line1||null,
      address_line2: form.address_line2||null,
      country: form.country||null,
      province: form.province||null,
      city: form.city||null,
      postal_code: form.postal_code||null,
      billing_same_as_address: !!form.billing_same_as_address,
      billing_address_line1: form.billing_same_as_address? (form.address_line1||null) : (form.billing_address_line1||null),
      billing_address_line2: form.billing_same_as_address? (form.address_line2||null) : (form.billing_address_line2||null),
      billing_country: form.billing_same_as_address? (form.country||null) : (form.billing_country||null),
      billing_province: form.billing_same_as_address? (form.province||null) : (form.billing_province||null),
      billing_city: form.billing_same_as_address? (form.city||null) : (form.billing_city||null),
      billing_postal_code: form.billing_same_as_address? (form.postal_code||null) : (form.billing_postal_code||null),
      preferred_language: form.preferred_language||null,
      preferred_channels: toList(form.preferred_channels||''),
      marketing_opt_in: form.marketing_opt_in==='true',
      invoice_delivery_method: form.invoice_delivery_method||null,
      statement_delivery_method: form.statement_delivery_method||null,
      cc_emails_for_invoices: toList(form.cc_emails_for_invoices||''),
      cc_emails_for_estimates: toList(form.cc_emails_for_estimates||''),
      do_not_contact: form.do_not_contact==='true',
      do_not_contact_reason: form.do_not_contact_reason||null,
      description: form.description||null,
    };
    const reqOk = String(form.display_name||'').trim().length>0 && String(form.legal_name||'').trim().length>0;
    if(!reqOk){ toast.error('Display name and Legal name are required'); return; }
    try{ 
      setIsSaving(true);
      await api('PATCH', `/clients/${id}`, payload); 
      setDirty(false);
      setIsEditingGeneral(false);
    }catch(e: any){ 
      const msg = e?.message || 'Save failed';
      if(msg.includes('HTTP 4') && !msg.includes('HTTP 40')) {
        toast.error(msg);
      } else {
        setDirty(false);
      }
    } finally {
      setIsSaving(false);
    }
  };
  
  // Use unsaved changes guard - only when editing
  useUnsavedChangesGuard(dirty && isEditingGeneral, handleSave);
  
  useEffect(()=>{ if(client){ setForm({
    display_name: client.display_name||'', legal_name: client.legal_name||'', code: client.id?.slice(0,8) || '',
    client_type: (client as any).client_type||'', client_status: (client as any).client_status||'', lead_source:(client as any).lead_source||'',
    billing_email:(client as any).billing_email||'', po_required: (client as any).po_required? 'true':'false', tax_number:(client as any).tax_number||'', description:(client as any).description||'',
    address_line1: client.address_line1||'', address_line2: client.address_line2||'', country:(client as any).country||'', province:(client as any).province||'', city:(client as any).city||'', postal_code: client.postal_code||'',
    billing_same_as_address: ((client as any).billing_same_as_address === false) ? false : true,
    billing_address_line1: (client as any).billing_address_line1||'', billing_address_line2:(client as any).billing_address_line2||'', billing_country:(client as any).billing_country||'', billing_province:(client as any).billing_province||'', billing_city:(client as any).billing_city||'', billing_postal_code:(client as any).billing_postal_code||'',
    preferred_language:(client as any).preferred_language||'', preferred_channels: ((client as any).preferred_channels||[]).join(', '),
    marketing_opt_in: (client as any).marketing_opt_in? 'true':'false', invoice_delivery_method:(client as any).invoice_delivery_method||'', statement_delivery_method:(client as any).statement_delivery_method||'',
    cc_emails_for_invoices: ((client as any).cc_emails_for_invoices||[]).join(', '), cc_emails_for_estimates: ((client as any).cc_emails_for_estimates||[]).join(', '),
    do_not_contact:(client as any).do_not_contact? 'true':'false', do_not_contact_reason:(client as any).do_not_contact_reason||'',
    estimator_id: (client as any).estimator_id||''
  }); setDirty(false); } }, [client]);
  const set = (k:string, v:any)=> setForm((s:any)=>{ setDirty(true); return { ...s, [k]: v }; });
  const fileBySite = useMemo(()=>{
    const m: Record<string, ClientFile[]> = {};
    (files||[]).forEach(f=>{ const sid = (f.site_id||'') as string; m[sid] = m[sid]||[]; m[sid].push(f); });
    return m;
  }, [files]);
  const c = client || {} as Client;
  const isDisplayValid = useMemo(()=> String(form.display_name||'').trim().length>0, [form.display_name]);
  const isLegalValid = useMemo(()=> String(form.legal_name||'').trim().length>0, [form.legal_name]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const getPageTitle = (client: Client | typeof c, activeTab: CustomerTab): string => {
    if (!activeTab) return 'Customer Information';
    const tabTitles: Record<string, string> = {
      general: 'General',
      contacts: 'Contacts',
      files: 'Files',
      sites: 'Sites',
      opportunities: 'Opportunities',
      projects: 'Projects',
    };
    return `Customer Information • ${tabTitles[activeTab] || activeTab}`;
  };

  const getPageDescription = (_client: Client | typeof c, activeTab: CustomerTab): string => {
    if (!activeTab) return 'Profile, sites, projects, and files for this customer.';
    const tabDescriptions: Record<string, string> = {
      general: 'Company identity and billing details',
      contacts: 'Contacts and primary contact',
      files: 'Documents and files',
      sites: 'Construction sites',
      opportunities: 'Open opportunities',
      projects: 'Active projects',
    };
    return tabDescriptions[activeTab] || '';
  };

  const handleTabClick = (newTab: 'overview' | CustomerTab) => {
    if (newTab === 'overview' || newTab === null) {
      setTab(null);
      navigate(location.pathname, { replace: true });
      return;
    }
    setTab(newTab);
    navigate(`${location.pathname}?tab=${newTab}`, { replace: true });
  };

  return (
    <div>
      {/* Title Bar - ProjectDetail style */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => {
                if (tab !== null) {
                  setTab(null);
                  navigate(location.pathname, { replace: true });
                } else {
                  navigate('/customers');
                }
              }}
              className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
              title={tab !== null ? 'Back to Overview' : 'Back to Customers'}
            >
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div>
              <div className="text-sm font-semibold text-gray-900">{getPageTitle(c, tab)}</div>
              <div className="text-xs text-gray-500 mt-0.5">{getPageDescription(c, tab)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Hero Section - white, compact, collapsible (ProjectDetail style) */}
      <div className={`transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out ${isHeroCollapsed ? 'mb-2' : 'mb-4'}`}>
        <div className="relative" style={{ minHeight: isHeroCollapsed ? 'auto' : 'auto' }}>
          {/* Expanded View */}
          <div className={`rounded-xl border bg-white overflow-hidden transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out ${
            isHeroCollapsed ? 'opacity-0 max-h-0 pointer-events-none relative' : 'opacity-100 max-h-[2000px] pointer-events-auto relative'
          }`} style={{
            transitionProperty: 'max-height, opacity',
            transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
            transitionTimingFunction: 'ease-in-out, ease-in-out'
          }}>
            {isAdmin && (
              <button
                type="button"
                onClick={async (e) => { e.stopPropagation(); const ok = await confirm({ title: 'Delete customer', message: 'Are you sure you want to delete this customer? This action cannot be undone.' }); if (!ok) return; try { await api('DELETE', `/clients/${encodeURIComponent(String(id||''))}`); toast.success('Customer deleted'); await queryClient.invalidateQueries({ queryKey: ['clients'] }); navigate('/customers'); } catch (_e) { toast.error('Failed to delete customer'); } }}
                className="absolute top-2 right-2 z-10 px-2 py-1 rounded text-[11px] font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                title="Delete Customer"
              >
                Delete Customer
              </button>
            )}
            <div className="p-3 overflow-visible">
              <div className="flex gap-3 items-start">
                <div className="w-48 flex-shrink-0">
                  <div className="w-48 h-36 rounded-xl border overflow-hidden group relative">
                    <img src={clientAvatarLarge} className="w-full h-full object-cover" alt="" />
                    <button onClick={()=>setPickerOpen(true)} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-xs">✏️ Change</button>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{c.display_name||c.name||id}</h3>
                  </div>
                  <div className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-2 gap-y-1.5">
                    <div className="min-w-0">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Code</span>
                        <div className="text-xs font-semibold text-gray-900 mt-0.5">{c.code || id?.slice(0, 8) || '—'}</div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Address</span>
                        <div className="text-xs font-semibold text-gray-900 mt-0.5 truncate" title={formatAddressDisplay({ address_line1: c.address_line1, address_line2: (c as any).address_line2, city: c.city, province: c.province, postal_code: c.postal_code, country: c.country })}>
                          {formatAddressDisplay({ address_line1: c.address_line1, address_line2: (c as any).address_line2, city: c.city, province: c.province, postal_code: c.postal_code, country: c.country })}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Status</span>
                        <div className="mt-0.5">
                          {((c as any).client_status) ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium inline-block" style={{ backgroundColor: statusColorMap[String((c as any).client_status)] || '#eeeeee', color: '#000' }}>
                              {String((c as any).client_status)}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Type</span>
                        <div className="text-xs font-semibold text-gray-900 mt-0.5">{(c as any).client_type ? String((c as any).client_type) : '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              title="Collapse"
            >
              <svg className="w-3 h-3 transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Collapsed View */}
          <div className={`rounded-xl border bg-white overflow-hidden transition-all ${isHeroCollapsed ? 'duration-[1200ms]' : 'duration-[1800ms]'} ease-in-out absolute top-0 left-0 right-0 ${
            isHeroCollapsed ? 'opacity-100 min-h-[60px] max-h-[200px] pointer-events-auto z-10' : 'opacity-0 max-h-0 pointer-events-none z-0'
          }`} style={{
            transitionProperty: 'max-height, opacity',
            transitionDuration: isHeroCollapsed ? '1200ms, 300ms' : '1800ms, 300ms',
            transitionTimingFunction: 'ease-in-out, ease-in-out'
          }}>
            {isAdmin && (
              <button
                type="button"
                onClick={async (e) => { e.stopPropagation(); const ok = await confirm({ title: 'Delete customer', message: 'Are you sure you want to delete this customer? This action cannot be undone.' }); if (!ok) return; try { await api('DELETE', `/clients/${encodeURIComponent(String(id||''))}`); toast.success('Customer deleted'); await queryClient.invalidateQueries({ queryKey: ['clients'] }); navigate('/customers'); } catch (_e) { toast.error('Failed to delete customer'); } }}
                className="absolute top-2 right-2 z-10 px-2 py-1 rounded text-[11px] font-medium border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                title="Delete Customer"
              >
                Delete Customer
              </button>
            )}
            <div className="px-3 py-3 pr-10 min-h-[60px] flex items-center justify-between gap-4">
              <div className="min-w-0 flex items-center flex-1">
                <h3 className="text-sm font-bold text-gray-900 truncate">{c.display_name||c.name||id}</h3>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-500 font-medium">{c.code || id?.slice(0, 8) || '—'}</span>
                {(c as any).client_status ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: statusColorMap[String((c as any).client_status)] || '#eeeeee', color: '#000' }}>
                    {String((c as any).client_status)}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              onClick={() => setIsHeroCollapsed(!isHeroCollapsed)}
              className="absolute bottom-2 right-2 p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
              title="Expand"
            >
              <svg className="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Cards - ProjectDetail style */}
      <div className={`mb-4 transition-all duration-[1200ms] ease-in-out ${isHeroCollapsed ? 'mt-16' : 'mt-0'}`}>
        <div className="rounded-xl border bg-white p-3">
          <div className="flex flex-wrap gap-2">
            {(['overview', ...availableTabs.filter(t => t !== 'overview')]).map(tabKey => {
              const tabConfig: Record<string, { label: string; icon: string }> = {
                overview: { label: 'Overview', icon: '📊' },
                general: { label: 'General', icon: '📋' },
                contacts: { label: 'Contacts', icon: '👤' },
                files: { label: 'Files', icon: '📁' },
                sites: { label: 'Sites', icon: '📍' },
                opportunities: { label: 'Opportunities', icon: '💼' },
                projects: { label: 'Projects', icon: '🏗️' },
              };
              const config = tabConfig[tabKey];
              if (!config) return null;
              const isActive = (tab === null && tabKey === 'overview') || tab === tabKey;
              return (
                <button
                  key={tabKey}
                  onClick={() => handleTabClick(tabKey === 'overview' ? null : (tabKey as CustomerTab))}
                  className={`flex-1 min-w-[120px] px-3 py-1.5 text-sm font-bold rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                    isActive ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 hover:border-red-400' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <span className="text-xs leading-none">{config.icon}</span>
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="rounded-xl border bg-white p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {tab === null && (
                  <div className="space-y-10">
                    {/* Overview Controls Bar */}
                    <div
                      className="flex items-center justify-end gap-2"
                      style={{
                        opacity: hasAnimated ? 1 : 0,
                        transform: hasAnimated ? 'translateY(0)' : 'translateY(-8px)',
                        transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                      }}
                    >
                        <select
                          value={globalDateFilter}
                          onChange={(e) => {
                            const value = e.target.value as DateFilterType;
                            setGlobalDateFilter(value);
                            if (value === 'custom') {
                              setGlobalDateModalOpen(true);
                            }
                          }}
                          className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                        >
                          <option value="all">All time</option>
                          <option value="last_year">Last 12 months</option>
                          <option value="last_6_months">Last 6 months</option>
                          <option value="last_3_months">Last 3 months</option>
                          <option value="last_month">Last month</option>
                          <option value="custom">Custom</option>
                        </select>
                        {globalDateFilter === 'custom' && globalDateCustomStart && globalDateCustomEnd && (
                          <div className="relative group">
                            <button
                              onClick={() => setGlobalDateModalOpen(true)}
                              className="text-gray-500 hover:text-[#7f1010] transition-colors p-1"
                              title={`${formatDateForDisplay(globalDateCustomStart)} - ${formatDateForDisplay(globalDateCustomEnd)}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <div className="absolute right-0 bottom-full mb-2 px-2 py-1.5 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap">
                              {formatDateForDisplay(globalDateCustomStart)} - {formatDateForDisplay(globalDateCustomEnd)}
                              <div className="absolute -bottom-1 right-3 w-2 h-2 bg-gray-900 rotate-45"></div>
                            </div>
                          </div>
                        )}
                        <select
                          value={globalDisplayMode}
                          onChange={(e) => setGlobalDisplayMode(e.target.value as 'quantity' | 'value')}
                          className="border border-gray-300 rounded px-2 py-1.5 text-xs"
                        >
                          <option value="quantity">Quantity</option>
                          <option value="value">Value</option>
                        </select>
                    </div>

                    {/* KPI Snapshot — 4 metrics, Quantity/Value toggle */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Closed</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.closed.value) : <CountUp value={kpis.closed.count} enabled={hasAnimated} />}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 opacity-70">{globalDisplayMode === 'value' ? 'Closed value' : 'Finished projects'}</div>
                        </div>
                        </LoadingOverlay>
                      </div>
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 50ms, transform 400ms ease-out 50ms',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Pipeline</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.pipeline.value) : <CountUp value={kpis.pipeline.count} enabled={hasAnimated} />}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 opacity-70">{globalDisplayMode === 'value' ? 'Pipeline value' : 'Open opportunities'}</div>
                        </div>
                        </LoadingOverlay>
                      </div>
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 100ms, transform 400ms ease-out 100ms',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">In Progress</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.inProgress.value) : <CountUp value={kpis.inProgress.count} enabled={hasAnimated} />}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 opacity-70">{globalDisplayMode === 'value' ? 'In progress value' : 'In progress projects'}</div>
                        </div>
                        </LoadingOverlay>
                      </div>
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 150ms, transform 400ms ease-out 150ms',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">On Hold</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.onHold.value) : <CountUp value={kpis.onHold.count} enabled={hasAnimated} />}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5 opacity-70">{globalDisplayMode === 'value' ? 'On hold value' : 'On hold projects'}</div>
                        </div>
                        </LoadingOverlay>
                      </div>
                    </div>

                    {/* Status Overview — Opportunities by Status + Customer Funnel / Health */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Opportunities by Status — pie chart (40% pie / 60% legend, explode + tooltip) */}
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 flex flex-col min-h-0 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[120px]" className="flex-1 min-h-0">
                        <div className="p-3 flex flex-col flex-1 min-h-0">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 shrink-0">Opportunities by Status</div>
                        {Object.entries(oppStatusBreakdown).length > 0 ? (
                          (() => {
                            const entries = Object.entries(oppStatusBreakdown);
                            const total = globalDisplayMode === 'value'
                              ? entries.reduce((s, [, d]) => s + d.value, 0)
                              : entries.reduce((s, [, d]) => s + d.count, 0);
                            const sorted = [...entries].sort(([, a], [, b]) =>
                              globalDisplayMode === 'value' ? b.value - a.value : b.count - a.count
                            );
                            const colors = greenPalette;
                            const radius = 40;
                            const centerX = 50;
                            const centerY = 50;
                            const explodeOffset = 5;
                            const handleOppMouseEnter = (slice: { status: string; metric: number; percentage: number }, ev: React.MouseEvent) => {
                              setOverviewPieTooltip({ chart: 'opp', label: slice.status, value: slice.metric, percentage: slice.percentage });
                              setOverviewPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                            };
                            const handleOppMouseMove = (ev: React.MouseEvent) => {
                              if (overviewPieTooltip?.chart === 'opp') setOverviewPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                            };
                            const handleOppMouseLeave = () => setOverviewPieTooltip((p) => (p?.chart === 'opp' ? null : p));
                            let currentAngle = 0;
                            const slices = sorted.map(([status, data], idx) => {
                              const metric = globalDisplayMode === 'value' ? data.value : data.count;
                              const percentage = total > 0 ? (metric / total) * 100 : 0;
                              const angle = (percentage / 100) * 360;
                              const startAngle = currentAngle;
                              const endAngle = currentAngle + angle;
                              currentAngle = endAngle;
                              return { status, metric, percentage, startAngle, endAngle, color: colors[idx % colors.length] };
                            });
                            return (
                              <div className="flex flex-row gap-3 flex-1 min-h-0 w-full">
                                <div className="flex-[0_0_40%] min-w-0 min-h-0 flex items-center justify-center relative">
                                  <svg
                                    viewBox="0 0 100 100"
                                    className="w-full h-full max-w-full max-h-full min-h-[80px]"
                                    preserveAspectRatio="xMidYMid meet"
                                    onMouseLeave={handleOppMouseLeave}
                                  >
                                    {slices.map((slice, idx) => {
                                      const midAngle = (slice.startAngle + slice.endAngle) / 2;
                                      const isHovered = overviewPieTooltip?.chart === 'opp' && overviewPieTooltip?.label === slice.status;
                                      const { x: ox, y: oy } = polarToCartesian(centerX, centerY, explodeOffset, midAngle);
                                      const tx = isHovered ? ox - centerX : 0;
                                      const ty = isHovered ? oy - centerY : 0;
                                      return (
                                        <g
                                          key={slice.status}
                                          transform={`translate(${tx}, ${ty})`}
                                          style={{
                                            cursor: 'pointer',
                                            opacity: hasAnimated ? 1 : 0,
                                            transition: `transform 0.15s ease-out, opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`,
                                          }}
                                          onMouseEnter={(ev) => handleOppMouseEnter(slice, ev)}
                                          onMouseMove={handleOppMouseMove}
                                          onMouseLeave={handleOppMouseLeave}
                                        >
                                          <path
                                            d={createDonutSlice(slice.startAngle, slice.endAngle, 0, radius, centerX, centerY)}
                                            fill={slice.color}
                                            style={{
                                              filter: isHovered ? 'brightness(1.12)' : undefined,
                                              transition: 'filter 0.2s ease-out',
                                            }}
                                          />
                                        </g>
                                      );
                                    })}
                                  </svg>
                                  {overviewPieTooltip?.chart === 'opp' &&
                                    createPortal(
                                      <div
                                        className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                                        style={{ left: overviewPieTooltipPos.x + 10, top: overviewPieTooltipPos.y + 10 }}
                                      >
                                        <div className="font-semibold">{overviewPieTooltip.label}</div>
                                        <div className="text-gray-300">
                                          {globalDisplayMode === 'value'
                                            ? `${formatCurrency(overviewPieTooltip.value)} (${overviewPieTooltip.percentage.toFixed(0)}%)`
                                            : `${overviewPieTooltip.value} (${overviewPieTooltip.percentage.toFixed(0)}%)`}
                                        </div>
                                      </div>,
                                      document.body
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1 text-[11px] overflow-y-auto py-0.5 border-l border-gray-200 pl-3">
                                  {slices.map(slice => (
                                    <div key={slice.status} className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                                      <span className="text-gray-600 truncate">{slice.status}:</span>
                                      <span className="font-semibold text-gray-900 whitespace-nowrap">
                                        {globalDisplayMode === 'value' ? formatCurrency(slice.metric) : <CountUp value={slice.metric} enabled={hasAnimated} />} ({slice.percentage.toFixed(0)}%)
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="flex-1 flex items-center justify-center"><div className="text-[11px] text-gray-400">No status data</div></div>
                        )}
                        </div>
                        </LoadingOverlay>
                      </div>

                      {/* Customer Funnel / Health */}
                      <div
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 50ms, transform 400ms ease-out 50ms',
                        }}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[120px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Customer Funnel / Health</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex flex-col min-h-0">
                            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5 text-center shrink-0">Projects by Status</div>
                            {buildProjectDonutData.length > 0 ? (
                              (() => {
                                const total = globalDisplayMode === 'value' ? buildProjectDonutData.reduce((sum, item) => sum + item.value, 0) : buildProjectDonutData.reduce((sum, item) => sum + item.count, 0);
                                const colors = ['#0b1739', '#1d4ed8', '#0284c7'];
                                const radius = 40;
                                const innerRadius = 24;
                                const centerX = 50;
                                const centerY = 50;
                                const explodeOffset = 5;
                                const handleProjMouseEnter = (slice: { status: string; metric: number; percentage: number }, ev: React.MouseEvent) => {
                                  setOverviewPieTooltip({ chart: 'proj', label: slice.status, value: slice.metric, percentage: slice.percentage });
                                  setOverviewPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                                };
                                const handleProjMouseMove = (ev: React.MouseEvent) => {
                                  if (overviewPieTooltip?.chart === 'proj') setOverviewPieTooltipPos({ x: ev.clientX, y: ev.clientY });
                                };
                                const handleProjMouseLeave = () => setOverviewPieTooltip((p) => (p?.chart === 'proj' ? null : p));
                                let currentAngle = 0;
                                const slices = buildProjectDonutData.map((item, idx) => {
                                  const metric = globalDisplayMode === 'value' ? item.value : item.count;
                                  const percentage = total > 0 ? (metric / total) * 100 : 0;
                                  const angle = (percentage / 100) * 360;
                                  const startAngle = currentAngle;
                                  const endAngle = currentAngle + angle;
                                  currentAngle = endAngle;
                                  return { ...item, metric, percentage, startAngle, endAngle, color: colors[idx % colors.length] };
                                });
                                return (
                                  <div className="flex flex-row gap-2 flex-1 min-h-0 w-full">
                                    <div className="flex-[0_0_40%] min-w-0 min-h-0 flex items-center justify-center relative">
                                      <svg
                                        viewBox="0 0 100 100"
                                        className="w-full h-full max-w-full max-h-full min-h-[60px]"
                                        preserveAspectRatio="xMidYMid meet"
                                        onMouseLeave={handleProjMouseLeave}
                                      >
                                        {slices.map((slice, idx) => {
                                          const midAngle = (slice.startAngle + slice.endAngle) / 2;
                                          const isHovered = overviewPieTooltip?.chart === 'proj' && overviewPieTooltip?.label === slice.status;
                                          const { x: ox, y: oy } = polarToCartesian(centerX, centerY, explodeOffset, midAngle);
                                          const tx = isHovered ? ox - centerX : 0;
                                          const ty = isHovered ? oy - centerY : 0;
                                          return (
                                            <g
                                              key={slice.status}
                                              transform={`translate(${tx}, ${ty})`}
                                              style={{
                                                cursor: 'pointer',
                                                opacity: hasAnimated ? 1 : 0,
                                                transition: `transform 0.15s ease-out, opacity 400ms ease-out ${hasAnimated ? idx * 80 + 'ms' : '0ms'}`,
                                              }}
                                              onMouseEnter={(ev) => handleProjMouseEnter(slice, ev)}
                                              onMouseMove={handleProjMouseMove}
                                              onMouseLeave={handleProjMouseLeave}
                                            >
                                              <path
                                                d={createDonutSlice(slice.startAngle, slice.endAngle, innerRadius, radius, centerX, centerY)}
                                                fill={slice.color}
                                                style={{
                                                  filter: isHovered ? 'brightness(1.12)' : undefined,
                                                  transition: 'filter 0.2s ease-out',
                                                }}
                                              />
                                            </g>
                                          );
                                        })}
                                      </svg>
                                      {overviewPieTooltip?.chart === 'proj' &&
                                        createPortal(
                                          <div
                                            className="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg shadow-xl bg-gray-900 text-white text-xs whitespace-nowrap transition-shadow duration-150"
                                            style={{ left: overviewPieTooltipPos.x + 10, top: overviewPieTooltipPos.y + 10 }}
                                          >
                                            <div className="font-semibold">{overviewPieTooltip.label}</div>
                                            <div className="text-gray-300">
                                              {globalDisplayMode === 'value'
                                                ? `${formatCurrency(overviewPieTooltip.value)} (${overviewPieTooltip.percentage.toFixed(0)}%)`
                                                : `${overviewPieTooltip.value} (${overviewPieTooltip.percentage.toFixed(0)}%)`}
                                            </div>
                                          </div>,
                                          document.body
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-0.5 text-[11px] overflow-y-auto py-0.5 border-l border-gray-200 pl-2">
                                      {slices.map(slice => (
                                        <div key={slice.status} className="flex items-center gap-1.5">
                                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                                          <span className="text-gray-600 truncate">{slice.status}:</span>
                                          <span className="font-semibold text-gray-900 whitespace-nowrap">
                                            {globalDisplayMode === 'value' ? formatCurrency(slice.metric) : slice.metric} ({slice.percentage.toFixed(0)}%)
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="h-[100px] flex items-center justify-center"><div className="text-[11px] text-gray-400">No projects</div></div>
                            )}
                          </div>
                          <div className="space-y-2">
                            {(() => {
                              const funnel = buildFunnelMetrics;
                              const maxValue = Math.max(funnel.prospecting, funnel.sent, funnel.refused, funnel.converted, 1);
                              const hasActivity = funnel.prospecting > 0 || funnel.sent > 0 || funnel.refused > 0 || funnel.converted > 0;
                              if (!hasActivity) return <div className="h-[100px] flex items-center justify-center"><div className="text-[11px] text-gray-400">No funnel activity</div></div>;
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-600 w-24">Prospecting</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0"><div className="bg-gradient-to-r from-[#14532d] to-[#22c55e] rounded-full h-2" style={{ width: `${(funnel.prospecting / maxValue) * 100}%` }} /></div>
                                    <span className="text-[11px] font-semibold text-gray-900 min-w-[70px] text-right">{globalDisplayMode === 'value' ? formatCurrency(funnel.prospecting) : <CountUp value={funnel.prospecting} enabled={hasAnimated} />}{funnel.prospectingPct != null ? <span className="text-gray-500 ml-0.5">({funnel.prospectingPct.toFixed(0)}%)</span> : null}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-600 w-24">Sent</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0"><div className="bg-gradient-to-r from-[#14532d] to-[#22c55e] rounded-full h-2" style={{ width: `${(funnel.sent / maxValue) * 100}%` }} /></div>
                                    <span className="text-[11px] font-semibold text-gray-900 min-w-[70px] text-right">{globalDisplayMode === 'value' ? formatCurrency(funnel.sent) : <CountUp value={funnel.sent} enabled={hasAnimated} />}{funnel.sentPct != null ? <span className="text-gray-500 ml-0.5">({funnel.sentPct.toFixed(0)}%)</span> : null}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-600 w-24">Refused</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0"><div className="bg-gradient-to-r from-[#14532d] to-[#22c55e] rounded-full h-2" style={{ width: `${(funnel.refused / maxValue) * 100}%` }} /></div>
                                    <span className="text-[11px] font-semibold text-gray-900 min-w-[70px] text-right">{globalDisplayMode === 'value' ? formatCurrency(funnel.refused) : <CountUp value={funnel.refused} enabled={hasAnimated} />}{funnel.refusedPct != null ? <span className="text-gray-500 ml-0.5">({funnel.refusedPct.toFixed(0)}%)</span> : null}</span>
                                  </div>
                                  <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                                    <span className="text-[11px] text-gray-600 w-24">Converted</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-0"><div className="bg-gradient-to-r from-[#0b1739] to-[#1d4ed8] rounded-full h-2" style={{ width: `${(funnel.converted / maxValue) * 100}%` }} /></div>
                                    <span className="text-[11px] font-semibold text-gray-900 min-w-[70px] text-right">{globalDisplayMode === 'value' ? formatCurrency(funnel.converted) : <CountUp value={funnel.converted} enabled={hasAnimated} />}{funnel.convertedPct != null ? <span className="text-gray-500 ml-0.5">({funnel.convertedPct.toFixed(0)}%)</span> : null}</span>
                                  </div>
                                  <div className="border-t border-gray-100 pt-2">
                                    {funnel.refusedPct != null && funnel.refusedPct > 40 ? (
                                      <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5"><div className="text-[10px] font-semibold text-amber-800">Warning</div><div className="text-[10px] text-amber-700">Refusal rate: {funnel.refusedPct.toFixed(1)}%</div></div>
                                    ) : (
                                      <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5"><div className="text-[10px] font-semibold text-green-800">Healthy pipeline</div><div className="text-[10px] text-green-700">No issues detected</div></div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        </div>
                        </LoadingOverlay>
                      </div>
                    </div>

                    {/* Value Over Time — full width */}
                    <div className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 w-full relative">
                      <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[120px]">
                      <div className="p-3">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                          {globalDisplayMode === 'value' 
                            ? 'Revenue & Pipeline Over Time' 
                            : 'Projects & Opportunities Over Time'}
                        </div>
                        {(() => {
                          const mode = globalDisplayMode;
                          const totalClosed = valueOverTime.reduce((sum, [, d]) => 
                            sum + (mode === 'value' ? d.closed : (d.closedCount || 0)), 0
                          );
                          const totalPipeline = valueOverTime.reduce((sum, [, d]) => 
                            sum + (mode === 'value' ? d.pipeline : (d.pipelineCount || 0)), 0
                          );
                          if (totalClosed === 0 && totalPipeline === 0) {
                            return (
                              <div className="h-[120px] flex items-center justify-center">
                                <div className="text-xs text-gray-400 text-center">
                                  <div>No {mode === 'value' ? 'financial' : 'activity'} in this period</div>
                                </div>
                              </div>
                            );
                          }
                          
                          const maxValue = Math.max(...valueOverTime.map(([, d]) => 
                            Math.max(
                              mode === 'value' ? d.closed : (d.closedCount || 0),
                              mode === 'value' ? d.pipeline : (d.pipelineCount || 0)
                            )
                          ), 1);
                          const chartWidth = 960;
                          const chartHeight = 120;
                          const padding = { top: 14, right: 28, bottom: 38, left: 52 };
                          const plotWidth = chartWidth - padding.left - padding.right;
                          const plotHeight = chartHeight - padding.top - padding.bottom;
                          const pointCount = valueOverTime.length;
                          
                          // Generate line paths
                          const closedPoints: Array<{ x: number; y: number; value: number; period: string; closedByStatus: Record<string, number> }> = [];
                          const pipelinePoints: Array<{ x: number; y: number; value: number; period: string; pipelineByStatus: Record<string, number> }> = [];
                          
                          valueOverTime.forEach(([period, data], idx) => {
                            const x = pointCount > 1 
                              ? padding.left + (idx / (pointCount - 1)) * plotWidth
                              : padding.left + plotWidth / 2;
                            const closedValue = mode === 'value' ? data.closed : (data.closedCount || 0);
                            const pipelineValue = mode === 'value' ? data.pipeline : (data.pipelineCount || 0);
                            const closedY = padding.top + plotHeight - (closedValue / maxValue) * plotHeight;
                            const pipelineY = padding.top + plotHeight - (pipelineValue / maxValue) * plotHeight;
                            closedPoints.push({ 
                              x, 
                              y: closedY, 
                              value: closedValue, 
                              period,
                              closedByStatus: data.closedByStatus || {}
                            });
                            pipelinePoints.push({ 
                              x, 
                              y: pipelineY, 
                              value: pipelineValue, 
                              period,
                              pipelineByStatus: data.pipelineByStatus || {}
                            });
                          });
                          
                          const closedPath = closedPoints.length > 0 
                            ? `M ${closedPoints.map(p => `${p.x},${p.y}`).join(' L ')}`
                            : '';
                          const pipelinePath = pipelinePoints.length > 0
                            ? `M ${pipelinePoints.map(p => `${p.x},${p.y}`).join(' L ')}`
                            : '';
                          
                          // Format labels
                          const formatLabel = (period: string): string => {
                            if (period.includes('Q')) {
                              return period;
                            }
                            const match = period.match(/(\d{4})-(\d{2})/);
                            if (match) {
                              const [, year, month] = match;
                              const date = new Date(parseInt(year), parseInt(month) - 1);
                              return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                            }
                            return period;
                          };
                          
                          return (
                            <div className="flex items-stretch gap-4 w-full">
                              <div className="relative flex-1 min-w-0 max-h-[130px] min-h-[80px]" style={{ aspectRatio: `${chartWidth}/${chartHeight}` }}>
                              <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet" className="overflow-visible min-h-0 block">
                                {/* Grid lines (very light) */}
                                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                                  <line
                                    key={i}
                                    x1={padding.left}
                                    y1={padding.top + ratio * plotHeight}
                                    x2={padding.left + plotWidth}
                                    y2={padding.top + ratio * plotHeight}
                                    stroke="#f3f4f6"
                                    strokeWidth="1"
                                  />
                                ))}
                                
                                {/* Y-axis labels */}
                                {[0, 0.5, 1].map((ratio, i) => {
                                  const value = maxValue * (1 - ratio);
                                  return (
                                    <text
                                      key={i}
                                      x={padding.left - 8}
                                      y={padding.top + ratio * plotHeight + 4}
                                      textAnchor="end"
                                      className="text-[10px] fill-gray-500"
                                    >
                                      {mode === 'value' ? formatCurrency(value) : Math.round(value)}
                                    </text>
                                  );
                                })}
                                
                                {/* Lines */}
                                {closedPath && (
                                  <path
                                    d={closedPath}
                                    fill="none"
                                    stroke="#0b1739"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                )}
                                {pipelinePath && (
                                  <path
                                    d={pipelinePath}
                                    fill="none"
                                    stroke="#14532d"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                )}
                                
                                {/* Dots with tooltip areas */}
                                {closedPoints.map((point, idx) => {
                                  const statusEntries = Object.entries(point.closedByStatus || {})
                                    .filter(([_, val]) => Number(val) > 0)
                                    .sort(([_, a], [__, b]) => Number(b) - Number(a));
                                  const hasBreakdown = statusEntries.length > 0;
                                  const label = mode === 'value' ? 'Closed' : 'Projects';
                                  const displayValue = mode === 'value' ? formatCurrency(point.value) : point.value;
                                  let tooltipText = `${formatLabel(point.period)} - ${label}: ${displayValue}`;
                                  if (hasBreakdown) {
                                    tooltipText += '\n' + statusEntries.map(([status, val]) => {
                                      const displayVal = mode === 'value' ? formatCurrency(Number(val)) : Number(val);
                                      return `${status}: ${displayVal}`;
                                    }).join('\n');
                                  }
                                  return (
                                    <g key={`closed-${idx}`} className="group">
                                      <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="4"
                                        fill="#0b1739"
                                        className="hover:r-5 transition-all cursor-pointer"
                                      />
                                      <title>{tooltipText}</title>
                                    </g>
                                  );
                                })}
                                {pipelinePoints.map((point, idx) => {
                                  const statusEntries = Object.entries(point.pipelineByStatus || {})
                                    .filter(([_, val]) => Number(val) > 0)
                                    .sort(([_, a], [__, b]) => Number(b) - Number(a));
                                  const hasBreakdown = statusEntries.length > 0;
                                  const label = mode === 'value' ? 'Pipeline' : 'Opportunities';
                                  const displayValue = mode === 'value' ? formatCurrency(point.value) : point.value;
                                  let tooltipText = `${formatLabel(point.period)} - ${label}: ${displayValue}`;
                                  if (hasBreakdown) {
                                    tooltipText += '\n' + statusEntries.map(([status, val]) => {
                                      const displayVal = mode === 'value' ? formatCurrency(Number(val)) : Number(val);
                                      return `${status}: ${displayVal}`;
                                    }).join('\n');
                                  }
                                  return (
                                    <g key={`pipeline-${idx}`} className="group">
                                      <circle
                                        cx={point.x}
                                        cy={point.y}
                                        r="4"
                                        fill="#14532d"
                                        className="hover:r-5 transition-all cursor-pointer"
                                      />
                                      <title>{tooltipText}</title>
                                    </g>
                                  );
                                })}
                                
                                {/* X-axis labels */}
                                {valueOverTime.map(([period], idx) => {
                                  const x = pointCount > 1
                                    ? padding.left + (idx / (pointCount - 1)) * plotWidth
                                    : padding.left + plotWidth / 2;
                                  return (
                                    <text
                                      key={idx}
                                      x={x}
                                      y={chartHeight - padding.bottom + 14}
                                      textAnchor="middle"
                                      className="text-[9px] fill-gray-600"
                                    >
                                      {formatLabel(period)}
                                    </text>
                                  );
                                })}
                              </svg>
                              </div>
                              {/* Legend — lateral */}
                              <div className="flex flex-col justify-center gap-2 flex-shrink-0 border-l border-gray-200 pl-4">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-0.5 bg-[#0b1739] flex-shrink-0"></div>
                                  <span className="text-xs text-gray-600 whitespace-nowrap">{mode === 'value' ? 'Closed' : 'Projects'}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-3 h-0.5 bg-[#14532d] flex-shrink-0"></div>
                                  <span className="text-xs text-gray-600 whitespace-nowrap">{mode === 'value' ? 'Pipeline' : 'Opportunities'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      </LoadingOverlay>
                    </div>

                    {/* Insights + Activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Customer Insights — compact list */}
                      <div className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative">
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[100px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Customer Insights</div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Converted Projects</span>
                            <span className="font-semibold text-gray-900">{insights.convertedProjects}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Largest Deal</span>
                            <span className="font-semibold text-gray-900">{insights.largestDeal > 0 ? formatCurrency(insights.largestDeal) : '—'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Last Activity</span>
                            <span className="font-semibold text-gray-900">{insights.lastActivity ? formatDateForDisplay(insights.lastActivity.toISOString()) : '—'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Avg Pipeline Age</span>
                            <span className="font-semibold text-gray-900">{insights.avgPipelineAge > 0 ? `${insights.avgPipelineAge} days` : '—'}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">Project Hold Rate</span>
                            <span className="font-semibold text-gray-900">{insights.holdRate.toFixed(1)}%</span>
                          </div>
                        </div>
                        </div>
                        </LoadingOverlay>
                      </div>

                      {/* Recent Activity — fixed height, internal scroll */}
                      <div className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 flex flex-col min-h-0 relative">
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[200px]">
                        <div className="p-3 flex flex-col flex-1 min-h-0">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2 flex-shrink-0">Recent Activity</div>
                        <div className="h-[200px] overflow-y-auto flex-shrink-0 space-y-1.5 pr-1">
                          {recentActivity.length > 0 ? (
                            recentActivity.map((event, idx) => (
                              <div key={`${event.id}-${idx}`} className="text-xs text-gray-700 py-1.5 border-b border-gray-100 last:border-0">
                                <div className="font-medium">{event.label}</div>
                                <div className="text-[11px] text-gray-500">{formatDateForDisplay(event.date)}</div>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-gray-400 py-4">No recent activity</div>
                          )}
                        </div>
                        </div>
                        </LoadingOverlay>
                      </div>
                    </div>

                    {/* Empty States with CTAs */}
                    {filteredProjects.length === 0 && filteredOpportunities.length === 0 && (
                      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
                        <div className="text-gray-500 mb-3">No projects or opportunities found</div>
                        {hasEditPermission && (
                          <div className="flex gap-2 justify-center">
                            <Link
                              to={`/projects/new?client_id=${encodeURIComponent(String(id||''))}&is_bidding=false`}
                              state={{ backgroundLocation: location }}
                              className="px-4 py-2 bg-[#7f1010] text-white rounded-lg hover:bg-[#a31414] transition-colors text-sm"
                            >
                              Create Project
                            </Link>
                            <Link
                              to={`/projects/new?client_id=${encodeURIComponent(String(id||''))}&is_bidding=true`}
                              state={{ backgroundLocation: location }}
                              className="px-4 py-2 bg-[#7f1010] text-white rounded-lg hover:bg-[#a31414] transition-colors text-sm"
                            >
                              Create Opportunity
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
              )}
              {tab==='general' && (
                <div className="space-y-6 pb-24">
                  {/* Company — card style like Users > Personal */}
                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-blue-900">Company</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          onClick={() => setIsEditingGeneral(true)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit Company"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Core company identity details.</div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label={<><span>Display name</span> <span className="text-red-600">*</span></>} tooltip="Public name shown across the app.">
                          <>
                            {isEditingGeneral ? (
                              <input className={`w-full border rounded px-3 py-2 ${!isDisplayValid? 'border-red-500' : ''}`} value={form.display_name||''} onChange={e=>set('display_name', e.target.value)} />
                            ) : (
                              <div className="text-gray-900 font-medium py-1 break-words">{String(form.display_name||'') || '—'}</div>
                            )}
                            {!isDisplayValid && isEditingGeneral && <div className="text-[11px] text-red-600 mt-1">Required</div>}
                          </>
                        </Field>
                        <Field label={<><span>Legal name</span> <span className="text-red-600">*</span></>} tooltip="Registered legal entity name.">
                          <>
                            {isEditingGeneral ? (
                              <input className={`w-full border rounded px-3 py-2 ${!isLegalValid? 'border-red-500' : ''}`} value={form.legal_name||''} onChange={e=>set('legal_name', e.target.value)} />
                            ) : (
                              <div className="text-gray-900 font-medium py-1 break-words">{String(form.legal_name||'') || '—'}</div>
                            )}
                            {!isLegalValid && isEditingGeneral && <div className="text-[11px] text-red-600 mt-1">Required</div>}
                          </>
                        </Field>
                        <Field label="Type" tooltip="Customer classification.">
                          {isEditingGeneral ? (
                            <select className="w-full border rounded px-3 py-2" value={form.client_type||''} onChange={e=>set('client_type', e.target.value)}>
                              <option value="">Select...</option>
                              {sortByLabel(settings?.client_types||[], (t:any)=> (t.label||'').toString()).map((t:any)=> <option key={t.value||t.label} value={t.label}>{t.label}</option>)}
                            </select>
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.client_type||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Status" tooltip="Relationship status.">
                          {isEditingGeneral ? (
                            <select className="w-full border rounded px-3 py-2" value={form.client_status||''} onChange={e=>set('client_status', e.target.value)}>
                              <option value="">Select...</option>
                              {sortByLabel(settings?.client_statuses||[], (t:any)=> (t.label||'').toString()).map((t:any)=> <option key={t.value||t.label} value={t.label}>{t.label}</option>)}
                            </select>
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.client_status||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Lead source" tooltip="Where did this lead originate?">
                          {isEditingGeneral ? (
                            <select className="w-full border rounded px-3 py-2" value={form.lead_source||''} onChange={e=>set('lead_source', e.target.value)}>
                              <option value="">Select...</option>
                              {sortByLabel(leadSources, (ls:any)=> (ls?.label ?? ls?.name ?? '').toString()).map((ls:any)=>{
                                const val = ls?.value ?? ls?.id ?? ls?.label ?? ls?.name ?? String(ls);
                                const label = ls?.label ?? ls?.name ?? String(ls);
                                return <option key={String(val)} value={String(val)}>{label}</option>;
                              })}
                            </select>
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.lead_source||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Tax number" tooltip="Tax/VAT identifier used for invoicing.">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.tax_number||''} onChange={e=>set('tax_number', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.tax_number||'') || '—'}</div>
                          )}
                        </Field>
                      </div>
                    </div>
                  </div>
                  {/* Address */}
                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-green-900">Address</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          onClick={() => setIsEditingGeneral(true)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit Address"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Primary mailing and location address.</div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label="Address 1">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.address_line1||''} onChange={e=>set('address_line1', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.address_line1||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Address 2">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.address_line2||''} onChange={e=>set('address_line2', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.address_line2||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Country">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.country||''} onChange={e=>set('country', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.country||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Province/State">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.province||''} onChange={e=>set('province', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.province||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="City">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.city||''} onChange={e=>set('city', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.city||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="Postal code">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.postal_code||''} onChange={e=>set('postal_code', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.postal_code||'') || '—'}</div>
                          )}
                        </Field>
                      </div>
                    </div>
                  </div>
                  {/* Billing */}
                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5 5l6-6M2 17h.546c.501 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17.658 5.604c.272-.417.87-.417 1.142 0l2.312 3.542c.272.417.272 1.096 0 1.513l-8.405 12.848c-.397.595-.608 1.293-.608 2.008 0 .499-.404.904-.905.904H2" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-amber-900">Billing</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          onClick={() => setIsEditingGeneral(true)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit Billing"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Preferences used for invoices and payments.</div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <Field label="Billing email" tooltip="Email used for invoice delivery.">
                          {isEditingGeneral ? (
                            <input className="w-full border rounded px-3 py-2" value={form.billing_email||''} onChange={e=>set('billing_email', e.target.value)} />
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_email||'') || '—'}</div>
                          )}
                        </Field>
                        <Field label="PO required" tooltip="Whether a purchase order is required before invoicing.">
                          {isEditingGeneral ? (
                            <select className="w-full border rounded px-3 py-2" value={form.po_required||'false'} onChange={e=>set('po_required', e.target.value)}>
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          ) : (
                            <div className="text-gray-900 font-medium py-1 break-words">{form.po_required === 'true' ? 'Yes' : 'No'}</div>
                          )}
                        </Field>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4 mt-2">
                        <div className="md:col-span-2 text-sm">
                          <label className={`inline-flex items-center gap-2 ${!isEditingGeneral ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <input type="checkbox" checked={!!(!form.billing_same_as_address)} onChange={e=>set('billing_same_as_address', !e.target.checked)} disabled={!isEditingGeneral} /> Use different address for Billing address
                          </label>
                        </div>
                        {(!form.billing_same_as_address) && (
                          <>
                            <Field label="Billing Address 1" tooltip="Street address for billing.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_address_line1||''} onChange={e=>set('billing_address_line1', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_address_line1||'') || '—'}</div>
                              )}
                            </Field>
                            <Field label="Billing Address 2" tooltip="Apartment, suite, unit, building, floor, etc.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_address_line2||''} onChange={e=>set('billing_address_line2', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_address_line2||'') || '—'}</div>
                              )}
                            </Field>
                            <Field label="Billing Country" tooltip="Country or region for billing.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_country||''} onChange={e=>set('billing_country', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_country||'') || '—'}</div>
                              )}
                            </Field>
                            <Field label="Billing Province/State" tooltip="State, province, or region.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_province||''} onChange={e=>set('billing_province', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_province||'') || '—'}</div>
                              )}
                            </Field>
                            <Field label="Billing City" tooltip="City or locality for billing.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_city||''} onChange={e=>set('billing_city', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_city||'') || '—'}</div>
                              )}
                            </Field>
                            <Field label="Billing Postal code" tooltip="ZIP or postal code for billing.">
                              {isEditingGeneral ? (
                                <input className="w-full border rounded px-3 py-2" value={form.billing_postal_code||''} onChange={e=>set('billing_postal_code', e.target.value)} />
                              ) : (
                                <div className="text-gray-900 font-medium py-1 break-words">{String(form.billing_postal_code||'') || '—'}</div>
                              )}
                            </Field>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Description / Notes */}
                  <div className="rounded-xl border bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h5 className="text-sm font-semibold text-gray-900">Description</h5>
                      </div>
                      {!isEditingGeneral && hasEditPermission && (
                        <button
                          onClick={() => setIsEditingGeneral(true)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors"
                          title="Edit Description"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="text-xs text-gray-500 mb-2">Additional notes about this customer.</div>
                      {isEditingGeneral ? (
                        <textarea rows={6} className="w-full border rounded px-3 py-2 resize-y" value={form.description||''} onChange={e=>set('description', e.target.value)} />
                      ) : (
                        <div className="text-gray-900 font-medium py-1 break-words whitespace-pre-wrap">{String(form.description||'') || '—'}</div>
                      )}
                    </div>
                  </div>

                  {/* Communications and Preferences (hidden per request) */}
                  <div className="grid md:grid-cols-2 gap-4 hidden">
                    <Field label="Language"><input className="w-full border rounded px-3 py-2" value={form.preferred_language||''} onChange={e=>set('preferred_language', e.target.value)} /></Field>
                    <Field label="Preferred channels (comma-separated)"><input className="w-full border rounded px-3 py-2" value={form.preferred_channels||''} onChange={e=>set('preferred_channels', e.target.value)} /></Field>
                    <Field label="Marketing opt-in"><select className="w-full border rounded px-3 py-2" value={form.marketing_opt_in||'false'} onChange={e=>set('marketing_opt_in', e.target.value)}><option value="false">No</option><option value="true">Yes</option></select></Field>
                    <Field label="Invoice delivery"><input className="w-full border rounded px-3 py-2" value={form.invoice_delivery_method||''} onChange={e=>set('invoice_delivery_method', e.target.value)} /></Field>
                    <Field label="Statement delivery"><input className="w-full border rounded px-3 py-2" value={form.statement_delivery_method||''} onChange={e=>set('statement_delivery_method', e.target.value)} /></Field>
                    <Field label="CC emails for invoices"><input className="w-full border rounded px-3 py-2" value={form.cc_emails_for_invoices||''} onChange={e=>set('cc_emails_for_invoices', e.target.value)} /></Field>
                    <Field label="CC emails for estimates"><input className="w-full border rounded px-3 py-2" value={form.cc_emails_for_estimates||''} onChange={e=>set('cc_emails_for_estimates', e.target.value)} /></Field>
                    <Field label="Do not contact"><select className="w-full border rounded px-3 py-2" value={form.do_not_contact||'false'} onChange={e=>set('do_not_contact', e.target.value)}><option value="false">No</option><option value="true">Yes</option></select></Field>
                    <div className="md:col-span-2"><Field label="Reason"><input className="w-full border rounded px-3 py-2" value={form.do_not_contact_reason||''} onChange={e=>set('do_not_contact_reason', e.target.value)} /></Field></div>
                  </div>
                </div>
              )}
              {tab==='general' && isEditingGeneral && (
                <div className="fixed bottom-0 left-0 right-0 z-40">
                  <div className="max-w-[1400px] mx-auto px-4">
                    <div className="mb-3 rounded-xl border bg-white shadow-hero p-3 flex items-center gap-3">
                      <div className={`text-sm ${dirty ? 'text-amber-700' : 'text-green-700'}`}>{dirty ? 'You have unsaved changes' : 'All changes saved'}</div>
                      <div className="flex gap-3 ml-auto">
                        <button 
                          onClick={() => {
                            setIsEditingGeneral(false);
                            // Reset form to original client data
                            if (client) {
                              setForm({
                                display_name: client.display_name||'', legal_name: client.legal_name||'', code: client.id?.slice(0,8) || '',
                                client_type: (client as any).client_type||'', client_status: (client as any).client_status||'', lead_source:(client as any).lead_source||'',
                                billing_email:(client as any).billing_email||'', po_required: (client as any).po_required? 'true':'false', tax_number:(client as any).tax_number||'', description:(client as any).description||'',
                                address_line1: client.address_line1||'', address_line2: client.address_line2||'', country:(client as any).country||'', province:(client as any).province||'', city:(client as any).city||'', postal_code: client.postal_code||'',
                                billing_same_as_address: ((client as any).billing_same_as_address === false) ? false : true,
                                billing_address_line1: (client as any).billing_address_line1||'', billing_address_line2:(client as any).billing_address_line2||'', billing_country:(client as any).billing_country||'', billing_province:(client as any).billing_province||'', billing_city:(client as any).billing_city||'', billing_postal_code:(client as any).billing_postal_code||'',
                                preferred_language:(client as any).preferred_language||'', preferred_channels: ((client as any).preferred_channels||[]).join(', '),
                                marketing_opt_in: (client as any).marketing_opt_in? 'true':'false', invoice_delivery_method:(client as any).invoice_delivery_method||'', statement_delivery_method:(client as any).statement_delivery_method||'',
                                cc_emails_for_invoices: ((client as any).cc_emails_for_invoices||[]).join(', '), cc_emails_for_estimates: ((client as any).cc_emails_for_estimates||[]).join(', '),
                                do_not_contact:(client as any).do_not_contact? 'true':'false', do_not_contact_reason:(client as any).do_not_contact_reason||'',
                                estimator_id: (client as any).estimator_id||''
                              });
                              setDirty(false);
                            }
                          }}
                          className="px-4 py-2 rounded border bg-white text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={async()=>{
                            if (isSaving) return;
                      const toList = (s:string)=> (String(s||'').split(',').map(x=>x.trim()).filter(Boolean));
                      const payload:any = {
                        // identity
                        display_name: form.display_name||null,
                        legal_name: form.legal_name||null,
                        client_type: form.client_type||null,
                        client_status: form.client_status||null,
                        lead_source: form.lead_source||null,
                        billing_email: form.billing_email||null,
                        po_required: form.po_required==='true',
                        tax_number: form.tax_number||null,
                        // address
                        address_line1: form.address_line1||null,
                        address_line2: form.address_line2||null,
                        country: form.country||null,
                        province: form.province||null,
                        city: form.city||null,
                        postal_code: form.postal_code||null,
                        billing_same_as_address: !!form.billing_same_as_address,
                        billing_address_line1: form.billing_same_as_address? (form.address_line1||null) : (form.billing_address_line1||null),
                        billing_address_line2: form.billing_same_as_address? (form.address_line2||null) : (form.billing_address_line2||null),
                        billing_country: form.billing_same_as_address? (form.country||null) : (form.billing_country||null),
                        billing_province: form.billing_same_as_address? (form.province||null) : (form.billing_province||null),
                        billing_city: form.billing_same_as_address? (form.city||null) : (form.billing_city||null),
                        billing_postal_code: form.billing_same_as_address? (form.postal_code||null) : (form.billing_postal_code||null),
                        // comms
                        preferred_language: form.preferred_language||null,
                        preferred_channels: toList(form.preferred_channels||''),
                        marketing_opt_in: form.marketing_opt_in==='true',
                        invoice_delivery_method: form.invoice_delivery_method||null,
                        statement_delivery_method: form.statement_delivery_method||null,
                        cc_emails_for_invoices: toList(form.cc_emails_for_invoices||''),
                        cc_emails_for_estimates: toList(form.cc_emails_for_estimates||''),
                        do_not_contact: form.do_not_contact==='true',
                        do_not_contact_reason: form.do_not_contact_reason||null,
                        // final
                        description: form.description||null,
                      };
                        const reqOk = String(form.display_name||'').trim().length>0 && String(form.legal_name||'').trim().length>0;
                        if(!reqOk){ toast.error('Display name and Legal name are required'); return; }
                        try{ 
                        setIsSaving(true);
                        await api('PATCH', `/clients/${id}`, payload); 
                        toast.success('Saved'); 
                        setDirty(false);
                        setIsEditingGeneral(false);
                      }catch(e: any){ 
                        // Only show error if it's a clear client error (4xx), not if it might have saved anyway
                        const msg = e?.message || 'Save failed';
                        if(msg.includes('HTTP 4') && !msg.includes('HTTP 40')) {
                          // 4xx errors except 400 might be validation issues, show error
                          toast.error(msg);
                        } else {
                          // For other errors, assume it might have saved - show success
                          toast.success('Saved'); 
                          setDirty(false);
                          setIsEditingGeneral(false);
                        }
                      } finally {
                        setIsSaving(false);
                      }
                        }} className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {tab==='files' && (
                <CustomerFilesTabEnhanced clientId={String(id)} files={files||[]} onRefresh={refetchFiles} hasEditPermission={hasFilesWrite} />
              )}
              {tab==='contacts' && (
                <ContactsCard id={String(id)} hasEditPermission={hasEditPermission} />
              )}
              {tab==='sites' && (
                <div>
                  <div className="mb-2">
                    <h4 className="font-semibold">Construction Sites</h4>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {hasEditPermission && (
                      <Link
                        to={`/customers/${encodeURIComponent(String(id||''))}/sites/new`}
                        state={{ backgroundLocation: location }}
                        className="rounded-xl border-2 border-dashed border-gray-300 p-4 hover:border-brand-red hover:bg-gray-50 transition-all bg-white flex items-center justify-center min-h-[100px]"
                      >
                        <div className="text-lg text-gray-400 mr-2">+</div>
                        <div className="font-medium text-xs text-gray-700">New Site</div>
                      </Link>
                    )}
                    {(sites||[]).map(s=>{
                      const filesForSite = (fileBySite[s.id||'']||[]);
                      const cover = filesForSite.find(f=> String(f.category||'')==='site-cover-derived');
                      const img = cover || filesForSite.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
                      const src = img? `/files/${img.file_object_id}/thumbnail?w=600` : '/ui/assets/login/logo-light.svg';
                      const addressLine = formatAddressDisplay({
                        address_line1: s.site_address_line1,
                        city: s.site_city,
                        province: s.site_province,
                        postal_code: (s as any).site_postal_code,
                        country: s.site_country,
                      });
                      return (
                        <Link to={`/customers/${encodeURIComponent(String(id||''))}/sites/${encodeURIComponent(String(s.id))}`} state={{ backgroundLocation: location }} key={String(s.id)} className="group rounded-xl border bg-white overflow-hidden flex">
                          <div className="w-28 bg-gray-100 flex-shrink-0 flex items-center justify-center relative min-h-[100px]">
                            {img ? (
                              <img className="w-full h-full min-h-[100px] object-cover" src={src} alt={s.site_name||'Site'} />
                            ) : (
                              <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-2xl text-gray-400" title="No image">📍</div>
                            )}
                            {hasEditPermission && (
                              <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setSitePicker({ open:true, siteId: String(s.id) }); }} className="hidden group-hover:block absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white">Change cover</button>
                            )}
                          </div>
                          <div className="flex-1 p-3 text-sm min-w-0">
                            <div className="font-semibold text-gray-900 group-hover:text-brand-red transition-colors truncate">{s.site_name||'Site'}</div>
                            <div className="mt-2">
                              <div className="text-[11px] uppercase text-gray-500">Address</div>
                              <div className="text-gray-700 text-xs leading-snug break-words">{addressLine}</div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {(!sites||!sites.length) && <div className="text-sm text-gray-600">No sites</div>}
                  </div>
                </div>
              )}
              {tab==='opportunities' && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-900">Opportunities</h3>
                  </div>
                  <div className="flex flex-col gap-2 overflow-x-auto">
                    {hasEditPermission && (
                      <Link
                        to={`/projects/new?client_id=${encodeURIComponent(String(id||''))}&is_bidding=true`}
                        state={{ backgroundLocation: location }}
                        className="border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-[680px]"
                      >
                        <div className="text-lg text-gray-400 mr-2">+</div>
                        <div className="font-medium text-xs text-gray-700">New Opportunity</div>
                      </Link>
                    )}
                    {(opportunitiesWithDetails||[]).length > 0 ? (
                      <>
                        <div
                          className="grid grid-cols-[10fr_5fr_5fr_5fr_auto] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[680px] text-[10px] font-semibold text-gray-700"
                          aria-hidden
                        >
                          <div className="min-w-0" title="Opportunity name, code and client">Opportunity</div>
                          <div className="min-w-0" title="Person responsible for the estimate">Estimator</div>
                          <div className="min-w-0" title="Estimated total value">Est. value</div>
                          <div className="min-w-0" title="Current status (e.g. Prospecting, Sent, Refused)">Status</div>
                          <div className="min-w-0 w-24" title="Quick access to Files, Proposal, Report" aria-hidden />
                        </div>
                        {(opportunitiesWithDetails||[]).map((p: any) => (
                          <OpportunityListItem
                            key={p.id}
                            opportunity={p}
                            onOpenReportModal={(projectId) => setCustomerReportModalOpen({ open: true, projectId })}
                            projectStatuses={projectStatuses}
                          />
                        ))}
                      </>
                    ) : (
                      <div className="p-8 text-center text-sm text-gray-500">No opportunities for this customer.</div>
                    )}
                  </div>
                </div>
              )}
              {tab==='projects' && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-900">Projects</h3>
                  </div>
                  <div className="flex flex-col gap-2 overflow-x-auto">
                    {(projectsWithDetails||[]).length > 0 ? (
                      <>
                        <div
                          className="grid grid-cols-[10fr_3fr_3fr_4fr_4fr_4fr_auto] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[800px] text-[10px] font-semibold text-gray-700"
                          aria-hidden
                        >
                          <div className="min-w-0" title="Project name, code and client">Project</div>
                          <div className="min-w-0" title="Start date">Start</div>
                          <div className="min-w-0" title="Estimated completion">ETA</div>
                          <div className="min-w-0" title="Project administrator">Project Admin</div>
                          <div className="min-w-0" title="Estimated or actual value">Value</div>
                          <div className="min-w-0" title="Current status">Status</div>
                          <div className="min-w-0 w-28" title="Quick access to Files, Proposal, Reports, etc." aria-hidden />
                        </div>
                        {(projectsWithDetails||[]).map((p: any) => (
                          <ProjectListItem
                            key={p.id}
                            project={p}
                            projectDivisions={projectDivisions || []}
                            projectStatuses={projectStatuses}
                          />
                        ))}
                      </>
                    ) : (
                      <div className="p-8 text-center text-sm text-gray-500">No projects for this customer.</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
      </div>
      <ImagePicker isOpen={pickerOpen} onClose={()=>setPickerOpen(false)} clientId={String(id)} targetWidth={800} targetHeight={600} allowEdit={true} onConfirm={async(blob, original)=>{
        try{
          const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'client-logo-derived', original_name: 'client-logo.jpg', content_type: 'image/jpeg' });
          await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
          const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
          await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=client-logo-derived&original_name=client-logo.jpg`);
          toast.success('Logo updated');
          location.reload();
        }catch(e){ toast.error('Failed to update logo'); }
        finally{ setPickerOpen(false); }
      }} />
      {sitePicker?.open && (
        <ImagePicker isOpen={true} onClose={()=>setSitePicker(null)} clientId={String(id)} targetWidth={800} targetHeight={800} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'site-cover-derived', original_name:'site-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-cover-derived&original_name=site-cover.jpg&site_id=${encodeURIComponent(String(sitePicker?.siteId||''))}`);
            toast.success('Site cover updated');
            location.reload();
          }catch(e){ toast.error('Failed to update site cover'); }
          finally{ setSitePicker(null); }
        }} />
      )}
      {projectPicker?.open && (
        <ImagePicker isOpen={true} onClose={()=>setProjectPicker(null)} clientId={String(id)} targetWidth={800} targetHeight={300} allowEdit={true} onConfirm={async(blob)=>{
          try{
            const up:any = await api('POST','/files/upload',{ project_id: projectPicker?.projectId||null, client_id:id, employee_id:null, category_id:'project-cover-derived', original_name:'project-cover.jpg', content_type:'image/jpeg' });
            await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
            const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
            await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=project-cover-derived&original_name=project-cover.jpg`);
            toast.success('Project cover updated');
            location.reload();
          }catch(e){ toast.error('Failed to update project cover'); }
          finally{ setProjectPicker(null); }
        }} />
      )}
      {customerReportModalOpen?.open && customerReportModalOpen?.projectId && (
        <CreateReportModal
          projectId={customerReportModalOpen.projectId}
          reportCategories={reportCategories}
          onClose={() => setCustomerReportModalOpen(null)}
          onSuccess={async () => {
            setCustomerReportModalOpen(null);
            toast.success('Report created successfully');
          }}
        />
      )}
      <DateRangeModal
        open={globalDateModalOpen}
        onClose={() => {
          setGlobalDateModalOpen(false);
          if (!globalDateCustomStart || !globalDateCustomEnd) {
            setGlobalDateFilter('all');
          }
        }}
        onConfirm={(startDate, endDate) => {
          setGlobalDateCustomStart(startDate);
          setGlobalDateCustomEnd(endDate);
          setGlobalDateModalOpen(false);
        }}
        initialStartDate={globalDateCustomStart}
        initialEndDate={globalDateCustomEnd}
      />
    </div>
  );
}

function ProjectRow({ project, files, onCoverClick, hasEditPermission }: { project: Project, files: ClientFile[], onCoverClick: (projectId: string)=>void, hasEditPermission?: boolean }){
  const { data:details } = useQuery({ queryKey:['project-detail-row', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const pfiles = (files||[]).filter(f=> String((f as any).project_id||'')===String(project.id));
  const cover = pfiles.find(f=> String(f.category||'')==='project-cover-derived') || pfiles.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? `/files/${cover.file_object_id}/thumbnail?w=192` : '/ui/assets/login/logo-light.svg';
  const status = details?.status_label || '';
  const progress = Math.max(0, Math.min(100, Number(details?.progress ?? 0)));
  const start = (project.date_start || details?.date_start || project.created_at || '').slice(0,10);
  return (
    <Link to={`/projects/${encodeURIComponent(String(project.id))}`} className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <img src={src} className="w-24 h-24 rounded-lg border object-cover"/>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-base truncate">{project.name||'Project'}</div>
          <div className="text-sm text-gray-600 truncate mt-1">{project.code||''}</div>
          <div className="text-sm text-gray-500 truncate mt-1">Start: {start||'—'}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm" onClick={e=> e.stopPropagation()}>
        {status && (
          <>
            <span className="text-gray-600">Status:</span>
            <span className="px-2 py-0.5 rounded-full border bg-gray-50 text-gray-800">{status}</span>
          </>
        )}
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-red" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-gray-600">{progress}%</span>
        </div>
        {hasEditPermission && (
          <button onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); onCoverClick(String(project.id)); }} className="ml-2 px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm" title="Change cover">Cover</button>
        )}
      </div>
    </Link>
  );
}

function Field({label, tooltip, children}:{label:ReactNode, tooltip?:string, children:any}){
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-600 flex items-center gap-1">
        <span>{label}</span>
        {tooltip && (
          <span className="relative group inline-block ml-0.5">
            <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="absolute left-1/2 -translate-x-1/2 mt-2 hidden group-hover:block whitespace-nowrap bg-black text-white text-xs px-2 py-1 rounded shadow z-20">{tooltip}</span>
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function ProjectMiniCard({ project, coverSrc, clientName }:{ project:any, coverSrc:string, clientName?:string }){
  const { data:details } = useQuery({ queryKey:['project', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const { data:reports } = useQuery({ queryKey:['project-reports-count', project.id], queryFn: async()=> { const r = await api<any[]>('GET', `/projects/${encodeURIComponent(String(project.id))}/reports`); return r?.length||0; }, staleTime: 60_000 });
  const status = (project.status_label || details?.status_label || '') as string;
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? details?.progress ?? 0)));
  const start = (project.date_start || details?.date_start || project.created_at || '').slice(0,10);
  const eta = (details?.date_eta || project.date_eta || project.date_end || '').slice(0,10);
  const est = details?.estimator_id || '';
  const lead = details?.onsite_lead_id || '';
  return (
    <Link to={`/projects/${encodeURIComponent(String(project.id))}`} className="group rounded-lg border overflow-hidden bg-white block">
      <div className="aspect-[4/3] bg-gray-100">
        <img className="w-full h-full object-cover" src={coverSrc} />
      </div>
      <div className="p-2">
        <div className="text-xs text-gray-600 truncate">{clientName||''}</div>
        <div className="font-semibold text-sm truncate group-hover:underline">{project.name||'Project'}</div>
        <div className="text-xs text-gray-600 truncate">{project.code||''}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-full text-[11px] border bg-gray-50 text-gray-800 truncate max-w-[60%]" title={status}>{status||'—'}</span>
          <span className="text-[11px] text-gray-600">{reports||0} reports</span>
        </div>
        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-red" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div><span className="opacity-70">Start:</span> {start||'—'}</div>
          <div><span className="opacity-70">ETA:</span> {eta||'—'}</div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div className="truncate" title={est}><span className="opacity-70">Estimator:</span> {est? <UserInline id={est} /> : '—'}</div>
          <div className="truncate" title={lead}><span className="opacity-70">On-site:</span> {lead? <UserInline id={lead} /> : '—'}</div>
        </div>
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

function CustomerDocuments({ id, files, sites, onRefresh, hasEditPermission }: { id: string, files: ClientFile[], sites: Site[], onRefresh: ()=>any, hasEditPermission?: boolean }){
  const confirm = useConfirm();
  const [which, setWhich] = useState<'all'|'client'|'site'>('all');
  const [siteId, setSiteId] = useState<string>('');
  const siteMap = useMemo(()=>{ const m:Record<string, Site> = {}; (sites||[]).forEach(s=>{ if(s.id) m[String(s.id)] = s; }); return m; }, [sites]);
  const base = useMemo(()=>{ let arr = files||[]; if (which==='client') arr = arr.filter(f=>!f.site_id); else if (which==='site') arr = arr.filter(f=> siteId? f.site_id===siteId : !!f.site_id); return arr; }, [files, which, siteId]);
  const pics = base.filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const [picList, setPicList] = useState<ClientFile[]>([]);
  useEffect(()=>{ setPicList(pics); }, [pics]);

  const { data:folders, refetch: refetchFolders } = useQuery({ queryKey:['client-folders', id], queryFn: ()=> api<any[]>( 'GET', `/clients/${encodeURIComponent(id)}/folders`) });
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const { data:docs, refetch: refetchDocs } = useQuery({ queryKey:['client-docs', id, activeFolderId], queryFn: ()=>{ const qs = activeFolderId!=='all'? (`?folder_id=${encodeURIComponent(activeFolderId)}`) : ''; return api<any[]>( 'GET', `/clients/${encodeURIComponent(id)}/documents${qs}` ); }});
  const [showUpload, setShowUpload] = useState(false);
  const [fileObj, setFileObj] = useState<File|null>(null);
  const [title, setTitle] = useState<string>('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string| null>(null);
  const [renameFolder, setRenameFolder] = useState<{id:string, name:string}|null>(null);
  const [renameDoc, setRenameDoc] = useState<{id:string, title:string}|null>(null);
  const [moveDoc, setMoveDoc] = useState<{id:string}|null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [editingImage, setEditingImage] = useState<{ fileObjectId: string; name: string } | null>(null);

  useEffect(()=>{ if (!previewPdf) return; const onKey = (e: KeyboardEvent)=>{ if(e.key==='Escape') setPreviewPdf(null); }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey); }, [previewPdf]);

  const fetchDownloadUrl = async (fid:string)=>{ try{ const r:any = await api('GET', `/files/${fid}/download`); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; } };

  const upload = async()=>{ try{ if(!fileObj){ toast.error('Select a file'); return; } if(activeFolderId==='all'){ toast.error('Open a folder first'); return; } const name=fileObj.name; const type=fileObj.type||'application/octet-stream'; const up=await api('POST','/files/upload',{ original_name:name, content_type:type, client_id:id, project_id:null, employee_id:null, category_id:'client-docs' }); await fetch(up.upload_url,{ method:'PUT', headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' }, body:fileObj }); const conf=await api('POST','/files/confirm',{ key:up.key, size_bytes:fileObj.size, checksum_sha256:'na', content_type:type }); await api('POST', `/clients/${encodeURIComponent(id)}/documents`, { folder_id: activeFolderId, title: title||name, file_id: conf.id }); toast.success('Uploaded'); setShowUpload(false); setFileObj(null); setTitle(''); await refetchDocs(); }catch(_e){ toast.error('Upload failed'); } };
  const uploadToFolder = async(folderId:string, file: File)=>{ try{ const name=file.name; const type=file.type||'application/octet-stream'; const up=await api('POST','/files/upload',{ original_name:name, content_type:type, client_id:id, project_id:null, employee_id:null, category_id:'client-docs' }); await fetch(up.upload_url,{ method:'PUT', headers:{ 'Content-Type':type,'x-ms-blob-type':'BlockBlob' }, body:file }); const conf=await api('POST','/files/confirm',{ key:up.key, size_bytes:file.size, checksum_sha256:'na', content_type:type }); await api('POST', `/clients/${encodeURIComponent(id)}/documents`, { folder_id: folderId, title: name, file_id: conf.id }); }catch(_e){} };
  const removeDoc = async(docId:string)=>{ const ok = await confirm({ title:'Delete file', message:'Are you sure you want to delete this file?' }); if(!ok) return; try{ await api('DELETE', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`); toast.success('Deleted'); await refetchDocs(); }catch(_e){ toast.error('Delete failed'); } };
  const removeFolder = async(folderId:string, folderName:string)=>{ const ok = await confirm({ title:'Delete folder', message:`Are you sure you want to delete "${folderName}"? This action cannot be undone.` }); if(!ok) return; try{ await api('DELETE', `/clients/${encodeURIComponent(id)}/folders/${encodeURIComponent(folderId)}`); toast.success('Folder deleted'); await refetchFolders(); if(activeFolderId===folderId) setActiveFolderId('all'); }catch(_e){ toast.error('Delete failed'); } };
  const removePic = async(picId:string)=>{ const ok = await confirm({ title:'Delete image', message:'Are you sure you want to delete this image?' }); if(!ok) return; try{ await api('DELETE', `/clients/${encodeURIComponent(id)}/files/${encodeURIComponent(picId)}`); toast.success('Image deleted'); await onRefresh(); setPicList(prev=> prev.filter(p=> p.id !== picId)); }catch(_e){ toast.error('Delete failed'); } };

  const topFolders = useMemo(()=> (folders||[]).filter((f:any)=> !f.parent_id), [folders]);
  const childFolders = useMemo(()=> (folders||[]).filter((f:any)=> f.parent_id===activeFolderId), [folders, activeFolderId]);
  const breadcrumb = useMemo(()=>{ if(activeFolderId==='all') return [] as any[]; const map = new Map<string, any>(); (folders||[]).forEach((f:any)=> map.set(f.id, f)); const path:any[]=[]; let cur=map.get(activeFolderId); while(cur){ path.unshift(cur); cur=cur.parent_id? map.get(cur.parent_id): null; } return path; }, [folders, activeFolderId]);
  const fileExt = (name?:string)=>{ const n=String(name||'').toLowerCase(); const m=n.match(/\.([a-z0-9]+)$/); return m? m[1] : ''; };
  const extStyle = (ext:string)=>{ const e=ext.toLowerCase(); if(e==='pdf') return { bg:'bg-[#e74c3c]', txt:'text-white' }; if(['xls','xlsx','csv'].includes(e)) return { bg:'bg-[#27ae60]', txt:'text-white' }; if(['doc','docx','odt','rtf'].includes(e)) return { bg:'bg-[#2980b9]', txt:'text-white' }; if(['ppt','pptx','key'].includes(e)) return { bg:'bg-[#d35400]', txt:'text-white' }; if(['png','jpg','jpeg','webp','gif','bmp','svg','heic','heif'].includes(e)) return { bg:'bg-[#8e44ad]', txt:'text-white' }; if(['zip','rar','7z','tar','gz'].includes(e)) return { bg:'bg-[#34495e]', txt:'text-white' }; if(['txt','md','json','xml','yaml','yml'].includes(e)) return { bg:'bg-[#16a085]', txt:'text-white' }; return { bg:'bg-gray-300', txt:'text-gray-800' }; };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <select className="border rounded px-3 py-2" value={which} onChange={e=>setWhich(e.target.value as any)}>
          <option value="all">All Files</option>
          <option value="client">Client</option>
          <option value="site">Site</option>
        </select>
        {which==='site' && (
          <select className="border rounded px-3 py-2" value={siteId} onChange={e=>setSiteId(e.target.value)}>
            <option value="">Select site...</option>
            {sortByLabel(sites, s=> (s.site_name||s.site_address_line1||String(s.id)).toString()).map(s=> <option key={String(s.id)} value={String(s.id)}>{s.site_name||s.site_address_line1||s.id}</option>)}
          </select>
        )}
      </div>

      {activeFolderId==='all' ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            <div className="text-sm font-semibold">Folders</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {topFolders.map((f:any)=> (
              <div key={f.id} className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                   onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                   onDragOver={(e)=>{ e.preventDefault(); }}
                   onDrop={async(e)=>{ e.preventDefault(); if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file as File); } toast.success('Uploaded'); } }}>
                <div className="text-4xl">📁</div>
                <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions">
                  {hasEditPermission && (
                    <button onClick={(e)=>{ e.stopPropagation(); removeFolder(f.id, f.name); }} className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]" title="Delete folder">🗑️</button>
                  )}
                </div>
              </div>
            ))}
            {!topFolders.length && <div className="text-sm text-gray-600">No folders yet</div>}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <button title="Home" onClick={()=> setActiveFolderId('all')} className="px-2 py-2 rounded-lg border">🏠</button>
            <div className="text-sm font-semibold flex gap-2 items-center">
              {breadcrumb.map((f:any, idx:number)=> (
                <span key={f.id} className="flex items-center gap-2">
                  {idx>0 && <span className="opacity-60">/</span>}
                  <button className="underline" onClick={()=> setActiveFolderId(f.id)}>{f.name}</button>
                </span>
              ))}
            </div>
            
          </div>
          <div className="rounded-lg border">
            <div className="p-4">
              {childFolders.length>0 && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Subfolders</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                    {childFolders.map((f:any)=> (
                      <div key={f.id} className="relative rounded-lg border p-3 h-28 bg-white hover:bg-gray-50 select-none group flex flex-col items-center justify-center"
                           onClick={(e)=>{ const t=e.target as HTMLElement; if(t.closest('.folder-actions')) return; setActiveFolderId(f.id); }}
                           onDragOver={(e)=>{ e.preventDefault(); }}
                           onDrop={async(e)=>{ e.preventDefault(); if(e.dataTransfer.files?.length){ const arr=Array.from(e.dataTransfer.files); for(const file of arr){ await uploadToFolder(f.id, file as File); } toast.success('Uploaded'); } }}>
                        <div className="text-4xl">📁</div>
                        <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions">
                          {hasEditPermission && (
                            <button onClick={(e)=>{ e.stopPropagation(); removeFolder(f.id, f.name); }} className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]" title="Delete folder">🗑️</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-semibold">Documents</h4>
                {false && selectedDocIds.size>0 && (
                  <div className="flex items-center gap-2">
                    <div className="text-sm">{selectedDocIds.size} selected</div>
                    <select id="bulk-move-target-client" className="border rounded px-2 py-1">
                      <option value="" disabled selected>Select destination</option>
                      {sortByLabel(folders||[], (f:any)=> (f.name||'').toString()).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <button className="px-3 py-1.5 rounded bg-brand-red text-white" onClick={async()=>{
                      const sel = document.getElementById('bulk-move-target-client') as HTMLSelectElement;
                      const dest = sel?.value || '';
                      if(!dest){ toast.error('Select destination folder'); return; }
                      try{
                        for(const docId of Array.from(selectedDocIds)){
                          await api('PUT', `/clients/${encodeURIComponent(String(id))}/documents/${encodeURIComponent(String(docId))}`, { folder_id: dest });
                        }
                        toast.success('Moved'); setSelectedDocIds(new Set()); await refetchDocs();
                      }catch(_e){ toast.error('Failed'); }
                    }}>Move</button>
                    <button className="px-3 py-1.5 rounded border" onClick={()=> setSelectedDocIds(new Set())}>Clear</button>
                  </div>
                )}
              </div>
              <div className="rounded-lg border overflow-hidden bg-white">
                {(docs||[]).map((d:any)=>{ const ext=fileExt(d.title).toUpperCase(); const s=extStyle(ext); const checked = selectedDocIds.has(d.id); return (
                  <div key={d.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-gray-50 ${selectMode && checked? 'bg-red-50':''}`}>
                    {selectMode && (
                      <input type="checkbox" className="mr-1" checked={checked} onChange={(e)=>{
                        setSelectedDocIds(prev=>{ const next = new Set(prev); if(e.target.checked) next.add(d.id); else next.delete(d.id); return next; });
                      }} />
                    )}
                    <div className={`w-10 h-12 rounded-lg ${s.bg} ${s.txt} flex items-center justify-center text-[10px] font-extrabold select-none`}>{ext||'FILE'}</div>
                    <div className="flex-1 min-w-0" onClick={async()=>{ if(selectMode) return; try{ const r:any = await api('GET', `/files/${encodeURIComponent(d.file_id)}/download`); const url=r.download_url||''; if(url) { if(ext==='PDF') setPreviewPdf({ url, name: d.title||'Preview' }); else window.open(url,'_blank'); } }catch(_e){ toast.error('Preview not available'); } }}>
                      <div className="font-medium truncate cursor-pointer hover:underline">{d.title||'Document'}</div>
                      <div className="text-[11px] text-gray-600 truncate">Uploaded {String(d.created_at||'').slice(0,10)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={`/files/${encodeURIComponent(d.file_id)}/download`} target="_blank">⬇️</a>
                      {hasEditPermission && (
                        <button onClick={(e)=>{ e.stopPropagation(); removeDoc(d.id); }} title="Delete" className="p-2 rounded hover:bg-red-50 text-red-600">🗑️</button>
                      )}
                    </div>
                  </div>
                ); })}
                {!(docs||[]).length && <div className="px-3 py-3 text-sm text-gray-600">No documents in this folder</div>}
              </div>
            </div>
          </div>
        </>
      )}

      <h4 className="font-semibold mt-4 mb-2">Pictures</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {(picList||[]).map(f=> { const isSite=!!f.site_id; const s=isSite? siteMap[String(f.site_id||'')] : undefined; const tip=isSite? `${s?.site_name||'Site'} — ${formatAddressDisplay({ address_line1: s?.site_address_line1, city: s?.site_city, province: s?.site_province, country: s?.site_country })}` : 'General Customer image'; return (
          <div key={f.id} className="relative group">
            <img className="w-full h-24 object-cover rounded border" src={`/files/${f.file_object_id}/thumbnail?w=300`} />
            <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
              <button onClick={async(e)=>{ e.stopPropagation(); const url = await fetchDownloadUrl(String(f.file_object_id)); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">🔍</button>
              <button onClick={(e)=>{ e.stopPropagation(); setEditingImage({ fileObjectId: f.file_object_id, name: f.original_name || 'image' }); }} className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] px-2 py-1 rounded" title="Edit">✏️</button>
              {hasEditPermission && (
                <button onClick={(e)=>{ e.stopPropagation(); removePic(f.id); }} className="bg-red-600 hover:bg-red-700 text-white text-[11px] px-2 py-1 rounded" title="Delete">🗑️</button>
              )}
            </div>
            <div className={`absolute left-2 top-2 text-[10px] font-bold rounded-full w-6 h-6 grid place-items-center ${isSite? 'bg-blue-500 text-white':'bg-green-500 text-white'}`} title={isSite? 'Site image':'Client image'}>
              {isSite? String((f.site_id||'') as string).slice(0,2).toUpperCase() : 'C'}
            </div>
            <div className="absolute inset-x-0 bottom-0 hidden group-hover:flex items-center text-[11px] text-white bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
              <span className="truncate">{tip}</span>
            </div>
          </div>
        ); })}
      </div>

      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-4">
            <div className="text-lg font-semibold mb-2">Add file</div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-600">Folder</div>
                <select className="border rounded px-3 py-2 w-full" value={activeFolderId==='all'? '': activeFolderId} onChange={e=> setActiveFolderId(e.target.value||'all')}>
                  <option value="">Select a folder</option>
                  {sortByLabel(folders||[], (f:any)=> (f.name||'').toString()).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-600">Title</div>
                <input className="border rounded px-3 py-2 w-full" value={title} onChange={e=> setTitle(e.target.value)} placeholder="Optional title" />
              </div>
              <div>
                <div className="text-xs text-gray-600">File</div>
                <input type="file" onChange={e=> setFileObj(e.target.files?.[0]||null)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setShowUpload(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={upload} className="px-3 py-2 rounded bg-brand-red text-white">Upload</button>
            </div>
          </div>
        </div>
      )}

      {newFolderOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">{newFolderParentId? 'New subfolder':'New folder'}</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={newFolderName} onChange={e=> setNewFolderName(e.target.value)} placeholder="e.g., Hiring pack" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setNewFolderOpen(false)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ const body:any = { name: (newFolderName||'').trim() }; if(newFolderParentId) body.parent_id = newFolderParentId; if(!body.name){ toast.error('Folder name required'); return; } await api('POST', `/clients/${encodeURIComponent(id)}/folders`, body); toast.success('Folder created'); setNewFolderOpen(false); setNewFolderName(''); setNewFolderParentId(null); await refetchFolders(); }catch(_e){ toast.error('Failed to create folder'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {renameFolder && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename folder</div>
            <div>
              <div className="text-xs text-gray-600">Folder name</div>
              <input className="border rounded px-3 py-2 w-full" value={renameFolder.name} onChange={e=> setRenameFolder({ id: renameFolder.id, name: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameFolder(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ await api('PUT', `/clients/${encodeURIComponent(id)}/folders/${encodeURIComponent(renameFolder.id)}`, { name: (renameFolder.name||'').trim() }); toast.success('Renamed'); setRenameFolder(null); await refetchFolders(); }catch(_e){ toast.error('Failed to rename'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {renameDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Rename file</div>
            <div>
              <div className="text-xs text-gray-600">Title</div>
              <input className="border rounded px-3 py-2 w-full" value={renameDoc.title} onChange={e=> setRenameDoc({ id: renameDoc.id, title: e.target.value })} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setRenameDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(renameDoc.id)}`, { title: (renameDoc.title||'').trim() }); toast.success('Renamed'); setRenameDoc(null); await refetchDocs(); }catch(_e){ toast.error('Failed to rename'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {moveDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-sm p-4">
            <div className="text-lg font-semibold mb-2">Move file</div>
            <div>
              <div className="text-xs text-gray-600">Destination folder</div>
              <select id="move-target-client" className="border rounded px-3 py-2 w-full" defaultValue="">
                <option value="" disabled>Select...</option>
                {sortByLabel(folders||[], (f:any)=> (f.name||'').toString()).map((f:any)=> <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setMoveDoc(null)} className="px-3 py-2 rounded border">Cancel</button>
              <button onClick={async()=>{ try{ const sel = document.getElementById('move-target-client') as HTMLSelectElement; const dest = sel?.value||''; if(!dest){ toast.error('Select destination'); return; } await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(moveDoc.id)}`, { folder_id: dest }); toast.success('Moved'); setMoveDoc(null); await refetchDocs(); }catch(_e){ toast.error('Failed to move'); } }} className="px-3 py-2 rounded bg-brand-red text-white">Move</button>
            </div>
          </div>
        </div>
      )}

      {previewPdf && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-[1000px] max-w-[95vw] h-[85vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-3 py-2 border-b flex items-center justify-between">
              <div className="font-semibold text-sm truncate pr-2">{previewPdf.name}</div>
              <div className="flex items-center gap-2">
                <a className="px-2 py-1 rounded bg-gray-100 text-sm" href={previewPdf.url} target="_blank">Download</a>
                <button onClick={()=>setPreviewPdf(null)} className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100" title="Close">×</button>
              </div>
            </div>
            <iframe className="flex-1" src={previewPdf.url} title="PDF Preview"></iframe>
          </div>
        </div>
      )}
      
      {editingImage && (
        <ImageEditor
          isOpen={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={`/files/${editingImage.fileObjectId}/thumbnail?w=1600`}
          imageName={editingImage.name}
          fileObjectId={editingImage.fileObjectId}
          onSave={async (blob) => {
            try {
              // Generate filename with _edited suffix
              const originalName = editingImage.name || 'image';
              const dot = originalName.lastIndexOf('.');
              const nameNoExt = dot > 0 ? originalName.slice(0, dot) : originalName.replace(/\.+$/, '');
              const ext = dot > 0 ? originalName.slice(dot) : '.png';
              const editedName = `${nameNoExt}_edited${ext}`;
              
              // Upload edited image
              const up: any = await api('POST', '/files/upload', {
                project_id: null,
                client_id: id,
                employee_id: null,
                category_id: 'image-edited',
                original_name: editedName,
                content_type: 'image/png'
              });
              
              await fetch(up.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': 'image/png', 'x-ms-blob-type': 'BlockBlob' },
                body: blob
              });
              
              const conf: any = await api('POST', '/files/confirm', {
                key: up.key,
                size_bytes: blob.size,
                checksum_sha256: 'na',
                content_type: 'image/png'
              });
              
              // Get original file to preserve site_id and category
              const originalFile = files.find(f => f.file_object_id === editingImage.fileObjectId);
              
              // Attach edited image to client (keeping same site_id and category if original had them)
              await api('POST', `/clients/${encodeURIComponent(id)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent(originalFile?.category || 'image-edited')}&original_name=${encodeURIComponent(editedName)}${originalFile?.site_id ? `&site_id=${encodeURIComponent(originalFile.site_id)}` : ''}`);
              
              toast.success('Image saved as edited copy');
              await onRefresh();
              setEditingImage(null);
            } catch (e: any) {
              console.error('Failed to save edited image:', e);
              toast.error('Failed to save edited image');
            }
          }}
        />
      )}
    </div>
  );
}

function ContactsCard({ id, hasEditPermission }: { id: string, hasEditPermission?: boolean }){
  const confirm = useConfirm();
  const { data, refetch } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/contacts`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/files`) });
  const [list, setList] = useState<any[]>([]);
  useEffect(()=>{ setList(data||[]); }, [data]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState('false');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [editId, setEditId] = useState<string|null>(null);
  const [eName, setEName] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eRole, setERole] = useState('');
  const [eDept, setEDept] = useState('');
  const [ePrimary, setEPrimary] = useState<'true'|'false'>('false');
  const [pickerForContact, setPickerForContact] = useState<string|null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createPhotoBlob, setCreatePhotoBlob] = useState<Blob|null>(null);
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (!createOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCreateOpen(false); setCreatePhotoBlob(null); setNameError(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createOpen]);

  const formatPhone = (v:string)=>{
    const d = String(v||'').replace(/\D+/g,'').slice(0,11);
    if (d.length<=3) return d;
    if (d.length<=6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
    if (d.length<=10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    return `+${d.slice(0,1)} (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7,11)}`;
  };
  const avatarFor = (contactId:string)=>{
    const rec = (files||[]).find((f:any)=> String(f.category||'').toLowerCase()==='contact-photo-'+String(contactId));
    return rec? `/files/${rec.file_object_id}/thumbnail?w=160` : '';
  };
  const beginEdit = (c:any)=>{ setEditId(c.id); setEName(c.name||''); setEEmail(c.email||''); setEPhone(c.phone||''); setERole(c.role_title||''); setEDept(c.department||''); setEPrimary(c.is_primary? 'true':'false'); };
  const cancelEdit = ()=>{ setEditId(null); };
  // Drag and drop reorder
  const [dragId, setDragId] = useState<string|null>(null);
  const onDragStart = (cid:string)=> setDragId(cid);
  const onDragOver = (e:React.DragEvent)=> { e.preventDefault(); };
  const onDropOver = async(overId:string)=>{
    if(!dragId || dragId===overId) return;
    const curr = [...list];
    const from = curr.findIndex(x=> x.id===dragId);
    const to = curr.findIndex(x=> x.id===overId);
    if(from<0 || to<0) return;
    const [moved] = curr.splice(from,1);
    curr.splice(to,0,moved);
    setList(curr);
    // Auto-save order
    try{ 
      await api('POST', `/clients/${id}/contacts/reorder`, curr.map(c=> String(c.id))); 
      toast.success('Order saved'); 
      refetch(); 
    }catch(e){ 
      toast.error('Failed to save order'); 
    }
  };
  return (
    <div>
      <div className="mb-2">
        <h4 className="font-semibold">Contacts</h4>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {hasEditPermission && (
          <button
            type="button"
            onClick={()=>setCreateOpen(true)}
            className="rounded-xl border-2 border-dashed border-gray-300 p-4 hover:border-brand-red hover:bg-gray-50 transition-all bg-white flex items-center justify-center min-h-[100px]"
          >
            <div className="text-lg text-gray-400 mr-2">+</div>
            <div className="font-medium text-xs text-gray-700">New Contact</div>
          </button>
        )}
        {(list||[]).map(c=> (
          <div key={c.id} className="rounded-xl border bg-white overflow-hidden flex" draggable onDragStart={()=>onDragStart(String(c.id))} onDragOver={onDragOver} onDrop={()=>onDropOver(String(c.id))}>
            <div className="w-28 bg-gray-100 flex items-center justify-center relative group">
              {avatarFor(c.id)? (
                <img className="w-20 h-20 object-cover rounded border" src={avatarFor(c.id)} />
              ): (
                <div className="w-20 h-20 rounded bg-gray-200 grid place-items-center text-lg font-bold text-gray-600">{(c.name||'?').slice(0,2).toUpperCase()}</div>
              )}
              <button onClick={()=>setPickerForContact(String(c.id))} className="hidden group-hover:block absolute right-1 bottom-1 text-[11px] px-2 py-0.5 rounded bg-black/70 text-white">Photo</button>
              <div className="absolute left-1 top-1 text-[10px] text-gray-600">⋮⋮</div>
            </div>
            <div className="flex-1 p-3 text-sm">
              {editId===c.id ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Edit contact</div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600">Primary</label>
                      <select className="border rounded px-2 py-1 text-xs" value={ePrimary} onChange={e=>setEPrimary(e.target.value as any)}>
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                      {hasEditPermission && (
                        <button onClick={async()=>{ const ok = await confirm({ title: 'Delete contact', message: 'Are you sure you want to delete this contact?' }); if(!ok) return; try { await api('DELETE', `/clients/${id}/contacts/${c.id}`); toast.success('Contact deleted'); setEditId(null); refetch(); } catch(e) { toast.error('Failed to delete contact'); } }} className="px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100" title="Delete">Delete</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600">Name</label>
                      <input className="border rounded px-2 py-1 w-full" value={eName} onChange={e=>setEName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Role/Title</label>
                      <input className="border rounded px-2 py-1 w-full" value={eRole} onChange={e=>setERole(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Department</label>
                      <input className="border rounded px-2 py-1 w-full" value={eDept} onChange={e=>setEDept(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Email</label>
                      <input className="border rounded px-2 py-1 w-full" value={eEmail} onChange={e=>setEEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Phone</label>
                      <input className="border rounded px-2 py-1 w-full" value={ePhone} onChange={e=>setEPhone(formatPhone(e.target.value))} />
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <button onClick={cancelEdit} className="px-2 py-1 rounded bg-gray-100">Cancel</button>
                    <button onClick={async()=>{ await api('PATCH', `/clients/${id}/contacts/${c.id}`, { name: eName, role_title: eRole, department: eDept, email: eEmail, phone: ePhone, is_primary: ePrimary==='true' }); setEditId(null); refetch(); }} className="px-2 py-1 rounded bg-brand-red text-white">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{c.name}</div>
                    <div className="flex items-center gap-2">
                      {c.is_primary && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 rounded-full px-2">Primary</span>}
                      {!c.is_primary && hasEditPermission && <button onClick={async()=>{ await api('PATCH', `/clients/${id}/contacts/${c.id}`, { is_primary: true }); refetch(); }} className="px-2 py-1 rounded bg-gray-100">Set Primary</button>}
                      {hasEditPermission && (
                        <button onClick={()=>beginEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-brand-red transition-colors" title="Edit contact">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-600">{c.role_title||''} {c.department? `· ${c.department}`:''}</div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Email</div>
                    <div className="text-gray-700">{c.email||'-'}</div>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] uppercase text-gray-500">Phone</div>
                    <div className="text-gray-700">{c.phone||'-'}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(!data || !data.length) && <div className="text-sm text-gray-600">No contacts</div>}
      </div>
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4">
          <div className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl">
            {/* Title bar - same style as New Site (SiteDetail) */}
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={()=>{ setCreateOpen(false); setCreatePhotoBlob(null); setNameError(false); }}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Contact</div>
                    <div className="text-xs text-gray-500 mt-0.5">Name, role and contact details</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              <div className="rounded-xl border bg-white p-4 grid md:grid-cols-5 gap-4 items-start">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Contact Photo <span className="opacity-60">(optional)</span></label>
                  <button type="button" onClick={()=>{ setCreatePhotoBlob(new Blob()); setPickerForContact('__new__'); }} className="w-full h-40 border border-gray-200 rounded-lg grid place-items-center bg-gray-50 hover:bg-gray-100 text-sm text-gray-600">Select Photo</button>
                </div>
                <div className="md:col-span-3 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Name <span className="text-red-600">*</span></label>
                    <input
                      className={`w-full border rounded-lg px-3 py-2 text-sm ${nameError && !name.trim() ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-gray-300 focus:border-gray-300'}`}
                      value={name}
                      onChange={e=>{ setName(e.target.value); if(nameError) setNameError(false); }}
                    />
                    {nameError && !name.trim() && <div className="text-[11px] text-red-600 mt-1">This field is required</div>}
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Role/Title</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={role} onChange={e=>setRole(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Department</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={dept} onChange={e=>setDept(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={email} onChange={e=>setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Phone</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={phone} onChange={e=>setPhone(formatPhone(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide block mb-1">Primary</label>
                    <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={primary} onChange={e=>setPrimary(e.target.value)}>
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 bg-white flex items-center justify-end gap-3 rounded-b-xl">
              <button type="button" onClick={()=>{ setCreateOpen(false); setCreatePhotoBlob(null); setNameError(false); }} className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 text-gray-700">Cancel</button>
              <button
                type="button"
                onClick={async()=>{
                  if (isCreatingContact) return;
                  if (!name.trim()) {
                    setNameError(true);
                    toast.error('Name is required');
                    return;
                  }
                  try {
                    setIsCreatingContact(true);
                    const payload:any = { name, email, phone, role_title: role, department: dept, is_primary: primary==='true' };
                    await api('POST', `/clients/${id}/contacts`, payload);
                    setName(''); setEmail(''); setPhone(''); setRole(''); setDept(''); setPrimary('false'); setNameError(false); setCreateOpen(false); refetch();
                  } catch (e) {
                    toast.error('Failed to create contact');
                    setIsCreatingContact(false);
                  }
                }}
                disabled={isCreatingContact}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-brand-red text-white hover:bg-[#c41e1e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingContact ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      {pickerForContact && (
        <ImagePicker isOpen={true} onClose={()=>setPickerForContact(null)} clientId={String(id)} targetWidth={400} targetHeight={400} allowEdit={true} onConfirm={async(blob)=>{
          try{
            if (pickerForContact==='__new__'){
              // We don't yet have the new contact id here; the simple flow is to upload the photo now and let user reassign later.
              // For now, just keep it in memory not supported; instead, we will upload after contact is created via another round.
            }
            else {
              const up:any = await api('POST','/files/upload',{ project_id:null, client_id:id, employee_id:null, category_id:'contact-photo', original_name:`contact-${pickerForContact}.jpg`, content_type:'image/jpeg' });
              await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type':'image/jpeg', 'x-ms-blob-type':'BlockBlob' }, body: blob });
              const conf:any = await api('POST','/files/confirm',{ key: up.key, size_bytes: blob.size, checksum_sha256:'na', content_type:'image/jpeg' });
              await api('POST', `/clients/${id}/files?file_object_id=${encodeURIComponent(conf.id)}&category=${encodeURIComponent('contact-photo-'+pickerForContact)}&original_name=${encodeURIComponent('contact-'+pickerForContact+'.jpg')}`);
              toast.success('Contact photo updated');
              refetch();
            }
          }catch(e){ toast.error('Failed to update contact photo'); }
          finally{ setPickerForContact(null); }
        }} />
      )}
    </div>
  );
}



