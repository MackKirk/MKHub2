import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import FilterBuilderModal from '@/components/FilterBuilder/FilterBuilderModal';
import FilterChip from '@/components/FilterBuilder/FilterChip';
import { FilterRule, FieldConfig } from '@/components/FilterBuilder/types';

type Quote = { 
  id:string, 
  code?:string, 
  name?:string, 
  client_id?:string, 
  created_at?:string, 
  updated_at?:string,
  estimator_id?:string,
  project_division_ids?:string[],
  client_name?:string,
  client_display_name?:string,
  order_number?:string,
  document_type?:string,
  estimated_value?:number,
  data?:any,
};

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
    'client': ['client_id', 'client_id_not'],
    'creation_date': ['creation_date_start', 'creation_date_end'],
    'update_date': ['update_date_start', 'update_date_end'],
    'estimator': ['estimator_id', 'estimator_id_not'],
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
      case 'client':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is') {
            params.set('client_id', rule.value);
          } else if (rule.operator === 'is_not') {
            params.set('client_id_not', rule.value);
          }
        }
        break;
      
      case 'creation_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('creation_date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('creation_date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('creation_date_start', rule.value);
            params.set('creation_date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('creation_date_start', rule.value[0]);
          params.set('creation_date_end', rule.value[1]);
        }
        break;
      
      case 'update_date':
        if (typeof rule.value === 'string') {
          if (rule.operator === 'is_before') {
            params.set('update_date_end', rule.value);
          } else if (rule.operator === 'is_after') {
            params.set('update_date_start', rule.value);
          } else if (rule.operator === 'is' && rule.value) {
            params.set('update_date_start', rule.value);
            params.set('update_date_end', rule.value);
          }
        } else if (Array.isArray(rule.value) && rule.operator === 'is_between') {
          params.set('update_date_start', rule.value[0]);
          params.set('update_date_end', rule.value[1]);
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
  
  // Client
  const client = params.get('client_id');
  const clientNot = params.get('client_id_not');
  if (client) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is', value: client });
  } else if (clientNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'client', operator: 'is_not', value: clientNot });
  }
  
  // Creation Date range
  const creationDateStart = params.get('creation_date_start');
  const creationDateEnd = params.get('creation_date_end');
  if (creationDateStart && creationDateEnd) {
    if (creationDateStart === creationDateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is', value: creationDateStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is_between', value: [creationDateStart, creationDateEnd] });
    }
  } else if (creationDateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is_after', value: creationDateStart });
  } else if (creationDateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'creation_date', operator: 'is_before', value: creationDateEnd });
  }
  
  // Update Date range
  const updateDateStart = params.get('update_date_start');
  const updateDateEnd = params.get('update_date_end');
  if (updateDateStart && updateDateEnd) {
    if (updateDateStart === updateDateEnd) {
      rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is', value: updateDateStart });
    } else {
      rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is_between', value: [updateDateStart, updateDateEnd] });
    }
  } else if (updateDateStart) {
    rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is_after', value: updateDateStart });
  } else if (updateDateEnd) {
    rules.push({ id: `rule-${idCounter++}`, field: 'update_date', operator: 'is_before', value: updateDateEnd });
  }
  
  // Estimator
  const estimator = params.get('estimator_id');
  const estimatorNot = params.get('estimator_id_not');
  if (estimator) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is', value: estimator });
  } else if (estimatorNot) {
    rules.push({ id: `rule-${idCounter++}`, field: 'estimator', operator: 'is_not', value: estimatorNot });
  }
  
  // Value range
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

export default function Quotes(){
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  
  const [q, setQ] = useState(queryParam);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  
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
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams(searchParams);
    return params.toString() ? '?' + params.toString() : '';
  }, [searchParams]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['quotes', qs], 
    queryFn: ()=> api<Quote[]>('GET', `/quotes${qs}`)
  });
  
  // Show loading until quotes are loaded
  const isInitialLoading = isLoading && !data;
  
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
  
  // Get employees for estimator names
  const { data: employees } = useQuery({ 
    queryKey:['employees'], 
    queryFn: ()=> api<any[]>('GET','/employees'), 
    staleTime: 300_000
  });
  
  // Get client files for cover images (batch load for all quotes)
  const clientIds = useMemo(() => {
    const ids = new Set<string>();
    (data || []).forEach((q: Quote) => {
      if (q.client_id) ids.add(q.client_id);
    });
    return Array.from(ids);
  }, [data]);
  
  const { data: allClientFiles } = useQuery({ 
    queryKey:['clientFilesForQuotes', clientIds.join(',')], 
    queryFn: async () => {
      const filesMap: Record<string, any[]> = {};
      await Promise.all(
        clientIds.map(async (clientId) => {
          try {
            const files = await api<any[]>('GET', `/clients/${encodeURIComponent(clientId)}/files`);
            filesMap[clientId] = files || [];
          } catch {
            filesMap[clientId] = [];
          }
        })
      );
      return filesMap;
    },
    enabled: clientIds.length > 0,
    staleTime: 300_000
  });
  
  const clients = clientsData?.items || clientsData || [];
  const arr = data||[];

  // Check permissions
  const { data: me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const isAdmin = (me?.roles||[]).includes('admin');
  const permissions = new Set(me?.permissions || []);
  const hasViewPermission = isAdmin || permissions.has('sales:quotations:read');
  const hasEditPermission = isAdmin || permissions.has('sales:quotations:write');

  // Filter Builder Configuration
  const filterFields: FieldConfig[] = useMemo(() => [
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
      id: 'creation_date',
      label: 'Creation Date',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'update_date',
      label: 'Update Date',
      type: 'date',
      operators: ['is', 'is_before', 'is_after', 'is_between'],
    },
    {
      id: 'estimator',
      label: 'Estimator',
      type: 'select',
      operators: ['is', 'is_not'],
      getOptions: () => (employees || []).map((emp: any) => ({ 
        value: emp.id, 
        label: emp.name || emp.username || emp.id 
      })),
    },
    {
      id: 'value',
      label: 'Value',
      type: 'number',
      operators: ['is_equal_to', 'greater_than', 'less_than', 'between'],
    },
  ], [clients, employees]);

  const handleApplyFilters = (rules: FilterRule[]) => {
    const params = convertRulesToParams(rules);
    if (q) params.set('q', q);
    setSearchParams(params);
    refetch();
  };

  const hasActiveFilters = currentRules.length > 0;

  // Helper to format rule value for display
  const formatRuleValue = (rule: FilterRule): string => {
    if (rule.field === 'client') {
      const client = clients.find((c: any) => String(c.id) === rule.value);
      return client?.display_name || client?.name || String(rule.value);
    }
    if (rule.field === 'creation_date' || rule.field === 'update_date') {
      if (Array.isArray(rule.value)) {
        return `${rule.value[0]} → ${rule.value[1]}`;
      }
      return String(rule.value);
    }
    if (rule.field === 'estimator') {
      const emp = (employees || []).find((e: any) => String(e.id) === rule.value);
      return emp?.name || emp?.username || String(rule.value);
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

  if (!hasViewPermission) {
    return (
      <div className="text-center py-12 text-gray-500">
        You do not have permission to view quotations.
      </div>
    );
  }

  return (
    <div>
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Quotations</div>
          <div className="text-sm text-gray-500 font-medium">List, search and manage quotations</div>
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
                  placeholder="Search by quote name, code, or client name..." 
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
      <LoadingOverlay isLoading={isInitialLoading} text="Loading quotes...">
        <div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4"
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
          ) : (
            <>
              {hasEditPermission && (
                <Link
                  to="/quotes/new"
                  state={{ backgroundLocation: location }}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex flex-col items-center justify-center min-h-[200px]"
                >
                  <div className="text-4xl text-gray-400 mb-2">+</div>
                  <div className="font-medium text-sm text-gray-700">New Quote</div>
                  <div className="text-xs text-gray-500 mt-1">Add new quote</div>
                </Link>
              )}
              {arr.length > 0 ? (
                arr.map(quote => (
                  <QuoteListCard 
                    key={quote.id} 
                    quote={quote} 
                    employees={employees}
                    clientFiles={allClientFiles?.[quote.client_id || ''] || []}
                  />
                ))
              ) : (
                <div className="col-span-2 p-8 text-center text-gray-500 rounded-xl border bg-white">
                  No quotes found matching your criteria.
                </div>
              )}
            </>
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
    </div>
  );
}

function QuoteListCard({ quote, employees, clientFiles }:{ quote: Quote, employees?: any[], clientFiles?: any[] }){
  const navigate = useNavigate();
  
  const clientName = quote.client_display_name || quote.client_name || '';
  const created = (quote.created_at || '').slice(0,10);
  const updated = (quote.updated_at || '').slice(0,10);
  
  // Get estimator name
  const estimator = employees?.find((e: any) => String(e.id) === String(quote.estimator_id));
  const estimatorName = estimator?.name || estimator?.username || '—';
  
  // Get estimated value from quote data - use the displayTotal (grandTotal) from Pricing section
  // This is the "Total" shown in the Pricing section of the form
  const estimatedValue = useMemo(() => {
    if (quote.estimated_value !== undefined && quote.estimated_value !== null) {
      const v = Number(quote.estimated_value);
      if (!isNaN(v) && v > 0) return v;
    }
    if (!quote.data) return 0;
    const data = quote.data;
    
    // First, try to use display_total if it was saved (new quotes will have this)
    if (data.display_total !== undefined && data.display_total !== null && data.display_total !== '') {
      const displayTotal = Number(data.display_total);
      if (!isNaN(displayTotal) && displayTotal > 0) {
        return displayTotal;
      }
    }
    
    // Fallback: Calculate the grandTotal (displayTotal) from Pricing section
    // This matches the "Total" shown in the Pricing section of the form
    const totalNum = Number(data.total || 0);
    const pstRate = Number(data.pst_rate || 0);
    const gstRate = Number(data.gst_rate || 0);
    
    // Get additional_costs (pricingItems) to calculate PST and GST
    const additionalCosts = Array.isArray(data.additional_costs) ? data.additional_costs : [];
    
    // If no additional costs and no total, try fallback values
    if (additionalCosts.length === 0) {
      if (totalNum > 0) {
        return totalNum;
      }
      return Number(data.bid_price || data.estimate_total_estimate || 0);
    }
    
    // Calculate PST only on items marked for PST
    const totalForPst = additionalCosts
      .filter((c: any) => c.pst === true)
      .reduce((a: number, c: any) => a + Number(c.value || 0), 0);
    const pst = totalForPst * (pstRate / 100);
    
    // Calculate GST only on items marked for GST
    const totalForGst = additionalCosts
      .filter((c: any) => c.gst === true)
      .reduce((a: number, c: any) => a + Number(c.value || 0), 0);
    const gst = totalForGst * (gstRate / 100);
    
    // Calculate subtotal = Total Direct Costs + PST
    const subtotal = totalNum + pst;
    
    // Calculate grandTotal = Sub-total + GST (this is the displayTotal shown in Pricing)
    const grandTotal = subtotal + gst;
    
    // Return grandTotal if it's greater than 0, otherwise try fallback values
    if (!isNaN(grandTotal) && grandTotal > 0) {
      return grandTotal;
    }
    
    // If grandTotal is 0 but we have totalNum, return totalNum (might be a quote without taxes)
    if (totalNum > 0) {
      return totalNum;
    }
    
    // Final fallback to other fields
    return Number(data.bid_price || data.estimate_total_estimate || 0);
  }, [quote.data]);
  
  // Get document type from data.cover_title or title, default to 'Quotation'
  const documentType = useMemo(() => {
    if (quote.document_type && String(quote.document_type).trim()) {
      return String(quote.document_type);
    }
    return (quote.data?.cover_title || quote.title || 'Quotation');
  }, [quote.data, quote.title, quote.document_type]);

  return (
    <Link 
      to={`/quotes/${encodeURIComponent(String(quote.id))}`} 
      className="group rounded-xl border bg-white hover:border-gray-200 hover:shadow-md hover:-translate-y-0.5 block h-full transition-all duration-200 relative"
    >
      <div className="p-4 flex flex-col gap-3">
        {/* Header (no image) */}
        <div className="min-w-0">
          <div className="text-xs text-gray-500 truncate min-w-0">{clientName || 'No client'}</div>
          <div className="min-w-0">
            <div className="font-semibold text-base text-gray-900 group-hover:text-[#7f1010] transition-colors whitespace-normal break-words">
              {documentType}
            </div>
            <div className="text-xs text-gray-600 break-words">{quote.code || quote.order_number || '—'}</div>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-black/5" />

        {/* Info grid (same info as before, simple text) */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Created</div>
            <div className="font-medium text-gray-900 truncate">{created || '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Updated</div>
            <div className="font-medium text-gray-900 truncate">{updated || '—'}</div>
          </div>
          <div className="min-w-0 truncate" title={estimatorName}>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900 text-xs">{estimatorName}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-semibold text-[#7f1010] truncate">
              {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
