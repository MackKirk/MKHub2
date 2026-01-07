import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';

type FleetAsset = {
  id: string;
  asset_type: string;
  name: string;
  vin?: string;
  model?: string;
  year?: number;
  status: string;
  hours_current?: number;
  created_at: string;
};

export default function FleetHeavyMachinery() {
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: assets, isLoading } = useQuery({
    queryKey: ['fleetAssets', 'heavy_machinery', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('asset_type', 'heavy_machinery');
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Heavy Machinery</div>
          <div className="text-sm text-gray-500 font-medium">Manage heavy machinery fleet</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search by name, serial, or model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-4 py-2"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
        <button
          onClick={() => nav('/fleet/assets/new?type=heavy_machinery')}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700"
        >
          + New Machinery
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <div className="h-6 bg-gray-100 animate-pulse rounded" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Serial/VIN</th>
                <th className="p-3 text-left">Model</th>
                <th className="p-3 text-left">Year</th>
                <th className="p-3 text-left">Hours</th>
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
                  <td className="p-3 font-medium">{asset.name}</td>
                  <td className="p-3 text-gray-600">{asset.vin || '-'}</td>
                  <td className="p-3 text-gray-600">{asset.model || '-'}</td>
                  <td className="p-3 text-gray-600">{asset.year || '-'}</td>
                  <td className="p-3 text-gray-600">
                    {asset.hours_current ? asset.hours_current.toLocaleString() : '-'}
                  </td>
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
          <div className="p-8 text-center text-gray-500">No heavy machinery found</div>
        )}
      </div>
    </div>
  );
}

