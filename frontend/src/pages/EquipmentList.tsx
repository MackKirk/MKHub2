import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
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

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Equipment</div>
        <div className="text-sm opacity-90">Manage tools and equipment</div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Search by name, serial, brand, or model..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border rounded-lg px-4 py-2"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="all">All Status</option>
          <option value="available">Available</option>
          <option value="checked_out">Checked Out</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
        <button
          onClick={() => nav('/fleet/equipment/new')}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700"
        >
          + New Equipment
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
          <div className="p-8 text-center text-gray-500">No equipment found</div>
        )}
      </div>
    </div>
  );
}

