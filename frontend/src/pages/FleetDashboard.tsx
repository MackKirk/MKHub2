import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useMemo } from 'react';

type DashboardData = {
  total_fleet_assets: number;
  total_vehicles: number;
  total_heavy_machinery: number;
  total_other_assets: number;
  inspections_due_count: number;
  inspections_due: Array<{ id: string; name: string; asset_type: string; last_inspection: string | null }>;
  open_work_orders_count: number;
  in_progress_work_orders_count: number;
  pending_parts_work_orders_count: number;
  overdue_equipment_count: number;
  overdue_equipment: Array<{ id: string; equipment_id: string; equipment_name: string; checked_out_by: string; expected_return_date: string | null }>;
};

export default function FleetDashboard() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['fleetDashboard'],
    queryFn: () => api<DashboardData>('GET', '/fleet/dashboard'),
  });

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Fleet & Equipment Management</div>
            <div className="text-sm text-gray-500 font-medium">Dashboard overview</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
            <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl border bg-white p-4">
              <div className="h-6 bg-gray-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const stats = data || {
    total_fleet_assets: 0,
    total_vehicles: 0,
    total_heavy_machinery: 0,
    total_other_assets: 0,
    inspections_due_count: 0,
    inspections_due: [],
    open_work_orders_count: 0,
    in_progress_work_orders_count: 0,
    pending_parts_work_orders_count: 0,
    overdue_equipment_count: 0,
    overdue_equipment: [],
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div>
          <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">Fleet & Equipment Management</div>
          <div className="text-sm text-gray-500 font-medium">Dashboard overview</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav('/fleet/vehicles')}>
          <div className="text-sm text-gray-600 mb-1">Total Fleet Assets</div>
          <div className="text-3xl font-bold text-gray-900">{stats.total_fleet_assets}</div>
          <div className="text-xs text-gray-500 mt-2">
            {stats.total_vehicles} vehicles • {stats.total_heavy_machinery} heavy machinery • {stats.total_other_assets} other
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav('/fleet/inspections')}>
          <div className="text-sm text-gray-600 mb-1">Inspections Due</div>
          <div className={`text-3xl font-bold ${stats.inspections_due_count > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
            {stats.inspections_due_count}
          </div>
          <div className="text-xs text-gray-500 mt-2">Requires attention</div>
        </div>

        <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav('/fleet/work-orders')}>
          <div className="text-sm text-gray-600 mb-1">Open Work Orders</div>
          <div className="text-3xl font-bold text-gray-900">{stats.open_work_orders_count}</div>
          <div className="text-xs text-gray-500 mt-2">
            {stats.in_progress_work_orders_count} in progress • {stats.pending_parts_work_orders_count} pending parts
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav('/fleet/equipment')}>
          <div className="text-sm text-gray-600 mb-1">Overdue Equipment</div>
          <div className={`text-3xl font-bold ${stats.overdue_equipment_count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {stats.overdue_equipment_count}
          </div>
          <div className="text-xs text-gray-500 mt-2">Checkouts past due date</div>
        </div>
      </div>

      {/* Inspections Due List */}
      {stats.inspections_due_count > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Inspections Due</h3>
            <button
              onClick={() => nav('/fleet/inspections')}
              className="text-sm text-brand-red hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {stats.inspections_due.slice(0, 5).map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                onClick={() => nav(`/fleet/assets/${item.id}`)}
              >
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-600 capitalize">{item.asset_type.replace('_', ' ')}</div>
                </div>
                <div className="text-sm text-orange-600">Due</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue Equipment List */}
      {stats.overdue_equipment_count > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Overdue Equipment</h3>
            <button
              onClick={() => nav('/fleet/equipment')}
              className="text-sm text-brand-red hover:underline"
            >
              View All
            </button>
          </div>
          <div className="space-y-2">
            {stats.overdue_equipment.slice(0, 5).map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded cursor-pointer"
                onClick={() => nav(`/fleet/equipment/${item.equipment_id}`)}
              >
                <div>
                  <div className="font-medium">{item.equipment_name}</div>
                  <div className="text-sm text-gray-600">
                    Expected: {item.expected_return_date ? new Date(item.expected_return_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                <div className="text-sm text-red-600">Overdue</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => nav('/fleet/assets?type=vehicle')}
          className="rounded-xl border bg-white p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="font-semibold mb-1">Vehicles</div>
          <div className="text-sm text-gray-600">Manage vehicle fleet</div>
        </button>
        <button
          onClick={() => nav('/fleet/assets?type=heavy_machinery')}
          className="rounded-xl border bg-white p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="font-semibold mb-1">Heavy Machinery</div>
          <div className="text-sm text-gray-600">Manage heavy machinery</div>
        </button>
        <button
          onClick={() => nav('/fleet/equipment')}
          className="rounded-xl border bg-white p-4 text-left hover:shadow-md transition-shadow"
        >
          <div className="font-semibold mb-1">Equipment</div>
          <div className="text-sm text-gray-600">Manage tools and equipment</div>
        </button>
      </div>
    </div>
  );
}

