import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '@/components/ConfirmProvider';
import LoadingOverlay from '@/components/LoadingOverlay';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useSearchParams } from 'react-router-dom';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import NewCustomerModal from '@/components/NewCustomerModal';

type Client = { id:string, name?:string, display_name?:string, code?:string, city?:string, province?:string, client_status?:string, client_type?:string, address_line1?:string, created_at?:string, logo_url?:string };

type ClientsResponse = {
  items: Client[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

// Helper: Convert filter rules to URL parameters
function convertRulesToParams(rules: FilterRule[]): URLSearchParams {
  const params = new URLSearchParams();
  
  // Clear all potential conflicting parameters first
  params.delete('status');
  params.delete('status_not');
  params.delete('type');
  params.delete('type_not');
  params.delete('city');
  params.delete('city_not');
  
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
      
      case 'type':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('type', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('type_not', rule.value);
          }
        }
        break;
      
      case 'city':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('city', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('city_not', rule.value);
          }
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
  
  // Type
  const type = params.get('type');
  const typeNot = params.get('type_not');
  if (type) {
    rules.push({ id: `rule-${idCounter++}`, field: 'type', operator: 'is', value: type });
  } else if (typeNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'type', operator: 'is_not', value: typeNot });
  }
  
  // City
  const city = params.get('city');
  const cityNot = params.get('city_not');
  if (city) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is', value: city });
  } else if (cityNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'city', operator: 'is_not', value: cityNot });
  }
  
  return rules;
}

export default function Customers(){
  const nav = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  
  // Get initial values from URL params
  const queryParam = searchParams.get('q') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  
  const [q, setQ] = useState(queryParam);
  const [page, setPage] = useState(pageParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const limit = 10;
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  const hasLoadedDataRef = useRef(false);
  
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
  
  // Load available locations from clients (for all filters - countries, provinces, cities)
  const { data: locationsData } = useQuery({ 
    queryKey:['client-locations'], 
    queryFn: ()=>api<any>('GET','/clients/locations'),
    staleTime: 300_000
  });
  
  // Sync URL params with state when URL changes
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    
    if (urlQ !== q) setQ(urlQ);
    if (urlPage !== page) setPage(urlPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  
  // Reset page to 1 when filters change
  const handleQChange = (value: string) => {
    setQ(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('q', value);
    else params.delete('q');
    params.set('page', '1');
    setSearchParams(params);
  };
  
  const queryString = useMemo(()=>{
    const p = new URLSearchParams(searchParams);
    // Remove 'q' and 'page' from params for query string (they're handled separately)
    const qParam = p.get('q');
    const pageParam = p.get('page');
    p.delete('q');
    p.delete('page');
    const filterString = p.toString();
    const finalParams = new URLSearchParams();
    if (qParam) finalParams.set('q', qParam);
    if (filterString) {
      filterString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        if (key && value) finalParams.set(key, decodeURIComponent(value));
      });
    }
    finalParams.set('page', String(page));
    finalParams.set('limit', String(limit));
    return finalParams.toString();
  }, [searchParams, page, limit]);
  
  const { data, isLoading, refetch, isFetching } = useQuery({ 
    queryKey:['clients', queryString], 
    queryFn: ()=>api<ClientsResponse>('GET', `/clients?${queryString}`) 
  });
  
  const { data:settings, isLoading: settingsLoading } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  
  // Track if we've loaded data at least once
  useEffect(() => {
    if (data) {
      hasLoadedDataRef.current = true;
    }
  }, [data]);
  
  // Check if we're still loading initial data (only show overlay if no data yet and we haven't loaded before)
  const isInitialLoading = ((isLoading && !data) || (settingsLoading && !settings)) && !hasLoadedDataRef.current;
  
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
  
  const statusColorMap: Record<string,string> = useMemo(()=>{
    const list = (settings||{}).client_statuses as {label?:string, value?:string, id?:string}[]|undefined;
    const m: Record<string,string> = {};
    (list||[]).forEach(it=>{ 
      const k = String(it.label||'').trim(); 
      const v = String(it.value||it.id||'').trim(); 
      if(k){ m[k] = v || ''; } 
    });
    return m;
  }, [settings]);
  
  const clientStatuses = (settings?.client_statuses || []) as {id?:string, label?:string, value?:string}[];
  const clientTypes = (settings?.client_types || []) as {id?:string, label?:string, value?:string}[];
  
  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:customers:write');
  
  // Organize locations data (countries, provinces, cities from actual clients only)
  const locations = locationsData || {};
  
  // Extract all cities from all locations
  const allCities = useMemo(() => {
    const citiesSet = new Set<string>();
    Object.values(locations).forEach((provinces: any) => {
      Object.values(provinces).forEach((cities: any) => {
        if (Array.isArray(cities)) {
          cities.forEach((city: string) => citiesSet.add(city));
        }
      });
    });
    return Array.from(citiesSet).sort();
  }, [locations]);
  
  // Filter Builder Configuration
  const filterFields: FieldConfig[] = useMemo(() => [
    {
      id: 'status',
      label: 'Status',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => clientStatuses.map((s: any) => ({ 
        value: s.id || s.value || '', 
        label: s.label || s.value || s.id || '' 
      })),
    },
    {
      id: 'type',
      label: 'Type',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => clientTypes.map((t: any) => ({ 
        value: t.id || t.value || '', 
        label: t.label || t.value || t.id || '' 
      })),
    },
    {
      id: 'city',
      label: 'City',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => allCities.map(city => ({ value: city, label: city })),
    },
  ], [clientStatuses, clientTypes, allCities]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

  // Helper to format rule value for display
  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'status') {
      const status = clientStatuses.find((s: any) => String(s.id || s.value) === rule.value);
      return status?.label || status?.value || String(rule.value);
    }
    if (rule.field === 'type') {
      const type = clientTypes.find((t: any) => String(t.id || t.value) === rule.value);
      return type?.label || type?.value || String(rule.value);
    }
    if (rule.field === 'city') {
      return String(rule.value);
    }
    return String(rule.value);
  };

  // Helper to get field label
  const getFieldLabel = (fieldId: string): string => {
    const field = filterFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Customers</div>
          <div className="text-sm text-gray-500 font-medium">Manage your customer list and sites</div>
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
            {/* Global Search - Dominant, large */}
            <div className="flex-1">
              <div className="relative">
                <input 
                  className="w-full border border-gray-200 rounded-md px-4 py-2.5 pl-10 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150" 
                  placeholder="Search by name, display name, code, address, city, province..." 
                  value={q} 
                  onChange={e=>handleQChange(e.target.value)} 
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
                  params.set('page', '1');
                  setPage(1);
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
                params.set('page', String(page));
                setSearchParams(params);
                refetch();
              }}
              getValueLabel={formatRuleValue}
              getFieldLabel={getFieldLabel}
            />
          ))}
        </div>
      )}

      <LoadingOverlay isLoading={isInitialLoading} text="Loading customers...">
        <div 
          className="rounded-xl border bg-white"
          style={animationComplete ? {} : {
            opacity: hasAnimated ? 1 : 0,
            transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out'
          }}
        >
          <div className="divide-y">
            {hasEditPermission && (
              <button
                onClick={() => setNewCustomerModalOpen(true)}
                className="w-full p-3 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-brand-red hover:bg-gray-50 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl text-gray-400">+</div>
                  <div>
                    <div className="font-medium text-sm text-gray-700">New Customer</div>
                    <div className="text-xs text-gray-500">Add new customer</div>
                  </div>
                </div>
              </button>
            )}
            {(data?.items || []).map(c => (
              <ClientRow key={c.id} c={c} statusColorMap={statusColorMap} hasEditPermission={hasEditPermission} onOpen={()=> nav(`/customers/${encodeURIComponent(c.id)}`)} onDeleted={()=> refetch()} />
            ))}
          </div>
          
          {/* Pagination Controls */}
          {data && data.total > 0 && (
            <div className="p-4 border-t flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} customers
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const newPage = Math.max(1, data.page - 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                  disabled={data.page <= 1 || isFetching}
                  className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div className="text-sm text-gray-700">
                  Page {data.page} of {data.total_pages}
                </div>
                <button
                  onClick={() => {
                    const newPage = Math.min(data.total_pages, data.page + 1);
                    setPage(newPage);
                    const params = new URLSearchParams(searchParams);
                    params.set('page', String(newPage));
                    setSearchParams(params);
                  }}
                  disabled={data.page >= data.total_pages || isFetching}
                  className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          {data && data.total === 0 && (
            <div className="p-8 text-center text-gray-500">
              No customers found matching your criteria.
            </div>
          )}
        </div>
      </LoadingOverlay>
      
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
      
      {/* New Customer Modal */}
      {newCustomerModalOpen && (
        <NewCustomerModal
          onClose={() => setNewCustomerModalOpen(false)}
          onSuccess={(customerId) => {
            setNewCustomerModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            refetch();
            if (customerId) {
              nav(`/customers/${encodeURIComponent(customerId)}`);
            }
          }}
        />
      )}
    </div>
  );
}

function ClientRow({ c, statusColorMap, hasEditPermission, onOpen, onDeleted }:{ c: Client, statusColorMap: Record<string,string>, hasEditPermission?: boolean, onOpen: ()=>void, onDeleted: ()=>void }){
  // Use logo_url from the client data (loaded together with the client list)
  const avatarUrl = c.logo_url || '/ui/assets/placeholders/customer.png';
  const status = String(c.client_status||'').trim();
  const color = status ? (statusColorMap[status] || '') : '';
  const badgeStyle: any = color ? { backgroundColor: color, borderColor: 'transparent', color: '#000' } : {};
  const confirm = useConfirm();
  return (
    <div 
      className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" 
      onClick={onOpen}
    >
      <div className="flex items-center gap-3 min-w-0">
        <img src={avatarUrl} className="w-12 h-12 rounded-lg border object-cover" alt={c.display_name || c.name || 'Client logo'}/>
        <div className="min-w-0">
          <div className="font-medium truncate">{c.display_name||c.name||c.id}</div>
          {c.code && <div className="text-xs text-gray-600">Code: {c.code}</div>}
          {c.address_line1 && <div className="text-xs text-gray-700 truncate">{String(c.address_line1)}</div>}
          <div className="text-xs text-gray-600 truncate">{[c.city, c.province].filter(Boolean).join(', ')}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm" onClick={e=> e.stopPropagation()}>
        <span className="text-gray-600">Status:</span>
        <span className="px-2 py-0.5 rounded-full border" style={badgeStyle}>{status || '—'}</span>
        <span className="text-gray-600">Type:</span>
        <span className="px-2 py-0.5 rounded-full border text-gray-700 bg-gray-50">{String(c.client_type||'—')}</span>
        {hasEditPermission && (
          <button className="ml-2 px-3 py-1.5 rounded bg-brand-red text-white hover:bg-red-700" title="Delete customer" onClick={async()=>{
            const ok = await confirm({ title: 'Delete customer', message: 'Are you sure you want to delete this customer? This action cannot be undone.' });
            if (!ok) return;
            try{ await api('DELETE', `/clients/${encodeURIComponent(c.id)}`); onDeleted(); }catch(_e){}
          }}>Delete</button>
        )}
      </div>
    </div>
  );
}


