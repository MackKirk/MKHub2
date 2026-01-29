import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

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
  created_at: string;
};

export default function FleetAssets() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
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

  // Update type filter when URL param or path changes (only on mount or when navigating)
  useEffect(() => {
    const urlType = searchParams.get('type');
    const pathname = window.location.pathname;
    let newType = 'all';
    
    // Priority: URL param > pathname
    if (urlType) {
      newType = urlType;
    } else if (pathname.includes('/vehicles')) {
      newType = 'vehicle';
    } else if (pathname.includes('/heavy-machinery')) {
      newType = 'heavy_machinery';
    } else if (pathname.includes('/other-assets')) {
      newType = 'other';
    }
    
    // Only update if different to avoid unnecessary re-renders
    setTypeFilter(prev => prev !== newType ? newType : prev);
  }, [searchParams]);
  
  // Update URL when type filter changes
  const handleTypeFilterChange = (type: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (type === 'all') {
      newParams.delete('type');
      // Navigate to /fleet/assets if on a specific type route
      const currentPath = window.location.pathname;
      if (currentPath !== '/fleet/assets' && !currentPath.includes('/fleet/assets/')) {
        nav('/fleet/assets');
        // Set filter after navigation
        setTimeout(() => setTypeFilter(type), 0);
        return;
      }
    } else {
      newParams.set('type', type);
    }
    // Update filter first, then URL params
    setTypeFilter(type);
    setSearchParams(newParams, { replace: true });
  };

  const { data: assets, isLoading } = useQuery({
    queryKey: ['fleetAssets', typeFilter, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.append('asset_type', typeFilter);
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      return api<FleetAsset[]>('GET', `/fleet/assets?${params.toString()}`);
    },
  });

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

      {/* Tabs + Filter Bar - connects to table below with single border */}
      <div className="rounded-t-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-4 pt-2">
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
        <div className="px-4 py-3 flex gap-3 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search by name, VIN, plate, or model..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
          <button
            onClick={() => nav(`/fleet/assets/new?type=${typeFilter === 'all' ? 'vehicle' : typeFilter}`)}
            className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Asset
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white overflow-hidden min-w-0">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading assets...</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left">Unit #</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Make/Model</th>
                <th className="p-3 text-left">Year</th>
                <th className="p-3 text-left">Plate/VIN</th>
                {typeFilter === 'vehicle' || typeFilter === 'all' ? (
                  <th className="p-3 text-left">Odometer</th>
                ) : null}
                {(typeFilter === 'heavy_machinery' || typeFilter === 'other' || typeFilter === 'all') ? (
                  <th className="p-3 text-left">Hours</th>
                ) : null}
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(assets || []).map(asset => (
                <tr
                  key={asset.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/fleet/assets/${asset.id}`)}
                >
                  <td className="p-3 text-gray-600">{asset.unit_number || '-'}</td>
                  <td className="p-3 font-medium">{asset.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                      {asset.asset_type === 'vehicle' ? 'Vehicle' : 
                       asset.asset_type === 'heavy_machinery' ? 'Heavy Machinery' : 
                       'Other'}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">
                    {asset.make && asset.model ? `${asset.make} ${asset.model}` : 
                     asset.make ? asset.make : 
                     asset.model ? asset.model : '-'}
                  </td>
                  <td className="p-3 text-gray-600">{asset.year || '-'}</td>
                  <td className="p-3 text-gray-600">
                    {asset.license_plate || asset.vin || '-'}
                  </td>
                  {typeFilter === 'vehicle' || typeFilter === 'all' ? (
                    <td className="p-3 text-gray-600">
                      {asset.odometer_current ? asset.odometer_current.toLocaleString() : '-'}
                    </td>
                  ) : null}
                  {(typeFilter === 'heavy_machinery' || typeFilter === 'other' || typeFilter === 'all') ? (
                    <td className="p-3 text-gray-600">
                      {asset.hours_current ? asset.hours_current.toLocaleString() : '-'}
                    </td>
                  ) : null}
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>
                      {asset.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && (!assets || assets.length === 0) && (
          <div className="p-8 text-center text-xs text-gray-500">
            No {typeFilter === 'all' ? 'assets' : getTypeLabel(typeFilter).toLowerCase()} found
          </div>
        )}
      </div>
    </div>
  );
}

