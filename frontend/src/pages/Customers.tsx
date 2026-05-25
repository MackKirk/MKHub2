import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessTokenIfNeeded } from '@/lib/api';
import { useMemo, useState, useEffect, useRef } from 'react';
import { getClientStatusBadgeVariant } from '@/lib/clientUi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Users } from 'lucide-react';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';
import NewCustomerModal from '@/components/NewCustomerModal';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  uiBorders,
  uiColors,
  uiCx,
  uiLayout,
  uiRadius,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

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
  
  // List sort (URL + API; order applies to full result set before pagination)
  const sortBy = (searchParams.get('sort') as 'customer' | 'code' | 'city' | 'status' | 'type') || 'customer';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: typeof sortBy, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  const queryString = useMemo(()=>{
    const p = new URLSearchParams(searchParams);
    const qParam = p.get('q');
    const sortParam = p.get('sort') || 'customer';
    const dirParam = p.get('dir') === 'desc' ? 'desc' : 'asc';
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
    finalParams.set('sort', sortParam);
    finalParams.set('dir', dirParam);
    return finalParams.toString();
  }, [searchParams, page, limit]);
  
  const { data, isLoading, refetch, isFetching } = useQuery({ 
    queryKey:['clients', queryString], 
    queryFn: ()=>api<ClientsResponse>('GET', `/clients?${queryString}`) 
  });
  
  const { data:settings, isLoading: settingsLoading } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });

  const listItems = data?.items ?? [];

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
      type: 'select_search',
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

  const listCardAnimClass = animationComplete
    ? undefined
    : uiCx(
        'transition-[opacity,transform] duration-[400ms] ease-out',
        hasAnimated ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-2 scale-[0.98]',
      );

  return (
    <main className={uiCx('min-h-full bg-gray-50', uiSpacing.pageY)}>
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack)}>
        <AppPageHeader
          title="Customers"
          subtitle="Manage your customer list and sites"
          icon={<Users className="h-4 w-4" />}
          actions={
            <div className="text-right">
              <div className={uiTypography.overline}>Today</div>
              <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
            </div>
          }
        />

        <AppCard bodyClassName={uiSpacing.cardPadding}>
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-stretch gap-3')}>
            <div className="min-w-0 flex-1">
              <AppInput
                placeholder="Search by name, display name, code, address, city, province..."
                value={q}
                onChange={(e) => handleQChange(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
                fieldHint="Search\n\nMatches customer name, display name, code, address, city, or province."
                aria-label="Search customers"
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
                  params.set('page', '1');
                  setPage(1);
                  setSearchParams(params);
                  refetch();
                }}
              >
                Clear
              </AppButton>
            )}
          </div>
        </AppCard>

        {hasActiveFilters && (
          <div className={uiCx(uiLayout.actionsRow, 'flex-wrap')}>
            {currentRules.map((rule) => (
              <FilterChip
                key={rule.id}
                rule={rule}
                onRemove={() => {
                  const updatedRules = currentRules.filter((r) => r.id !== rule.id);
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
          <AppCard
            className={uiCx(uiShadows.card, listCardAnimClass)}
            bodyClassName="!p-0"
            footer={
              data && data.total > 0 ? (
                <div className={uiCx(uiLayout.actionsRow, 'w-full flex-wrap justify-between gap-3')}>
                  <p className={uiTypography.helper}>
                    Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of{' '}
                    {data.total} customers
                  </p>
                  <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.page <= 1 || isFetching}
                      onClick={() => {
                        const newPage = Math.max(1, data.page - 1);
                        setPage(newPage);
                        const params = new URLSearchParams(searchParams);
                        params.set('page', String(newPage));
                        setSearchParams(params);
                      }}
                    >
                      Previous
                    </AppButton>
                    <span className={uiTypography.helper}>
                      Page {data.page} of {data.total_pages}
                    </span>
                    <AppButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.page >= data.total_pages || isFetching}
                      onClick={() => {
                        const newPage = Math.min(data.total_pages, data.page + 1);
                        setPage(newPage);
                        const params = new URLSearchParams(searchParams);
                        params.set('page', String(newPage));
                        setSearchParams(params);
                      }}
                    >
                      Next
                    </AppButton>
                  </div>
                </div>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-2">
              {hasEditPermission && (
                <div className={uiCx(uiSpacing.cardPadding, 'pb-0')}>
                  <AppListCreateItem
                    label="New Customer"
                    layout="row"
                    className="w-full"
                    onClick={() => setNewCustomerModalOpen(true)}
                  />
                </div>
              )}
              {(data?.items || []).length > 0 ? (
                <div className="overflow-x-auto">
                  <div
                    className={uiCx(
                      'grid min-w-[640px] w-full grid-cols-[40fr_10fr_25fr_10fr_15fr] items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 sm:gap-3 lg:gap-4',
                      uiTypography.overline,
                      'normal-case tracking-normal text-gray-700',
                    )}
                    role="row"
                  >
                    <SortHeader label="Customer" column="customer" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} title="Sort by customer name" />
                    <SortHeader label="Code" column="code" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} title="Sort by code" />
                    <SortHeader label="City" column="city" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} title="Sort by city" />
                    <SortHeader label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} title="Sort by status" />
                    <SortHeader label="Type" column="type" sortBy={sortBy} sortDir={sortDir} onSort={setListSort} title="Sort by type" />
                  </div>
                  <div className={uiCx('min-w-[640px] border-t-0', uiBorders.subtle)}>
                    {listItems.map((c) => (
                      <ClientRow
                        key={c.id}
                        c={c}
                        onOpen={() => nav(`/customers/${encodeURIComponent(c.id)}`)}
                      />
                    ))}
                  </div>
                </div>
              ) : data && data.total === 0 ? (
                <div className={uiSpacing.cardPadding}>
                  <AppEmptyState title="No customers found matching your criteria." className="border-0 bg-transparent shadow-none" />
                </div>
              ) : null}
            </div>
          </AppCard>
        </LoadingOverlay>

        <FilterBuilderModal
          isOpen={isFilterModalOpen}
          onClose={() => setIsFilterModalOpen(false)}
          onApply={handleApplyFilters}
          initialRules={currentRules}
          fields={filterFields}
          getFieldData={() => null}
        />

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
    </main>
  );
}

type SortColumn = 'customer' | 'code' | 'city' | 'status' | 'type';

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  title,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn, direction?: 'asc' | 'desc') => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="flex min-w-0 items-center gap-1 rounded py-0.5 text-left outline-none hover:text-gray-900 focus:outline-none"
      title={title}
    >
      {label}
      {sortBy === column ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

function ClientRow({ c, onOpen }: { c: Client; onOpen: () => void }) {
  const avatarUrl = withFileAccessTokenIfNeeded(c.logo_url) || '/ui/assets/placeholders/customer.png';
  const status = String(c.client_status || '').trim();

  return (
    <div
      role="button"
      tabIndex={0}
      className={uiCx(
        'grid min-h-[52px] w-full cursor-pointer grid-cols-[40fr_10fr_25fr_10fr_15fr] items-center gap-2 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 sm:gap-3 lg:gap-4',
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={avatarUrl}
          className={uiCx('h-10 w-10 shrink-0 object-cover', uiRadius.control, uiBorders.subtle)}
          alt={c.display_name || c.name || 'Client logo'}
        />
        <div className="flex min-w-0 flex-col justify-center">
          <div className={uiCx(uiTypography.sectionTitle, 'truncate text-xs')}>{c.display_name || c.name || c.id}</div>
          {c.address_line1 ? (
            <div className={uiCx(uiTypography.helper, 'truncate text-[10px]')}>{String(c.address_line1)}</div>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center">
        <span className={uiCx(uiTypography.body, 'truncate text-xs')}>{c.code || '—'}</span>
      </div>
      <div className="flex min-w-0 items-center">
        <span className={uiCx(uiTypography.helper, 'truncate')}>
          {[c.city, c.province].filter(Boolean).join(', ') || '—'}
        </span>
      </div>
      <div className="flex min-w-0 items-center">
        {status ? (
          <AppBadge variant={getClientStatusBadgeVariant(status)} className="max-w-full truncate">
            {status}
          </AppBadge>
        ) : (
          <span className={uiTypography.helper}>—</span>
        )}
      </div>
      <div className="flex min-w-0 items-center">
        <AppBadge variant="neutral" className="max-w-full truncate normal-case tracking-normal">
          {String(c.client_type || '—')}
        </AppBadge>
      </div>
    </div>
  );
}


