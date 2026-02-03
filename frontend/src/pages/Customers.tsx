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
  
  // List sort (from URL, client-side on current page)
  const sortBy = (searchParams.get('sort') as 'customer' | 'code' | 'city' | 'status' | 'type') || 'customer';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: typeof sortBy, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    setSearchParams(params, { replace: true });
  };

  const queryString = useMemo(()=>{
    const p = new URLSearchParams(searchParams);
    // Remove 'q', 'page', 'sort', 'dir' from params for API query (handled separately or client-side)
    const qParam = p.get('q');
    const pageParam = p.get('page');
    p.delete('q');
    p.delete('page');
    p.delete('sort');
    p.delete('dir');
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

  const sortedItems = useMemo(() => {
    const list = data?.items ? [...data.items] : [];
    const cmp = (a: Client, b: Client) => {
      let aVal: string;
      let bVal: string;
      switch (sortBy) {
        case 'customer':
          aVal = `${(a.display_name || a.name || '').toLowerCase()}\t${(a.address_line1 || '')}`;
          bVal = `${(b.display_name || b.name || '').toLowerCase()}\t${(b.address_line1 || '')}`;
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        case 'code':
          aVal = (a.code || '').toLowerCase();
          bVal = (b.code || '').toLowerCase();
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        case 'city':
          aVal = [a.city, a.province].filter(Boolean).join(', ').toLowerCase();
          bVal = [b.city, b.province].filter(Boolean).join(', ').toLowerCase();
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        case 'status':
          aVal = (a.client_status || '').toLowerCase();
          bVal = (b.client_status || '').toLowerCase();
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        case 'type':
          aVal = (a.client_type || '').toLowerCase();
          bVal = (b.client_type || '').toLowerCase();
          return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        default:
          return 0;
      }
    };
    list.sort((a, b) => {
      const r = cmp(a, b);
      return sortDir === 'asc' ? r : -r;
    });
    return list;
  }, [data?.items, sortBy, sortDir]);
  
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
      {/* Title Bar - same layout and font sizes as Projects / Opportunities */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">Customers</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage your customer list and sites</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar - same rounded-xl area as Projects */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input 
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150" 
                placeholder="Search by name, display name, code, address, city, province..." 
                value={q} 
                onChange={e=>handleQChange(e.target.value)} 
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <button 
            onClick={()=>setIsFilterModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </button>
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
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors duration-150 whitespace-nowrap"
            >
              Clear
            </button>
          )}
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
          className="rounded-xl border border-gray-200 bg-white overflow-hidden"
          style={animationComplete ? {} : {
            opacity: hasAnimated ? 1 : 0,
            transform: hasAnimated ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out'
          }}
        >
          <div className="flex flex-col gap-2 overflow-x-auto">
            {hasEditPermission && (
              <button
                onClick={() => setNewCustomerModalOpen(true)}
                className="border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center min-h-[60px] min-w-[640px]"
              >
                <div className="text-lg text-gray-400 mr-2">+</div>
                <div className="font-medium text-xs text-gray-700">New Customer</div>
              </button>
            )}
            {(data?.items || []).length > 0 && (
              <>
                {/* Column headers - sortable */}
                <div 
                  className="grid grid-cols-[40fr_10fr_25fr_10fr_15fr] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-2 w-full text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 rounded-t-lg"
                  role="row"
                >
                  <button type="button" onClick={() => setListSort('customer')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by customer name">Customer{sortBy === 'customer' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                  <button type="button" onClick={() => setListSort('code')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by code">Code{sortBy === 'code' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                  <button type="button" onClick={() => setListSort('city')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by city">City{sortBy === 'city' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                  <button type="button" onClick={() => setListSort('status')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by status">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                  <button type="button" onClick={() => setListSort('type')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by type">Type{sortBy === 'type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                </div>
                <div className="rounded-b-lg border border-t-0 border-gray-200 overflow-hidden min-w-0">
                  {sortedItems.map(c => (
                    <ClientRow key={c.id} c={c} statusColorMap={statusColorMap} onOpen={()=> nav(`/customers/${encodeURIComponent(c.id)}`)} />
                  ))}
                </div>
              </>
            )}
          </div>
          
          {/* Pagination Controls */}
          {data && data.total > 0 && (
            <div className="p-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-xs text-gray-600">
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
                  className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Previous
                </button>
                <div className="text-xs text-gray-700 font-medium">
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
                  className="rounded-lg px-3 py-2 border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          
          {data && data.total === 0 && (
            <div className="p-8 text-center text-xs text-gray-500">
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

function ClientRow({ c, statusColorMap, onOpen }:{ c: Client, statusColorMap: Record<string,string>, onOpen: ()=>void }){
  const avatarUrl = c.logo_url || '/ui/assets/placeholders/customer.png';
  const status = String(c.client_status||'').trim();
  const color = status ? (statusColorMap[status] || '') : '';
  const badgeStyle: any = color ? { backgroundColor: color, borderColor: 'transparent', color: '#000' } : {};
  return (
    <div 
      className="grid grid-cols-[40fr_10fr_25fr_10fr_15fr] gap-2 sm:gap-3 lg:gap-4 items-center px-4 py-3 w-full hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 min-h-[52px]" 
      onClick={onOpen}
    >
      {/* Col 1: Customer (avatar + name, address) - vertically centered */}
      <div className="min-w-0 flex items-center gap-3">
        <img src={avatarUrl} className="w-10 h-10 rounded-lg border border-gray-200 object-cover flex-shrink-0" alt={c.display_name || c.name || 'Client logo'}/>
        <div className="min-w-0 flex flex-col justify-center">
          <div className="text-xs font-semibold text-gray-900 truncate">{c.display_name||c.name||c.id}</div>
          {c.address_line1 && <div className="text-[10px] text-gray-500 truncate">{String(c.address_line1)}</div>}
        </div>
      </div>
      {/* Col 2: Code - vertically centered */}
      <div className="min-w-0 flex items-center">
        <span className="text-xs text-gray-700 truncate">{c.code || '—'}</span>
      </div>
      {/* Col 3: City */}
      <div className="min-w-0 flex items-center">
        <span className="text-xs text-gray-600 truncate">{[c.city, c.province].filter(Boolean).join(', ') || '—'}</span>
      </div>
      {/* Col 4: Status - vertically centered (code + status group shifted left via pr-8 on row) */}
      <div className="min-w-0 flex items-center">
        <span className="inline-flex px-2 py-0.5 rounded-full border text-[10px] font-medium truncate max-w-full" style={badgeStyle}>{status || '—'}</span>
      </div>
      {/* Col 5: Type */}
      <div className="min-w-0 flex items-center">
        <span className="inline-flex px-2 py-0.5 rounded-full border border-gray-200 text-[10px] font-medium text-gray-700 bg-gray-50 truncate">{String(c.client_type||'—')}</span>
      </div>
    </div>
  );
}


