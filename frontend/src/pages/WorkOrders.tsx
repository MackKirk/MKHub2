import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { api } from '@/lib/api';

type WorkOrder = {
  id: string;
  work_order_number: string;
  entity_type: string;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  assigned_to_user_id?: string;
  created_at: string;
};

export default function WorkOrders() {
  const nav = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');

  const { data: workOrders, isLoading } = useQuery({
    queryKey: ['workOrders', statusFilter, urgencyFilter, entityTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (urgencyFilter !== 'all') params.append('urgency', urgencyFilter);
      if (entityTypeFilter !== 'all') params.append('entity_type', entityTypeFilter);
      const query = params.toString();
      return api<WorkOrder[]>('GET', `/fleet/work-orders${query ? `?${query}` : ''}`);
    },
  });

  const statusColors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    pending_parts: 'bg-orange-100 text-orange-800',
    closed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
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
              <div className="text-sm font-semibold text-gray-900">Work Orders</div>
              <div className="text-xs text-gray-500 mt-0.5">Unified work order management</div>
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
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_parts">Pending Parts</option>
            <option value="closed">Closed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Urgency</option>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <select
            value={entityTypeFilter}
            onChange={e => setEntityTypeFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            <option value="all">All Types</option>
            <option value="fleet">Fleet</option>
            <option value="equipment">Equipment</option>
          </select>
          <button
            onClick={() => nav('/fleet/work-orders/new')}
            className="px-3 py-2 text-xs font-medium text-white bg-brand-red rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            + New Work Order
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white overflow-hidden min-w-0">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-gray-500">Loading work orders...</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-3 text-left">Work Order #</th>
                <th className="p-3 text-left">Description</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Urgency</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {(workOrders || []).map(wo => (
                <tr
                  key={wo.id}
                  className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                >
                  <td className="p-3 font-medium">{wo.work_order_number}</td>
                  <td className="p-3 text-gray-600">{wo.description}</td>
                  <td className="p-3 text-gray-600 capitalize">{wo.entity_type}</td>
                  <td className="p-3 text-gray-600 capitalize">{wo.category}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${urgencyColors[wo.urgency] || 'bg-gray-100 text-gray-800'}`}>
                      {wo.urgency}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[wo.status] || 'bg-gray-100 text-gray-800'}`}>
                      {wo.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-3 text-gray-600">
                    {new Date(wo.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && (!workOrders || workOrders.length === 0) && (
          <div className="p-8 text-center text-xs text-gray-500">No work orders found</div>
        )}
      </div>
    </div>
  );
}

