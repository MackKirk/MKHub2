import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken, withFileAccessTokenIfNeeded } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { formatAddressDisplay } from '@/lib/addressUtils';
import { getClientStatusBadgeVariant } from '@/lib/clientUi';
import { useEffect, useMemo, useState, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import ImagePicker from '@/components/ImagePicker';
import ImageEditor from '@/components/ImageEditor';
import { useConfirm } from '@/components/ConfirmProvider';
import LoadingOverlay from '@/components/LoadingOverlay';
import { CustomerFilesTabEnhanced } from './CustomerFilesTabEnhanced';
import { OpportunityListItem, CreateReportModal } from './Opportunities';
import { ProjectListItem } from './Projects';
import NewContactModal from '@/components/NewContactModal';
import EditContactModal, { type ClientContactRecord } from '@/components/EditContactModal';
import SiteFormModal, { type ClientSiteRecord } from '@/components/SiteFormModal';
import EditCustomerGeneralModal, {
  type CustomerGeneralEditSection,
} from '@/components/EditCustomerGeneralModal';
import { SITE_CARD_COVER_CROP, uploadSiteCover } from '@/lib/siteCover';
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppFileUpload,
  AppFormModal,
  AppHeroEditButton,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSectionHeader,
  appSectionPresetProps,
  AppSelect,
  AppTabs,
  AppTooltip,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiModalLayer,
  uiRadius,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Users, ChevronDown, ChevronUp, CalendarDays, GripVertical, Mail, Phone, MapPin, Camera } from 'lucide-react';
import {
  canViewCustomerTab as canViewCustomerTabFn,
  type CustomerTab as CustomerTabId,
  canEditCustomerTab as canEditCustomerTabFn,
  canEditCustomerRecord as canEditCustomerRecordFn,
} from '@/lib/customerPermissions';

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

/** Hero collapse/expand — expand slower than collapse (same easing as quick info). */
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden transition-[max-height,opacity]';
const HERO_EXPAND_DURATION = 'duration-[1400ms]';
const HERO_COLLAPSE_DURATION = 'duration-[650ms]';

const OVERVIEW_DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'last_year', label: 'Last 12 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
] as const;

const OVERVIEW_DISPLAY_MODE_OPTIONS = [
  { value: 'quantity', label: 'Quantity' },
  { value: 'value', label: 'Value' },
] as const;

function DateRangeModal({ open, onClose, onConfirm, initialStartDate = '', initialEndDate = '' }: DateRangeModalProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  useEffect(() => {
    if (open) {
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
    }
  }, [open, initialStartDate, initialEndDate]);

  const handleConfirm = () => {
    if (startDate && endDate) {
      onConfirm(startDate, endDate);
    }
  };

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      title="Custom Date Range"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton disabled={!startDate || !endDate} onClick={handleConfirm}>
            Apply
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppDatePicker label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <AppDatePicker label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
    </AppFormModal>
  );
}

type ProjectLinkRow = { id: string; name?: string; code?: string };

function CustomerOverviewProjectListModal({
  open,
  onClose,
  title,
  subtitle = 'Click an item to open the project page',
  items,
  emptyMessage = 'No items',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: ProjectLinkRow[];
  emptyMessage?: string;
}) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      size="md"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      {items.length === 0 ? (
        <AppEmptyState title={emptyMessage} />
      ) : (
        <ul className={uiCx(uiBorders.subtle, uiRadius.control, 'divide-y divide-gray-100 overflow-hidden')}>
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${encodeURIComponent(p.id)}`}
                className={uiCx('block px-3 py-2.5 text-sm font-medium text-brand-red hover:bg-red-50')}
                onClick={onClose}
              >
                {p.name || p.code || p.id}
                {p.code && p.name ? <span className="ml-1 font-normal text-gray-500">({p.code})</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppModal>
  );
}

type RelatedMembershipRow = { id: string; code?: string; name?: string; is_bidding: boolean; is_awarded_related: boolean };

type ClientParticipationsResponse = {
  rollup: (Project & { is_bidding?: boolean; participation?: string })[];
  related_memberships: RelatedMembershipRow[];
};

function CustomerOverviewRelatedModal({
  open,
  onClose,
  memberships,
}: {
  open: boolean;
  onClose: () => void;
  memberships: RelatedMembershipRow[];
}) {
  const projAll = memberships.filter((m) => !m.is_bidding);
  const oppAll = memberships.filter((m) => m.is_bidding);

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Related customer"
      description="Projects and opportunities where this customer is related (not owner)"
      size="md"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
          <AppButton variant="secondary" onClick={onClose}>
            Close
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppCard title="Projects" bodyClassName="p-0">
          {projAll.length === 0 ? (
            <p className={uiCx(uiTypography.helper, uiSpacing.cardPadding)}>None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {projAll.map((m) => (
                <li key={m.id} className={uiCx('flex items-center gap-2 px-3 py-2 hover:bg-gray-50')}>
                  <Link
                    to={`/projects/${encodeURIComponent(m.id)}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand-red"
                    onClick={onClose}
                  >
                    {m.name || m.code || m.id}
                  </Link>
                  <AppBadge variant={m.is_awarded_related ? 'success' : 'neutral'}>
                    {m.is_awarded_related ? 'Awarded' : 'Not awarded'}
                  </AppBadge>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
        <AppCard title="Opportunities" bodyClassName="p-0">
          {oppAll.length === 0 ? (
            <p className={uiCx(uiTypography.helper, uiSpacing.cardPadding)}>None</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {oppAll.map((m) => (
                <li key={m.id} className={uiCx('flex items-center gap-2 px-3 py-2 hover:bg-gray-50')}>
                  <Link
                    to={`/projects/${encodeURIComponent(m.id)}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-brand-red"
                    onClick={onClose}
                  >
                    {m.name || m.code || m.id}
                  </Link>
                  <AppBadge variant={m.is_awarded_related ? 'success' : 'neutral'}>
                    {m.is_awarded_related ? 'Awarded' : 'Not awarded'}
                  </AppBadge>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>
    </AppModal>
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
  const raw = Array.isArray(data.additional_costs) ? data.additional_costs : [];
  const additionalCosts = raw.filter((item: any) => item && item.approved !== false);
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
  const canViewCustomerTab = (t: CustomerTabId) => canViewCustomerTabFn(isAdmin, permissions, t);
  const canEditCustomerTab = (t: CustomerTabId) => canEditCustomerTabFn(isAdmin, permissions, t);
  const canDeleteCustomer = canEditCustomerRecordFn(isAdmin, permissions);
  const hasEditGeneral = canEditCustomerTab('general');
  const hasContactsEdit = canEditCustomerTab('contacts');
  const hasFilesView = canViewCustomerTab('files');
  const hasFilesEdit = canEditCustomerTab('files');
  const hasSitesEdit = canEditCustomerTab('sites');
  const hasProjectsTabView = canViewCustomerTab('projects');
  const hasProjectsEdit = canEditCustomerTab('projects');
  const hasOpportunitiesTabView = canViewCustomerTab('opportunities');
  const hasOpportunitiesEdit = canEditCustomerTab('opportunities');
  const hasOverviewView = canViewCustomerTab('overview');
  const hasGeneralView = canViewCustomerTab('general');
  const hasContactsView = canViewCustomerTab('contacts');
  const hasSitesView = canViewCustomerTab('sites');
  const { data:sites } = useQuery({ queryKey:['clientSites', id], queryFn: ()=>api<Site[]>('GET', `/clients/${id}/sites`) });
  const { data:files, refetch: refetchFiles } = useQuery({ queryKey:['clientFiles', id], queryFn: ()=>api<ClientFile[]>('GET', `/clients/${id}/files`) });
  const { data:settings } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  const { data: projectDivisions } = useQuery({
    queryKey: ['project-divisions'],
    queryFn: () => api<any[]>('GET', '/settings/project-divisions'),
    staleTime: 300_000,
    enabled: hasOverviewView || hasProjectsTabView || hasOpportunitiesTabView,
  });
  const projectStatuses = (settings?.project_statuses || []) as any[];
  const reportCategories = (settings?.report_categories || []) as any[];
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
  const { data: participationData, isLoading: participationLoading } = useQuery({
    queryKey: ['clientProjectParticipations', id],
    queryFn: () =>
      api<ClientParticipationsResponse>(
        'GET',
        `/clients/${encodeURIComponent(String(id || ''))}/project-participations`
      ),
    enabled: (hasProjectsTabView || hasOpportunitiesTabView || hasOverviewView) && !!id,
    staleTime: 60_000,
  });
  const projects = useMemo(
    () => (participationData?.rollup ?? []).filter((p) => p.is_bidding !== true),
    [participationData]
  );
  const opportunities = useMemo(
    () => (participationData?.rollup ?? []).filter((p) => p.is_bidding === true),
    [participationData]
  );
  const relatedMemberships = useMemo(
    () => participationData?.related_memberships ?? [],
    [participationData]
  );
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
  type OverviewKpiModalKind = 'closed' | 'pipeline' | 'inProgress' | 'onHold' | 'related' | null;
  const [overviewKpiModal, setOverviewKpiModal] = useState<OverviewKpiModalKind>(null);
  
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
    enabled: hasProjectsTabView && projectsToFetch.length > 0,
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
    enabled: hasOpportunitiesTabView && opportunitiesToFetch.length > 0,
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

  const overviewModalItemsClosed = useMemo(
    () =>
      filteredProjects
        .filter((p) => (p.details?.status_label || p.status_label || '').toLowerCase() === 'finished')
        .map((p) => ({ id: p.id, name: p.name, code: p.code })),
    [filteredProjects]
  );
  const overviewModalItemsInProgress = useMemo(
    () =>
      filteredProjects
        .filter((p) => (p.details?.status_label || p.status_label || '').toLowerCase() === 'in progress')
        .map((p) => ({ id: p.id, name: p.name, code: p.code })),
    [filteredProjects]
  );
  const overviewModalItemsOnHold = useMemo(
    () =>
      filteredProjects
        .filter((p) => (p.details?.status_label || p.status_label || '').toLowerCase() === 'on hold')
        .map((p) => ({ id: p.id, name: p.name, code: p.code })),
    [filteredProjects]
  );
  const overviewModalItemsPipeline = useMemo(
    () =>
      filteredOpportunities
        .filter((o) => {
          const s = (o.details?.status_label || o.status_label || '').toLowerCase();
          return s === 'prospecting' || s === 'sent to customer';
        })
        .map((o) => ({ id: o.id, name: o.name, code: o.code })),
    [filteredOpportunities]
  );

  const relatedParticipationStats = useMemo(() => {
    const proj = relatedMemberships.filter((m) => !m.is_bidding);
    const opp = relatedMemberships.filter((m) => m.is_bidding);
    return {
      projectsTotal: proj.length,
      projectsAwarded: proj.filter((m) => m.is_awarded_related).length,
      opportunitiesTotal: opp.length,
      opportunitiesAwarded: opp.filter((m) => m.is_awarded_related).length,
    };
  }, [relatedMemberships]);

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
    enabled: (hasProjectsTabView || hasOverviewView) && chartProjects.length > 0,
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
    enabled: (hasOpportunitiesTabView || hasOverviewView) && chartOpportunities.length > 0,
    staleTime: 120_000,
  });

  const projectCostsSummaryTotalsMap = useMemo(() => {
    return new Map((projectCostsSummaryTotalsQuery.data || []).map((r: any) => [r.id, r.total]));
  }, [projectCostsSummaryTotalsQuery.data]);

  const opportunityProposalTotalsMap = useMemo(() => {
    return new Map((opportunityProposalTotalsQuery.data || []).map((r: any) => [r.id, r.total]));
  }, [opportunityProposalTotalsQuery.data]);
  
  const isOverviewLoading =
    participationLoading ||
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

  // Chart-specific filtered data (for per-chart date range) and status breakdowns
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
  const availableTabs = useMemo(
    () =>
      (['overview', 'general', 'contacts', 'files', 'sites', 'opportunities', 'projects'] as const).filter(
        (t) => canViewCustomerTab(t)
      ),
    [isAdmin, permissions]
  );
  
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
    if (availableTabs.length === 0) return;
    const currentKey = tab === null ? 'overview' : tab;
    if (!availableTabs.includes(currentKey as (typeof availableTabs)[number])) {
      const first = availableTabs[0];
      const newTab = first === 'overview' ? null : (first as CustomerTab);
      setTab(newTab);
      if (newTab === null) {
        navigate(location.pathname, { replace: true });
      } else {
        navigate(`${location.pathname}?tab=${newTab}`, { replace: true });
      }
    }
  }, [tab, availableTabs, location.pathname, navigate]);

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
  const clientLogoRec = useMemo(() => {
    const logos = (files || []).filter(
      (f) => !f.site_id && String(f.category || '').toLowerCase() === 'client-logo-derived',
    );
    if (logos.length === 0) return undefined;
    return [...logos].sort((a, b) =>
      String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')),
    )[0];
  }, [files]);

  const heroAvatarSrc = useMemo(() => {
    const logoUrl = (client as { logo_url?: string | null } | undefined)?.logo_url;
    if (logoUrl) {
      return withFileAccessTokenIfNeeded(logoUrl) || '/ui/assets/placeholders/customer.png';
    }
    if (clientLogoRec?.file_object_id) {
      return withFileAccessToken(`/files/${clientLogoRec.file_object_id}/thumbnail?w=800`);
    }
    return '/ui/assets/placeholders/customer.png';
  }, [client, clientLogoRec?.file_object_id]);
  const [generalEditSection, setGeneralEditSection] = useState<CustomerGeneralEditSection | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [projectPicker, setProjectPicker] = useState<{ open:boolean, projectId?:string }|null>(null);
  
  const billingUsesDifferentAddress = (client as any)?.billing_same_as_address === false;

  const fileBySite = useMemo(()=>{
    const m: Record<string, ClientFile[]> = {};
    (files||[]).forEach(f=>{ const sid = (f.site_id||'') as string; m[sid] = m[sid]||[]; m[sid].push(f); });
    return m;
  }, [files]);
  const c = client || {} as Client;

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

  const activeTabKey = tab === null ? 'overview' : tab;
  const appTabItems = useMemo(
    () =>
      availableTabs.map((tabKey) => {
        const labels: Record<string, string> = {
          overview: 'Overview',
          general: 'General',
          contacts: 'Contacts',
          files: 'Files',
          sites: 'Sites',
          opportunities: 'Opportunities',
          projects: 'Projects',
        };
        return { key: tabKey, label: labels[tabKey] || tabKey };
      }),
    [availableTabs],
  );

  const handlePageBack = () => {
    if (tab !== null && hasOverviewView) {
      setTab(null);
      navigate(location.pathname, { replace: true });
    } else {
      navigate('/customers');
    }
  };

  const clientStatusLabel = String((c as any).client_status || '');
  const clientStatusVariant = getClientStatusBadgeVariant(clientStatusLabel);

  return (
    <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
      <div className={uiCx('w-full', uiSpacing.pageStack)}>
      <div
        className={uiCx(
          'flex flex-col',
          isHeroCollapsed ? 'gap-1.5' : 'gap-2',
        )}
      >
      <AppPageHeader
        title={getPageTitle(c, tab)}
        subtitle={getPageDescription(c, tab)}
        icon={<Users className="h-4 w-4" />}
        onBack={handlePageBack}
        backLabel={tab !== null && hasOverviewView ? 'Back to Overview' : 'Back to Customers'}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard
        className={uiCx('transition-[margin]', HERO_PANEL_EASE)}
        bodyClassName="relative overflow-hidden p-0"
      >
        {canDeleteCustomer && (
          <AppButton
            type="button"
            variant="danger"
            size="sm"
            className="absolute top-2 right-2 z-20"
            onClick={async (e) => {
              e.stopPropagation();
              const ok = await confirm({
                title: 'Delete customer',
                message: 'Are you sure you want to delete this customer? This action cannot be undone.',
              });
              if (!ok) return;
              try {
                await api('DELETE', `/clients/${encodeURIComponent(String(id || ''))}`);
                toast.success('Customer deleted');
                await queryClient.invalidateQueries({ queryKey: ['clients'] });
                navigate('/customers');
              } catch (_e) {
                toast.error('Failed to delete customer');
              }
            }}
          >
            Delete Customer
          </AppButton>
        )}

        <div
          className={uiCx(
            HERO_PANEL_TRANSITION_BASE,
            HERO_PANEL_EASE,
            isHeroCollapsed
              ? uiCx(HERO_COLLAPSE_DURATION, 'max-h-0 opacity-0')
              : uiCx(HERO_EXPAND_DURATION, 'max-h-[320px] opacity-100'),
          )}
          aria-hidden={isHeroCollapsed}
        >
          <div className="relative p-3 pr-10">
            <div className="flex items-start gap-3">
              <div className="w-48 shrink-0">
                <div className={uiCx('group relative h-36 w-48 overflow-hidden', uiRadius.control, uiBorders.subtle)}>
                  <img
                    key={clientLogoRec?.file_object_id ?? (client as { logo_url?: string })?.logo_url ?? 'placeholder'}
                    src={heroAvatarSrc}
                    className="h-full w-full object-cover"
                    alt=""
                  />
                  {hasFilesEdit && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={uiCx(uiTypography.sectionTitle, 'mb-2 truncate')}>{c.display_name || c.name || id}</h3>
                <div className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-2 gap-y-1.5">
                  <div className="min-w-0">
                    <div className={uiTypography.overline}>Code</div>
                    <div className={uiCx(uiTypography.helper, 'mt-0.5 font-semibold text-gray-900')}>
                      {c.code || id?.slice(0, 8) || '—'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={uiTypography.overline}>Address</div>
                    <div
                      className={uiCx(uiTypography.helper, 'mt-0.5 truncate font-semibold text-gray-900')}
                      title={formatAddressDisplay({
                        address_line1: c.address_line1,
                        address_line2: (c as any).address_line2,
                        city: c.city,
                        province: c.province,
                        postal_code: c.postal_code,
                        country: c.country,
                      })}
                    >
                      {formatAddressDisplay({
                        address_line1: c.address_line1,
                        address_line2: (c as any).address_line2,
                        city: c.city,
                        province: c.province,
                        postal_code: c.postal_code,
                        country: c.country,
                      })}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={uiTypography.overline}>Status</div>
                    <div className="mt-0.5">
                      {clientStatusLabel ? (
                        <AppBadge variant={clientStatusVariant}>{clientStatusLabel}</AppBadge>
                      ) : (
                        <span className={uiCx(uiTypography.helper, 'font-semibold text-gray-400')}>—</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={uiTypography.overline}>Type</div>
                    <div className={uiCx(uiTypography.helper, 'mt-0.5 font-semibold text-gray-900')}>
                      {(c as any).client_type ? String((c as any).client_type) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={uiCx(
            HERO_PANEL_TRANSITION_BASE,
            HERO_PANEL_EASE,
            isHeroCollapsed
              ? uiCx(HERO_EXPAND_DURATION, 'max-h-[32px] opacity-100')
              : uiCx(HERO_COLLAPSE_DURATION, 'max-h-0 opacity-0'),
          )}
          aria-hidden={!isHeroCollapsed}
        >
          <div className="flex h-8 items-center justify-between gap-2 px-2.5 py-0">
            <h3 className={uiCx(uiTypography.sectionTitle, 'min-w-0 flex-1 truncate leading-none')}>
              {c.display_name || c.name || id}
            </h3>
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-[10px] font-medium leading-none text-gray-500">{c.code || id?.slice(0, 8) || '—'}</span>
              {clientStatusLabel ? (
                <AppBadge variant={clientStatusVariant} className="!px-1.5 !py-0 !text-[9px] !leading-none">
                  {clientStatusLabel}
                </AppBadge>
              ) : null}
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                className="ml-0.5 shrink-0 p-0.5"
                onClick={() => setIsHeroCollapsed(false)}
                title="Expand"
                aria-label="Expand"
              >
                <ChevronDown className="h-3 w-3" />
              </AppButton>
            </div>
          </div>
        </div>

        {!isHeroCollapsed ? (
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            className="absolute bottom-2 right-2 z-20 p-1"
            onClick={() => setIsHeroCollapsed(true)}
            title="Collapse"
            aria-label="Collapse"
          >
            <ChevronUp className="h-3 w-3" />
          </AppButton>
        ) : null}
      </AppCard>

      {availableTabs.length > 0 && (
        <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>
          <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : 'p-3'}>
            <AppTabs tabs={appTabItems} value={activeTabKey} onChange={(key) => handleTabClick(key === 'overview' ? null : (key as CustomerTab))} />
          </AppCard>
        </div>
      )}
      </div>

      <AppCard bodyClassName="p-5">
          {isLoading? <div className="h-24 animate-pulse bg-gray-100 rounded"/> : (
            <>
              {availableTabs.length === 0 && (
                <p className="text-sm text-gray-500">You do not have permission to view any section of this customer.</p>
              )}
              {tab === null && hasOverviewView && (
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
                        <AppSelect
                          value={globalDateFilter}
                          onChange={(e) => {
                            const v = e.target.value as DateFilterType;
                            setGlobalDateFilter(v);
                            if (v === 'custom') {
                              setGlobalDateModalOpen(true);
                            }
                          }}
                          options={[...OVERVIEW_DATE_FILTER_OPTIONS]}
                          className="w-auto min-w-[140px]"
                        />
                        {globalDateFilter === 'custom' && globalDateCustomStart && globalDateCustomEnd && (
                          <AppTooltip
                            content={`${formatDateForDisplay(globalDateCustomStart)} - ${formatDateForDisplay(globalDateCustomEnd)}`}
                          >
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="p-1"
                              onClick={() => setGlobalDateModalOpen(true)}
                              aria-label="Edit custom date range"
                            >
                              <CalendarDays className="h-4 w-4" />
                            </AppButton>
                          </AppTooltip>
                        )}
                        <AppSelect
                          value={globalDisplayMode}
                          onChange={(e) => setGlobalDisplayMode(e.target.value as 'quantity' | 'value')}
                          options={[...OVERVIEW_DISPLAY_MODE_OPTIONS]}
                          className="w-auto min-w-[120px]"
                        />
                    </div>

                    {/* KPI Snapshot — 4 metrics + related card; Quantity/Value toggle */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/40"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
                        }}
                        onClick={() => setOverviewKpiModal('closed')}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Finished Projects</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.closed.value) : <CountUp value={kpis.closed.count} enabled={hasAnimated} />}
                        </div>
                        </div>
                        </LoadingOverlay>
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/40"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 50ms, transform 400ms ease-out 50ms',
                        }}
                        onClick={() => setOverviewKpiModal('pipeline')}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">Open Opportunities</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.pipeline.value) : <CountUp value={kpis.pipeline.count} enabled={hasAnimated} />}
                        </div>
                        </div>
                        </LoadingOverlay>
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/40"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 100ms, transform 400ms ease-out 100ms',
                        }}
                        onClick={() => setOverviewKpiModal('inProgress')}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">In Progress Projects</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.inProgress.value) : <CountUp value={kpis.inProgress.count} enabled={hasAnimated} />}
                        </div>
                        </div>
                        </LoadingOverlay>
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative text-left w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/40"
                        style={{
                          opacity: hasAnimated ? 1 : 0,
                          transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                          transition: 'opacity 400ms ease-out 150ms, transform 400ms ease-out 150ms',
                        }}
                        onClick={() => setOverviewKpiModal('onHold')}
                      >
                        <LoadingOverlay isLoading={isOverviewLoading} minHeight="min-h-[80px]">
                        <div className="p-3">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">On Hold Projects</div>
                        <div className="text-lg font-semibold text-gray-900">
                          {globalDisplayMode === 'value' ? formatCurrency(kpis.onHold.value) : <CountUp value={kpis.onHold.count} enabled={hasAnimated} />}
                        </div>
                        </div>
                        </LoadingOverlay>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="w-full rounded-xl border border-gray-200/90 bg-white shadow-md overflow-hidden transition-shadow duration-200 hover:shadow-lg hover:border-gray-300/80 relative text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7f1010]/40"
                      style={{
                        opacity: hasAnimated ? 1 : 0,
                        transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
                        transition: 'opacity 400ms ease-out 200ms, transform 400ms ease-out 200ms',
                      }}
                      onClick={() => setOverviewKpiModal('related')}
                    >
                      <LoadingOverlay isLoading={participationLoading} minHeight="min-h-[72px]">
                        <div className="p-3">
                          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">PROJECTS AND OPPORTUNITIES RELATED TO THIS CUSTOMER</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <div className="text-[11px] font-semibold text-gray-700 mb-1">Projects</div>
                              <div className="text-lg font-semibold text-gray-900 tabular-nums">
                                {relatedParticipationStats.projectsTotal}{' '}
                                <span className="text-sm font-normal text-gray-500">as related</span>
                              </div>
                              <div className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">
                                {relatedParticipationStats.projectsAwarded}{' '}
                                <span className="text-sm font-normal text-gray-500">awarded of this total</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] font-semibold text-gray-700 mb-1">Opportunities</div>
                              <div className="text-lg font-semibold text-gray-900 tabular-nums">
                                {relatedParticipationStats.opportunitiesTotal}{' '}
                                <span className="text-sm font-normal text-gray-500">as related</span>
                              </div>
                              <div className="text-lg font-semibold text-gray-900 tabular-nums mt-0.5">
                                {relatedParticipationStats.opportunitiesAwarded}{' '}
                                <span className="text-sm font-normal text-gray-500">awarded of this total</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </LoadingOverlay>
                    </button>

                    <CustomerOverviewProjectListModal
                      open={overviewKpiModal === 'closed'}
                      onClose={() => setOverviewKpiModal(null)}
                      title="Finished Projects"
                      subtitle="Finished projects for this customer"
                      emptyMessage="No finished projects"
                      items={overviewModalItemsClosed}
                    />
                    <CustomerOverviewProjectListModal
                      open={overviewKpiModal === 'pipeline'}
                      onClose={() => setOverviewKpiModal(null)}
                      title="Open Opportunities"
                      subtitle="Open opportunities for this customer"
                      emptyMessage="No open opportunities"
                      items={overviewModalItemsPipeline}
                    />
                    <CustomerOverviewProjectListModal
                      open={overviewKpiModal === 'inProgress'}
                      onClose={() => setOverviewKpiModal(null)}
                      title="In Progress Projects"
                      subtitle="Projects currently in progress"
                      emptyMessage="No in progress projects"
                      items={overviewModalItemsInProgress}
                    />
                    <CustomerOverviewProjectListModal
                      open={overviewKpiModal === 'onHold'}
                      onClose={() => setOverviewKpiModal(null)}
                      title="On Hold Projects"
                      subtitle="Projects on hold for this customer"
                      emptyMessage="No on hold projects"
                      items={overviewModalItemsOnHold}
                    />
                    <CustomerOverviewRelatedModal
                      open={overviewKpiModal === 'related'}
                      onClose={() => setOverviewKpiModal(null)}
                      memberships={relatedMemberships}
                    />

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
                  </div>
              )}
              {tab==='general' && hasGeneralView && (
                <div className="space-y-6">
                  <AppCard>
                    <AppSectionHeader
                      title="Company"
                      description="Core company identity details."
                      {...appSectionPresetProps('company')}
                      action={
                        hasEditGeneral ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('company')} title="Edit Company" />
                        ) : null
                      }
                    />
                    <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                      <ReadOnlyField label="Display name *" value={client?.display_name} />
                      <ReadOnlyField label="Legal name *" value={(client as any)?.legal_name} />
                      <ReadOnlyField label="Type" value={(client as any)?.client_type} />
                      <ReadOnlyField label="Status" value={(client as any)?.client_status} />
                      <ReadOnlyField label="Lead source" value={(client as any)?.lead_source} />
                      <ReadOnlyField label="Tax number" value={(client as any)?.tax_number} />
                    </div>
                  </AppCard>
                  <AppCard>
                    <AppSectionHeader
                      title="Address"
                      description="Primary mailing and location address."
                      {...appSectionPresetProps('address')}
                      action={
                        hasEditGeneral ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('address')} title="Edit Address" />
                        ) : null
                      }
                    />
                    <div className={uiCx('mt-4 grid gap-4 md:grid-cols-2')}>
                      <ReadOnlyField label="Address 1" value={client?.address_line1} />
                      <ReadOnlyField label="Address 2" value={client?.address_line2} />
                      <ReadOnlyField label="Country" value={(client as any)?.country} />
                      <ReadOnlyField label="Province/State" value={(client as any)?.province} />
                      <ReadOnlyField label="City" value={(client as any)?.city} />
                      <ReadOnlyField label="Postal code" value={client?.postal_code} />
                    </div>
                  </AppCard>
                  <AppCard>
                    <AppSectionHeader
                      title="Billing"
                      description="Preferences used for invoices and payments."
                      {...appSectionPresetProps('billing')}
                      action={
                        hasEditGeneral ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('billing')} title="Edit Billing" />
                        ) : null
                      }
                    />
                    <div className={uiCx('mt-4 space-y-4')}>
                      <div className="grid gap-4 md:grid-cols-2">
                        <ReadOnlyField label="Billing email" value={(client as any)?.billing_email} />
                        <ReadOnlyField
                          label="PO required"
                          value={(client as any)?.po_required ? 'Yes' : 'No'}
                        />
                      </div>
                      <AppCheckbox
                        label="Use different address for Billing address"
                        checked={billingUsesDifferentAddress}
                        disabled
                      />
                      {billingUsesDifferentAddress ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <ReadOnlyField label="Billing Address 1" value={(client as any)?.billing_address_line1} />
                          <ReadOnlyField label="Billing Address 2" value={(client as any)?.billing_address_line2} />
                          <ReadOnlyField label="Billing Country" value={(client as any)?.billing_country} />
                          <ReadOnlyField label="Billing Province/State" value={(client as any)?.billing_province} />
                          <ReadOnlyField label="Billing City" value={(client as any)?.billing_city} />
                          <ReadOnlyField label="Billing Postal code" value={(client as any)?.billing_postal_code} />
                        </div>
                      ) : (
                        <p className={uiTypography.helper}>Billing address matches the primary address.</p>
                      )}
                    </div>
                  </AppCard>
                  <AppCard>
                    <AppSectionHeader
                      title="Description"
                      description="Additional notes about this customer."
                      {...appSectionPresetProps('description')}
                      action={
                        hasEditGeneral ? (
                          <AppHeroEditButton onClick={() => setGeneralEditSection('description')} title="Edit Description" />
                        ) : null
                      }
                    />
                    <div className="mt-4">
                      <div className={uiCx(uiTypography.helper, 'whitespace-pre-wrap break-words font-medium text-gray-900')}>
                        {String((client as any)?.description || '') || '—'}
                      </div>
                    </div>
                  </AppCard>
                </div>
              )}
              {tab==='files' && hasFilesView && (
                <CustomerFilesTabEnhanced clientId={String(id)} files={files||[]} onRefresh={refetchFiles} hasEditPermission={hasFilesEdit} />
              )}
              {tab==='contacts' && hasContactsView && (
                <ContactsCard
                  id={String(id)}
                  hasEditPermission={hasContactsEdit}
                  clientDisplayName={client?.display_name || client?.name || ''}
                />
              )}
              {tab==='sites' && hasSitesView && (
                <SitesCard
                  clientId={String(id || '')}
                  sites={sites || []}
                  hasEditPermission={hasSitesEdit}
                  fileBySite={fileBySite}
                  clientDisplayName={client?.display_name || client?.name || ''}
                  onSitesRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['clientSites', id] });
                  }}
                  onFilesRefresh={refetchFiles}
                />
              )}
              {tab==='opportunities' && hasOpportunitiesTabView && (
                <div className={uiSpacing.sectionStack}>
                  <AppSectionHeader
                    title="Opportunities"
                    description="Bidding and sales opportunities linked to this customer."
                    {...appSectionPresetProps('opportunities')}
                  />
                  <div className="flex flex-col gap-2 overflow-x-auto">
                    {hasOpportunitiesEdit && (
                      <AppListCreateItem
                        label="New Opportunity"
                        layout="row"
                        className="min-h-[60px] min-w-[680px]"
                        onClick={() =>
                          navigate(`/projects/new?client_id=${encodeURIComponent(String(id || ''))}&is_bidding=true`, {
                            state: { backgroundLocation: location },
                          })
                        }
                      />
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
                      <AppEmptyState title="No opportunities for this customer." />
                    )}
                  </div>
                </div>
              )}
              {tab==='projects' && hasProjectsTabView && (
                <div className={uiSpacing.sectionStack}>
                  <AppSectionHeader
                    title="Projects"
                    description="Active and completed projects for this customer."
                    {...appSectionPresetProps('projects')}
                  />
                  <div className="flex flex-col gap-2 overflow-x-auto">
                    {(projectsWithDetails||[]).length > 0 ? (
                      <>
                        <div
                          className="grid grid-cols-[10fr_3fr_3fr_4fr_4fr_4fr_auto] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[800px] text-[10px] font-semibold text-gray-700"
                          aria-hidden
                        >
                          <div className="min-w-0" title="Project name, code and client">Project</div>
                          <div className="min-w-0" title="Start date">Start</div>
                          <div className="min-w-0" title="End date">End Date</div>
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
                      <AppEmptyState title="No projects for this customer." />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
      </AppCard>
      <EditCustomerGeneralModal
        open={generalEditSection !== null}
        section={generalEditSection}
        onClose={() => setGeneralEditSection(null)}
        clientId={String(id || '')}
        client={client}
        clientDisplayName={client?.display_name || client?.name || ''}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['client', id] });
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }}
      />
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
    </main>
  );
}

function ProjectRow({ project, files, onCoverClick, hasEditPermission }: { project: Project, files: ClientFile[], onCoverClick: (projectId: string)=>void, hasEditPermission?: boolean }){
  const { data:details } = useQuery({ queryKey:['project-detail-row', project.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(project.id))}`), staleTime: 60_000 });
  const pfiles = (files||[]).filter(f=> String((f as any).project_id||'')===String(project.id));
  const cover = pfiles.find(f=> String(f.category||'')==='project-cover-derived') || pfiles.find(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
  const src = cover? withFileAccessToken(`/files/${cover.file_object_id}/thumbnail?w=192`) : '/ui/assets/login/logo-light.svg';
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

function ReadOnlyField({ label, value }: { label: ReactNode; value?: string | null }) {
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>
        {String(value || '') || '—'}
      </div>
    </div>
  );
}

/** @deprecated Legacy wrapper — prefer App* controls with built-in labels. */
function Field({ label, tooltip, children }: { label: ReactNode; tooltip?: string; children: any }) {
  return (
    <div className="space-y-2">
      <label className={uiCx(uiTypography.controlLabel, 'flex items-center gap-1')}>
        <span>{label}</span>
        {tooltip ? <AppTooltip content={tooltip}><span className="inline-flex text-gray-400">?</span></AppTooltip> : null}
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
          <div><span className="opacity-70">End Date:</span> {eta||'—'}</div>
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
  const [moveDocFolderId, setMoveDocFolderId] = useState('');
  const [previewPdf, setPreviewPdf] = useState<{ url:string, name:string }|null>(null);
  const [selectMode, setSelectMode] = useState<boolean>(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [editingImage, setEditingImage] = useState<{ fileObjectId: string; name: string } | null>(null);

  useEffect(()=>{ if (!previewPdf) return; const onKey = (e: KeyboardEvent)=>{ if(e.key==='Escape') setPreviewPdf(null); }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey); }, [previewPdf]);

  const fetchDownloadUrl = async (fid:string)=>{ try{ const r:any = await api('GET', withFileAccessToken(`/files/${fid}/download`)); return String(r.download_url||''); }catch(_e){ toast.error('Download link unavailable'); return ''; } };

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
      <div className={uiCx(uiLayout.actionsRow, 'mb-3 flex-wrap')}>
        <AppSelect
          value={which}
          onChange={(e) => setWhich(e.target.value as 'all' | 'client' | 'site')}
          options={[
            { value: 'all', label: 'All Files' },
            { value: 'client', label: 'Client' },
            { value: 'site', label: 'Site' },
          ]}
          className="w-auto min-w-[140px]"
        />
        {which === 'site' && (
          <AppSelect
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="Select site..."
            options={[
              { value: '', label: 'Select site...' },
              ...sortByLabel(sites, (s) => (s.site_name || s.site_address_line1 || String(s.id)).toString()).map((s) => ({
                value: String(s.id),
                label: String(s.site_name || s.site_address_line1 || s.id),
              })),
            ]}
            className="w-auto min-w-[180px]"
          />
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
                    <div className="flex-1 min-w-0" onClick={async()=>{ if(selectMode) return; try{ const r:any = await api('GET', withFileAccessToken(`/files/${encodeURIComponent(d.file_id)}/download`)); const url=r.download_url||''; if(url) { if(ext==='PDF') setPreviewPdf({ url, name: d.title||'Preview' }); else window.open(url,'_blank'); } }catch(_e){ toast.error('Preview not available'); } }}>
                      <div className="font-medium truncate cursor-pointer hover:underline">{d.title||'Document'}</div>
                      <div className="text-[11px] text-gray-600 truncate">Uploaded {String(d.created_at||'').slice(0,10)}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={withFileAccessToken(`/files/${encodeURIComponent(d.file_id)}/download`)} target="_blank">⬇️</a>
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
            <img className="w-full h-24 object-cover rounded border" src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=300`)} loading="lazy" />
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

      <AppFormModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        title="Add file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton variant="secondary" onClick={() => setShowUpload(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={upload}>Upload</AppButton>
          </div>
        }
      >
        <div className={uiSpacing.sectionStack}>
          <AppSelect
            label="Folder"
            value={activeFolderId === 'all' ? '' : activeFolderId}
            onChange={(e) => setActiveFolderId(e.target.value || 'all')}
            placeholder="Select a folder"
            options={sortByLabel(folders || [], (f: any) => (f.name || '').toString()).map((f: any) => ({
              value: f.id,
              label: f.name,
            }))}
          />
          <AppInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
          <AppFileUpload label="File" value={fileObj} onChange={setFileObj} />
        </div>
      </AppFormModal>

      <AppFormModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title={newFolderParentId ? 'New subfolder' : 'New folder'}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton variant="secondary" onClick={() => setNewFolderOpen(false)}>
              Cancel
            </AppButton>
            <AppButton
              onClick={async () => {
                try {
                  const body: any = { name: (newFolderName || '').trim() };
                  if (newFolderParentId) body.parent_id = newFolderParentId;
                  if (!body.name) {
                    toast.error('Folder name required');
                    return;
                  }
                  await api('POST', `/clients/${encodeURIComponent(id)}/folders`, body);
                  toast.success('Folder created');
                  setNewFolderOpen(false);
                  setNewFolderName('');
                  setNewFolderParentId(null);
                  await refetchFolders();
                } catch (_e) {
                  toast.error('Failed to create folder');
                }
              }}
            >
              Create
            </AppButton>
          </div>
        }
      >
        <AppInput
          label="Folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="e.g., Hiring pack"
        />
      </AppFormModal>

      <AppFormModal
        open={!!renameFolder}
        onClose={() => setRenameFolder(null)}
        title="Rename folder"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton variant="secondary" onClick={() => setRenameFolder(null)}>
              Cancel
            </AppButton>
            <AppButton
              onClick={async () => {
                if (!renameFolder) return;
                try {
                  await api('PUT', `/clients/${encodeURIComponent(id)}/folders/${encodeURIComponent(renameFolder.id)}`, {
                    name: (renameFolder.name || '').trim(),
                  });
                  toast.success('Renamed');
                  setRenameFolder(null);
                  await refetchFolders();
                } catch (_e) {
                  toast.error('Failed to rename');
                }
              }}
            >
              Save
            </AppButton>
          </div>
        }
      >
        {renameFolder ? (
          <AppInput
            label="Folder name"
            value={renameFolder.name}
            onChange={(e) => setRenameFolder({ id: renameFolder.id, name: e.target.value })}
          />
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={!!renameDoc}
        onClose={() => setRenameDoc(null)}
        title="Rename file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton variant="secondary" onClick={() => setRenameDoc(null)}>
              Cancel
            </AppButton>
            <AppButton
              onClick={async () => {
                if (!renameDoc) return;
                try {
                  await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(renameDoc.id)}`, {
                    title: (renameDoc.title || '').trim(),
                  });
                  toast.success('Renamed');
                  setRenameDoc(null);
                  await refetchDocs();
                } catch (_e) {
                  toast.error('Failed to rename');
                }
              }}
            >
              Save
            </AppButton>
          </div>
        }
      >
        {renameDoc ? (
          <AppInput
            label="Title"
            value={renameDoc.title}
            onChange={(e) => setRenameDoc({ id: renameDoc.id, title: e.target.value })}
          />
        ) : null}
      </AppFormModal>

      <AppFormModal
        open={!!moveDoc}
        onClose={() => {
          setMoveDoc(null);
          setMoveDocFolderId('');
        }}
        title="Move file"
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
            <AppButton
              variant="secondary"
              onClick={() => {
                setMoveDoc(null);
                setMoveDocFolderId('');
              }}
            >
              Cancel
            </AppButton>
            <AppButton
              onClick={async () => {
                if (!moveDoc) return;
                if (!moveDocFolderId) {
                  toast.error('Select destination');
                  return;
                }
                try {
                  await api('PUT', `/clients/${encodeURIComponent(id)}/documents/${encodeURIComponent(moveDoc.id)}`, {
                    folder_id: moveDocFolderId,
                  });
                  toast.success('Moved');
                  setMoveDoc(null);
                  setMoveDocFolderId('');
                  await refetchDocs();
                } catch (_e) {
                  toast.error('Failed to move');
                }
              }}
            >
              Move
            </AppButton>
          </div>
        }
      >
        <AppSelect
          label="Destination folder"
          value={moveDocFolderId}
          onChange={(e) => setMoveDocFolderId(e.target.value)}
          placeholder="Select..."
          options={sortByLabel(folders || [], (f: any) => (f.name || '').toString()).map((f: any) => ({
            value: f.id,
            label: f.name,
          }))}
        />
      </AppFormModal>

      <AppModal
        open={!!previewPdf}
        onClose={() => setPreviewPdf(null)}
        title={previewPdf?.name}
        size="lg"
        dialogClassName="!max-w-[1000px] !h-[85vh]"
        bodyClassName="flex min-h-0 flex-1 flex-col p-0"
        footer={
          previewPdf ? (
            <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
              <AppButton variant="secondary" onClick={() => window.open(previewPdf.url, '_blank')}>
                Download
              </AppButton>
              <AppButton variant="secondary" onClick={() => setPreviewPdf(null)}>
                Close
              </AppButton>
            </div>
          ) : undefined
        }
      >
        {previewPdf ? <iframe className="min-h-0 flex-1 w-full" src={previewPdf.url} title="PDF Preview" /> : null}
      </AppModal>
      
      {editingImage && (
        <ImageEditor
          isOpen={!!editingImage}
          onClose={() => setEditingImage(null)}
          imageUrl={withFileAccessToken(`/files/${editingImage.fileObjectId}/thumbnail?w=1024`)}
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

function SitesCard({
  clientId,
  sites,
  hasEditPermission,
  fileBySite,
  clientDisplayName,
  onSitesRefresh,
  onFilesRefresh,
}: {
  clientId: string;
  sites: Site[];
  hasEditPermission?: boolean;
  fileBySite: Record<string, ClientFile[]>;
  clientDisplayName?: string;
  onSitesRefresh: () => void;
  onFilesRefresh: () => void;
}) {
  const [coverPickerSiteId, setCoverPickerSiteId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSite, setEditSite] = useState<ClientSiteRecord | null>(null);

  const coverBySiteId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sites) {
      const filesForSite = fileBySite[s.id || ''] || [];
      const cover = filesForSite.find((f) => String(f.category || '') === 'site-cover-derived');
      const img =
        cover ||
        filesForSite.find((f) => f.is_image === true || String(f.content_type || '').startsWith('image/'));
      if (img) {
        map.set(String(s.id), withFileAccessToken(`/files/${img.file_object_id}/thumbnail?w=480`));
      }
    }
    return map;
  }, [sites, fileBySite]);

  const openSite = (s: Site) => {
    setEditSite({
      id: String(s.id),
      site_name: s.site_name,
      site_address_line1: s.site_address_line1,
      site_address_line1_complement: (s as ClientSiteRecord).site_address_line1_complement,
      site_address_line2: (s as ClientSiteRecord).site_address_line2,
      site_address_line2_complement: (s as ClientSiteRecord).site_address_line2_complement,
      site_address_line3: (s as ClientSiteRecord).site_address_line3,
      site_address_line3_complement: (s as ClientSiteRecord).site_address_line3_complement,
      site_city: s.site_city,
      site_province: s.site_province,
      site_postal_code: (s as { site_postal_code?: string }).site_postal_code,
      site_country: s.site_country,
      site_notes: (s as ClientSiteRecord).site_notes,
    });
  };

  const refreshSites = () => {
    onSitesRefresh();
    onFilesRefresh();
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Construction Sites"
        description={
          hasEditPermission
            ? 'Click a row to edit. Use the camera control to change the cover without opening the form.'
            : 'Click a row to view site details.'
        }
        {...appSectionPresetProps('address')}
      />
      <div className="flex flex-col gap-2">
        {hasEditPermission && (
          <AppListCreateItem label="New Site" layout="row" onClick={() => setCreateOpen(true)} />
        )}
        {sites.map((s) => {
          const coverSrc = coverBySiteId.get(String(s.id)) || '';
          const addressLine = formatAddressDisplay({
            address_line1: s.site_address_line1,
            city: s.site_city,
            province: s.site_province,
            postal_code: (s as { site_postal_code?: string }).site_postal_code,
            country: s.site_country,
          });

          return (
            <div
              key={String(s.id)}
              role="button"
              tabIndex={0}
              onClick={() => openSite(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openSite(s);
                }
              }}
              className={uiCx(
                'group flex items-center gap-3 text-left',
                uiRadius.control,
                uiBorders.subtle,
                uiColors.surface,
                'px-2 py-2 sm:px-3 sm:py-2.5',
                'cursor-pointer transition-shadow hover:border-gray-300 hover:shadow-sm',
              )}
            >
              <div
                className={uiCx(
                  'relative h-12 w-36 shrink-0 overflow-hidden bg-gray-100 sm:h-14 sm:w-40',
                  uiRadius.control,
                )}
              >
                {coverSrc ? (
                  <img src={coverSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                    <MapPin className="h-6 w-6 opacity-50" aria-hidden />
                  </div>
                )}
                {hasEditPermission ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCoverPickerSiteId(String(s.id));
                    }}
                    className={uiCx(
                      'absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm',
                      'opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-800',
                    )}
                    title="Change cover"
                  >
                    <Camera className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className={uiCx(uiTypography.sectionTitle, 'truncate')}>{s.site_name || 'Site'}</p>
                <p className={uiCx(uiTypography.helper, 'mt-0.5 flex items-start gap-1 truncate')}>
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                  <span className="truncate">{addressLine || '—'}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {!sites.length && !hasEditPermission && <AppEmptyState title="No sites" />}
      <SiteFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clientId={clientId}
        clientDisplayName={clientDisplayName}
        onSaved={refreshSites}
      />
      <SiteFormModal
        open={!!editSite}
        onClose={() => setEditSite(null)}
        clientId={clientId}
        clientDisplayName={clientDisplayName}
        site={editSite}
        coverUrl={editSite ? coverBySiteId.get(String(editSite.id)) || '' : ''}
        readOnly={!hasEditPermission}
        onSaved={refreshSites}
        onDeleted={refreshSites}
      />
      {coverPickerSiteId && (
        <ImagePicker
          isOpen
          onClose={() => setCoverPickerSiteId(null)}
          clientId={clientId}
          targetWidth={SITE_CARD_COVER_CROP.width}
          targetHeight={SITE_CARD_COVER_CROP.height}
          allowEdit
          overlayClassName={uiModalLayer.nestedPicker}
          onConfirm={async (blob) => {
            try {
              await uploadSiteCover(clientId, coverPickerSiteId, blob);
              toast.success('Site cover updated');
              onFilesRefresh();
            } catch {
              toast.error('Failed to update site cover');
            } finally {
              setCoverPickerSiteId(null);
            }
          }}
        />
      )}
    </div>
  );
}

function ContactsCard({ id, hasEditPermission, clientDisplayName }: { id: string, hasEditPermission?: boolean, clientDisplayName?: string }){
  const queryClient = useQueryClient();
  const { data, refetch } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/contacts`) });
  const { data:files } = useQuery({ queryKey:['clientFilesForContacts', id], queryFn: ()=>api<any[]>('GET', `/clients/${id}/files`) });
  const [list, setList] = useState<any[]>([]);
  useEffect(()=>{ setList(data||[]); }, [data]);
  const [editContact, setEditContact] = useState<ClientContactRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const avatarByContactId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of list) {
      const rec = (files || []).find(
        (f: any) => String(f.category || '').toLowerCase() === `contact-photo-${String(c.id)}`,
      );
      if (rec) {
        map.set(String(c.id), withFileAccessToken(`/files/${rec.file_object_id}/thumbnail?w=160`));
      }
    }
    return map;
  }, [files, list]);

  const contactMetaLine = (c: any) => {
    const parts = [c.role_title, c.department].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  };

  const refreshContacts = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['clientFilesForContacts', id] });
  };

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
    try{ 
      await api('POST', `/clients/${id}/contacts/reorder`, curr.map(c=> String(c.id))); 
      toast.success('Order saved'); 
      refetch(); 
    }catch(e){ 
      toast.error('Failed to save order'); 
    }
  };

  const openEdit = (c: any) => {
    if (!hasEditPermission) return;
    setEditContact({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      role_title: c.role_title,
      department: c.department,
      is_primary: c.is_primary,
    });
  };

  return (
    <div className={uiSpacing.sectionStack}>
      <AppSectionHeader
        title="Contacts"
        description={
          hasEditPermission
            ? 'Click a row to edit. Drag rows to reorder. Primary contact is highlighted.'
            : undefined
        }
        {...appSectionPresetProps('contact')}
      />
      <div className="flex flex-col gap-2">
        {hasEditPermission && (
          <AppListCreateItem label="New Contact" layout="row" onClick={() => setCreateOpen(true)} />
        )}
        {(list||[]).map(c=> {
          const avatarSrc = avatarByContactId.get(String(c.id)) || '';
          const meta = contactMetaLine(c);

          return (
            <div
              key={c.id}
              role={hasEditPermission ? 'button' : undefined}
              tabIndex={hasEditPermission ? 0 : undefined}
              draggable={hasEditPermission}
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStart(String(c.id));
              }}
              onDragOver={onDragOver}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDropOver(String(c.id));
              }}
              onClick={() => openEdit(c)}
              onKeyDown={(e) => {
                if (hasEditPermission && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  openEdit(c);
                }
              }}
              className={uiCx(
                'group flex items-center gap-2 sm:gap-3 text-left',
                uiRadius.control,
                uiBorders.subtle,
                uiColors.surface,
                'px-2 py-2 sm:px-3 sm:py-2.5',
                hasEditPermission && 'cursor-pointer transition-shadow hover:border-gray-300 hover:shadow-sm',
                c.is_primary && 'ring-1 ring-emerald-200/80',
              )}
            >
              {hasEditPermission ? (
                <span
                  className="flex h-9 w-5 shrink-0 cursor-grab items-center justify-center text-gray-300 active:cursor-grabbing group-hover:text-gray-400"
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>
              ) : null}
              <div className="relative shrink-0">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt=""
                    className={uiCx('h-11 w-11 object-cover', uiRadius.control, 'ring-2 ring-white')}
                  />
                ) : (
                  <div
                    className={uiCx(
                      'flex h-11 w-11 items-center justify-center text-sm font-semibold text-gray-600',
                      uiRadius.control,
                      'bg-gradient-to-br from-gray-100 to-gray-200',
                    )}
                  >
                    {(c.name || '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{c.name || '—'}</span>
                  {c.is_primary ? <AppBadge variant="success">Primary</AppBadge> : null}
                </div>
                {meta ? <p className={uiCx(uiTypography.helper, 'truncate')}>{meta}</p> : null}
                <div
                  className={uiCx('mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5', uiTypography.helper)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-gray-600 hover:text-brand-red"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span className="truncate">{c.email}</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      —
                    </span>
                  )}
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex min-w-0 items-center gap-1 text-gray-600 hover:text-brand-red"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span>{c.phone}</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      —
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {(!data || !data.length) && !hasEditPermission && <AppEmptyState title="No contacts" />}
      <NewContactModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        clientId={id}
        clientDisplayName={clientDisplayName}
        onCreated={() => refreshContacts()}
      />
      <EditContactModal
        open={!!editContact}
        onClose={() => setEditContact(null)}
        clientId={id}
        clientDisplayName={clientDisplayName}
        contact={editContact}
        photoUrl={editContact ? avatarByContactId.get(String(editContact.id)) || '' : ''}
        onSaved={() => refreshContacts()}
        onDeleted={() => refreshContacts()}
      />
    </div>
  );
}



