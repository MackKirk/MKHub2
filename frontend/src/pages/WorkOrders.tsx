import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
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

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="text-2xl font-extrabold">Work Orders</div>
        <div className="text-sm opacity-90">Unified work order management</div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border rounded-lg px-4 py-2"
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
          className="border rounded-lg px-4 py-2"
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
          className="border rounded-lg px-4 py-2"
        >
          <option value="all">All Types</option>
          <option value="fleet">Fleet</option>
          <option value="equipment">Equipment</option>
        </select>
        <button
          onClick={() => nav('/fleet/work-orders/new')}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700"
        >
          + New Work Order
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
          <div className="p-8 text-center text-gray-500">No work orders found</div>
        )}
      </div>
    </div>
  );
}

