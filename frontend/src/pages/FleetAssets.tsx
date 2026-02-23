import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { FleetAssetNewForm } from './FleetAssetNew';

type FleetAsset = {
  id: string;
  asset_type: string;
  name: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  body_style?: string;
  status: string;
  odometer_current?: number;
  hours_current?: number;
  driver_id?: string;
  fuel_type?: string;
  vehicle_type?: string;
  yard_location?: string;
  created_at: string;
};

type FleetAssetsResponse = {
  items: FleetAsset[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  fuel_type_options: string[];
};

export default function FleetAssets() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fuelTypeFilter, setFuelTypeFilter] = useState<string>('all');
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);
  
  // Get initial type from URL or path
  const getInitialType = () => {
    const pathname = window.location.pathname;
    if (pathname.includes('/vehicles')) return 'vehicle';
    if (pathname.includes('/heavy-machinery')) return 'heavy_machinery';
    if (pathname.includes('/other-assets')) return 'other';
    const urlType = searchParams.get('type');
    return urlType || 'all';
  };
  
  const [typeFilter, setTypeFilter] = useState<string>(getInitialType());

  const pageParam = parseInt(searchParams.get('page') || '1', 10);
  const [page, setPage] = useState(pageParam);
  const limit = 15;

  // List sort (from URL, client-side on current page) - same pattern as Customers
  type SortColumn = 'unit_number' | 'name' | 'type' | 'make_model' | 'year' | 'plate_vin' | 'fuel_type' | 'vehicle_type' | 'sleeps' | 'assignment' | 'status';
  const sortBy = (searchParams.get('sort') as SortColumn) || 'name';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';
  const setListSort = (column: SortColumn, direction?: 'asc' | 'desc') => {
    const params = new URLSearchParams(searchParams);
    const nextDir = direction ?? (sortBy === column && sortDir === 'asc' ? 'desc' : 'asc');
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1'); // always go to page 1 when sort changes (affects all pages)
    setPage(1);
    setSearchParams(params, { replace: true });
  };

  // Update type filter and page when URL params change
  useEffect(() => {
    const urlType = searchParams.get('type');
    const pathname = window.location.pathname;
    const urlPage = parseInt(searchParams.get('page') || '1', 10);
    let newType = 'all';

    if (urlType) newType = urlType;
    else if (pathname.includes('/vehicles')) newType = 'vehicle';
    else if (pathname.includes('/heavy-machinery')) newType = 'heavy_machinery';
    else if (pathname.includes('/other-assets')) newType = 'other';

    setTypeFilter(prev => prev !== newType ? newType : prev);
    if (urlPage !== page) setPage(urlPage);
  }, [searchParams]);
  
  // Update URL when type filter changes (reset page to 1)
  const handleTypeFilterChange = (type: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', '1');
    setPage(1);
    if (type === 'all') {
      newParams.delete('type');
      const currentPath = window.location.pathname;
      if (currentPath !== '/fleet/assets' && !currentPath.includes('/fleet/assets/')) {
        nav('/fleet/assets');
        setTimeout(() => setTypeFilter(type), 0);
        return;
      }
    } else {
      newParams.set('type', type);
    }
    setTypeFilter(type);
    setSearchParams(newParams, { replace: true });
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['fleetAssets', typeFilter, search, statusFilter, fuelTypeFilter, sortBy, sortDir, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('asset_type', typeFilter);
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (fuelTypeFilter !== 'all') params.append('fuel_type', fuelTypeFilter);
      params.set('sort', sortBy);
      params.set('dir', sortDir);
      params.set('page', String(page));
      params.set('limit', String(limit));
      return api<FleetAssetsResponse>('GET', `/fleet/assets?${params.toString()}`);
    },
  });

  const assets = data?.items ?? [];
  const fuelTypeOptions = data?.fuel_type_options ?? [];

  // Reset page to 1 when search or filters change (via debounced effect)
  const prevFiltersRef = useRef({ search, statusFilter, fuelTypeFilter });
  useEffect(() => {
    const changed =
      prevFiltersRef.current.search !== search ||
      prevFiltersRef.current.statusFilter !== statusFilter ||
      prevFiltersRef.current.fuelTypeFilter !== fuelTypeFilter;
    if (changed) {
      prevFiltersRef.current = { search, statusFilter, fuelTypeFilter };
      setPage(1);
      const params = new URLSearchParams(searchParams);
      params.set('page', '1');
      setSearchParams(params, { replace: true });
    }
  }, [search, statusFilter, fuelTypeFilter]);

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
  };

  const typeLabels: Record<string, string> = {
    vehicle: 'Vehicles',
    heavy_machinery: 'Heavy Machinery',
    other: 'Other Assets',
    all: 'All Fleet Assets',
  };

  const getTypeLabel = (type: string) => {
    return typeLabels[type] || type;
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // When New Asset modal is open: prevent body scroll and ESC to close
  useEffect(() => {
    if (!showNewAssetModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowNewAssetModal(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewAssetModal]);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div>
              <div className="text-sm font-semibold text-gray-900">{getTypeLabel(typeFilter)}</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage fleet assets</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar - same layout as Customers */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex gap-1 border-b border-gray-200 px-0 pt-0 pb-3 mb-3">
          <button
            onClick={() => handleTypeFilterChange('all')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'all' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleTypeFilterChange('vehicle')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'vehicle' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Vehicles
          </button>
          <button
            onClick={() => handleTypeFilterChange('heavy_machinery')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'heavy_machinery' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Heavy Machinery
          </button>
          <button
            onClick={() => handleTypeFilterChange('other')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              typeFilter === 'other' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Other Assets
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, VIN, plate, or model..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pl-9 text-sm bg-gray-50/50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 focus:bg-white transition-all duration-150"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
          {(typeFilter === 'vehicle' || typeFilter === 'all') && fuelTypeOptions.length > 0 && (
            <select
              value={fuelTypeFilter}
              onChange={e => setFuelTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
            >
              <option value="all">All Fuel Types</option>
              {fuelTypeOptions.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowNewAssetModal(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Asset
          </button>
        </div>
      </div>

      {/* List - same visual as Customers: rounded-xl, sortable column headers, grid rows */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading assets...</div>
        ) : (assets.length > 0 ? (
          <>
            <div className="flex flex-col gap-0 overflow-x-auto">
              {/* Sortable column headers - 11 columns to match Customers style */}
              <div
                className="grid items-center px-4 py-2 w-full text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[900px]"
                style={{ gridTemplateColumns: '6fr 14fr 8fr 14fr 5fr 10fr 8fr 8fr 6fr 10fr 8fr' }}
                role="row"
              >
                <button type="button" onClick={() => setListSort('unit_number')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by unit number">Unit #{sortBy === 'unit_number' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('name')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by name">Name{sortBy === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('type')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by type">Type{sortBy === 'type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('make_model')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by make/model">Make/Model{sortBy === 'make_model' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('year')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by year">Year{sortBy === 'year' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('plate_vin')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by plate/VIN">Plate/VIN{sortBy === 'plate_vin' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('fuel_type')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by fuel type">Fuel Type{sortBy === 'fuel_type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('vehicle_type')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by vehicle type">Vehicle Type{sortBy === 'vehicle_type' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('sleeps')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by sleeps">Sleeps{sortBy === 'sleeps' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('assignment')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by assignment">Assignment{sortBy === 'assignment' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
                <button type="button" onClick={() => setListSort('status')} className="min-w-0 text-left flex items-center gap-1 hover:text-gray-900 rounded py-0.5 outline-none focus:outline-none" title="Sort by status">Status{sortBy === 'status' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
              </div>
              <div className="rounded-b-lg border-t-0 border-gray-200 overflow-hidden min-w-0">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="grid items-center px-4 py-3 w-full hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 min-h-[52px] min-w-[900px]"
                    style={{ gridTemplateColumns: '6fr 14fr 8fr 14fr 5fr 10fr 8fr 8fr 6fr 10fr 8fr' }}
                    onClick={() => nav(`/fleet/assets/${asset.id}`)}
                  >
                    <div className="min-w-0 text-xs text-gray-600 truncate">{asset.unit_number || '—'}</div>
                    <div className="min-w-0 text-xs font-medium text-gray-900 truncate">{asset.name || '—'}</div>
                    <div className="min-w-0">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                        {asset.asset_type === 'vehicle' ? 'Vehicle' : asset.asset_type === 'heavy_machinery' ? 'Heavy Machinery' : 'Other'}
                      </span>
                    </div>
                    <div className="min-w-0 text-xs text-gray-600 truncate">
                      {asset.make && asset.model ? `${asset.make} ${asset.model}` : asset.make || asset.model || '—'}
                    </div>
                    <div className="min-w-0 text-xs text-gray-600">{asset.year ?? '—'}</div>
                    <div className="min-w-0 text-xs text-gray-600 truncate">{asset.license_plate || asset.vin || '—'}</div>
                    <div className="min-w-0 text-xs text-gray-600 truncate">{asset.fuel_type || '—'}</div>
                    <div className="min-w-0 text-xs text-gray-600 truncate">{asset.vehicle_type || '—'}</div>
                    <div className="min-w-0 text-xs text-gray-600 truncate">{asset.yard_location || '—'}</div>
                    <div className="min-w-0">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${asset.driver_id ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                        {asset.driver_id ? 'Assigned' : 'Available'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>
                        {asset.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination Controls */}
            {data && data.total > 0 && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  Showing {((data.page - 1) * data.limit) + 1} to {Math.min(data.page * data.limit, data.total)} of {data.total} assets
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
          </>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No {typeFilter === 'all' ? 'assets' : getTypeLabel(typeFilter).toLowerCase()} found
          </div>
        ))}
      </div>

      {/* New Asset Modal - same visual as New Site (SiteDetail) */}
      {showNewAssetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewAssetModal(false)}
        >
          <div
            className="w-[900px] max-w-[95vw] max-h-[90vh] bg-gray-100 rounded-xl overflow-hidden flex flex-col border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-t-xl border-b border-gray-200 bg-white p-4 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewAssetModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Asset</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new fleet asset</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <FleetAssetNewForm
                initialAssetType={typeFilter === 'all' ? 'vehicle' : typeFilter}
                onSuccess={(data) => {
                  setShowNewAssetModal(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssets'] });
                  nav(`/fleet/assets/${data.id}`);
                }}
                onCancel={() => setShowNewAssetModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

