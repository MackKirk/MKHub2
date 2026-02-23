import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { EquipmentNewForm } from './EquipmentNew';

type Equipment = {
  id: string;
  category: string;
  name: string;
  unit_number?: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  status: string;
  created_at: string;
};

const categoryLabels: Record<string, string> = {
  all: 'All Equipment',
  generator: 'Generators',
  tool: 'Tools',
  electronics: 'Electronics',
  small_tool: 'Small Tools',
  safety: 'Safety Equipment',
};

export default function EquipmentList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showNewEquipmentModal, setShowNewEquipmentModal] = useState(false);

  const categoryFromUrl = searchParams.get('category') || 'all';
  useEffect(() => {
    setCategoryFilter(categoryFromUrl);
  }, [categoryFromUrl]);

  const handleCategoryChange = (cat: string) => {
    const params = new URLSearchParams(searchParams);
    if (cat === 'all') {
      params.delete('category');
    } else {
      params.set('category', cat);
    }
    setSearchParams(params, { replace: true });
    setCategoryFilter(cat);
  };

  const { data: equipment = [], isLoading } = useQuery({
    queryKey: ['equipment', categoryFilter, search, statusFilter],
    queryFn: async () => {
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  useEffect(() => {
    if (!showNewEquipmentModal) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewEquipmentModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [showNewEquipmentModal]);

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title Bar */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">{categoryLabels[categoryFilter] || 'Equipment'}</div>
            <div className="text-xs text-gray-500 mt-0.5">Manage tools and equipment</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar - same layout as FleetAssets */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex gap-1 border-b border-gray-200 px-0 pt-0 pb-3 mb-3">
          <button
            onClick={() => handleCategoryChange('all')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'all' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleCategoryChange('generator')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'generator' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Generators
          </button>
          <button
            onClick={() => handleCategoryChange('tool')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'tool' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Tools
          </button>
          <button
            onClick={() => handleCategoryChange('electronics')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'electronics' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Electronics
          </button>
          <button
            onClick={() => handleCategoryChange('small_tool')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'small_tool' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Small Tools
          </button>
          <button
            onClick={() => handleCategoryChange('safety')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] ${
              categoryFilter === 'safety' ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Safety Equipment
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, serial, brand, or model..."
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
            <option value="available">Available</option>
            <option value="checked_out">Checked Out</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
          <button
            onClick={() => setShowNewEquipmentModal(true)}
            className="px-3 py-2 text-sm font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Equipment
          </button>
        </div>
      </div>

      {/* List - same grid style as FleetAssets */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading equipment...</div>
        ) : equipment.length > 0 ? (
          <div className="flex flex-col gap-0 overflow-x-auto">
            <div
              className="grid items-center px-4 py-2 w-full text-[10px] font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 rounded-t-lg min-w-[800px]"
              style={{ gridTemplateColumns: '6fr 14fr 10fr 10fr 12fr 6fr 10fr 8fr' }}
            >
              <span className="min-w-0 text-left">Unit #</span>
              <span className="min-w-0 text-left">Name</span>
              <span className="min-w-0 text-left">Category</span>
              <span className="min-w-0 text-left">Serial</span>
              <span className="min-w-0 text-left">Brand/Model</span>
              <span className="min-w-0 text-left">Value</span>
              <span className="min-w-0 text-left">Assignment</span>
              <span className="min-w-0 text-left">Status</span>
            </div>
            <div className="rounded-b-lg border-t-0 border-gray-200 overflow-hidden min-w-0">
              {equipment.map((item) => (
                <div
                  key={item.id}
                  className="grid items-center px-4 py-3 w-full hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 min-h-[52px] min-w-[800px]"
                  style={{ gridTemplateColumns: '6fr 14fr 10fr 10fr 12fr 6fr 10fr 8fr' }}
                  onClick={() => nav(`/fleet/equipment/${item.id}`)}
                >
                  <div className="min-w-0 text-xs text-gray-600 truncate">{item.unit_number || '—'}</div>
                  <div className="min-w-0 text-xs font-medium text-gray-900 truncate">{item.name || '—'}</div>
                  <div className="min-w-0">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 capitalize">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="min-w-0 text-xs text-gray-600 truncate">{item.serial_number || '—'}</div>
                  <div className="min-w-0 text-xs text-gray-600 truncate">
                    {[item.brand, item.model].filter(Boolean).join(' ') || '—'}
                  </div>
                  <div className="min-w-0 text-xs text-gray-600">
                    {item.value != null ? `$${item.value.toLocaleString()}` : '—'}
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${item.status === 'checked_out' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {item.status === 'checked_out' ? 'Assigned' : 'Available'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status] || 'bg-gray-100 text-gray-800'}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-gray-500">
            No {categoryFilter === 'all' ? 'equipment' : categoryLabels[categoryFilter]?.toLowerCase()} found
          </div>
        )}
      </div>

      {/* New Equipment Modal */}
      {showNewEquipmentModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-y-auto p-4"
          onClick={() => setShowNewEquipmentModal(false)}
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
                    onClick={() => setShowNewEquipmentModal(false)}
                    className="p-1.5 rounded hover:bg-gray-100 transition-colors flex items-center justify-center"
                    title="Close"
                  >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">New Equipment</div>
                    <div className="text-xs text-gray-500 mt-0.5">Create a new equipment item</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <EquipmentNewForm
                initialCategory={categoryFilter === 'all' ? 'generator' : categoryFilter}
                onSuccess={(data) => {
                  setShowNewEquipmentModal(false);
                  queryClient.invalidateQueries({ queryKey: ['equipment'] });
                  nav(`/fleet/equipment/${data.id}`);
                }}
                onCancel={() => setShowNewEquipmentModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
