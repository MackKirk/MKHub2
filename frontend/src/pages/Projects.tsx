import { useQuery, useQueries } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import ImagePicker from '@/components/ImagePicker';
import { DivisionIcon } from '@/components/DivisionIcon';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { FolderKanban, LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-react';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { getUserDisplayName } from '@/lib/userDisplay';
import { isRangeOperator } from '@/components/FilterBuilder/utils';
import { useBusinessLine } from '@/context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE, filterProjectDivisionsForBusinessLine, PROJECT_DIVISIONS_QUERY_KEY } from '@/lib/businessLine';
import { effectiveShowInProject } from '@/lib/projectStatusVisibility';
import { buildOpportunityListSearchParams, resolveProjectQuickStatusFilters } from '@/lib/opportunityFilters';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppTabCountBadge,
  AppTooltip,
  AppUserAvatar,
  getAppTabButtonClassName,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
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

type Project = { 
  id:string, 
  code?:string, 
  name?:string, 
  slug?:string, 
  client_id?:string, 
  created_at?:string, 
  date_start?:string, 
  date_eta?:string,
  date_end?:string, 
  project_division_ids?:string[],
  project_division_percentages?: Record<string, number> | null,
  cover_image_url?:string,
  client_name?:string,
  client_display_name?:string,
  progress?:number,
  status_label?:string,
  estimator_id?:string,
  estimator_ids?:string[],
  estimator_name?:string,
  estimator_avatar_file_id?:string,
  project_admin_id?:string,
  project_admin_name?:string,
  project_admin_avatar_file_id?:string,
  onsite_lead_id?:string,
  cost_actual?:number,
  service_value?:number,
};
type ClientFile = { id:string, file_object_id:string, is_image?:boolean, content_type?:string };
type ProjectListResponse = { items: Project[]; total: number; page: number; limit: number } | Project[];

function projectListTotal(data: ProjectListResponse | undefined): number {
  if (!data) return 0;
  if (Array.isArray(data)) return data.length;
  return typeof data.total === 'number' ? data.total : (data.items?.length ?? 0);
}

// Helper function to calculate Final Total (with GST) from proposal data
function calculateProposalTotal(proposalData: any): number {
  if (!proposalData) return 0;
  
  const data = proposalData?.data || proposalData || {};
  const additionalCosts = data.additional_costs || [];
  
  if (additionalCosts.length === 0) return 0;
  
  const pstRate = Number(data.pst_rate) || 7.0;
  const gstRate = Number(data.gst_rate) || 5.0;
  
  // Calculate Total Direct Costs
  const totalDirectCosts = additionalCosts.reduce((sum: number, item: any) => {
    const value = Number(item.value || 0);
    const quantity = Number(item.quantity || 1);
    return sum + (value * quantity);
  }, 0);
  
  // Calculate PST (only on items with pst=true)
  const totalForPst = additionalCosts
    .filter((item: any) => item.pst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item.value || 0);
      const quantity = Number(item.quantity || 1);
      return sum + (value * quantity);
    }, 0);
  
  const pst = totalForPst * (pstRate / 100);
  
  // Calculate Subtotal (Total Direct Costs + PST)
  const subtotal = totalDirectCosts + pst;
  
  // Calculate GST (only on items with gst=true)
  const totalForGst = additionalCosts
    .filter((item: any) => item.gst === true)
    .reduce((sum: number, item: any) => {
      const value = Number(item.value || 0);
      const quantity = Number(item.quantity || 1);
      return sum + (value * quantity);
    }, 0);
  
  const gst = totalForGst * (gstRate / 100);
  
  // Calculate Grand Total (Final Total with GST) = Subtotal + GST
  return subtotal + gst;
}

// Helper function to calculate total from all proposals (original + change orders)
function useProposalsTotal(projectId: string): number {
  // Fetch all proposals for the project
  const { data: proposals } = useQuery({ 
    queryKey: ['projectProposals', projectId], 
    queryFn: () => api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(projectId)}`),
    enabled: !!projectId
  });
  
  // Organize proposals: original first, then Change Orders sorted by number
  const organizedProposals = useMemo(() => {
    if (!proposals || proposals.length === 0) return { original: null, changeOrders: [] };
    
    const original = proposals.find(p => !p.is_change_order);
    const changeOrders = proposals
      .filter(p => p.is_change_order)
      .sort((a, b) => (a.change_order_number || 0) - (b.change_order_number || 0));
    
    return {
      original: original || null,
      changeOrders: changeOrders
    };
  }, [proposals]);
  
  // Fetch full proposal data for original proposal
  const { data: originalProposalData } = useQuery({ 
    queryKey: ['proposal', organizedProposals.original?.id], 
    queryFn: () => organizedProposals.original?.id ? api<any>('GET', `/proposals/${organizedProposals.original.id}`) : Promise.resolve(null),
    enabled: !!organizedProposals.original?.id
  });
  
  // Fetch full proposal data for all change orders using useQueries
  const changeOrderQueries = useQueries({
    queries: organizedProposals.changeOrders.map(co => ({
      queryKey: ['proposal', co.id],
      queryFn: () => api<any>('GET', `/proposals/${co.id}`),
      enabled: !!co.id
    }))
  });
  
  // Calculate totals
  const total = useMemo(() => {
    // Calculate original total
    const originalTotal = calculateProposalTotal(originalProposalData || organizedProposals.original);
    
    // Calculate change orders totals
    const changeOrderTotals = organizedProposals.changeOrders.map((co, idx) => {
      const queryResult = changeOrderQueries[idx];
      const dataToUse = queryResult?.data || co;
      return calculateProposalTotal(dataToUse);
    });
    
    // Sum all totals
    return originalTotal + changeOrderTotals.reduce((sum, coTotal) => sum + coTotal, 0);
  }, [originalProposalData, organizedProposals, changeOrderQueries]);
  
  return total;
}

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

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  
  // Clear all potential conflicting parameters first
  const fieldsToClear: Record<string, string[]> = {
    'status': ['status', 'status_not'],
    'division': ['division_id', 'division_id_not'],
    'client': ['client_id', 'client_id_not'],
    'estimator': ['estimator_id', 'estimator_id_not'],
    'start_date': ['date_start', 'date_end'],
    'eta': ['eta_start', 'eta_end'],
    'value': ['value_min', 'value_max'],
  };
  
  Object.values(fieldsToClear).flat().forEach(param => {
    params.delete(param);
  });
  
  for (const rule of rules) {
    if (!rule.value || (Array.isArray(rule.value) && (!rule.value[0] || !rule.value[1]))) {
      continue; // Skip empty rules
    }
    
    switch (rule.field) {
      case 'status':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('status', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('status_not', rule.value);
          }
        }
        break;
      
      case 'division':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('division_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('division_id_not', rule.value);
          }
        }
        break;
      
      case 'client':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('client_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('client_id_not', rule.value);
          }
        }
        break;
      
      case 'estimator':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('estimator_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('estimator_id_not', rule.value);
          }
        }
        break;
      
      case 'start_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('date_start', rule.value);
            params.set('date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('date_start', rule.value[0]);
          params.set('date_end', rule.value[1]);
        }
        break;
      
      case 'eta':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('eta_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('eta_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('eta_start', rule.value);
            params.set('eta_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('eta_start', rule.value[0]);
          params.set('eta_end', rule.value[1]);
        }
        break;
      
      case 'value':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'greater_than') {
            params.set('value_min', rule.value);
          } else if (rule.operator === 'less_than') {
            params.set('value_max', rule.value);
          } else if (rule.operator === 'is_equal_to') {
            params.set('value_min', rule.value);
            params.set('value_max', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'between') {
          params.set('value_min', rule.value[0]);
          params.set('value_max', rule.value[1]);
        }
        break;
    }
  }
  
  return params;
}

// Helper: Convert URL parameters to filter rules
function convertParamsToRules(params: URLSearchParams): FilterRule[] {
  const rules: FilterRule[] = [];
  let idCounter = 1;
  
  // Status
  const status = params.get('status');
  const statusNot = params.get('status_not');
  if (status) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is', value: status });
  } else if (statusNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'status', operator: 'is_not', value: statusNot });
  }
  
  // Division
  const division = params.get('division_id');
  const divisionNot = params.get('division_id_not');
  if (division) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is', value: division });
  } else if (divisionNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'division', operator: 'is_not', value: divisionNot });
  }
  
  // Client
  const client = params.get('client_id');
  const clientNot = params.get('client_id_not');
  if (client) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is', value: client });
  } else if (clientNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is_not', value: clientNot });
  }
  
  // Estimator
  const estimator = params.get('estimator_id');
  const estimatorNot = params.get('estimator_id_not');
  if (estimator) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is', value: estimator });
  } else if (estimatorNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is_not', value: estimatorNot });
  }
  
  // Date range (start_date)
  const dateStart = params.get('date_start');
  const dateEnd = params.get('date_end');
  if (dateStart && dateEnd) {
    if (dateStart === dateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is', value: dateStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_between', value: [dateStart, dateEnd] });
    }
  } else if (dateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_after', value: dateStart });
  } else if (dateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'start_date', operator: 'is_before', value: dateEnd });
  }
  
  // End date range (eta)
  const etaStart = params.get('eta_start');
  const etaEnd = params.get('eta_end');
  if (etaStart && etaEnd) {
    if (etaStart === etaEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is', value: etaStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_between', value: [etaStart, etaEnd] });
    }
  } else if (etaStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_after', value: etaStart });
  } else if (etaEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'eta', operator: 'is_before', value: etaEnd });
  }
  
  // Value range (value)
  const valueMin = params.get('value_min');
  const valueMax = params.get('value_max');
  if (valueMin && valueMax) {
    if (valueMin === valueMax) {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'is_equal_to', value: valueMin });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'between', value: [valueMin, valueMax] });
    }
  } else if (valueMin) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'greater_than', value: valueMin });
  } else if (valueMax) {
    rules.push({ id: `rule-${idCounter++}`, field: 'value', operator: 'less_than', value: valueMax });
  }
  
  return rules;
}

export default function Projects(){
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const businessLine = useBusinessLine();
  const projectBasePath = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-projects' : '/projects';
  const businessDashboardPath = businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? '/rm-business' : '/business';
  
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
    const saved = localStorage.getItem('projects-view-mode');
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
    localStorage.setItem('projects-view-mode', viewMode);
  }, [viewMode, searchParams, setSearchParams]);
  
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
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams(searchParams);
    if (!params.has('page')) params.set('page', '1');
    if (!params.has('limit')) params.set('limit', '25');
    params.set('business_line', businessLine);
    return params.toString() ? '?' + params.toString() : '';
  }, [searchParams, businessLine]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['projects', businessLine, qs], 
    queryFn: ()=> api<{ items: Project[]; total: number; page: number; limit: number } | Project[]>('GET', `/projects/business/projects${qs}`)
  });
  
  // Load project divisions in parallel (shared across all cards, no individual loading)
  const { data: projectDivisions, isLoading: divisionsLoading } = useQuery({ 
    queryKey:PROJECT_DIVISIONS_QUERY_KEY, 
    queryFn: ()=> api<any[]>('GET','/settings/project-divisions'), 
    staleTime: 300_000
  });
  const divisionsForLine = useMemo(
    () => filterProjectDivisionsForBusinessLine(projectDivisions, businessLine),
    [projectDivisions, businessLine]
  );
  
  // Show loading until both projects and divisions are loaded
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
  
  // Get clients for filter
  const { data: clientsData } = useQuery({ 
    queryKey:['clients-for-filter'], 
    queryFn: ()=> api<any>('GET','/clients?limit=100'), 
    staleTime: 300_000
  });
  
  // Get employees for estimator filter
  const { data: employees } = useQuery({ 
    queryKey:['employees'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });

  // Only users with "Sales / Estimating" department for estimator filter dropdown
  const ESTIMATOR_DEPARTMENT = 'Sales / Estimating';
  const employeesInEstimatingDept = useMemo(() => {
    const list = employees || [];
    const target = ESTIMATOR_DEPARTMENT.toLowerCase();
    return list.filter((emp: any) => {
      if (Array.isArray(emp.divisions) && emp.divisions.length > 0) {
        return emp.divisions.some((d: any) => String(d?.label || '').trim().toLowerCase() === target);
      }
      const dept = String((emp.department || emp.division || '')).trim();
      return dept.toLowerCase().includes(target);
    });
  }, [employees]);

  const projectStatuses = settings?.project_statuses || [];
  const clients = clientsData?.items || clientsData || [];
  const paginated = data && !Array.isArray(data) && 'items' in data;
  const arr = paginated ? (data.items || []) : (Array.isArray(data) ? data : []);
  const totalCount = paginated && typeof (data as any).total === 'number' ? (data as any).total : arr.length;
  const currentPage = paginated && typeof (data as any).page === 'number' ? (data as any).page : 1;
  const limitPage = paginated && typeof (data as any).limit === 'number' ? (data as any).limit : 25;
  const totalPages = Math.max(1, Math.ceil(totalCount / limitPage));
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);

  // List sort: read from URL so it persists and is shareable
  const sortBy = (searchParams.get('sort') as 'project' | 'start' | 'eta' | 'admin' | 'value' | 'status') || 'project';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: typeof sortBy, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  // Filter Builder Configuration
  const filterFields: FieldConfig[] = useMemo(() => [
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => {
        // Allowed statuses for projects (case-insensitive matching)
        const allowedStatuses = ['in progress', 'on progress', 'on hold', 'finished'];
        return projectStatuses
          .filter((s: any) => {
            if (!effectiveShowInProject(s)) return false;
            const label = (s.label || '').trim().toLowerCase();
            return allowedStatuses.includes(label);
          })
          .map((s: any) => ({ value: s.id, label: s.label }));
      },
    },
    {
      id: 'division',
      label: 'Division',
      type: 'select',
      operators: ['is', 'is_not'],
      getGroupedOptions: () => {
        const groups: Array<{ label: string; options: Array<{ value: string; label: string }> }> = [];
        divisionsForLine?.forEach((div: any) => {
          const options: Array<{ value: string; label: string }> = [
            { value: div.id, label: div.label }
          ];
          div.subdivisions?.forEach((sub: any) => {
            options.push({ value: sub.id, label: sub.label });
          });
          groups.push({ label: div.label, options });
        });
        return groups;
      },
    },
    {
      id: 'client',
      label: 'Client',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => clients.map((c: any) => ({ 
        value: c.id, 
        label: c.display_name || c.name || c.code || c.id 
      })),
    },
    {
      id: 'estimator',
      label: 'Estimators',
      type: 'user',
      operators: ['is', 'is_not'],
      getUsers: () => employeesInEstimatingDept.map((emp: any) => mapEmployeeToAppUserSelect(emp)),
    },
    {
      id: 'start_date',
      label: 'Start Date',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'eta',
      label: 'End Date',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'value',
      label: 'Value',
      type: 'number',
      operators: ['is_equal_to', 'greater_than', 'less_than', 'between'],
    },
  ], [projectStatuses, divisionsForLine, clients, employees, employeesInEstimatingDept]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    if (searchParams.get('related_to_me') === '1') params.set('related_to_me', '1');
    params.set('page', '1');
    setSearchParams(params);
    refetch();
  };

  const hasRuleFilters = currentRules.length > 0;
  const hasActiveFilters = hasRuleFilters || searchParams.get('related_to_me') === '1';

  const projectQuickStatusFilters = useMemo(
    () => resolveProjectQuickStatusFilters(projectStatuses),
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
        active: searchParams.get('related_to_me') === '1',
        onClick: () => {
          const params = new URLSearchParams(searchParams);
          if (params.get('related_to_me') === '1') params.delete('related_to_me');
          else params.set('related_to_me', '1');
          params.set('page', '1');
          setSearchParams(params, { replace: true });
        },
      },
    ];
    for (const filter of projectQuickStatusFilters) {
      segments.push({
        key: filter.key,
        label: filter.label,
        active: searchParams.get('status') === filter.statusId,
        onClick: () => toggleStatusQuickFilter(filter.statusId),
      });
    }
    return segments;
  }, [searchParams, projectQuickStatusFilters, setSearchParams]);

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
          p.set('related_to_me', '1');
          return p.toString();
        })(),
      },
    ];
    for (const filter of projectQuickStatusFilters) {
      const p = new URLSearchParams(quickFilterCountBaseParams);
      p.set('status', filter.statusId);
      targets.push({ key: filter.key, qs: p.toString() });
    }
    return targets;
  }, [quickFilterCountBaseParams, projectQuickStatusFilters]);

  const quickFilterCountQueries = useQueries({
    queries: quickFilterCountTargets.map((target) => ({
      queryKey: ['projects', 'quick-filter-count', businessLine, target.key, target.qs],
      queryFn: () =>
        api<ProjectListResponse>('GET', `/projects/business/projects?${target.qs}`).then(projectListTotal),
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

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  // Helper to format rule value for display
  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'status') {
      const status = projectStatuses.find((s: any) => String(s.id) === rule.value);
      return status?.label || String(rule.value);
    }
    if (rule.field === 'division') {
      for (const div of (projectDivisions || [])) {
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
      const emp = (employees || []).find((e: any) => String(e.id) === rule.value);
      return emp ? getUserDisplayName(mapEmployeeToAppUserSelect(emp)) : String(rule.value);
    }
    if (rule.field === 'start_date' || rule.field === 'eta') {
      if (Array.isArray(rule.value)) {
        return `${rule.value[0]} → ${rule.value[1]}`;
      }
      return String(rule.value);
    }
    if (rule.field === 'value') {
      if (Array.isArray(rule.value)) {
        return `$${Number(rule.value[0]).toLocaleString()} → $${Number(rule.value[1]).toLocaleString()}`;
      }
      return `$${Number(rule.value).toLocaleString()}`;
    }
    return String(rule.value);
  };

  // Helper to get field label
  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Projects"
          subtitle="List, search and manage projects"
          onBack={() => navigate(businessDashboardPath)}
          backLabel="Back to Business"
          icon={<FolderKanban className="h-4 w-4" />}
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
                placeholder="Search by project name, code, or client name..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                aria-label="Search projects"
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
                  if (searchParams.get('related_to_me') === '1') params.set('related_to_me', '1');
                  setSearchParams(params);
                  refetch();
                }}
                getValueLabel={formatRuleValue}
                getFieldLabel={getFieldLabel}
              />
            ))}
          </div>
        )}

        <LoadingOverlay isLoading={isInitialLoading} text="Loading projects...">
          <AppCard className={uiCx(uiShadows.card, listCardAnimClass)} bodyClassName={uiSpacing.cardPadding}>
        {viewMode === 'cards' ? (
          <div className={uiCx('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3', listCardAnimClass)}>
            {isLoading && !arr.length ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className={uiCx('h-64 animate-pulse bg-gray-100', uiRadius.card)} />
                ))}
              </>
            ) : arr.length > 0 ? (
              arr.map((p) => (
                <ProjectListCard
                  key={p.id}
                  project={p}
                  projectDivisions={projectDivisions}
                  projectStatuses={projectStatuses}
                  projectBasePath={projectBasePath}
                />
              ))
            ) : null}
          </div>
        ) : (
          <div className={uiCx('flex flex-col gap-2 overflow-x-auto', listCardAnimClass)}>
            <div
              className={uiCx(
                'grid min-w-[800px] grid-cols-[10fr_3fr_3fr_4fr_4fr_4fr_auto] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 sm:gap-3 lg:gap-4',
                uiTypography.overline,
                'normal-case tracking-normal text-gray-700',
              )}
              role="row"
            >
              <button type="button" onClick={() => setListSort('project')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by project name">Project{sortBy === 'project' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => setListSort('start')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by start date">Start{sortBy === 'start' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => setListSort('eta')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by End Date">End Date{sortBy === 'eta' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => setListSort('admin')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by project admin">Project Admin{sortBy === 'admin' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => setListSort('value')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by value">Value{sortBy === 'value' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <button type="button" onClick={() => setListSort('status')} className="min-w-0 flex items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none" title="Sort by status">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              <div className="min-w-0 w-28" aria-hidden />
            </div>
            {isLoading && !arr.length ? (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className={uiCx('h-20 min-w-[800px] animate-pulse bg-gray-100', uiRadius.control)} />
                ))}
              </>
            ) : arr.length > 0 ? (
              arr.map((p) => (
                <ProjectListItem
                  key={p.id}
                  project={p}
                  projectDivisions={projectDivisions}
                  projectStatuses={projectStatuses}
                  projectBasePath={projectBasePath}
                />
              ))
            ) : null}
          </div>
        )}
        {!isInitialLoading && arr.length === 0 && (
          <AppEmptyState
            className="py-8"
            title="No projects found"
            description="No projects found matching your criteria."
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
          }catch(e){           toast.error('Failed to update cover'); setPickerOpen(null); }
        }} />
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

export function ProjectListItem({ project, projectDivisions, projectStatuses, variant = 'card', projectBasePath = '/projects' }: { project: Project, projectDivisions?: any[], projectStatuses: any[]; variant?: 'card' | 'row'; projectBasePath?: string }){
  const navigate = useNavigate();

  const clientName = project.client_display_name || project.client_name || '';
  const status = project.status_label || '';
  const statusLabel = String(status || '').trim();
  const start = (project.date_start || project.created_at || '').slice(0,10);
  const eta = (project.date_eta || '').slice(0,10);
  const projectAdminId = project.project_admin_id || null;

  const proposalsTotal = useProposalsTotal(project.id);
  const estimatedValue = proposalsTotal > 0 ? proposalsTotal : (project.service_value || 0);

  const { data: employeesData } = useQuery({
    queryKey:['employees-for-projects-list'],
    queryFn: ()=> api<any[]>('GET','/employees'),
    staleTime: 300_000
  });
  const employees = employeesData || [];

  const projectAdmin = useMemo(() => {
    if (!projectAdminId) return null;
    return employees.find((e: any) => String(e.id) === String(projectAdminId)) || null;
  }, [projectAdminId, employees]);

  // Use list payload so name/avatar show before /employees loads
  const listAdminName = (project as any).project_admin_name;
  const listAdminAvatarFileId = (project as any).project_admin_avatar_file_id;
  const adminDisplayName = listAdminName || (projectAdmin && getUserDisplayName(projectAdmin)) || '—';
  const userForAdmin = projectAdmin ?? (listAdminName || listAdminAvatarFileId
    ? { name: listAdminName, profile_photo_file_id: listAdminAvatarFileId, first_name: listAdminName }
    : null);

  const tabButtons = [
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'pricing', icon: '💰', label: 'Pricing', tab: 'pricing' },
    { key: 'reports', icon: '📋', label: 'Notes/History', tab: 'reports' },
    { key: 'dispatch', icon: '👷', label: 'Workload', tab: 'dispatch' },
  ];

  const col1 = (
    <div className="min-w-0">
      <div className="text-sm font-bold text-gray-900 group-hover:text-[#7f1010] transition-colors truncate">
        {project.name || 'Project'}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
        <span className="truncate">{project.code || '—'}</span>
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
      <span className="font-semibold text-gray-900 text-xs whitespace-nowrap truncate">{start || '—'}</span>
    </div>
  );
  const col3 = (
    <div className="min-w-0 flex items-center">
      <span className="font-semibold text-gray-900 text-xs whitespace-nowrap truncate">{eta || '—'}</span>
    </div>
  );
  const col4 = (
    <div className="min-w-0 flex items-center">
      {!userForAdmin && !listAdminName ? (
        <span className="text-xs font-semibold text-gray-400">—</span>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar user={userForAdmin} size="sm" showTooltip={true} tooltipText={adminDisplayName} />
          <span className="font-semibold text-gray-900 text-xs truncate min-w-0">{adminDisplayName}</span>
        </div>
      )}
    </div>
  );
  const col5 = (
    <div className="min-w-0 flex items-center">
      <span className="font-semibold text-[#7f1010] whitespace-nowrap text-xs truncate">
        {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </span>
    </div>
  );
  const col6 = (
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
  const col7 = (
    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      {tabButtons.map((btn) => (
        <button
          key={btn.key}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`${projectBasePath}/${encodeURIComponent(String(project.id))}?tab=${btn.tab}`);
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
        onClick={() => navigate(`${projectBasePath}/${encodeURIComponent(String(project.id))}`)}
        className="group hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <td className="px-3 py-2 align-middle">{col1}</td>
        <td className="px-3 py-2 align-middle">{col2}</td>
        <td className="px-3 py-2 align-middle">{col3}</td>
        <td className="px-3 py-2 align-middle">{col4}</td>
        <td className="px-3 py-2 align-middle">{col5}</td>
        <td className="px-3 py-2 align-middle">{col6}</td>
        <td className="px-3 py-2 align-middle">{col7}</td>
      </tr>
    );
  }

  return (
    <Link
      to={`${projectBasePath}/${encodeURIComponent(String(project.id))}`}
      className={uiCx('group block min-w-[800px] p-4 transition-all duration-200 hover:border-gray-300', uiBorders.subtle, uiRadius.card, uiColors.surface, 'hover:shadow-md')}
    >
      <div className="grid grid-cols-[10fr_3fr_3fr_4fr_4fr_4fr_auto] gap-2 sm:gap-3 lg:gap-4 items-center overflow-hidden">
        {col1}
        {col2}
        {col3}
        {col4}
        {col5}
        {col6}
        {col7}
      </div>
    </Link>
  );
}

function ProjectListCard({ project, projectDivisions, projectStatuses, projectBasePath = '/projects' }:{ project: Project, projectDivisions?: any[], projectStatuses: any[]; projectBasePath?: string }){
  const navigate = useNavigate();
  
  // Use cover image URL from project data (same image as General Information); API returns /files/... without JWT
  const src = withFileAccessTokenIfNeeded(project.cover_image_url) || '/ui/assets/placeholders/project.png';
  
  // Use client name from project data
  const clientName = project.client_display_name || project.client_name || '';

  // Use project divisions from parent (passed as prop, no individual loading)
  // This prevents "popping" updates after initial render
  // Use only data from backend - no additional queries to prevent "popping"
  const status = project.status_label || '';
  const statusLabel = String(status || '').trim();
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const start = (project.date_start || project.created_at || '').slice(0,10);
  const eta = (project.date_eta || '').slice(0,10);
  const projectAdminId = project.project_admin_id || null;
  const actualValue = project.cost_actual || 0;
  
  // Calculate total from proposals (original + change orders)
  const proposalsTotal = useProposalsTotal(project.id);
  const estimatedValue = proposalsTotal > 0 ? proposalsTotal : (project.service_value || 0);
  
  const projectDivIds = project.project_division_ids || [];
  
  // Get employees data for avatars
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-projects-cards'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];
  
  // Resolve Project Admin employee for avatar
  const projectAdmin = useMemo(() => {
    if (!projectAdminId) return null;
    return employees.find((e: any) => String(e.id) === String(projectAdminId)) || null;
  }, [projectAdminId, employees]);

  // Use list payload so name/avatar show before /employees loads
  const listAdminName = (project as any).project_admin_name;
  const listAdminAvatarFileId = (project as any).project_admin_avatar_file_id;
  const adminDisplayNameCard = listAdminName || (projectAdmin && getUserDisplayName(projectAdmin)) || '—';
  const userForAdminCard = projectAdmin ?? (listAdminName || listAdminAvatarFileId
    ? { name: listAdminName, profile_photo_file_id: listAdminAvatarFileId, first_name: listAdminName }
    : null);
  
  // Fetch proposals to get pricing items for percentage calculation
  const { data:proposals } = useQuery({ 
    queryKey:['projectProposals', project.id], 
    queryFn: ()=>api<any[]>('GET', `/proposals?project_id=${encodeURIComponent(String(project.id||''))}`) 
  });
  
  // Fetch full proposal data if proposal exists
  const proposal = proposals && proposals.length > 0 ? proposals[0] : null;
  const { data:proposalData } = useQuery({ 
    queryKey: ['proposal', proposal?.id],
    queryFn: () => proposal?.id ? api<any>('GET', `/proposals/${proposal.id}`) : Promise.resolve(null),
    enabled: !!proposal?.id
  });
  
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
  
  // Get division icons and labels with percentages (only if projectDivisions is already loaded)
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: ReactNode; label: string; id: string; percentage: number }> = [];
    for (const divId of projectDivIds.slice(0, 5)) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ 
            icon: getDivisionIcon(div.label, true), 
            label: div.label,
            id: String(div.id),
            percentage: calculatedPercentages[String(divId)] || 0
          });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ 
              icon: getDivisionIcon(div.label, true), 
              label: `${div.label} - ${sub.label}`,
              id: String(sub.id),
              percentage: calculatedPercentages[String(divId)] || 0
            });
            break;
          }
        }
        if (icons.length > 0 && icons[icons.length - 1].id === String(divId)) break;
      }
    }
    return icons;
  }, [projectDivIds, projectDivisions, calculatedPercentages]);

  // Tab icons and navigation - same style as Opportunities cards (w-8 h-8 rounded-lg)
  const tabButtons = [
    { key: 'reports', icon: '📝', label: 'Notes/History', tab: 'reports' },
    { key: 'dispatch', icon: '👷', label: 'Workload', tab: 'dispatch' },
    { key: 'timesheet', icon: '⏰', label: 'Timesheet', tab: 'timesheet' },
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'pricing', icon: '💰', label: 'Pricing', tab: 'pricing' },
    { key: 'orders', icon: '🛒', label: 'Orders', tab: 'orders' },
  ];

  return (
    <Link 
      to={`${projectBasePath}/${encodeURIComponent(String(project.id))}`} 
      className={uiCx('group relative block h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300', uiBorders.subtle, uiRadius.card, uiColors.surface, 'hover:shadow-md')}
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Top row: thumb + title */}
        <div className="flex gap-4">
          <div className="w-24 h-20 flex-shrink-0">
            <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
              <img className="w-full h-full object-cover" src={src} alt={project.name || 'Project'} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className={uiCx(uiTypography.overline, 'truncate min-w-0')}>{clientName || 'No client'}</div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
                {project.name || 'Project'}
              </div>
              <div className="text-xs font-semibold text-gray-900 break-words">{project.code || '—'}</div>
            </div>

            {/* Quick access - same style as Opportunities (w-8 h-8 rounded-lg) */}
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {tabButtons.map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`${projectBasePath}/${encodeURIComponent(String(project.id))}?tab=${btn.tab}`);
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

        {/* Progress bar */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-red rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-12 text-right">{progress}%</span>
          </div>
        </div>

        <div className="border-t border-black/5" />

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Start Date</div>
            <div className="text-xs font-semibold text-gray-900 truncate">{start || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>End Date</div>
            <div className="text-xs font-semibold text-gray-900 truncate">{eta || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Project Admin</div>
            {!userForAdminCard && !listAdminName ? (
              <div className="text-xs font-semibold text-gray-400">—</div>
            ) : (
              <div className="flex items-center gap-2">
                <UserAvatar user={userForAdminCard} size="sm" showTooltip={true} tooltipText={adminDisplayNameCard} />
                <div className="text-xs font-semibold text-gray-900 truncate">{adminDisplayNameCard}</div>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Estimated Value</div>
            <div className="h-5 flex items-center">
              <div className="text-xs font-semibold text-[#7f1010] truncate w-full">
                {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
          </div>
        </div>
        {actualValue > 0 && (
          <div>
            <div className={uiCx(uiTypography.overline, 'mb-0.5')}>Actual Value</div>
            <div className="text-xs font-semibold text-[#7f1010]">${actualValue.toLocaleString()}</div>
          </div>
        )}

        <div className="border-t border-black/5" />

        {/* Bottom row: divisions (left) + status (right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {divisionIcons.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {divisionIcons.map((div, idx) => (
                  <AppTooltip
                    key={idx}
                    content={div.label}
                    placement="bottom"
                    className="flex flex-col items-center"
                  >
                    <div className="flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                      {div.icon}
                    </div>
                    <div className="text-[10px] font-semibold text-gray-600 mt-0.5">
                      {Math.round(div.percentage || 0)}%
                    </div>
                  </AppTooltip>
                ))}
                {projectDivIds.length > 5 && (
                  <AppTooltip
                    content={`${projectDivIds.length - 5} more divisions`}
                    placement="bottom"
                  >
                    <div className="text-sm text-gray-400 cursor-pointer">
                      +{projectDivIds.length - 5}
                    </div>
                  </AppTooltip>
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

function UserInline({ id }:{ id:string }){
  // Disable query to prevent "popping" - show ID or placeholder instead
  // Can be enabled later if needed, or fetch user names in backend batch
  return <span className="font-medium">—</span>;
}


