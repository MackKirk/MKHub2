import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { WORK_ORDER_STATUS_OPTIONS, WORK_ORDER_STATUS_COLORS, WORK_ORDER_STATUS_LABELS, URGENCY_COLORS } from '@/lib/fleetBadges';
import FleetDetailHeader from '@/components/FleetDetailHeader';
import OverlayPortal from '@/components/OverlayPortal';

type CostItem = {
  id?: string;
  description: string;
  amount: number;
  invoice_files: string[];
};

type WorkOrder = {
  id: string;
  work_order_number: string;
  entity_type: string;
  entity_id: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  origin_source?: string | null;
  origin_id?: string | null;
  assigned_to_user_id?: string;
  photos?: string[] | { before: string[]; after: string[] };
  documents?: string[];
  costs?: {
    labor?: number | CostItem[];
    parts?: number | CostItem[];
    other?: number | CostItem[];
    total?: number;
  };
  created_at: string;
  updated_at?: string;
  closed_at?: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  estimated_duration_minutes?: number | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  quote_file_ids?: string[] | null;
  odometer_reading?: number | null;
  hours_reading?: number | null;
};

export default function WorkOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showCostForm, setShowCostForm] = useState(false);
  const [editingCost, setEditingCost] = useState<{ category: string; index?: number } | null>(null);

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'costs' | 'files' | 'activity' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'costs' | 'files' | 'activity'>(initialTab);
  const isValidId = id && id !== 'new';

  const { data: workOrder, isLoading } = useQuery({
    queryKey: ['workOrder', id],
    queryFn: () => api<WorkOrder>('GET', `/fleet/work-orders/${id}`),
    enabled: isValidId,
  });

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'general' | 'costs' | 'files' | 'activity' | null;
    if (tabParam && ['general', 'costs', 'files', 'activity'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  const { data: asset } = useQuery({
    queryKey: ['fleetAsset', workOrder?.entity_id],
    queryFn: () => api<{ id: string; name?: string; unit_number?: string; photos?: string[] }>('GET', `/fleet/assets/${workOrder!.entity_id}`),
    enabled: !!workOrder?.entity_id && workOrder?.entity_type === 'fleet',
  });

  const assetPhotoUrl = asset?.photos?.[0] ? withFileAccessToken(`/files/${asset.photos[0]}/thumbnail?w=400`) : null;

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');

  const updateWorkOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      return api('PUT', `/fleet/work-orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Work order updated');
    },
    onError: () => {
      toast.error('Failed to update work order');
    },
  });

  const updateCostsMutation = useMutation({
    mutationFn: async (newCosts: any) => {
      return api('PUT', `/fleet/work-orders/${id}`, { costs: newCosts });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Costs updated');
      setShowCostForm(false);
      setEditingCost(null);
    },
    onError: () => {
      toast.error('Failed to update costs');
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (body: { check_in_at?: string; odometer_reading?: number; hours_reading?: number; estimated_duration_minutes?: number; scheduled_end_at?: string }) => {
      return api('PUT', `/fleet/work-orders/${id}/check-in`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Work order started');
    },
    onError: () => toast.error('Failed to start work order'),
  });

  const deleteWorkOrderMutation = useMutation({
    mutationFn: () => api('DELETE', `/fleet/work-orders/${id}`),
    onSuccess: () => {
      toast.success('Work order deleted');
      queryClient.invalidateQueries({ queryKey: ['workOrder'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-work-orders-calendar'] });
      nav('/fleet/work-orders');
    },
    onError: () => toast.error('Failed to delete work order'),
  });

  const statusColors = WORK_ORDER_STATUS_COLORS;
  const urgencyColors = URGENCY_COLORS;

  // Helper to check if costs are in new format (array) or legacy (number)
  const isCostArray = (cost: any): cost is CostItem[] => {
    return Array.isArray(cost);
  };

  const getCostTotal = (costs: any, category: 'labor' | 'parts' | 'other'): number => {
    const cost = costs?.[category];
    if (!cost) return 0;
    if (typeof cost === 'number') return cost;
    if (Array.isArray(cost)) {
      return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    return 0;
  };

  const getTotalCost = (costs: any): number => {
    if (!costs) return 0;
    if (costs.total && typeof costs.total === 'number') return costs.total;
    return getCostTotal(costs, 'labor') + getCostTotal(costs, 'parts') + getCostTotal(costs, 'other');
  };

  const canEditCosts = ['open', 'in_progress', 'pending_parts'].includes(workOrder?.status ?? '');

  const removeCostItem = (category: 'labor' | 'parts' | 'other', index: number) => {
    const currentCosts = workOrder?.costs || {};
    const arr = Array.isArray(currentCosts[category]) ? [...(currentCosts[category] as CostItem[])] : [];
    const newArr = arr.filter((_, i) => i !== index);
    const newCosts = { ...currentCosts, [category]: newArr };
    newCosts.total = getCostTotal(newCosts, 'labor') + getCostTotal(newCosts, 'parts') + getCostTotal(newCosts, 'other');
    updateCostsMutation.mutate(newCosts);
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  if (!isValidId) {
    return <div className="p-4">Invalid work order ID</div>;
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!workOrder) {
    return <div className="p-4">Work order not found</div>;
  }

  const costs = workOrder.costs || {};
  const laborCosts = Array.isArray(costs.labor) ? costs.labor : [];
  const partsCosts = Array.isArray(costs.parts) ? costs.parts : [];
  const otherCosts = Array.isArray(costs.other) ? costs.other : [];

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <FleetDetailHeader
        onBack={() => nav('/fleet/work-orders')}
        title={<span className="text-sm font-semibold text-gray-900">{workOrder.work_order_number}</span>}
        subtitle={<span className="capitalize">{workOrder.entity_type}</span>}
        actions={isAdmin ? (
          <button
            type="button"
            onClick={() => window.confirm('Delete this work order permanently?') && deleteWorkOrderMutation.mutate()}
            disabled={deleteWorkOrderMutation.isPending}
            className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
          >
            {deleteWorkOrderMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : undefined}
        right={
          <div className="text-right">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{todayLabel}</div>
          </div>
        }
      />

      {/* Hero section - asset photo + key info (project-like) */}
      <div className="rounded-xl border bg-white overflow-hidden p-4">
        <div className="flex gap-4 items-start">
          {/* Left: asset image when fleet */}
          <div className="w-48 flex-shrink-0">
            <div className="w-48 h-36 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
              {workOrder.entity_type === 'fleet' && assetPhotoUrl ? (
                <img src={assetPhotoUrl} alt={asset?.name || 'Asset'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1M4 12a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6m16 4a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6" />
                  </svg>
                </div>
              )}
            </div>
            {workOrder.entity_type === 'fleet' && asset && (
              <button
                type="button"
                onClick={() => nav(`/fleet/assets/${workOrder.entity_id}`)}
                className="mt-2 text-xs font-medium text-brand-red hover:underline"
              >
                View asset
              </button>
            )}
          </div>
          {/* Right: info grid */}
          <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Number</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{workOrder.work_order_number}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
              <div className="mt-1">
                <select
                  value={workOrder.status}
                  onChange={(e) => updateWorkOrderMutation.mutate({ status: e.target.value })}
                  disabled={updateWorkOrderMutation.isPending}
                  className={`block w-full max-w-[180px] rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium focus:ring-2 focus:ring-brand-red focus:border-brand-red ${statusColors[workOrder.status] || 'bg-gray-100 text-gray-800'}`}
                >
                  {WORK_ORDER_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Category</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5 capitalize">{workOrder.category}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Urgency</span>
              <div className="mt-0.5">
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${urgencyColors[workOrder.urgency] || 'bg-gray-100 text-gray-800'}`}>
                  {workOrder.urgency}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Entity</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5 capitalize">{workOrder.entity_type}</div>
            </div>
            <div>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Created</span>
              <div className="text-sm font-semibold text-gray-900 mt-0.5">{new Date(workOrder.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-4">
          {(['general', 'costs', 'files', 'activity'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => {
                setTab(tabKey);
                nav(`/fleet/work-orders/${id}?tab=${tabKey}`, { replace: true });
              }}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
                tab === tabKey ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {tabKey}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white p-4 min-w-0 overflow-hidden">
        {tab === 'general' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Description</span>
              <div className="font-medium text-gray-900 mt-1">{workOrder.description}</div>
              {workOrder.origin_source === 'inspection' && workOrder.origin_id && (
                <div className="mt-3">
                  <a
                    href={`/fleet/inspections/${workOrder.origin_id}`}
                    onClick={(e) => { e.preventDefault(); nav(`/fleet/inspections/${workOrder.origin_id}`); }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-red hover:underline"
                  >
                    View originating inspection
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>
                </div>
              )}
            </div>

            {workOrder.entity_type === 'fleet' && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Service &nbsp;/&nbsp; Shop</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Scheduled (end)</span>
                    <div className="font-medium mt-1">
                      {workOrder.scheduled_end_at
                        ? new Date(workOrder.scheduled_end_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Expected duration</span>
                    <div className="font-medium mt-1">
                      {(() => {
                        const end = workOrder.scheduled_end_at ? new Date(workOrder.scheduled_end_at).getTime() : null;
                        const start = workOrder.scheduled_start_at
                          ? new Date(workOrder.scheduled_start_at).getTime()
                          : workOrder.check_in_at
                            ? new Date(workOrder.check_in_at).getTime()
                            : workOrder.created_at
                              ? new Date(workOrder.created_at).getTime()
                              : null;
                        if (end && start && end >= start) {
                          const days = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
                          return `${days} day${days !== 1 ? 's' : ''}`;
                        }
                        if (workOrder.estimated_duration_minutes != null) {
                          return `${Math.floor(workOrder.estimated_duration_minutes / 60)}h ${workOrder.estimated_duration_minutes % 60}min`;
                        }
                        return '—';
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Check-in</span>
                    <div className="font-medium mt-1">
                      {workOrder.check_in_at
                        ? new Date(workOrder.check_in_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Check-out</span>
                    <div className="font-medium mt-1">
                      {workOrder.check_out_at
                        ? new Date(workOrder.check_out_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'costs' && (
          <div className="space-y-6">
            {/* Three separate category sections - add button inside each card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Labor */}
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Labor</h4>
                  <span className="text-sm font-medium text-gray-700">${getCostTotal(costs, 'labor').toFixed(2)}</span>
                </div>
                {laborCosts.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No labor costs.</p>
                ) : (
                  <ul className="space-y-0">
                    {laborCosts.map((item, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-900 truncate min-w-0">{item.description || '—'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium text-gray-900">${item.amount.toFixed(2)}</span>
                          {canEditCosts && (
                            <>
                              <button type="button" onClick={() => { setEditingCost({ category: 'labor', index: idx }); setShowCostForm(true); }} className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button type="button" onClick={() => window.confirm('Remove this cost?') && removeCostItem('labor', idx)} className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {showCostForm && editingCost?.category === 'labor' ? (
                  <div className="mt-3">
                    <CostFormInline
                    workOrderId={id!}
                    category="labor"
                    existingCostIndex={editingCost.index}
                    existingCost={editingCost.index !== undefined ? laborCosts[editingCost.index] : undefined}
                    onSuccess={(newCosts) => { updateCostsMutation.mutate(newCosts); }}
                    onCancel={() => { setShowCostForm(false); setEditingCost(null); }}
                  />
                  </div>
                ) : canEditCosts ? (
                  <button
                    type="button"
                    onClick={() => { setEditingCost({ category: 'labor' }); setShowCostForm(true); }}
                    className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center gap-2"
                  >
                    <span className="text-lg text-gray-400">+</span>
                    <span className="font-medium text-xs text-gray-700">Add Labor</span>
                  </button>
                ) : null}
              </div>

              {/* Parts */}
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Parts</h4>
                  <span className="text-sm font-medium text-gray-700">${getCostTotal(costs, 'parts').toFixed(2)}</span>
                </div>
                {partsCosts.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No parts costs.</p>
                ) : (
                  <ul className="space-y-0">
                    {partsCosts.map((item, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-900 truncate min-w-0">{item.description || '—'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium text-gray-900">${item.amount.toFixed(2)}</span>
                          {canEditCosts && (
                            <>
                              <button type="button" onClick={() => { setEditingCost({ category: 'parts', index: idx }); setShowCostForm(true); }} className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button type="button" onClick={() => window.confirm('Remove this cost?') && removeCostItem('parts', idx)} className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {showCostForm && editingCost?.category === 'parts' ? (
                  <div className="mt-3">
                    <CostFormInline
                    workOrderId={id!}
                    category="parts"
                    existingCostIndex={editingCost.index}
                    existingCost={editingCost.index !== undefined ? partsCosts[editingCost.index] : undefined}
                    onSuccess={(newCosts) => { updateCostsMutation.mutate(newCosts); }}
                    onCancel={() => { setShowCostForm(false); setEditingCost(null); }}
                  />
                  </div>
                ) : canEditCosts ? (
                  <button
                    type="button"
                    onClick={() => { setEditingCost({ category: 'parts' }); setShowCostForm(true); }}
                    className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center gap-2"
                  >
                    <span className="text-lg text-gray-400">+</span>
                    <span className="font-medium text-xs text-gray-700">Add Parts</span>
                  </button>
                ) : null}
              </div>

              {/* Other */}
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-900">Other</h4>
                  <span className="text-sm font-medium text-gray-700">${getCostTotal(costs, 'other').toFixed(2)}</span>
                </div>
                {otherCosts.length === 0 ? (
                  <p className="text-xs text-gray-500 py-2">No other costs.</p>
                ) : (
                  <ul className="space-y-0">
                    {otherCosts.map((item, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-900 truncate min-w-0">{item.description || '—'}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium text-gray-900">${item.amount.toFixed(2)}</span>
                          {canEditCosts && (
                            <>
                              <button type="button" onClick={() => { setEditingCost({ category: 'other', index: idx }); setShowCostForm(true); }} className="p-1 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button type="button" onClick={() => window.confirm('Remove this cost?') && removeCostItem('other', idx)} className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {showCostForm && editingCost?.category === 'other' ? (
                  <div className="mt-3">
                    <CostFormInline
                    workOrderId={id!}
                    category="other"
                    existingCostIndex={editingCost.index}
                    existingCost={editingCost.index !== undefined ? otherCosts[editingCost.index] : undefined}
                    onSuccess={(newCosts) => { updateCostsMutation.mutate(newCosts); }}
                    onCancel={() => { setShowCostForm(false); setEditingCost(null); }}
                  />
                  </div>
                ) : canEditCosts ? (
                  <button
                    type="button"
                    onClick={() => { setEditingCost({ category: 'other' }); setShowCostForm(true); }}
                    className="mt-3 w-full border-2 border-dashed border-gray-300 rounded-lg p-2.5 hover:border-brand-red hover:bg-gray-50 transition-all text-center bg-white flex items-center justify-center gap-2"
                  >
                    <span className="text-lg text-gray-400">+</span>
                    <span className="font-medium text-xs text-gray-700">Add Other</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Costs Summary - below the 3 cards, with total */}
            <div className="rounded-xl border bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Costs Summary</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-600 mb-1">Labor</div>
                  <div className="text-sm font-semibold text-gray-900">${getCostTotal(costs, 'labor').toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-600 mb-1">Parts</div>
                  <div className="text-sm font-semibold text-gray-900">${getCostTotal(costs, 'parts').toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs font-medium text-gray-600 mb-1">Other</div>
                  <div className="text-sm font-semibold text-gray-900">${getCostTotal(costs, 'other').toFixed(2)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t-2 border-gray-300">
                <div className="text-sm font-semibold text-gray-900">Total</div>
                <div className="text-lg font-bold text-brand-red">${getTotalCost(costs).toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <WorkOrderFilesTab workOrderId={id!} />
        )}

        {tab === 'activity' && (
          <WorkOrderActivityTab workOrderId={id!} />
        )}
      </div>
    </div>
  );
}

type ActivityLogEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string | null;
  created_by: string | null;
  created_by_display: string | null;
};

function formatActivityMessage(entry: ActivityLogEntry): string {
  const d = entry.details || {};
  switch (entry.action) {
    case 'file_attached':
      return `Attached file "${d.original_name ?? 'file'}" to ${String(d.category ?? '').toLowerCase()}`;
    case 'file_removed':
      return `Removed file "${d.original_name ?? d.file_object_id ?? 'file'}" from ${String(d.category ?? '').toLowerCase()}`;
    case 'status_changed':
      const oldL = WORK_ORDER_STATUS_LABELS[d.old_status as string] ?? d.old_status;
      const newL = WORK_ORDER_STATUS_LABELS[d.new_status as string] ?? d.new_status;
      return `Status changed from ${oldL} to ${newL}`;
    case 'cost_added':
      return `Added cost: ${d.description ?? '—'} (${d.category}) $${Number(d.amount ?? 0).toFixed(2)}`;
    case 'cost_removed':
      return `Removed cost: ${d.description ?? '—'} (${d.category}) $${Number(d.amount ?? 0).toFixed(2)}`;
    default:
      return entry.action;
  }
}

function WorkOrderActivityTab({ workOrderId }: { workOrderId: string }) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['workOrderActivity', workOrderId],
    queryFn: () => api<ActivityLogEntry[]>('GET', `/fleet/work-orders/${workOrderId}/activity`),
    enabled: !!workOrderId,
  });

  if (isLoading) return <div className="py-4 text-gray-500">Loading activity…</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Activity log</h3>
      <p className="text-xs text-gray-500">File attachments, status changes, and cost additions/removals.</p>
      {activity.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-sm">No activity recorded yet.</div>
      ) : (
        <ul className="space-y-0 divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden bg-white">
          {activity.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50/50">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs">
                {entry.action === 'file_attached' && '📎'}
                {entry.action === 'file_removed' && '🗑️'}
                {entry.action === 'status_changed' && '🔄'}
                {entry.action === 'cost_added' && '➕'}
                {entry.action === 'cost_removed' && '➖'}
                {!['file_attached', 'file_removed', 'status_changed', 'cost_added', 'cost_removed'].includes(entry.action) && '•'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-900">{formatActivityMessage(entry)}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {entry.created_by_display ?? 'System'}
                  {entry.created_at && ` · ${new Date(entry.created_at).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Work order files tab: project-style layout (sidebar categories + files table + drag and drop)
const WO_FILE_CATEGORIES = [
  { id: 'all', label: 'All Files' },
  { id: 'orcamentos', label: 'Quotes' },
  { id: 'photos', label: 'Photos' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'outros', label: 'Other' },
] as const;

type WorkOrderFileItem = {
  id: string;
  file_object_id: string;
  category: string;
  original_name: string | null;
  uploaded_at: string | null;
  content_type: string | null;
  is_image: boolean;
  is_legacy?: boolean;
};

function WorkOrderFilesTab({ workOrderId }: { workOrderId: string }) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [uploadCategory, setUploadCategory] = useState<string>('outros');
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{ id: string; file: File; progress: number; status: 'pending' | 'uploading' | 'success' | 'error'; error?: string }>>([]);
  const [sortBy, setSortBy] = useState<'uploaded_at' | 'name' | 'type'>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['workOrderFiles', workOrderId],
    queryFn: () => api<WorkOrderFileItem[]>('GET', `/fleet/work-orders/${workOrderId}/files`),
    enabled: !!workOrderId,
  });

  const filesByCategory = useMemo(() => {
    const grouped: Record<string, WorkOrderFileItem[]> = { all: [] };
    WO_FILE_CATEGORIES.forEach((c) => { if (c.id !== 'all') grouped[c.id] = []; });
    files.forEach((f) => {
      const cat = f.category || 'outros';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
      grouped.all.push(f);
    });
    return grouped;
  }, [files]);

  const getFileTypeLabel = (f: WorkOrderFileItem): string => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    if (f.is_image || ct.startsWith('image/')) return 'Image';
    if (ct.includes('pdf') || ext === 'pdf') return 'PDF';
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return 'Excel';
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return 'Word';
    return ext.toUpperCase() || 'File';
  };

  const currentFiles = useMemo(() => {
    let list = filesByCategory[selectedCategory] || [];
    const q = fileSearchQuery.trim().toLowerCase();
    if (q) list = list.filter((f) => (f.original_name || f.file_object_id || '').toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;
      if (sortBy === 'uploaded_at') {
        aVal = a.uploaded_at || '';
        bVal = b.uploaded_at || '';
      } else if (sortBy === 'name') {
        aVal = (a.original_name || a.file_object_id || '').toLowerCase();
        bVal = (b.original_name || b.file_object_id || '').toLowerCase();
      } else {
        aVal = getFileTypeLabel(a).toLowerCase();
        bVal = getFileTypeLabel(b).toLowerCase();
      }
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filesByCategory, selectedCategory, fileSearchQuery, sortBy, sortOrder]);

  const handleSort = (column: 'uploaded_at' | 'name' | 'type') => {
    if (sortBy === column) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(column); setSortOrder('asc'); }
  };

  const iconFor = (f: WorkOrderFileItem) => {
    const name = String(f.original_name || '');
    const ext = (name.includes('.') ? name.split('.').pop() : '').toLowerCase();
    const ct = String(f.content_type || '').toLowerCase();
    const is = (x: string) => ct.includes(x) || ext === x;
    if (is('pdf')) return { label: 'PDF', color: 'bg-red-500' };
    if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('excel') || ct.includes('spreadsheet')) return { label: 'XLS', color: 'bg-green-600' };
    if (['doc', 'docx'].includes(ext) || ct.includes('word')) return { label: 'DOC', color: 'bg-blue-600' };
    if (f.is_image || ct.startsWith('image/')) return { label: 'IMG', color: 'bg-purple-500' };
    return { label: (ext || 'FILE').toUpperCase().slice(0, 4), color: 'bg-gray-600' };
  };

  const uploadFileToBlob = async (file: File): Promise<string> => {
    const type = file.type || 'application/octet-stream';
    const up: any = await api('POST', '/files/upload', {
      original_name: file.name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'work-order-files',
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': type, 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: type,
    });
    return conf.id;
  };

  const uploadMultiple = async (fileList: File[], targetCategory?: string) => {
    const category = targetCategory !== undefined ? targetCategory : (selectedCategory === 'all' ? uploadCategory : selectedCategory);
    const newQueue = Array.from(fileList).map((file, idx) => ({
      id: `${Date.now()}-${idx}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setUploadQueue((prev) => [...prev, ...newQueue]);

    for (const item of newQueue) {
      try {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
        const fileObjectId = await uploadFileToBlob(item.file);
        const params = new URLSearchParams({ file_object_id: fileObjectId, category });
        params.set('original_name', item.file.name);
        await api('POST', `/fleet/work-orders/${workOrderId}/files?${params}`);
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'success', progress: 100 } : u)));
      } catch (e: any) {
        setUploadQueue((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: e?.message || 'Upload failed' } : u)));
      }
    }
    queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['workOrderActivity', workOrderId] });
    setTimeout(() => setUploadQueue((prev) => prev.filter((u) => !newQueue.find((nq) => nq.id === u.id))), 2000);
  };

  const deleteMutation = useMutation({
    mutationFn: async (item: WorkOrderFileItem) => {
      if (item.is_legacy && item.id.startsWith('legacy-')) {
        return api('DELETE', `/fleet/work-orders/${workOrderId}/files/legacy/${item.file_object_id}?category=${encodeURIComponent(item.category)}`);
      }
      return api('DELETE', `/fleet/work-orders/${workOrderId}/files/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', workOrderId] });
      toast.success('File removed');
    },
    onError: () => toast.error('Failed to remove file'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ fileId, category }: { fileId: string; category: string }) => {
      return api('PUT', `/fleet/work-orders/${workOrderId}/files/${fileId}?category=${encodeURIComponent(category)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrderFiles', workOrderId] });
      toast.success('File moved');
    },
    onError: () => toast.error('Failed to move file'),
  });

  const handleMoveFile = (item: WorkOrderFileItem, newCategory: string) => {
    if (item.is_legacy) {
      toast.error('Legacy files cannot be moved. Remove and re-upload into the desired category.');
      return;
    }
    updateCategoryMutation.mutate({ fileId: item.id, category: newCategory });
  };

  const fetchDownloadUrl = async (fid: string) => {
    try {
      const r: any = await api('GET', withFileAccessToken(`/files/${fid}/download`));
      return String(r.download_url || '');
    } catch {
      toast.error('Download link unavailable');
      return '';
    }
  };

  const onDropRight = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      const category = selectedCategory === 'all' ? uploadCategory : selectedCategory;
      await uploadMultiple(Array.from(e.dataTransfer.files), category);
      return;
    }
    if (draggedFileId && selectedCategory !== 'all') {
      const item = files.find((f) => f.id === draggedFileId);
      if (item) handleMoveFile(item, selectedCategory);
      setDraggedFileId(null);
    }
  };

  const onDropCategory = async (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      await uploadMultiple(Array.from(e.dataTransfer.files), categoryId);
      return;
    }
    if (draggedFileId && categoryId !== 'all') {
      const item = files.find((f) => f.id === draggedFileId);
      if (item) handleMoveFile(item, categoryId);
      setDraggedFileId(null);
    }
  };

  if (isLoading) return <div className="py-4 text-gray-500">Loading files…</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Files</h2>
        </div>

        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex min-h-[400px]">
            {/* Left sidebar - categories */}
            <div className="w-64 border-r bg-gray-50 flex flex-col shrink-0">
              <div className="p-3 border-b">
                <div className="text-xs font-semibold text-gray-700">File Categories</div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {WO_FILE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => cat.id !== 'all' && onDropCategory(e, cat.id)}
                    className={`w-full text-left px-3 py-2 border-b hover:bg-white transition-colors ${
                      selectedCategory === cat.id ? 'bg-white border-l-4 border-l-brand-red font-semibold' : 'text-gray-700'
                    } ${isDragging && cat.id !== 'all' ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{cat.id === 'all' ? '📁' : '📄'}</span>
                      <span className="text-xs">{cat.label}</span>
                      <span className="ml-auto text-[10px] text-gray-500">({filesByCategory[cat.id]?.length ?? 0})</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right content - files table + drop zone */}
            <div
              className={`flex-1 overflow-y-auto p-4 ${isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-400' : ''}`}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={onDropRight}
            >
              <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative flex-1 max-w-sm">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </span>
                    <input
                      type="text"
                      value={fileSearchQuery}
                      onChange={(e) => setFileSearchQuery(e.target.value)}
                      placeholder="Search by file name..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red"
                    />
                  </div>
                  <div className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                    {WO_FILE_CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? selectedCategory}
                    <span className="ml-1 text-gray-500">({currentFiles.length})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedCategory === 'all' && (
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1.5"
                    >
                      {WO_FILE_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowUpload(true)}
                    className="px-2 py-1.5 rounded bg-brand-red text-white text-xs font-medium"
                  >
                    + Upload File
                  </button>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden bg-white">
                {currentFiles.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-12" />
                          <th
                            className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSort('name')}
                          >
                            Name {sortBy === 'name' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                          </th>
                          <th
                            className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSort('type')}
                          >
                            Type {sortBy === 'type' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                          </th>
                          <th
                            className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => handleSort('uploaded_at')}
                          >
                            Upload Date {sortBy === 'uploaded_at' && <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                          </th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {currentFiles.map((f) => {
                          const icon = iconFor(f);
                          const isImg = f.is_image || String(f.content_type || '').startsWith('image/');
                          const name = f.original_name || f.file_object_id || 'File';
                          return (
                            <tr
                              key={f.id}
                              draggable
                              onDragStart={() => setDraggedFileId(f.id)}
                              onDragEnd={() => setDraggedFileId(null)}
                              className="hover:bg-gray-50 cursor-move"
                            >
                              <td className="px-3 py-2">
                                {isImg ? (
                                  <a
                                    href={withFileAccessToken(`/files/${f.file_object_id}/download`)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 block"
                                  >
                                    <img src={withFileAccessToken(`/files/${f.file_object_id}/thumbnail?w=64`)} alt={name} className="w-full h-full object-cover" />
                                  </a>
                                ) : (
                                  <div className={`w-8 h-10 rounded-lg ${icon.color} text-white flex items-center justify-center text-[10px] font-extrabold select-none`}>
                                    {icon.label}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <a
                                  href={withFileAccessToken(`/files/${f.file_object_id}/download`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-semibold truncate max-w-xs block hover:underline"
                                >
                                  {name}
                                </a>
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{getFileTypeLabel(f)}</td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const url = await fetchDownloadUrl(f.file_object_id);
                                      if (url) window.open(url, '_blank');
                                    }}
                                    title="Download"
                                    className="p-1 rounded hover:bg-gray-100 text-xs"
                                  >
                                    ⬇️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => window.confirm('Remove this file?') && deleteMutation.mutate(f)}
                                    title="Delete"
                                    className="p-1 rounded hover:bg-red-50 text-red-600 text-xs"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-3 py-6 text-center text-gray-500">
                    <div className="text-2xl mb-2">📁</div>
                    <div className="text-xs">No files in this category</div>
                    <div className="text-[10px] mt-1">Drag and drop files here or click &quot;Upload File&quot;</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <OverlayPortal><div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={(e) => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold mb-3">Upload Files</div>
            <div className="space-y-3">
              {selectedCategory === 'all' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    {WO_FILE_CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1.5">Files (multiple supported)</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={async (e) => {
                    const list = e.target.files;
                    if (list?.length) {
                      setShowUpload(false);
                      await uploadMultiple(Array.from(list));
                    }
                  }}
                  className="w-full text-xs"
                />
              </div>
              <div className="text-[10px] text-gray-500">You can also drag and drop files onto a category in the sidebar or onto the file area.</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowUpload(false)} className="px-3 py-1.5 rounded border text-xs">
                Cancel
              </button>
            </div>
          </div>
        </div></OverlayPortal>
      )}

      {/* Upload progress */}
      {uploadQueue.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border w-80 max-h-96 overflow-hidden z-50">
          <div className="p-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-xs">Upload progress</span>
            <button type="button" onClick={() => setUploadQueue([])} className="text-gray-500 hover:text-gray-700 text-[10px]">
              Clear
            </button>
          </div>
          <div className="overflow-y-auto max-h-80">
            {uploadQueue.map((u) => (
              <div key={u.id} className="p-2.5 border-b">
                <div className="text-xs font-medium truncate" title={u.file.name}>{u.file.name}</div>
                <div className="text-[10px] text-gray-500">
                  {u.status === 'pending' && 'Waiting…'}
                  {u.status === 'uploading' && 'Uploading…'}
                  {u.status === 'success' && 'Done'}
                  {u.status === 'error' && (u.error || 'Error')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Cost Form Component
function CostFormInline({ workOrderId, category, existingCost, existingCostIndex, onSuccess, onCancel }: {
  workOrderId: string;
  category: 'labor' | 'parts' | 'other';
  existingCost?: CostItem;
  existingCostIndex?: number;
  onSuccess: (costs: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    description: existingCost?.description || '',
    amount: existingCost?.amount || 0,
  });

  const { data: workOrder } = useQuery({
    queryKey: ['workOrder', workOrderId],
    queryFn: () => api<WorkOrder>('GET', `/fleet/work-orders/${workOrderId}`),
  });

  const getCostTotal = (costs: any, cat: 'labor' | 'parts' | 'other'): number => {
    const cost = costs?.[cat];
    if (!cost) return 0;
    if (typeof cost === 'number') return cost;
    if (Array.isArray(cost)) {
      return cost.reduce((sum, item) => sum + (item.amount || 0), 0);
    }
    return 0;
  };

  const handleSubmit = () => {
    if (!form.description.trim() || form.amount <= 0) {
      toast.error('Description and amount are required');
      return;
    }

    const currentCosts = workOrder?.costs || {};
    // Convert legacy format to new format if needed
    let categoryCosts: CostItem[] = [];
    if (Array.isArray(currentCosts[category])) {
      categoryCosts = [...currentCosts[category]];
    } else if (typeof currentCosts[category] === 'number' && currentCosts[category] > 0) {
      // Convert legacy single number to array format
      categoryCosts = [{ description: 'Legacy cost', amount: currentCosts[category] as number, invoice_files: [] }];
    }
    
    const newCostItem: CostItem = {
      description: form.description.trim(),
      amount: form.amount,
      invoice_files: [],
    };

    let newCosts: any = { ...currentCosts };
    
    // Handle editing vs adding
    if (existingCost && existingCostIndex !== undefined) {
      // Replace item at index
      newCosts[category] = categoryCosts.map((item, idx) => 
        idx === existingCostIndex ? newCostItem : item
      );
    } else {
      // Add new cost
      newCosts[category] = [...categoryCosts, newCostItem];
    }
    
    // Ensure all categories are arrays
    if (!Array.isArray(newCosts.labor)) newCosts.labor = typeof newCosts.labor === 'number' ? [{ description: 'Legacy', amount: newCosts.labor, invoice_files: [] }] : [];
    if (!Array.isArray(newCosts.parts)) newCosts.parts = typeof newCosts.parts === 'number' ? [{ description: 'Legacy', amount: newCosts.parts, invoice_files: [] }] : [];
    if (!Array.isArray(newCosts.other)) newCosts.other = typeof newCosts.other === 'number' ? [{ description: 'Legacy', amount: newCosts.other, invoice_files: [] }] : [];
    
    // Calculate total
    const total = getCostTotal(newCosts, 'labor') + getCostTotal(newCosts, 'parts') + getCostTotal(newCosts, 'other');
    newCosts.total = total;
    onSuccess(newCosts);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-2 w-full min-w-0 mb-4">
      {/* Icon - like Project Pricing */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-500">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <input
        type="text"
        value={form.description}
        onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
        className="flex-1 min-w-[100px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
        placeholder="Name"
      />
      <input
        type="text"
        inputMode="decimal"
        value={form.amount > 0 ? form.amount : ''}
        onChange={(e) => {
          const v = e.target.value.replace(/,/g, '');
          const num = parseFloat(v) || 0;
          setForm(prev => ({ ...prev, amount: num }));
        }}
        className="flex-1 min-w-[100px] max-w-[140px] rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
        placeholder="Price"
      />
      <button
        type="button"
        onClick={onCancel}
        className="p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 flex-shrink-0"
        title="Cancel"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!form.description.trim() || form.amount <= 0}
        className="px-3 py-1.5 rounded-lg bg-brand-red text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
      >
        {existingCost ? 'Update' : 'Add'}
      </button>
    </div>
  );
}
