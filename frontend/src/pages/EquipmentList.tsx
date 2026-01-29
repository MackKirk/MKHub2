import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';

type Equipment = {
  id: string;
  category: string;
  name: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  status: string;
  created_at: string;
};

export default function EquipmentList() {
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: equipment, isLoading } = useQuery({
    queryKey: ['equipment', search, categoryFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const query = params.toString();
      return api<Equipment[]>('GET', `/fleet/equipment${query ? `?${query}` : ''}`);
    },
  });

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-800',
    checked_out: 'bg-blue-100 text-blue-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
  };

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'generator', label: 'Generators' },
    { value: 'tool', label: 'Tools' },
    { value: 'electronics', label: 'Electronics' },
    { value: 'small_tool', label: 'Small Tools' },
    { value: 'safety', label: 'Safety Equipment' },
  ];

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
              <div className="text-sm font-semibold text-gray-900">Equipment</div>
              <div className="text-xs text-gray-500 mt-0.5">Manage tools and equipment</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 flex gap-3 items-center flex-wrap">
          <input
            type="text"
            placeholder="Search by name, serial, brand, or model..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            {categories.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="checked_out">Checked Out</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
          <button
            onClick={() => nav('/fleet/equipment/new')}
            className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Equipment
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white overflow-hidden min-w-0">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading equipment...</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Serial Number</th>
                <th className="p-3 text-left">Brand/Model</th>
                <th className="p-3 text-left">Value</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(equipment || []).map(item => (
                <tr
                  key={item.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/fleet/equipment/${item.id}`)}
                >
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3 text-gray-600 capitalize">{item.category.replace('_', ' ')}</td>
                  <td className="p-3 text-gray-600">{item.serial_number || '-'}</td>
                  <td className="p-3 text-gray-600">{item.brand || ''} {item.model || ''}</td>
                  <td className="p-3 text-gray-600">
                    {item.value ? `$${item.value.toLocaleString()}` : '-'}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && (!equipment || equipment.length === 0) && (
          <div className="p-8 text-center text-xs text-gray-500">No equipment found</div>
        )}
      </div>
    </div>
  );
}

