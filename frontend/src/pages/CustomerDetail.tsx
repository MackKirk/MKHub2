import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken, withFileAccessTokenIfNeeded } from '@/lib/api';
import { sortByLabel } from '@/lib/sortOptions';
import { formatAddressDisplay } from '@/lib/addressUtils';
import { getClientStatusBadgeVariant } from '@/lib/clientUi';
import { PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { useEffect, useMemo, useState, ReactNode } from 'react';
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
import { CustomerOverviewTab } from '@/components/customer/overview/CustomerOverviewTab';

type Client = { id:string, name?:string, display_name?:string, code?:string, city?:string, province?:string, postal_code?:string, country?:string, address_line1?:string, address_line2?:string, created_at?:string };
type Site = { id:string, site_name?:string, site_address_line1?:string, site_city?:string, site_province?:string, site_country?:string };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string, site_id?:string, category?:string, original_name?:string, uploaded_at?:string };
type Project = { id:string, code?:string, name?:string, slug?:string, created_at?:string, date_start?:string, date_end?:string };
type Contact = { id:string, name?:string, email?:string, phone?:string, is_primary?:boolean };

type ClientParticipationsResponse = {
  rollup: (Project & { is_bidding?: boolean; participation?: string })[];
  related_memberships: Array<{
    id: string;
    code?: string;
    name?: string;
    is_bidding: boolean;
    is_awarded_related: boolean;
  }>;
};

type CustomerTab = 'overview' | 'general' | 'files' | 'contacts' | 'sites' | 'projects' | 'opportunities' | null;

/** Empty field placeholder (Unicode em dash). */
const EM_DASH = '\u2014';

/** Hero collapse/expand — expand slower than collapse (same easing as quick info). */
const HERO_PANEL_EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
const HERO_PANEL_TRANSITION_BASE = 'overflow-hidden transition-[max-height,opacity]';
const HERO_EXPAND_DURATION = 'duration-[1400ms]';
const HERO_COLLAPSE_DURATION = 'duration-[650ms]';
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
    queryKey: PROJECT_DIVISIONS_QUERY_KEY,
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
  const { data:contacts } = useQuery({ queryKey:['clientContacts', id], queryFn: ()=>api<Contact[]>('GET', `/clients/${id}/contacts`) });
  // Determine available tabs based on permissions
  // Order: Overview â†’ General â†’ Contacts â†’ Files â†’ Sites â†’ Opportunities â†’ Projects
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
    return `Customer Information \u00b7 ${tabTitles[activeTab] || activeTab}`;
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
    <div className={uiCx('w-full', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
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
                      {c.code || id?.slice(0, 8) || EM_DASH}
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
                        <span className={uiCx(uiTypography.helper, 'font-semibold text-gray-400')}>{EM_DASH}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className={uiTypography.overline}>Type</div>
                    <div className={uiCx(uiTypography.helper, 'mt-0.5 font-semibold text-gray-900')}>
                      {(c as any).client_type ? String((c as any).client_type) : EM_DASH}
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
              <span className="text-[10px] font-medium leading-none text-gray-500">{c.code || id?.slice(0, 8) || EM_DASH}</span>
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
                  <CustomerOverviewTab
                    clientId={String(id)}
                    client={client as Parameters<typeof CustomerOverviewTab>[0]['client']}
                    onTabChange={(t) => handleTabClick(t)}
                  />
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
                        {String((client as any)?.description || '') || EM_DASH}
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
                    {(opportunities||[]).length > 0 ? (
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
                        {(opportunities||[]).map((p: any) => (
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
                    {(projects||[]).length > 0 ? (
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
                        {(projects||[]).map((p: any) => (
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
    </div>
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
          <div className="text-sm text-gray-500 truncate mt-1">Start: {start||EM_DASH}</div>
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
  const display = String(value ?? '').trim();
  return (
    <div className="space-y-1">
      <div className={uiTypography.controlLabel}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'break-words font-medium text-gray-900')}>
        {display || EM_DASH}
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
          <span className="px-2 py-0.5 rounded-full text-[11px] border bg-gray-50 text-gray-800 truncate max-w-[60%]" title={status}>{status||EM_DASH}</span>
          <span className="text-[11px] text-gray-600">{reports||0} reports</span>
        </div>
        <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-brand-red" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div><span className="opacity-70">Start:</span> {start||EM_DASH}</div>
          <div><span className="opacity-70">End Date:</span> {eta||EM_DASH}</div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div className="truncate" title={est}><span className="opacity-70">Estimator:</span> {est? <UserInline id={est} /> : EM_DASH}</div>
          <div className="truncate" title={lead}><span className="opacity-70">On-site:</span> {lead? <UserInline id={lead} /> : EM_DASH}</div>
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
  return <span className="font-medium">{label||EM_DASH}</span>;
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
                <div className="text-4xl">ðŸ“</div>
                <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions">
                  {hasEditPermission && (
                    <button onClick={(e)=>{ e.stopPropagation(); removeFolder(f.id, f.name); }} className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]" title="Delete folder">ðŸ—‘ï¸</button>
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
            <button title="Home" onClick={()=> setActiveFolderId('all')} className="px-2 py-2 rounded-lg border">ðŸ </button>
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
                        <div className="text-4xl">ðŸ“</div>
                        <div className="mt-1 text-sm font-medium truncate text-center w-full" title={f.name}>{f.name}</div>
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 folder-actions">
                          {hasEditPermission && (
                            <button onClick={(e)=>{ e.stopPropagation(); removeFolder(f.id, f.name); }} className="p-1 rounded bg-red-600 hover:bg-red-700 text-white text-[10px]" title="Delete folder">ðŸ—‘ï¸</button>
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
                      <a title="Download" className="p-2 rounded hover:bg-gray-100" href={withFileAccessToken(`/files/${encodeURIComponent(d.file_id)}/download`)} target="_blank">â¬‡ï¸</a>
                      {hasEditPermission && (
                        <button onClick={(e)=>{ e.stopPropagation(); removeDoc(d.id); }} title="Delete" className="p-2 rounded hover:bg-red-50 text-red-600">ðŸ—‘ï¸</button>
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
        {(picList||[]).map(f=> { const isSite=!!f.site_id; const s=isSite? siteMap[String(f.site_id||'')] : undefined; const tip=isSite? `${s?.site_name||'Site'} ${EM_DASH} ${formatAddressDisplay({ address_line1: s?.site_address_line1, city: s?.site_city, province: s?.site_province, country: s?.site_country })}` : 'General Customer image'; return (
          <div key={f.id} className="relative group">
            <img className="w-full h-24 object-cover rounded border" src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=300`)} loading="lazy" />
            <div className="absolute right-2 top-2 hidden group-hover:flex gap-1">
              <button onClick={async(e)=>{ e.stopPropagation(); const url = await fetchDownloadUrl(String(f.file_object_id)); if(url) window.open(url,'_blank'); }} className="bg-black/70 hover:bg-black/80 text-white text-[11px] px-2 py-1 rounded" title="Zoom">ðŸ”</button>
              <button onClick={(e)=>{ e.stopPropagation(); setEditingImage({ fileObjectId: f.file_object_id, name: f.original_name || 'image' }); }} className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] px-2 py-1 rounded" title="Edit">âœï¸</button>
              {hasEditPermission && (
                <button onClick={(e)=>{ e.stopPropagation(); removePic(f.id); }} className="bg-red-600 hover:bg-red-700 text-white text-[11px] px-2 py-1 rounded" title="Delete">ðŸ—‘ï¸</button>
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
                  <span className="truncate">{addressLine || EM_DASH}</span>
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
    return parts.length ? parts.join(' Â· ') : null;
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
                  <span className={uiCx(uiTypography.sectionTitle, 'truncate')}>{c.name || EM_DASH}</span>
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
                  ) : null}
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex min-w-0 items-center gap-1 text-gray-600 hover:text-brand-red"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                      <span>{c.phone}</span>
                    </a>
                  ) : null}
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



