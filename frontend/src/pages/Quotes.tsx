import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';

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

export default function Quotes(){
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const minValue = searchParams.get('min_value') || '';
  const queryParam = searchParams.get('q') || '';
  const clientIdParam = searchParams.get('client_id') || '';
  const dateStartParam = searchParams.get('date_start') || '';
  const dateEndParam = searchParams.get('date_end') || '';
  
  const [q, setQ] = useState(queryParam);
  const [minValueInput, setMinValueInput] = useState(minValue);
  const [minValueDisplay, setMinValueDisplay] = useState(minValue ? formatCurrency(minValue) : '');
  const [minValueFocused, setMinValueFocused] = useState(false);
  const [selectedClient, setSelectedClient] = useState(clientIdParam);
  const [dateStart, setDateStart] = useState(dateStartParam);
  const [dateEnd, setDateEnd] = useState(dateEndParam);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  
  // Sync URL params with state when URL changes
  useEffect(() => {
    const urlMinValue = searchParams.get('min_value') || '';
    const urlQ = searchParams.get('q') || '';
    const urlClient = searchParams.get('client_id') || '';
    const urlDateStart = searchParams.get('date_start') || '';
    const urlDateEnd = searchParams.get('date_end') || '';
    
    if (urlMinValue !== minValueInput) setMinValueInput(urlMinValue);
    if (urlQ !== q) setQ(urlQ);
    if (urlClient !== selectedClient) setSelectedClient(urlClient);
    if (urlDateStart !== dateStart) setDateStart(urlDateStart);
    if (urlDateEnd !== dateEnd) setDateEnd(urlDateEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Auto-apply filters when they change
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (minValueInput) params.set('min_value', minValueInput);
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    setSearchParams(params);
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minValueInput, selectedClient, dateStart, dateEnd]);
  
  const qs = useMemo(()=> {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (minValueInput) params.set('min_value', minValueInput);
    if (selectedClient) params.set('client_id', selectedClient);
    if (dateStart) params.set('date_start', dateStart);
    if (dateEnd) params.set('date_end', dateEnd);
    return params.toString() ? '?' + params.toString() : '';
  }, [q, minValueInput, selectedClient, dateStart, dateEnd]);
  
  const { data, isLoading, refetch } = useQuery({ 
    queryKey:['quotes', qs], 
    queryFn: ()=> api<Quote[]>('GET', `/quotes${qs}`)
  });
  
  // Show loading until quotes are loaded
  const isInitialLoading = isLoading && !data;
  
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
  const hasEditPermission = (me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('business:projects:write');

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Quotations</div>
          <div className="text-sm opacity-90">List, search and manage quotations.</div>
        </div>
        {hasEditPermission && (
          <Link to="/quotes/new" state={{ backgroundLocation: location }} className="px-4 py-2 rounded bg-white text-brand-red font-semibold">+ New Quote</Link>
        )}
      </div>
      {/* Advanced Search Panel */}
      <div className="mb-3 rounded-xl border bg-white shadow-sm overflow-hidden relative">
        {/* Main Search Bar */}
        {isFiltersCollapsed ? (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold text-gray-700">Show Filters</div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-white border-b">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Quotes</label>
                <div className="relative">
                  <input 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent text-gray-900" 
                    placeholder="Search by quote name, code, or client name..." 
                    value={q} 
                    onChange={e=>setQ(e.target.value)} 
                    onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters Row */}
        {!isFiltersCollapsed && (
          <div className="p-4 border-b bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Customer</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={selectedClient}
                  onChange={e=>setSelectedClient(e.target.value)}
                >
                  <option value="">All Customers</option>
                  {clients.map((client: any) => (
                    <option key={client.id} value={client.id}>
                      {client.display_name || client.name || client.code || client.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Min Value ($)</label>
                <input 
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  placeholder="$0.00" 
                  value={minValueFocused ? minValueDisplay : (minValueInput ? formatCurrency(minValueInput) : '')}
                  onFocus={() => {
                    setMinValueFocused(true);
                    setMinValueDisplay(minValueInput || '');
                  }}
                  onBlur={() => {
                    setMinValueFocused(false);
                    const parsed = parseCurrency(minValueDisplay);
                    setMinValueInput(parsed);
                    setMinValueDisplay(parsed);
                  }}
                  onChange={e=>{
                    const raw = e.target.value;
                    setMinValueDisplay(raw);
                  }}
                  onKeyDown={e=>{ if(e.key==='Enter') { e.currentTarget.blur(); refetch(); } }} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date (From)</label>
                <input 
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  value={dateStart} 
                  onChange={e=>setDateStart(e.target.value)} 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">End Date (To)</label>
                <input 
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white" 
                  value={dateEnd} 
                  onChange={e=>setDateEnd(e.target.value)} 
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isFiltersCollapsed && (
          <div className="p-4 bg-white border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {arr.length > 0 && (
                <span>Found {arr.length} quote{arr.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pr-10">
              <button 
                onClick={()=>{
                  setQ('');
                  setMinValueInput('');
                  setSelectedClient('');
                  setDateStart('');
                  setDateEnd('');
                  setSearchParams({});
                  refetch();
                }} 
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Collapse/Expand button - bottom right corner */}
        <button
          onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-tl-lg border-t border-l bg-white hover:bg-gray-50 transition-colors flex items-center justify-center shadow-sm"
          title={isFiltersCollapsed ? "Expand filters" : "Collapse filters"}
        >
          <svg 
            className={`w-4 h-4 text-gray-600 transition-transform ${!isFiltersCollapsed ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      <LoadingOverlay isLoading={isInitialLoading} text="Loading quotes...">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isLoading && !arr.length ? (
            <>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-xl" />
              ))}
            </>
          ) : arr.length > 0 ? (
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
        </div>
      </LoadingOverlay>
    </div>
  );
}

function QuoteListCard({ quote, employees, clientFiles }:{ quote: Quote, employees?: any[], clientFiles?: any[] }){
  const navigate = useNavigate();
  
  const clientName = quote.client_display_name || quote.client_name || '';
  const created = (quote.created_at || '').slice(0,10);
  const updated = (quote.updated_at || '').slice(0,10);
  
  // Get cover image
  const coverImage = useMemo(() => {
    const img = (clientFiles || []).find(f => String(f.category || '') === 'quote-cover-derived');
    return img ? `/files/${img.file_object_id}/thumbnail?w=400` : '/ui/assets/login/logo-light.svg';
  }, [clientFiles]);
  
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
      className="group rounded-xl border bg-white hover:shadow-lg transition-all overflow-hidden block flex flex-col h-full relative"
    >
      {/* Top section: Image + Header */}
      <div className="flex">
        {/* Image on the left */}
        <div className="w-40 h-40 flex-shrink-0 p-4">
          <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden relative">
            <img className="w-full h-full object-cover" src={coverImage} alt={documentType} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          </div>
        </div>
        
        {/* Header on the right */}
        <div className="flex-1 p-4 flex flex-col min-w-0">
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1 truncate">{clientName || 'No client'}</div>
            <div className="font-bold text-lg text-gray-900 group-hover:text-[#7f1010] transition-colors truncate mb-1">
              {documentType}
            </div>
            <div className="text-xs text-gray-600 truncate mb-2">{quote.code || quote.order_number || '—'}</div>
          </div>
        </div>
      </div>

      {/* Bottom section: Info */}
      <div className="px-4 pb-4">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-3">
          <div>
            <div className="text-xs text-gray-500">Created</div>
            <div className="font-medium text-gray-900">{created || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Updated</div>
            <div className="font-medium text-gray-900">{updated || '—'}</div>
          </div>
          <div className="truncate" title={estimatorName}>
            <div className="text-xs text-gray-500">Estimator</div>
            <div className="font-medium text-gray-900 text-xs">{estimatorName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Estimated Value</div>
            <div className="font-medium text-gray-900">
              {estimatedValue > 0 ? `$${estimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </div>
          </div>
        </div>

      </div>
    </Link>
  );
}
