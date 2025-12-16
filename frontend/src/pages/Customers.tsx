import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '@/components/ConfirmProvider';
import LoadingOverlay from '@/components/LoadingOverlay';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useSearchParams } from 'react-router-dom';

type Client = { id:string, name?:string, display_name?:string, code?:string, city?:string, province?:string, client_status?:string, client_type?:string, address_line1?:string, created_at?:string, logo_url?:string };

type ClientsResponse = {
  items: Client[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export default function Customers(){
  const nav = useNavigate();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get initial values from URL params
  const queryParam = searchParams.get('q') || '';
  const cityParam = searchParams.get('city') || '';
  const statusParam = searchParams.get('status') || '';
  const typeParam = searchParams.get('type') || '';
  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  
  const [q, setQ] = useState(queryParam);
  const [city, setCity] = useState(cityParam);
  const [status, setStatus] = useState(statusParam);
  const [ctype, setCtype] = useState(typeParam);
  const [page, setPage] = useState(pageParam);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('Canada');
  const [selectedProvince, setSelectedProvince] = useState('BC');
  const limit = 10;
  
  // Load available locations from clients (for all filters - countries, provinces, cities)
  const { data: locationsData } = useQuery({ 
    queryKey:['client-locations'], 
    queryFn: ()=>api<any>('GET','/clients/locations'),
    staleTime: 300_000
  });
  
  // Initialize country/province from city if city is set
  useEffect(() => {
    if (city && locationsData) {
      // Try to find the country and province for the selected city
      for (const country in locationsData) {
        for (const province in locationsData[country]) {
          if (locationsData[country][province].includes(city)) {
            setSelectedCountry(country);
            setSelectedProvince(province);
            return;
          }
        }
      }
    }
  }, [city, locationsData]);
  
  // Sync URL params with state when URL changes
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlCity = searchParams.get('city') || '';
    const urlStatus = searchParams.get('status') || '';
    const urlType = searchParams.get('type') || '';
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    
    if (urlQ !== q) setQ(urlQ);
    if (urlCity !== city) setCity(urlCity);
    if (urlStatus !== status) setStatus(urlStatus);
    if (urlType !== ctype) setCtype(urlType);
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
  const handleCityChange = (value: string) => {
    setCity(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('city', value);
    else params.delete('city');
    params.set('page', '1');
    setSearchParams(params);
  };
  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('status', value);
    else params.delete('status');
    params.set('page', '1');
    setSearchParams(params);
  };
  const handleCtypeChange = (value: string) => {
    setCtype(value);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (value) params.set('type', value);
    else params.delete('type');
    params.set('page', '1');
    setSearchParams(params);
  };
  
  const queryString = useMemo(()=>{
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    // Only apply city filter when advanced filters is open
    if (showAdvanced && city) p.set('city', city);
    if (status) p.set('status', status);
    if (ctype) p.set('type', ctype);
    p.set('page', String(page));
    p.set('limit', String(limit));
    return p.toString();
  }, [q, city, status, ctype, page, limit, showAdvanced]);
  
  const { data, isLoading, refetch, isFetching } = useQuery({ 
    queryKey:['clients', queryString], 
    queryFn: ()=>api<ClientsResponse>('GET', `/clients?${queryString}`) 
  });
  
  const { data:settings, isLoading: settingsLoading } = useQuery({ queryKey:['settings'], queryFn: ()=>api<any>('GET','/settings') });
  
  // Check if we're still loading initial data (only show overlay if no data yet)
  const isInitialLoading = (isLoading && !data) || (settingsLoading && !settings);
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
  
  // Organize locations data (countries, provinces, cities from actual clients only)
  const locations = locationsData || {};
  
  // Extract unique countries from locations data
  const allCountries = useMemo(() => {
    return Object.keys(locations).sort();
  }, [locations]);
  
  // Extract provinces for selected country
  const allProvinces = useMemo(() => {
    if (!selectedCountry || !locations[selectedCountry]) return [];
    return Object.keys(locations[selectedCountry]).sort();
  }, [selectedCountry, locations]);
  
  // Extract cities for selected country and province
  const cities = useMemo(() => {
    if (!selectedCountry || !selectedProvince || !locations[selectedCountry]?.[selectedProvince]) return [];
    return locations[selectedCountry][selectedProvince].sort();
  }, [selectedCountry, selectedProvince, locations]);
  
  // Initialize default values when advanced filters is opened and locations data is loaded
  useEffect(() => {
    if (showAdvanced && locationsData && Object.keys(locationsData).length > 0 && !city) {
      // Set default to Canada/BC if available
      if ('Canada' in locationsData) {
        if (selectedCountry !== 'Canada') {
          setSelectedCountry('Canada');
        }
        if (locationsData['Canada'] && 'BC' in locationsData['Canada']) {
          if (selectedProvince !== 'BC') {
            setSelectedProvince('BC');
          }
        } else if (locationsData['Canada']) {
          const firstProvince = Object.keys(locationsData['Canada']).sort()[0];
          if (firstProvince && selectedProvince !== firstProvince) {
            setSelectedProvince(firstProvince);
          }
        }
      } else {
        const firstCountry = Object.keys(locationsData).sort()[0];
        if (firstCountry && selectedCountry !== firstCountry) {
          setSelectedCountry(firstCountry);
          if (locationsData[firstCountry]) {
            const firstProvince = Object.keys(locationsData[firstCountry]).sort()[0];
            if (firstProvince) setSelectedProvince(firstProvince);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdvanced, locationsData]);
  
  // Reset province and city when country changes (only if not already set from city)
  useEffect(() => {
    if (selectedCountry && locations[selectedCountry] && !city) {
      const firstProvince = Object.keys(locations[selectedCountry]).sort()[0];
      if (firstProvince && firstProvince !== selectedProvince) {
        setSelectedProvince(firstProvince);
      }
    }
  }, [selectedCountry, locations, city]);
  
  // Reset city when province changes (only if city is not in the new province)
  useEffect(() => {
    if (selectedProvince && city && locations[selectedCountry]?.[selectedProvince]) {
      if (!locations[selectedCountry][selectedProvince].includes(city)) {
        setCity('');
      }
    }
  }, [selectedProvince, selectedCountry, locations]);

  return (
    <div>
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4 flex items-center justify-between">
        <div>
          <div className="text-2xl font-extrabold">Customers</div>
          <div className="text-sm opacity-90">Manage your customer list and sites</div>
        </div>
        <Link to="/customers/new" className="px-4 py-2 rounded bg-white text-brand-red font-semibold">+ New Customer</Link>
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
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Customers</label>
                <div className="relative">
                  <input 
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent text-gray-900" 
                    placeholder="Search by name, display name, or code..." 
                    value={q} 
                    onChange={e=>handleQChange(e.target.value)} 
                    onKeyDown={e=>{ if(e.key==='Enter') refetch(); }} 
                  />
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              {!isFiltersCollapsed && (
                <div className="flex items-end gap-2 pt-6">
                  <button 
                    onClick={()=>{
                      const newValue = !showAdvanced;
                      setShowAdvanced(newValue);
                      // Clear city filter when closing advanced filters
                      if (!newValue && city) {
                        setCity('');
                        const params = new URLSearchParams(searchParams);
                        params.delete('city');
                        setSearchParams(params);
                      }
                    }}
                    className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <svg className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Advanced Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Filters Row */}
        {!isFiltersCollapsed && (
          <div className="p-4 border-b bg-gray-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={status}
                  onChange={e=>handleStatusChange(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {clientStatuses.map((s: any) => (
                    <option key={s.id || s.value || s.label} value={s.id || s.value || ''}>
                      {s.label || s.value || s.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={ctype}
                  onChange={e=>handleCtypeChange(e.target.value)}
                >
                  <option value="">All Types</option>
                  {clientTypes.map((t: any) => (
                    <option key={t.id || t.value || t.label} value={t.id || t.value || ''}>
                      {t.label || t.value || t.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Filters (Collapsible) */}
        {!isFiltersCollapsed && showAdvanced && (
          <div className="p-4 bg-gray-50 border-t animate-in slide-in-from-top duration-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Country</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white"
                  value={selectedCountry}
                  onChange={e=>{
                    setSelectedCountry(e.target.value);
                    setCity(''); // Reset city when country changes
                    const params = new URLSearchParams(searchParams);
                    params.delete('city');
                    setSearchParams(params);
                  }}
                  disabled={!locationsData || allCountries.length === 0}
                >
                  {!locationsData ? (
                    <option value="">Loading...</option>
                  ) : allCountries.length === 0 ? (
                    <option value="">No countries available</option>
                  ) : (
                    allCountries.map(country => (
                      <option key={country} value={country}>{country}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Province / State</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  value={selectedProvince}
                  onChange={e=>{
                    setSelectedProvince(e.target.value);
                    setCity(''); // Reset city when province changes
                    const params = new URLSearchParams(searchParams);
                    params.delete('city');
                    setSearchParams(params);
                  }}
                  disabled={!selectedCountry || allProvinces.length === 0}
                >
                  {allProvinces.length === 0 ? (
                    <option value="">{selectedCountry ? 'No provinces available' : 'Select Province...'}</option>
                  ) : (
                    <>
                      <option value="">Select Province...</option>
                      {allProvinces.map(province => (
                        <option key={province} value={province}>{province}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">City</label>
                <select 
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  value={city}
                  onChange={e=>handleCityChange(e.target.value)}
                  disabled={!selectedProvince || cities.length === 0}
                >
                  <option value="">All Cities</option>
                  {cities.map(cityName => (
                    <option key={cityName} value={cityName}>{cityName}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isFiltersCollapsed && (
          <div className="p-4 bg-white border-t flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {data && data.total > 0 && (
                <span>Found {data.total} customer{data.total !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-2 pr-10">
              {isFetching && (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm text-gray-600">Loading...</span>
                </div>
              )}
              <button 
                onClick={()=>{
                  setQ('');
                  setStatus('');
                  setCtype('');
                  setCity('');
                  const params = new URLSearchParams();
                  params.set('page', '1');
                  setSearchParams(params);
                  setPage(1);
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

      <LoadingOverlay isLoading={isInitialLoading} text="Loading customers...">
        <div className="rounded-xl border bg-white">
          <div className="divide-y">
            {(data?.items || []).map(c => (
              <ClientRow key={c.id} c={c} statusColorMap={statusColorMap} onOpen={()=> nav(`/customers/${encodeURIComponent(c.id)}`)} onDeleted={()=> refetch()} />
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
    </div>
  );
}

function ClientRow({ c, statusColorMap, onOpen, onDeleted }:{ c: Client, statusColorMap: Record<string,string>, onOpen: ()=>void, onDeleted: ()=>void }){
  // Use logo_url from the client data (loaded together with the client list)
  const avatarUrl = c.logo_url || '/ui/assets/login/logo-light.svg';
  const status = String(c.client_status||'').trim();
  const color = status ? (statusColorMap[status] || '') : '';
  const badgeStyle: any = color ? { backgroundColor: color, borderColor: 'transparent', color: '#000' } : {};
  const confirm = useConfirm();
  return (
    <div className="p-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer" onClick={onOpen}>
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
        <button className="ml-2 px-3 py-1.5 rounded bg-brand-red text-white hover:bg-red-700" title="Delete customer" onClick={async()=>{
          const ok = await confirm({ title: 'Delete customer', message: 'Are you sure you want to delete this customer? This action cannot be undone.' });
          if (!ok) return;
          try{ await api('DELETE', `/clients/${encodeURIComponent(c.id)}`); onDeleted(); }catch(_e){}
        }}>Delete</button>
      </div>
    </div>
  );
}


