import { useQueries, useQuery } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { LayoutDashboard, LayoutGrid, List, Plus, Search, SlidersHorizontal } from 'lucide-react';
import LoadingOverlay from '@/components/LoadingOverlay';
import { DivisionIcon } from '@/components/DivisionIcon';
import { ReportAttachmentAreaMultiple } from '@/components/ReportAttachmentArea';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig, FilterOperator } from '@/components/FilterBuilder/types';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { useBusinessLine } from '@/context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE, filterProjectDivisionsForBusinessLine } from '@/lib/businessLine';
import {
  buildOpportunityListSearchParams,
  convertParamsToRules,
  convertRulesToParams,
  isRelatedToMeParamActive,
  OPPORTUNITY_FIELD_LABELS,
  resolveOpportunityQuickStatusFilters,
  setRelatedToMeParam,
} from '@/lib/opportunityFilters';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import { filterStatusesForOpportunity } from '@/lib/projectStatusVisibility';
import { getUserDisplayName } from '@/lib/userDisplay';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppPageHeader,
  AppSelect,
  AppTextarea,
  AppTooltip,
  AppTabCountBadge,
  getAppTabButtonClassName,
  AppUserAvatar,
  AppSortableEntityList,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  getListCreateItemClassName,
  useAppListSort,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiListCreateItem,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

/** Same avatar as AppUserSelect list rows (`AppUserAvatar` sm = 24px, gray placeholder). */
function UserAvatar({
  user,
  size = 'sm',
  showTooltip = true,
  tooltipText,
}: {
  user: any;
  size?: 'sm' | 'md';
  showTooltip?: boolean;
  tooltipText?: string;
}) {
  const displayName = tooltipText || getUserDisplayName(user) || 'Unknown';
  const avatar = <AppUserAvatar user={user} size={size} />;

  if (!showTooltip) {
    return <span className="relative inline-flex shrink-0">{avatar}</span>;
  }

  return (
    <AppTooltip content={displayName} className="group/avatar shrink-0">
      {avatar}
    </AppTooltip>
  );
}

type Opportunity = { id:string, code?:string, name?:string, slug?:string, client_id?:string, created_at?:string, date_start?:string, date_eta?:string, date_end?:string, is_bidding?:boolean, project_division_ids?:string[], cover_image_url?:string, estimator_id?:string, estimator_name?:string, cost_estimated?:number };
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };
type OpportunityListResponse = { items: Opportunity[]; total: number; page: number; limit: number } | Opportunity[];

function opportunityListTotal(data: OpportunityListResponse | undefined): number {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  return typeof data.total === 'number' ? data.total : (data.items?.length ?? 0);
}

/** Same emoji tab icons as before DS migration (UTF-16 escapes avoid file encoding issues). */
const OPPORTUNITY_TAB_ICON_BUTTONS = [
  { key: 'files', icon: '\u{1F4C1}', label: 'Files', tab: 'files' },
  { key: 'proposal', icon: '\u{1F4C4}', label: 'Proposal', tab: 'proposal' },
  { key: 'pricing', icon: '\u{1F4B0}', label: 'Pricing', tab: 'pricing' },
  { key: 'reports', icon: '\u{1F4CB}', label: 'Notes/History', tab: 'reports' },
] as const;

type OpportunitiesListKind = 'opportunity' | 'leak';

export default function Opportunities({ listKind = 'opportunity' }: { listKind?: OpportunitiesListKind } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const businessLine = useBusinessLine();
  const isLeakMode = listKind === 'leak';
  const opportunityBasePath = isLeakMode
    ? '/rm-leak-investigations'
    : (businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-opportunities' : '/opportunities');
  const businessDashboardPath = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-business' : '/business';
  const newOpportunityPath = isLeakMode
    ? '/rm-projects/new?is_leak_investigation=true'
    : `${businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects'}/new?is_bidding=true`;
  
  const [q, setQ] = useState(queryParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  // View mode state with persistence
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    // Check URL param first
    const urlView = searchParams.get('view');
    if (urlView === 'list' || urlView === 'cards') {
      return urlView;
    }
    // Then check localStorage
    const viewKey = isLeakMode ? 'leak-investigations-view-mode' : 'opportunities-view-mode';
    const saved = localStorage.getItem(viewKey);
    return (saved === 'list' || saved === 'cards') ? saved : 'list';
  });
  
  // Sync viewMode with URL and localStorage
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (viewMode === 'list') {
      params.set('view', 'list');
    } else {
      params.delete('view');
    }
    setSearchParams(params, { replace: true });
    localStorage.setItem(isLeakMode ? 'leak-investigations-view-mode' : 'opportunities-view-mode', viewMode);
  }, [viewMode, searchParams, setSearchParams, isLeakMode]);
  
  // Get current date formatted (same as Dashboard)
  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);
  
  // Convert current URL params to rules for modal
  const currentRules = useMemo(() => {
    return convertParamsToRules(searchParams);
  }, [searchParams]);
  
  // Sync search query with URL when it changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (q) {
      params.set('q', q);
    } else {
      params.delete('q');
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  
  // Sync q state when URL changes
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  
  // Build query string from URL params (filters + pagination)
  const qs = useMemo(() => {
    const params = buildOpportunityListSearchParams(searchParams, businessLine, {
      page: Number(searchParams.get('page') || '1') || 1,
      limit: Number(searchParams.get('limit') || '25') || 25,
    });
    const s = params.toString();
    return s ? `?${s}` : '';
  }, [searchParams, businessLine]);
  
  const listEndpoint = isLeakMode ? '/projects/business/leak-investigations' : '/projects/business/opportunities';
  const { data, isLoading, refetch } = useQuery({ 
    queryKey: [isLeakMode ? 'leak-investigations' : 'opportunities', businessLine, qs], 
    queryFn: ()=> api<{ items: Opportunity[]; total: number; page: number; limit: number } | Opportunity[]>('GET', `${listEndpoint}${qs}`)
  });
  
  // Load project divisions in parallel
  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({ 
    queryKey:['project-divisions'], 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  const divisionsForLine = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, businessLine),
    [projectDivisions, businessLine]
  );
  
  // Show loading until both opportunities and divisions are loaded
  const isInitialLoading = (isLoading && !data) || (divisionsLoading && !projectDivisions);
  
  // Track when animation completes to remove inline styles for hover to work
  useEffect(() => {
    if (hasAnimated) {
      const timer = setTimeout(() => setAnimationComplete(true), 400);
      return () => clearTimeout(timer);
    }
  }, [hasAnimated]);
  
  // Track when initial data is loaded to trigger entry animations
  useEffect(() => {
    if (!isInitialLoading && !hasAnimated) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, hasAnimated]);
  
  const { data: settings } = useQuery({ 
    queryKey:['settings'], 
    queryFn: ()=> api<any>('GET','/settings'), 
    staleTime: 300_000
  });
  
  const reportCategories = (settings?.report_categories || []) as any[];
  
  // Get clients for filter
  const { data: clientsData } = useQuery({ 
    queryKey:['clients-for-filter'], 
    queryFn: ()=> api<any>('GET','/clients?limit=100'), 
    staleTime: 300_000
  });
  
  const projectStatuses = settings?.project_statuses || [];
  const clients = clientsData?.items || clientsData || [];
  const paginated = data && !Array.isArray(data) && 'items' in data;
  const arr = paginated ? (data.items || []) : (Array.isArray(data) ? data : []);
  const totalCount = paginated && typeof (data as any).total === 'number' ? (data as any).total : arr.length;
  const currentPage = paginated && typeof (data as any).page === 'number' ? (data as any).page : 1;
  const limitPage = paginated && typeof (data as any).limit === 'number' ? (data as any).limit : 25;
  const totalPages = Math.max(1, Math.ceil(totalCount / limitPage));
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);
  const [reportModalOpen, setReportModalOpen] = useState<{ open:boolean, projectId?:string }|null>(null);

  type OpportunityListSort = 'opportunity' | 'estimator' | 'value' | 'status';
  const { sortBy, sortDir, setSort: setListSort } = useAppListSort<OpportunityListSort>({
    searchParams,
    setSearchParams,
    defaultSort: 'opportunity',
    validSorts: ['opportunity', 'estimator', 'value', 'status'] as const,
  });

  // Get employees for estimator filter
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-filter'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];

  // Only users with "Sales / Estimating" department for estimator filter dropdown
  const ESTIMATOR_DEPARTMENT = 'Sales / Estimating';
  const employeesInEstimatingDept = useMemo(() => {
    const target = ESTIMATOR_DEPARTMENT.toLowerCase();
    return (employees || []).filter((emp: any) => {
      if (Array.isArray(emp.divisions) && emp.divisions.length > 0) {
        return emp.divisions.some((d: any) => String(d?.label || '').trim().toLowerCase() === target);
      }
      const dept = String((emp.department || emp.division || '')).trim();
      return dept.toLowerCase().includes(target);
    });
  }, [employees]);

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission =
    (me?.roles || []).includes('admin') ||
    (me?.permissions || []).includes('business:projects:write') ||
    (businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE
      ? (me?.permissions || []).includes('business:rm:projects:write')
      : (me?.permissions || []).includes('business:construction:projects:write'));

  const hasRuleFilters = currentRules.length > 0;
  const hasActiveFilters = useMemo(() => {
    return hasRuleFilters || isRelatedToMeParamActive(searchParams);
  }, [hasRuleFilters, searchParams]);

  const opportunityQuickStatusFilters = useMemo(
    () => resolveOpportunityQuickStatusFilters(projectStatuses),
    [projectStatuses],
  );

  const toggleStatusQuickFilter = (statusId: string | undefined) => {
    if (!statusId) return;
    const params = new URLSearchParams(searchParams);
    const cur = params.get('status');
    if (cur === statusId) {
      params.delete('status');
    } else {
      params.delete('status_not');
      params.set('status', statusId);
    }
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const quickFilterSegments = useMemo(() => {
    const segments: Array<{ key: string; label: string; active: boolean; onClick: () => void }> = [
      {
        key: 'related_to_me',
        label: 'Related to Me',
        active: isRelatedToMeParamActive(searchParams),
        onClick: () => {
          const params = new URLSearchParams(searchParams);
          const enabling = !isRelatedToMeParamActive(searchParams);
          setRelatedToMeParam(params, enabling);
          if (enabling) {
            params.delete('status');
            params.delete('status_not');
          }
          params.set('page', '1');
          setSearchParams(params, { replace: true });
        },
      },
    ];
    for (const filter of opportunityQuickStatusFilters) {
      segments.push({
        key: filter.key,
        label: filter.label,
        active: searchParams.get('status') === filter.statusId,
        onClick: () => toggleStatusQuickFilter(filter.statusId),
      });
    }
    return segments;
  }, [searchParams, opportunityQuickStatusFilters, setSearchParams]);

  const quickFilterCountBaseParams = useMemo(
    () =>
      buildOpportunityListSearchParams(searchParams, businessLine, {
        omitQuickFilters: true,
        page: 1,
        limit: 1,
      }),
    [searchParams, businessLine],
  );

  const quickFilterCountTargets = useMemo(() => {
    const targets: Array<{ key: string; qs: string }> = [
      {
        key: 'related_to_me',
        qs: (() => {
          const p = new URLSearchParams(quickFilterCountBaseParams);
          setRelatedToMeParam(p, true);
          return p.toString();
        })(),
      },
    ];
    for (const filter of opportunityQuickStatusFilters) {
      const p = new URLSearchParams(quickFilterCountBaseParams);
      p.set('status', filter.statusId);
      targets.push({ key: filter.key, qs: p.toString() });
    }
    return targets;
  }, [quickFilterCountBaseParams, opportunityQuickStatusFilters]);

  const quickFilterCountQueries = useQueries({
    queries: quickFilterCountTargets.map((target) => ({
      queryKey: [isLeakMode ? 'leak-investigations' : 'opportunities', 'quick-filter-count', businessLine, target.key, target.qs],
      queryFn: () =>
        api<OpportunityListResponse>('GET', `${listEndpoint}?${target.qs}`).then(opportunityListTotal),
      staleTime: 60_000,
    })),
  });

  const quickFilterCountsByKey = useMemo(() => {
    const counts: Record<string, number> = {};
    quickFilterCountTargets.forEach((target, index) => {
      const total = quickFilterCountQueries[index]?.data;
      if (typeof total === 'number') counts[target.key] = total;
    });
    return counts;
  }, [quickFilterCountTargets, quickFilterCountQueries]);

  const filterFields: FieldConfig[] = useMemo(() => {
    const statusOptions = filterStatusesForOpportunity(projectStatuses)
      .map((s: { id?: unknown; label?: unknown }) => ({
        value: String(s.id),
        label: String(s.label || ''),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

    const divisionGrouped = [...(divisionsForLine || [])]
      .sort((a: { label?: string }, b: { label?: string }) =>
        (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' }),
      )
      .map((div: { id: unknown; label: string; subdivisions?: { id: unknown; label: string }[] }) => ({
        label: div.label,
        options: [
          { value: String(div.id), label: div.label },
          ...[...(div.subdivisions || [])]
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
            .map((sub) => ({ value: String(sub.id), label: sub.label })),
        ],
      }));

    const clientOptions = [...clients]
      .sort((a: { display_name?: string; name?: string; code?: string; id?: string }, b) => {
        const labelA = (a.display_name || a.name || a.code || a.id || '').toString();
        const labelB = (b.display_name || b.name || b.code || b.id || '').toString();
        return labelA.localeCompare(labelB, undefined, { sensitivity: 'base' });
      })
      .map((c) => ({
        value: String(c.id),
        label: (c.display_name || c.name || c.code || c.id) as string,
      }));

    return [
      {
        id: 'status',
        label: 'Status',
        type: 'select' as const,
        operators: ['is', 'is_not'] as FilterOperator[],
        getOptions: () => statusOptions,
      },
      {
        id: 'division',
        label: 'Division',
        type: 'select' as const,
        operators: ['is', 'is_not'] as FilterOperator[],
        getGroupedOptions: () => divisionGrouped,
      },
      {
        id: 'client',
        label: 'Client',
        type: 'select' as const,
        operators: ['is', 'is_not'] as FilterOperator[],
        getOptions: () => clientOptions,
      },
      {
        id: 'estimator',
        label: 'Estimator',
        type: 'user' as const,
        operators: ['is', 'is_not'] as FilterOperator[],
        getUsers: () => employeesInEstimatingDept.map((e: any) => mapEmployeeToAppUserSelect(e)),
      },
      {
        id: 'start_date',
        label: 'Start Date',
        type: 'date' as const,
        operators: ['is', 'is_before', 'is_after', 'is_between'] as FilterOperator[],
      },
      {
        id: 'eta',
        label: 'End Date',
        type: 'date' as const,
        operators: ['is', 'is_before', 'is_after', 'is_between'] as FilterOperator[],
      },
      {
        id: 'value',
        label: 'Value',
        type: 'number' as const,
        operators: ['is_equal_to', 'greater_than', 'less_than', 'between'] as FilterOperator[],
      },
    ];
  }, [projectStatuses, divisionsForLine, clients, employeesInEstimatingDept]);

  // Handle applying filters from modal
  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    if (isRelatedToMeParamActive(searchParams)) setRelatedToMeParam(params, true);
    params.set('page', '1');
    setSearchParams(params);
    refetch();
  };
  
  // Helper to format rule value for chip display
  const formatRuleValue = (rule: FilterRule): string => {
    if (Array.isArray(rule.value)) {
      return `${rule.value[0]} → ${rule.value[1]}`;
    }
    if (rule.field === 'status') {
      const status = projectStatuses.find((s: any) => String(s.id) === rule.value);
      return status?.label || String(rule.value);
    }
    if (rule.field === 'division') {
      for (const div of (divisionsForLine || [])) {
        if (String(div.id) === rule.value) return div.label;
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === rule.value) return `${div.label} - ${sub.label}`;
        }
      }
      return String(rule.value);
    }
    if (rule.field === 'client') {
      const client = clients.find((c: any) => String(c.id) === rule.value);
      return client?.display_name || client?.name || String(rule.value);
    }
    if (rule.field === 'estimator') {
      const employee = employeesInEstimatingDept.find((e: any) => String(e.id) === rule.value);
      return employee ? getUserDisplayName(mapEmployeeToAppUserSelect(employee)) : String(rule.value);
    }
    if (rule.field === 'value') {
      return `$${rule.value}`;
    }
    return String(rule.value);
  };
  
  const getFieldLabel = (fieldId: string): string => OPPORTUNITY_FIELD_LABELS[fieldId] || fieldId;

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  const newItemLabel = isLeakMode ? 'New Leak Investigation' : 'New Opportunity';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title={isLeakMode ? 'Leak investigations' : 'Opportunities'}
          subtitle={isLeakMode ? 'Create, edit and track leak investigations' : 'Create, edit and track bids and quotes'}
          onBack={() => navigate(businessDashboardPath)}
          backLabel="Back to Business"
          icon={<LayoutDashboard className="h-4 w-4" />}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />

        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
            <div className={uiCx('flex shrink-0 items-stretch overflow-hidden', uiRadius.control, uiBorders.subtle)}>
              <AppButton
                type="button"
                variant={viewMode === 'list' ? 'primary' : 'secondary'}
                size="sm"
                className="!rounded-none !px-2.5"
                onClick={() => setViewMode('list')}
                title="List view"
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </AppButton>
              <AppButton
                type="button"
                variant={viewMode === 'cards' ? 'primary' : 'secondary'}
                size="sm"
                className="!rounded-none !border-l-0 !px-2.5"
                onClick={() => setViewMode('cards')}
                title="Card view"
                aria-label="Card view"
              >
                <LayoutGrid className="h-4 w-4" />
              </AppButton>
            </div>
            <div className="min-w-0 flex-1">
              <AppInput
                placeholder={
                  isLeakMode
                    ? 'Search by leak investigation name, code, or client name...'
                    : 'Search by opportunity name, code, or client name...'
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                aria-label={isLeakMode ? 'Search leak investigations' : 'Search opportunities'}
              />
            </div>
            <AppButton
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<SlidersHorizontal className="h-4 w-4" />}
              onClick={() => setIsFilterModalOpen(true)}
            >
              Filters
            </AppButton>
            {hasActiveFilters && (
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  setSearchParams(params);
                  refetch();
                }}
              >
                Clear
              </AppButton>
            )}
          </div>
          <div className={uiCx('mt-3 border-t border-gray-100 pt-3', uiLayout.actionsRow, 'flex-wrap items-center gap-2')}>
            <span className={uiCx(uiTypography.overline, 'shrink-0')}>Quick filters:</span>
            <div className="flex flex-wrap gap-2">
              {quickFilterSegments.map((segment) => (
                <button
                  key={segment.key}
                  type="button"
                  onClick={segment.onClick}
                  className={getAppTabButtonClassName(segment.active)}
                  aria-pressed={segment.active}
                >
                  <span>{segment.label}</span>
                  {typeof quickFilterCountsByKey[segment.key] === 'number' ? (
                    <AppTabCountBadge count={quickFilterCountsByKey[segment.key]} isActive={segment.active} />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </AppCard>

        {hasRuleFilters && (
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
            {currentRules.map((rule) => (
              <FilterChip
                key={rule.id}
                rule={rule}
                onRemove={() => {
                  const updatedRules = currentRules.filter((r) => r.id !== rule.id);
                  const params = convertRulesToParams(updatedRules);
                  if (q) params.set('q', q);
                  if (isRelatedToMeParamActive(searchParams)) setRelatedToMeParam(params, true);
                  setSearchParams(params);
                  refetch();
                }}
                getValueLabel={formatRuleValue}
                getFieldLabel={getFieldLabel}
              />
            ))}
          </div>
        )}

        <LoadingOverlay isLoading={isInitialLoading} text={isLeakMode ? 'Loading leak investigations...' : 'Loading opportunities...'}>
          <AppCard className={uiCx(uiShadows.card, listCardAnimClass)} bodyClassName={uiSpacing.cardPadding}>
        {viewMode === 'cards' ? (
          <div className={uiCx('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3', listCardAnimClass)}>
            {hasEditPermission && (
              <Link
                to={newOpportunityPath}
                state={{ backgroundLocation: location }}
                className={getListCreateItemClassName('card', 'min-h-[200px]')}
              >
                <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className={uiListCreateItem.label}>{newItemLabel}</span>
              </Link>
            )}
            {arr.map(p => (
              <OpportunityListCard 
                key={p.id} 
                opportunity={p} 
                onOpenReportModal={(projectId) => setReportModalOpen({ open: true, projectId })}
                projectStatuses={projectStatuses}
                opportunityBasePath={opportunityBasePath}
              />
            ))}
          </div>
        ) : (
          <AppSortableEntityList className={listCardAnimClass}>
            {hasEditPermission && (
              <Link
                to={newOpportunityPath}
                state={{ backgroundLocation: location }}
                className={getListCreateItemClassName('row', 'min-h-[60px] min-w-[680px]')}
              >
                <Plus className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                <span className={uiListCreateItem.label}>{newItemLabel}</span>
              </Link>
            )}
            <AppSortableEntityListHeader preset="opportunities">
              <AppSortableEntityListSortColumn
                label={isLeakMode ? 'Leak investigation' : 'Opportunity'}
                column="opportunity"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                title={isLeakMode ? 'Sort by leak investigation name' : 'Sort by opportunity name'}
              />
              <AppSortableEntityListSortColumn
                label="Estimator"
                column="estimator"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                title="Sort by estimator"
              />
              <AppSortableEntityListSortColumn
                label="Est. value"
                column="value"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                title="Sort by estimated value"
              />
              <AppSortableEntityListSortColumn
                label="Status"
                column="status"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={setListSort}
                title="Sort by status"
              />
              <div className="min-w-0 w-24" aria-hidden />
            </AppSortableEntityListHeader>
            {arr.map(p => (
              <OpportunityListItem
                key={p.id}
                opportunity={p}
                onOpenReportModal={(projectId) => setReportModalOpen({ open: true, projectId })}
                projectStatuses={projectStatuses}
                opportunityBasePath={opportunityBasePath}
              />
            ))}
          </AppSortableEntityList>
        )}
        {!isInitialLoading && arr.length === 0 && (
          <AppEmptyState
            className="py-8"
            title={isLeakMode ? 'No leak investigations found' : 'No opportunities found'}
            description={
              isLeakMode
                ? 'No leak investigations found matching your criteria.'
                : 'No opportunities found matching your criteria.'
            }
          />
        )}
        {!isInitialLoading && totalCount > 0 && (
          <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap justify-between gap-3 border-t border-gray-200 pt-4')}>
            <p className={uiTypography.helper}>
              Page {currentPage} of {totalPages} ({totalCount} total)
            </p>
            <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => {
                  const p = new URLSearchParams(searchParams);
                  p.set('page', String(Math.max(1, currentPage - 1)));
                  setSearchParams(p);
                }}
              >
                Previous
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  const p = new URLSearchParams(searchParams);
                  p.set('page', String(Math.min(totalPages, currentPage + 1)));
                  setSearchParams(p);
                }}
              >
                Next
              </AppButton>
            </div>
          </div>
        )}
          </AppCard>
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
            toast.success('Note created successfully');
          }}
        />
      )}
      
        <FilterBuilderModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          onApply={handleApplyFilters}
          initialRules={currentRules}
          fields={filterFields}
          getFieldData={() => null}
        />
    </div>
  );
}

// Division icons use images from @/icons via DivisionIcon component
const getDivisionIcon = (label: string, suppressNativeTitle?: boolean) => <DivisionIcon label={label} size={16} suppressNativeTitle={suppressNativeTitle} />;

export function CreateReportModal({ projectId, reportCategories, onClose, onSuccess }: {
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

  const categoryOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const addCats = (cats: typeof commercialCategories, prefix?: string) => {
      cats.forEach((cat) => {
        const value = String(cat.value || cat.label || '');
        const label = prefix ? `${prefix} — ${cat.label}` : String(cat.label || value);
        opts.push({ value, label });
      });
    };
    if (!isBidding) {
      addCats(commercialCategories, 'Commercial');
      addCats(productionCategories, 'Production / Execution');
    } else {
      addCats(commercialCategories);
    }
    return opts;
  }, [isBidding, commercialCategories, productionCategories]);

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
      toast.error('Failed to create note');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="New Note"
      description="Add a note or report to this opportunity"
      size="md"
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
            Cancel
          </AppButton>
          <AppButton
            type="submit"
            form="create-note-form-opportunity"
            size="sm"
            disabled={uploading}
            loading={uploading}
          >
            {uploading ? 'Creating...' : 'Create Note'}
          </AppButton>
        </div>
      }
    >
      <form
        id="create-note-form-opportunity"
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        className={uiCx('space-y-4', uiSpacing.sectionStack)}
      >
        <AppInput
          label="Title *"
          placeholder="Enter note title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <AppSelect
          label="Category"
          placeholder="Select category..."
          options={categoryOptions}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <AppTextarea
          label="Description *"
          rows={6}
          placeholder="Describe what happened, how the day went, or any events on site..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <ReportAttachmentAreaMultiple
          files={files}
          setFiles={setFiles}
          accept="image/*,.pdf,.doc,.docx"
          label="Attachments (optional – multiple allowed)"
        />
      </form>
    </AppFormModal>
  );
}

export function OpportunityListItem({ opportunity, onOpenReportModal, projectStatuses, variant = 'card', opportunityBasePath = '/opportunities' }: {
  opportunity: Opportunity;
  onOpenReportModal: (projectId: string) => void;
  projectStatuses: any[];
  variant?: 'card' | 'row';
  opportunityBasePath?: string;
}){
  const navigate = useNavigate();
  const { data:client } = useQuery({
    queryKey:['opportunity-client', opportunity.client_id],
    queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null),
    enabled: !!opportunity.client_id,
    staleTime: 300_000
  });
  const { data:details } = useQuery({
    queryKey:['opportunity-detail-card', opportunity.id],
    queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`),
    staleTime: 60_000
  });

  const status = (opportunity as any).status_label || details?.status_label || '';
  const statusLabel = String(status || '').trim();
  const estimatedValue = (opportunity as any).cost_estimated || details?.cost_estimated || 0;
  const estimatorIds = (opportunity as any).estimator_ids || details?.estimator_ids || ((opportunity as any).estimator_id || details?.estimator_id ? [(opportunity as any).estimator_id || details?.estimator_id] : []);
  const clientName = client?.display_name || client?.name || '';

  const { data: employeesData } = useQuery({
    queryKey:['employees-for-opportunities-list'],
    queryFn: ()=> api<any[]>('GET','/employees'),
    staleTime: 300_000
  });
  const employees = employeesData || [];

  const estimators = useMemo(() => {
    return estimatorIds
      .map((id: string) => employees.find((e: any) => String(e.id) === String(id)))
      .filter(Boolean);
  }, [estimatorIds, employees]);

  // Use list payload so name/avatar show before /employees loads
  const listEstimatorName = (opportunity as any).estimator_name;
  const listEstimatorAvatarFileId = (opportunity as any).estimator_avatar_file_id;
  const estimatorDisplayName = listEstimatorName || (estimators[0] && getUserDisplayName(estimators[0])) || (estimators.length > 1 ? 'Multiple' : '—');
  const userForAvatar = estimators[0] ?? (listEstimatorName || listEstimatorAvatarFileId
    ? { name: listEstimatorName, profile_photo_file_id: listEstimatorAvatarFileId, first_name: listEstimatorName }
    : null);

  const col1 = (
    <div className="min-w-0">
      <div className="text-sm font-bold text-gray-900 group-hover:text-[#7f1010] transition-colors truncate">
        {opportunity.name || 'Opportunity'}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
        <span className="truncate">{opportunity.code || '—'}</span>
        {clientName && (
          <>
            <span className="text-gray-400">•</span>
            <span className="truncate">{clientName}</span>
          </>
        )}
      </div>
    </div>
  );
  const col2 = (
    <div className="min-w-0 flex items-center">
      {!userForAvatar && !listEstimatorName ? (
        <span className="text-xs font-semibold text-gray-400">—</span>
      ) : estimators.length === 1 ? (
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar user={estimators[0]} size="sm" showTooltip={true} />
          <span className="font-semibold text-gray-900 text-xs truncate min-w-0">{getUserDisplayName(estimators[0])}</span>
        </div>
      ) : estimators.length > 1 ? (
        <div className="flex items-center gap-1.5">
          {estimators.slice(0, 2).map((est: any) => (
            <UserAvatar key={est.id} user={est} size="sm" showTooltip={true} />
          ))}
          <span className="text-xs text-gray-500 ml-1">+{estimators.length - 2}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar user={userForAvatar} size="sm" showTooltip={true} tooltipText={estimatorDisplayName} />
          <span className="font-semibold text-gray-900 text-xs truncate min-w-0">{estimatorDisplayName}</span>
        </div>
      )}
    </div>
  );
  const col3 = (
    <div className="min-w-0 flex items-center">
      <span className="font-semibold text-[#7f1010] whitespace-nowrap text-xs truncate">
        {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    </div>
  );
  const col4 = (
    <div className="min-w-0 flex items-center">
      {statusLabel ? (
        <AppBadge variant={getProjectStatusBadgeVariant(statusLabel)} className="max-w-full truncate">
          {statusLabel}
        </AppBadge>
      ) : (
        <span className={uiTypography.helper}>—</span>
      )}
    </div>
  );
  const col5 = (
    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {OPPORTUNITY_TAB_ICON_BUTTONS.map((btn) => (
        <button
          key={btn.key}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (btn.key === 'reports') {
              onOpenReportModal(String(opportunity.id));
            } else {
              navigate(`${opportunityBasePath}/${encodeURIComponent(String(opportunity.id))}?tab=${btn.tab}`);
            }
          }}
          className="relative group/btn w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 flex items-center justify-center text-sm transition-all hover:scale-[1.05]"
          title={btn.label}
        >
          {btn.icon}
          <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/btn:opacity-100 pointer-events-none z-20 transition-opacity">
            {btn.label}
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
          </span>
        </button>
      ))}
    </div>
  );

  if (variant === 'row') {
    return (
      <tr
        onClick={() => navigate(`${opportunityBasePath}/${encodeURIComponent(String(opportunity.id))}`)}
        className="group hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2 align-middle">{col1}</td>
        <td className="px-3 py-2 align-middle">{col2}</td>
        <td className="px-3 py-2 align-middle">{col3}</td>
        <td className="px-3 py-2 align-middle">{col4}</td>
        <td className="px-3 py-2 align-middle">{col5}</td>
      </tr>
    );
  }

  return (
    <AppSortableEntityListRow
      as="link"
      preset="opportunities"
      to={`${opportunityBasePath}/${encodeURIComponent(String(opportunity.id))}`}
    >
      {col1}
      {col2}
      {col3}
      {col4}
      {col5}
    </AppSortableEntityListRow>
  );
}

function OpportunityListCard({ opportunity, onOpenReportModal, projectStatuses, opportunityBasePath = '/opportunities' }: { 
  opportunity: Opportunity;
  onOpenReportModal: (projectId: string) => void;
  projectStatuses: any[];
  opportunityBasePath?: string;
}){
  const navigate = useNavigate();
  // Card cover should match General Information; API returns /files/... without JWT
  const src = withFileAccessTokenIfNeeded(opportunity.cover_image_url) || '/ui/assets/placeholders/project.png';
  const { data:details } = useQuery({ queryKey:['opportunity-detail-card', opportunity.id], queryFn: ()=> api<any>('GET', `/projects/${encodeURIComponent(String(opportunity.id))}`), staleTime: 60_000 });
  const { data:client } = useQuery({ queryKey:['opportunity-client', opportunity.client_id], queryFn: ()=> opportunity.client_id? api<any>('GET', `/clients/${encodeURIComponent(String(opportunity.client_id||''))}`): Promise.resolve(null), enabled: !!opportunity.client_id, staleTime: 300_000 });
  const { data:projectDivisions } = useQuery({ queryKey:['project-divisions'], queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), staleTime: 300_000 });
  const status = (opportunity as any).status_label || details?.status_label || '';
  const statusLabel = String(status || '').trim();
  const start = (opportunity.date_start || details?.date_start || opportunity.created_at || '').slice(0,10);
  const eta = (opportunity.date_eta || details?.date_eta || '').slice(0, 10);
  const estimatedValue = (opportunity as any).cost_estimated || details?.cost_estimated || 0;
  const estimatorIds = (opportunity as any).estimator_ids || details?.estimator_ids || ((opportunity as any).estimator_id || details?.estimator_id ? [(opportunity as any).estimator_id || details?.estimator_id] : []);
  const clientName = client?.display_name || client?.name || '';
  const projectDivIds = (opportunity as any).project_division_ids || details?.project_division_ids || [];
  
  // Get employees data for avatars
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-opportunities-cards'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];
  
  // Get estimator employees for avatars
  const estimators = useMemo(() => {
    return estimatorIds
      .map((id: string) => employees.find((e: any) => String(e.id) === String(id)))
      .filter(Boolean);
  }, [estimatorIds, employees]);

  // Use list payload so name/avatar show before /employees loads
  const listEstimatorName = (opportunity as any).estimator_name;
  const listEstimatorAvatarFileId = (opportunity as any).estimator_avatar_file_id;
  const estimatorDisplayNameCard = listEstimatorName || (estimators[0] && getUserDisplayName(estimators[0])) || (estimators.length > 1 ? 'Multiple' : '—');
  const userForAvatarCard = estimators[0] ?? (listEstimatorName || listEstimatorAvatarFileId
    ? { name: listEstimatorName, profile_photo_file_id: listEstimatorAvatarFileId, first_name: listEstimatorName }
    : null);
  
  // Fetch proposals to get pricing items for percentage calculation
  const { data:proposals } = useQuery({ 
    queryKey:['opportunityProposals', opportunity.id], 
    queryFn: ()=>api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(opportunity.id||''))}`) 
  });
  
  // Fetch full proposal data if proposal exists
  const proposal = proposals && proposals.length > 0 ? proposals[0] : null;
  const { data:proposalData } = useQuery({ 
    queryKey: ['proposal', proposal?.id],
    queryFn: () => proposal?.id ? api<any>('GET', `/proposals/${proposal.id}`) : Promise.resolve(null),
    enabled: !!proposal?.id
  });
  
  // Check for pending data (mobile-created opportunities may be missing key fields)
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    // Use details if available, otherwise fallback to opportunity data
    const siteId = details?.site_id;
    const hasDivisions = Array.isArray(projectDivIds) && projectDivIds.length > 0;
    const hasEstimators = estimatorIds.length > 0;
    
    if (!hasEstimators) missing.push('Estimator');
    if (!siteId) missing.push('Site');
    if (!hasDivisions) missing.push('Division');
    
    return missing;
  }, [details, projectDivIds, estimatorIds]);
  
  const hasPendingData = missingFields.length > 0;
  
  // Calculate percentages from pricing items
  const calculatedPercentages = useMemo(() => {
    if (projectDivIds.length === 0) return {};
    
    // Initialize all divisions to 0%
    const result: { [key: string]: number } = {};
    projectDivIds.forEach(id => {
      result[String(id)] = 0;
    });
    
    // Get pricing items from proposal (data is nested in proposalData.data)
    const pricingItems = proposalData?.data?.additional_costs || [];
    
    // If no pricing items, return 0% for all divisions
    if (pricingItems.length === 0) {
      return result;
    }
    
    // Group by division_id and sum values
    const divisionTotals: { [key: string]: number } = {};
    pricingItems.forEach((item: any) => {
      if (item.division_id) {
        const divId = String(item.division_id);
        const value = (item.value || 0) * (parseInt(item.quantity || '1', 10) || 1);
        divisionTotals[divId] = (divisionTotals[divId] || 0) + value;
      }
    });
    
    // Calculate total
    const total = Object.values(divisionTotals).reduce((a, b) => a + b, 0);
    
    // Calculate percentages only if total > 0
    if (total > 0) {
      projectDivIds.forEach(id => {
        const idStr = String(id);
        result[idStr] = divisionTotals[idStr] ? (divisionTotals[idStr] / total) * 100 : 0;
      });
    }
    
    return result;
  }, [projectDivIds, proposalData]);
  
  // Get division icons and labels with percentages
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: ReactNode; label: string; percentage: number }> = [];
    for (const divId of projectDivIds.slice(0, 5)) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ 
            icon: getDivisionIcon(div.label, true), 
            label: div.label,
            percentage: calculatedPercentages[String(divId)] || 0
          });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ 
              icon: getDivisionIcon(div.label, true), 
              label: `${div.label} - ${sub.label}`,
              percentage: calculatedPercentages[String(divId)] || 0
            });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].label.includes(String(divId))) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions, calculatedPercentages]);

  return (
    <Link 
      to={`${opportunityBasePath}/${encodeURIComponent(String(opportunity.id))}`} 
      className={uiCx('group relative block h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300', uiBorders.subtle, uiRadius.card, uiColors.surface, 'hover:shadow-md')}
    >
      {/* Pending data alert icon (separate, top-left) */}
      {hasPendingData && (
        <div className="absolute top-3 right-3 z-20 group/alert">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-orange-600 drop-shadow-sm"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>

          {/* Tooltip showing missing fields */}
          <div className="absolute right-0 bottom-full mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/alert:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
            <div className="font-semibold mb-1">Pending Data:</div>
            <div className="space-y-0.5">
              {missingFields.map((field, idx) => (
                <div key={idx}>• {field}</div>
              ))}
            </div>
            <div className="absolute -bottom-1 right-4 w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Status row (own line, top-right) */}
        {/* Top row: thumb + title */}
        <div className="flex gap-4">
          {/* Image (smaller, does NOT dictate card size) */}
          <div className="w-24 h-20 flex-shrink-0">
            <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
              <img className="w-full h-full object-cover" src={src} alt={opportunity.name || 'Opportunity'} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Customer + name + code - font sizes like ProjectDetail */}
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide truncate min-w-0">{clientName || 'No client'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
                {opportunity.name || 'Opportunity'}
              </div>
              <div className="text-xs font-semibold text-gray-900 break-words">{opportunity.code || '—'}</div>
            </div>

            {/* Icons row (right below code) - same icon size as employee area */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {OPPORTUNITY_TAB_ICON_BUTTONS.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn.key === 'reports') {
                      onOpenReportModal(String(opportunity.id));
                    } else {
                      navigate(`${opportunityBasePath}/${encodeURIComponent(String(opportunity.id))}?tab=${btn.tab}`);
                    }
                  }}
                  className="relative group/btn w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 hover:border-gray-300 flex items-center justify-center text-sm transition-all hover:scale-[1.05]"
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

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Fields - labels text-[10px] font-medium text-gray-500 uppercase, values text-xs font-semibold like ProjectDetail */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">Estimator</div>
            {!userForAvatarCard && !listEstimatorName ? (
              <div className="text-xs font-semibold text-gray-400">—</div>
            ) : estimators.length === 1 ? (
              <div className="flex items-center gap-2">
                <UserAvatar user={estimators[0]} size="sm" showTooltip={true} />
                <div className="font-semibold text-gray-900 text-xs truncate">{getUserDisplayName(estimators[0])}</div>
              </div>
            ) : estimators.length > 1 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {estimators.map((est: any) => (
                  <UserAvatar key={est.id} user={est} size="sm" showTooltip={true} />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <UserAvatar user={userForAvatarCard} size="sm" showTooltip={true} tooltipText={estimatorDisplayNameCard} />
                <div className="font-semibold text-gray-900 text-xs truncate">{estimatorDisplayNameCard}</div>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">Estimated Value</div>
            <div className="h-5 flex items-center">
              <div className="font-semibold text-[#7f1010] text-xs truncate w-full">
                {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Bottom row: divisions (left) + status (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {divisionIcons.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {divisionIcons.map((div, idx) => (
                  <div key={idx} className="relative group/icon flex flex-col items-center">
                    <div className="text-base cursor-pointer hover:scale-110 transition-transform">
                      {div.icon}
                    </div>
                    <div className="text-[10px] font-semibold text-gray-600 mt-0.5">
                      {Math.round(div.percentage || 0)}%
                    </div>
                    <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-[100] shadow-lg">
                      {div.label}
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                ))}
                {projectDivIds.length > 5 && (
                  <div className="relative group/icon">
                    <div className="text-sm text-gray-400 cursor-pointer">
                      +{projectDivIds.length - 5}
                    </div>
                    <div className="absolute left-0 top-full mt-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/icon:opacity-100 transition-opacity pointer-events-none z-[100] shadow-lg">
                      {projectDivIds.length - 5} more divisions
                      <div className="absolute -top-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs font-semibold text-gray-400">No division</div>
            )}
          </div>

          <div className="relative flex-shrink-0">
            {statusLabel ? (
              <AppBadge variant={getProjectStatusBadgeVariant(statusLabel)} className="max-w-[10rem] truncate">
                {statusLabel}
              </AppBadge>
            ) : (
              <span className={uiTypography.helper}>—</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

