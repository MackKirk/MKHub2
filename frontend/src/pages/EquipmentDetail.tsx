import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Equipment = {
  id: string;
  category: string;
  name: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  value?: number;
  warranty_expiry?: string;
  purchase_date?: string;
  status: string;
  photos?: string[];
  documents?: string[];
  notes?: string;
};

type Checkout = {
  id: string;
  equipment_id: string;
  checked_out_by_user_id: string;
  checked_out_at: string;
  expected_return_date?: string;
  actual_return_date?: string;
  condition_out: string;
  condition_in?: string;
  status: string;
};

type WorkOrder = {
  id: string;
  work_order_number: string;
  description: string;
  urgency: string;
  status: string;
  created_at: string;
};

type EquipmentLog = {
  id: string;
  log_type: string;
  log_date: string;
  description: string;
  created_at: string;
};

export default function EquipmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'checkout' | 'work-orders' | 'logs' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'checkout' | 'work-orders' | 'logs'>(initialTab);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showCheckinModal, setShowCheckinModal] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'general' | 'checkout' | 'work-orders' | 'logs' | null;
    if (tabParam && ['general', 'checkout', 'work-orders', 'logs'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  const isValidId = id && id !== 'new';

  const { data: equipment, isLoading } = useQuery({
    queryKey: ['equipment', id],
    queryFn: () => api<Equipment>('GET', `/fleet/equipment/${id}`),
    enabled: isValidId,
  });

  const { data: checkouts } = useQuery({
    queryKey: ['equipmentCheckouts', id],
    queryFn: () => api<Checkout[]>('GET', `/fleet/equipment/${id}/checkouts`),
    enabled: isValidId,
  });

  const { data: workOrders } = useQuery({
    queryKey: ['equipmentWorkOrders', id],
    queryFn: () => api<WorkOrder[]>('GET', `/fleet/equipment/${id}/work-orders`),
    enabled: isValidId,
  });

  const { data: logs } = useQuery({
    queryKey: ['equipmentLogs', id],
    queryFn: () => api<EquipmentLog[]>('GET', `/fleet/equipment/${id}/logs`),
    enabled: isValidId,
  });

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (!isValidId) {
    return <div className="p-4">Invalid equipment ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!equipment) {
    return <div className="p-4">Equipment not found</div>;
  }

  const activeCheckout = (checkouts || []).find(c => c.status === 'checked_out' || c.status === 'overdue');
  const isCheckedOut = equipment.status === 'checked_out' || equipment.status === 'maintenance' || !!activeCheckout;

  return (
    <div className="space-y-4">
      <div className="bg-slate-200/50 rounded-[12px] border border-slate-200 flex items-center justify-between py-4 px-6 mb-6">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => nav('/fleet/equipment')}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
            title="Back to Equipment"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight mb-0.5">{equipment.name}</div>
            <div className="text-sm text-gray-500 font-medium capitalize">{equipment.category.replace('_', ' ')}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Today</div>
          <div className="text-sm font-semibold text-gray-700">{todayLabel}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['general', 'checkout', 'work-orders', 'logs'] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              nav(`/fleet/equipment/${id}?tab=${t}`, { replace: true });
            }}
            className={`px-4 py-2 rounded-t-lg transition-colors capitalize ${
              tab === t
                ? 'bg-white border-t border-l border-r text-gray-900 font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="rounded-xl border bg-white p-6">
        {tab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <div className="font-medium">{equipment.name}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Category</label>
                <div className="font-medium capitalize">{equipment.category.replace('_', ' ')}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Serial Number</label>
                <div className="font-medium">{equipment.serial_number || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Brand</label>
                <div className="font-medium">{equipment.brand || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Model</label>
                <div className="font-medium">{equipment.model || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Value</label>
                <div className="font-medium">{equipment.value ? `$${equipment.value.toLocaleString()}` : '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Warranty Expiry</label>
                <div className="font-medium">
                  {equipment.warranty_expiry ? new Date(equipment.warranty_expiry).toLocaleDateString() : '-'}
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Purchase Date</label>
                <div className="font-medium">
                  {equipment.purchase_date ? new Date(equipment.purchase_date).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>
            {equipment.notes && (
              <div>
                <label className="text-sm text-gray-600">Notes</label>
                <div className="mt-1 p-3 bg-gray-50 rounded">{equipment.notes}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'checkout' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Check-out / Check-in</h3>
              {equipment.status === 'available' && (
                <button
                  onClick={() => setShowCheckoutModal(true)}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Check Out
                </button>
              )}
              {isCheckedOut && (
                <button
                  onClick={() => setShowCheckinModal(true)}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Check In
                </button>
              )}
            </div>
            {activeCheckout && (
              <div className={`border rounded-lg p-4 ${activeCheckout.status === 'overdue' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                <div className="font-medium mb-2">Currently Checked Out</div>
                <div className="text-sm text-gray-600">
                  Checked out: {new Date(activeCheckout.checked_out_at).toLocaleDateString()}
                </div>
                {activeCheckout.expected_return_date && (
                  <div className={`text-sm mt-1 ${activeCheckout.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                    Expected return: {new Date(activeCheckout.expected_return_date).toLocaleDateString()}
                    {activeCheckout.status === 'overdue' && ' (OVERDUE)'}
                  </div>
                )}
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Checkout History</h4>
              <div className="space-y-2">
                {(checkouts || []).map(checkout => (
                  <div key={checkout.id} className="border rounded-lg p-3">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">
                          {new Date(checkout.checked_out_at).toLocaleDateString()}
                          {checkout.actual_return_date && ` - ${new Date(checkout.actual_return_date).toLocaleDateString()}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          Condition: {checkout.condition_out}
                          {checkout.condition_in && ` → ${checkout.condition_in}`}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${
                        checkout.status === 'overdue' ? 'bg-red-100 text-red-800' :
                        checkout.status === 'checked_out' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {checkout.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {(!checkouts || checkouts.length === 0) && (
                <div className="text-sm text-gray-500 py-4">No checkout history</div>
              )}
            </div>
          </div>
        )}

        {tab === 'work-orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Work Orders</h3>
              <button
                onClick={() => nav(`/fleet/work-orders/new?entity_type=equipment&entity_id=${id}`)}
                className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
              >
                + New Work Order
              </button>
            </div>
            <div className="space-y-2">
              {(workOrders || []).map(wo => (
                <div
                  key={wo.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{wo.work_order_number}</div>
                      <div className="text-sm text-gray-600">{wo.description}</div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(wo.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Logs</h3>
            <div className="space-y-2">
              {(logs || []).map(log => (
                <div key={log.id} className="border-l-4 border-gray-300 pl-4 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium capitalize">{log.log_type.replace('_', ' ')}</div>
                      <div className="text-sm text-gray-600">{log.description}</div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(log.log_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

