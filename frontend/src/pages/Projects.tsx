import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import ImagePicker from '@/components/ImagePicker';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import { isRangeOperator } from '@/components/FilterBuilder/utils';

// Helper function to get user initials
function getUserInitials(user: any): string {
  const firstName = user?.first_name || user?.name || user?.username || '';
  const lastName = user?.last_name || '';
  const firstInitial = firstName ? firstName[0].toUpperCase() : '';
  const lastInitial = lastName ? lastName[0].toUpperCase() : '';
  if (firstInitial && lastInitial) {
    return firstInitial + lastInitial;
  }
  return firstInitial || (user?.username ? user.username[0].toUpperCase() : '?');
}

// Helper function to get user display name
function getUserDisplayName(user: any): string {
  if (user?.first_name && user?.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  return user?.name || user?.username || 'Unknown';
}

// Component for user avatar with tooltip
function UserAvatar({ user, size = 'w-6 h-6', showTooltip = true, tooltipText }: { 
  user: any; 
  size?: string; 
  showTooltip?: boolean;
  tooltipText?: string;
}) {
  const photoFileId = user?.profile_photo_file_id;
  const initials = getUserInitials(user);
  const displayName = tooltipText || getUserDisplayName(user);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="relative inline-flex group/avatar">
      {photoFileId && !imageError ? (
        <img
          src={`/files/${photoFileId}/thumbnail?w=80`}
          alt={displayName}
          className={`${size} rounded-full object-cover border border-gray-300`}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className={`${size} rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold text-xs`}>
          {initials}
        </div>
      )}

      {showTooltip && (
        <div className="absolute left-0 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
          {displayName}
          <div className="absolute -bottom-1 left-2 w-2 h-2 bg-gray-900 rotate-45"></div>
        </div>
      )}
    </div>
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
  project_admin_id?:string,
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
  
  // ETA range (eta)
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
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
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
    return params.toString() ? '?' + params.toString() : '';
  }, [searchParams]);
  
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
    queryFn: ()=> api<any>('GET','/clients?limit=500'), 
    staleTime: 300_000
  });
  
  // Get employees for estimator filter
  const { data: employees } = useQuery({ 
    queryKey:['employees'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  
  const projectStatuses = settings?.project_statuses || [];
  const clients = clientsData?.items || clientsData || [];
  const arr = data||[];
  const [pickerOpen, setPickerOpen] = useState<{ open:boolean, clientId?:string, projectId?:string }|null>(null);

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:projects:write');

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
        projectDivisions?.forEach((div: any) => {
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
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => (employees || []).map((emp: any) => ({ 
        value: emp.id, 
        label: emp.name || emp.username || emp.id 
      })),
    },
    {
      id: 'start_date',
      label: 'Start Date',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'eta',
      label: 'ETA',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'value',
      label: 'Value',
      type: 'number',
      operators: ['is_equal_to', 'greater_than', 'less_than', 'between'],
    },
  ], [projectStatuses, projectDivisions, clients, employees]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

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
      return emp?.name || emp?.username || String(rule.value);
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
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Projects</div>
          <div className="text-sm text-gray-500 font-medium">List, search and manage projects</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>
      {/* Filter Bar */}
      <div className="mb-3 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Primary Row: Global Search + Actions */}
        <div className="px-6 py-4 bg-white">
          <div className="flex items-center gap-4">
            {/* View Toggle Button */}
            <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  viewMode === 'list'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="List view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2.5 text-sm font-medium transition-colors duration-150 border-l border-gray-200 ${
                  viewMode === 'cards'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
                title="Card view"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
            </div>

            {/* Global Search - Dominant, large */}
            <div className="flex-1">
              <div className="relative">
                <input 
                  className="w-full border border-gray-200 rounded-md px-4 py-2.5 pl-10 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150" 
                  placeholder="Search by project name, code, or client name..." 
                  value={q} 
                  onChange={e=>setQ(e.target.value)} 
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* + Filters Button - Opens Modal */}
            <button 
              onClick={()=>setIsFilterModalOpen(true)}
              className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
            >
              + Filters
            </button>

            {/* Clear Filters - Only when active */}
            {hasActiveFilters && (
              <button 
                onClick={()=>{
                  const params = new URLSearchParams();
                  if (q) params.set('q', q);
                  setSearchParams(params);
                  refetch();
                }} 
                className="px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 whitespace-nowrap"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          {currentRules.map((rule) => (
            <FilterChip
              key={rule.id}
              rule={rule}
              onRemove={() => {
                const updatedRules = currentRules.filter(r => r.id !== rule.id);
                const params = convertRulesToParams(updatedRules);
                if (q) params.set('q', q);
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
        {viewMode === 'cards' ? (
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3 gap-4"
            style={animationComplete ? {} : {
              opacity: hasAnimated ? 1 : 0,
              transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
              transition: 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            {isLoading && !arr.length ? (
              <>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </>
            ) : arr.length > 0 ? (
                arr.map(p => (
                  <ProjectListCard
                    key={p.id}
                    project={p}
                    projectDivisions={projectDivisions}
                    projectStatuses={projectStatuses}
                  />
                ))
              ) : (
                <div className="col-span-2 p-8 text-center text-gray-500 rounded-xl border bg-white">
                  No projects found matching your criteria.
                </div>
              )}
          </div>
        ) : (
          <div 
            className="flex flex-col gap-2 overflow-x-auto"
            style={animationComplete ? {} : {
              opacity: hasAnimated ? 1 : 0,
              transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
              transition: 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            {isLoading && !arr.length ? (
              <>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-lg" />
                ))}
              </>
            ) : arr.length > 0 ? (
                arr.map(p => (
                  <ProjectListItem
                    key={p.id}
                    project={p}
                    projectDivisions={projectDivisions}
                    projectStatuses={projectStatuses}
                  />
                ))
              ) : (
                <div className="p-8 text-center text-gray-500 rounded-xl border bg-white">
                  No projects found matching your criteria.
                </div>
              )}
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
          }catch(e){           toast.error('Failed to update cover'); setPickerOpen(null); }
        }} />
      )}
      
      {/* Filter Builder Modal */}
      <FilterBuilderModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        onApply={handleApplyFilters}
        initialRules={currentRules}
        fields={filterFields}
        getFieldData={(fieldId) => {
          // Return data for field if needed
          return null;
        }}
      />
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

function ProjectListItem({ project, projectDivisions, projectStatuses }:{ project: Project, projectDivisions?: any[], projectStatuses: any[] }){
  const navigate = useNavigate();
  
  // Use client name from project data
  const clientName = project.client_display_name || project.client_name || '';
  const status = project.status_label || '';
  const statusLabel = String(status || '').trim();
  const statusColor = (projectStatuses || []).find((s: any) => String(s?.label || '').trim() === statusLabel)?.value || '#e5e7eb';
  const start = (project.date_start || project.created_at || '').slice(0,10);
  const eta = (project.date_eta || '').slice(0,10);
  const projectAdminId = project.project_admin_id || null;
  const estimatedValue = project.service_value || 0;
  
  // Get employees data for avatars
  const { data: employeesData } = useQuery({ 
    queryKey:['employees-for-projects-list'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  const employees = employeesData || [];
  
  // Resolve Project Admin employee for avatar
  const projectAdmin = useMemo(() => {
    if (!projectAdminId) return null;
    return employees.find((e: any) => String(e.id) === String(projectAdminId)) || null;
  }, [projectAdminId, employees]);

  return (
    <Link 
      to={`/projects/${encodeURIComponent(String(project.id))}`} 
      className="group border rounded-lg bg-white p-4 hover:shadow-md transition-all duration-200 min-w-[800px]"
    >
      <div className="grid grid-cols-[10fr_3fr_3fr_3fr_3fr_3fr] gap-2 sm:gap-3 lg:gap-4 items-center overflow-hidden">
        {/* Coluna 1: Name, Code, Client */}
        <div className="min-w-0">
          <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors truncate">
            {project.name || 'Project'}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
            <span className="truncate">{project.code || '—'}</span>
            {clientName && (
              <>
                <span className="text-gray-400">•</span>
                <span className="truncate">{clientName}</span>
              </>
            )}
          </div>
        </div>

        {/* Coluna 2: Start */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">Start</div>
          <div className="font-medium text-gray-900 whitespace-nowrap text-sm truncate">{start || '—'}</div>
        </div>

        {/* Coluna 3: ETA */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">ETA</div>
          <div className="font-medium text-gray-900 whitespace-nowrap text-sm truncate">{eta || '—'}</div>
        </div>

        {/* Coluna 4: Avatares (Project Admin) */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">Project Admin</div>
          {!projectAdmin ? (
            <div className="text-gray-400 text-xs">—</div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <UserAvatar user={projectAdmin} size="w-5 h-5" showTooltip={true} />
              <div className="font-medium text-gray-900 text-xs truncate min-w-0">{getUserDisplayName(projectAdmin)}</div>
            </div>
          )}
        </div>

        {/* Coluna 5: Value */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 mb-0.5">Value</div>
          <div className="font-semibold text-[#7f1010] whitespace-nowrap text-sm truncate">
            {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </div>
        </div>

        {/* Coluna 6: Status */}
        <div className="min-w-0">
          <span
            className={[
              'inline-flex items-center gap-1 px-2 lg:px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm',
              'backdrop-blur-sm border-gray-200 text-gray-800',
            ].join(' ')}
            title={status}
            style={{ backgroundColor: statusColor, color: '#000' }}
          >
            <span className="truncate">{status || '—'}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProjectListCard({ project, projectDivisions, projectStatuses }:{ project: Project, projectDivisions?: any[], projectStatuses: any[] }){
  const navigate = useNavigate();
  
  // Use cover image URL from project data (same image as General Information)
  const src = project.cover_image_url || '/ui/assets/placeholders/project.png';
  
  // Use client name from project data
  const clientName = project.client_display_name || project.client_name || '';

  // Use project divisions from parent (passed as prop, no individual loading)
  // This prevents "popping" updates after initial render
  // Use only data from backend - no additional queries to prevent "popping"
  const status = project.status_label || '';
  const statusLabel = String(status || '').trim();
  const statusColor = (projectStatuses || []).find((s: any) => String(s?.label || '').trim() === statusLabel)?.value || '#e5e7eb';
  const progress = Math.max(0, Math.min(100, Number(project.progress ?? 0)));
  const start = (project.date_start || project.created_at || '').slice(0,10);
  const eta = (project.date_eta || '').slice(0,10);
  const projectAdminId = project.project_admin_id || null;
  const actualValue = project.cost_actual || 0;
  const estimatedValue = project.service_value || 0;
  const projectDivIds = project.project_division_ids || [];
  // Matches ProjectDetail (General Information): `project_division_percentages`
  const percentages = project.project_division_percentages || {};
  
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
  
  // Calculate percentages if not set (auto-initialize)
  const calculatedPercentages = useMemo(() => {
    if (projectDivIds.length === 0) return {};

    // Filter percentages to only include valid division IDs (remove orphaned percentages)
    const filteredPercentages: { [key: string]: number } = {};
    projectDivIds.forEach(id => {
      const idStr = String(id);
      if ((percentages as any)[idStr] !== undefined) {
        filteredPercentages[idStr] = Number((percentages as any)[idStr]) || 0;
      }
    });

    // If percentages exist and cover all divisions, use them
    const hasPercentages = projectDivIds.every(id => filteredPercentages[String(id)] !== undefined);
    if (hasPercentages && Object.keys(filteredPercentages).length > 0) {
      return filteredPercentages;
    }

    // Otherwise, calculate equal distribution
    const equalPercent = projectDivIds.length === 1 ? 100 : 100 / projectDivIds.length;
    const result: { [key: string]: number } = {};
    projectDivIds.forEach(id => {
      result[String(id)] = equalPercent;
    });
    return result;
  }, [projectDivIds, percentages]);
  
  // Get division icons and labels with percentages (only if projectDivisions is already loaded)
  const divisionIcons = useMemo(() => {
    if (!Array.isArray(projectDivIds) || projectDivIds.length === 0 || !projectDivisions) return [];
    const icons: Array<{ icon: string; label: string; id: string; percentage: number }> = [];
    for (const divId of projectDivIds.slice(0, 5)) {
      for (const div of (projectDivisions || [])) {
        if (String(div.id) === String(divId)) {
          icons.push({ 
            icon: getDivisionIcon(div.label), 
            label: div.label,
            id: String(div.id),
            percentage: calculatedPercentages[String(divId)] || 0
          });
          break;
        }
        for (const sub of (div.subdivisions || [])) {
          if (String(sub.id) === String(divId)) {
            icons.push({ 
              icon: getDivisionIcon(div.label), 
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

  // Tab icons and navigation
  const tabButtons = [
    { key: 'reports', icon: '📝', label: 'Reports', tab: 'reports' },
    { key: 'dispatch', icon: '👷', label: 'Workload', tab: 'dispatch' },
    { key: 'timesheet', icon: '⏰', label: 'Timesheet', tab: 'timesheet' },
    { key: 'files', icon: '📁', label: 'Files', tab: 'files' },
    { key: 'proposal', icon: '📄', label: 'Proposal', tab: 'proposal' },
    { key: 'orders', icon: '🛒', label: 'Orders', tab: 'orders' },
  ];

  return (
    <Link 
      to={`/projects/${encodeURIComponent(String(project.id))}`} 
      className="group rounded-xl border bg-white hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 block h-full transition-all duration-200 relative"
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
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1.5">Project Admin</div>
            {!projectAdmin ? (
              <div className="text-gray-400 text-xs">—</div>
            ) : (
              <div className="flex items-center gap-2">
                <UserAvatar user={projectAdmin} size="w-6 h-6" showTooltip={true} />
                <div className="font-medium text-gray-900 text-xs truncate">{getUserDisplayName(projectAdmin)}</div>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500 mb-1.5">Estimated Value</div>
            <div className="h-6 flex items-center">
              <div className="font-semibold text-[#7f1010] truncate w-full">
                {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              </div>
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
                  <div key={idx} className="relative group/icon flex flex-col items-center" title={div.label}>
                    <div className="text-xl cursor-pointer hover:scale-110 transition-transform">
                      {div.icon}
                    </div>
                    <div className="text-xs text-gray-600 font-bold mt-0.5">
                      {Math.round(div.percentage || 0)}%
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
                'backdrop-blur-sm border-gray-200 text-gray-800',
              ].join(' ')}
              title={status}
              style={{ backgroundColor: statusColor, color: '#000' }}
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


