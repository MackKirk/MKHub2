import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatDateLocal } from '@/lib/dateUtils';
import OverlayPortal from '@/components/OverlayPortal';
import { WorkOrderAttachmentsPicker } from '@/components/fleet/WorkOrderAttachmentsPicker';
import {
  SAFETY_MODAL_OVERLAY,
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  CATEGORY_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_COLORS,
  WORK_ORDER_STATUS_LABELS,
} from '@/lib/fleetBadges';

type Equipment = {
  id: string;
  category: string;
  name: string;
  unit_number?: string;
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

type AssetAssignment = {
  id: string;
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  phone_snapshot?: string;
  address_snapshot?: string;
  department_snapshot?: string;
  assigned_at: string;
  returned_at?: string;
  odometer_out?: number;
  odometer_in?: number;
  hours_out?: number;
  hours_in?: number;
  notes_out?: string;
  notes_in?: string;
  photos_out?: string[];
  photos_in?: string[];
};

type WorkOrder = {
  id: string;
  work_order_number: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  photos?: string[] | { before?: string[]; after?: string[] };
  created_at: string;
};

function flattenWorkOrderPhotos(photos: WorkOrder['photos']): string[] {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos;
  return [
    ...(Array.isArray(photos.before) ? photos.before : []),
    ...(Array.isArray(photos.after) ? photos.after : []),
  ];
}

type EquipmentLog = {
  id: string;
  log_type: string;
  log_date: string;
  description: string;
  created_at: string;
};

function getEmployeeDisplayName(emp: any): string {
  if (!emp) return '';
  const name = (emp.name || '').trim();
  if (name) return name;
  const first = (emp.first_name || emp.profile?.first_name || '').trim();
  const last = (emp.last_name || emp.profile?.last_name || '').trim();
  const full = [first, last].filter(Boolean).join(' ');
  if (full) return full;
  return (emp.preferred_name || emp.profile?.preferred_name || emp.username || '').trim() || '—';
}

export default function EquipmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'work-orders' | 'logs' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'work-orders' | 'logs'>(initialTab);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssetAssignment | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as 'general' | 'work-orders' | 'logs' | null;
    if (tabParam && ['general', 'work-orders', 'logs'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  const isValidId = id && id !== 'new';

  const { data: equipment, isLoading } = useQuery({
    queryKey: ['equipment', id],
    queryFn: () => api<Equipment>('GET', `/fleet/equipment/${id}`),
    enabled: isValidId,
  });

  const { data: workOrders, isLoading: workOrdersLoading } = useQuery({
    queryKey: ['equipmentWorkOrders', id],
    queryFn: () => api<WorkOrder[]>('GET', `/fleet/equipment/${id}/work-orders`),
    enabled: isValidId,
  });

  const { data: logs } = useQuery({
    queryKey: ['equipmentLogs', id],
    queryFn: () => api<EquipmentLog[]>('GET', `/fleet/equipment/${id}/logs`),
    enabled: isValidId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['equipmentAssignments', id],
    queryFn: () => api<AssetAssignment[]>('GET', `/fleet/equipment/${id}/assignments`),
    enabled: isValidId,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');

  const openAssignment = useMemo(() => assignments.find((a) => !a.returned_at), [assignments]);

  const findAssignmentForLog = useCallback(
    (log: EquipmentLog) => {
      if (!Array.isArray(assignments) || assignments.length === 0) return null;
      const logTime = new Date(log.log_date).getTime();
      if (log.log_type === 'checkout') {
        return (
          assignments.find((a) => {
            const t = new Date(a.assigned_at).getTime();
            return Math.abs(t - logTime) < 5000;
          }) ?? null
        );
      }
      if (log.log_type === 'checkin') {
        return (
          assignments.find((a) => a.returned_at && Math.abs(new Date(a.returned_at).getTime() - logTime) < 5000) ?? null
        );
      }
      return null;
    },
    [assignments]
  );

  const assignMutation = useMutation({
    mutationFn: async (data: any) => api('POST', `/fleet/equipment/${id}/assign`, data),
    onSuccess: () => {
      toast.success('Assigned successfully');
      setShowAssignModal(false);
      queryClient.invalidateQueries({ queryKey: ['equipmentAssignments', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment', id] });
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to assign'),
  });

  const returnMutation = useMutation({
    mutationFn: async (data: any) => api('POST', `/fleet/equipment/${id}/return`, data),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturnModal(false);
      queryClient.invalidateQueries({ queryKey: ['equipmentAssignments', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment', id] });
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to return'),
  });

  const canWriteEquipment =
    isAdministrator || !!(me?.permissions || []).includes('equipment:write');

  const [retiringEquipment, setRetiringEquipment] = useState(false);
  const retireEquipmentMutation = useMutation({
    mutationFn: () => api('DELETE', `/fleet/equipment/${id}`),
    onSuccess: () => {
      toast.success('Equipment retired');
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      nav('/company-assets/equipment');
    },
    onError: (error: any) => toast.error(error?.message || 'Retire failed'),
  });

  const [purgingEquipment, setPurgingEquipment] = useState(false);
  const purgeEquipmentMutation = useMutation({
    mutationFn: () => api('POST', `/fleet/equipment/${id}/purge`),
    onSuccess: () => {
      toast.success('Equipment removed from database');
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      nav('/company-assets/equipment');
    },
    onError: (error: any) => toast.error(error?.message || 'Permanent delete failed'),
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

  if (!isValidId) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">Invalid equipment ID</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="h-6 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">Equipment not found</div>
      </div>
    );
  }

  const isAssigned = !!openAssignment;
  const categoryLabel = equipment.category.replace(/_/g, ' ');
  const heroThumbSrc = equipment.photos?.[0]
    ? withFileAccessToken(`/files/${equipment.photos[0]}/thumbnail?w=160`)
    : '/ui/assets/placeholders/project.png';

  const tabLabel: Record<'general' | 'work-orders' | 'logs', string> = {
    general: 'General',
    'work-orders': 'Work orders',
    logs: 'Logs',
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Title bar — same pattern as ProjectDetail, Opportunities, EquipmentList */}
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => nav('/company-assets/equipment')}
              className="flex shrink-0 items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100"
              title="Back to equipment"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <img
              src={heroThumbSrc}
              alt=""
              className="hidden h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover sm:block"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900">{equipment.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                {equipment.unit_number ? <span>Unit #{equipment.unit_number}</span> : null}
                <span className="capitalize">{categoryLabel}</span>
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusColors[equipment.status] || 'bg-gray-100 text-gray-800'}`}
                >
                  {equipment.status.replace(/_/g, ' ')}
                </span>
                <span
                  className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                    isAssigned ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}
                >
                  {isAssigned ? 'Assigned' : 'Available'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {openAssignment ? (
              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Return
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Assign
              </button>
            )}
            {canWriteEquipment ? (
              <button
                type="button"
                disabled={retiringEquipment || retireEquipmentMutation.isPending}
                onClick={async () => {
                  const choice = await confirm({
                    title: 'Retire equipment',
                    message: openAssignment
                      ? 'This item is still assigned. Retiring marks it as removed from active inventory; return it first if you want a clean custody record. Continue?'
                      : 'Retire this equipment? It will stay in the system as retired (history preserved).',
                    confirmText: 'Retire',
                    cancelText: 'Cancel',
                  });
                  if (choice !== 'confirm') return;
                  setRetiringEquipment(true);
                  try {
                    await retireEquipmentMutation.mutateAsync();
                  } finally {
                    setRetiringEquipment(false);
                  }
                }}
                className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retiringEquipment || retireEquipmentMutation.isPending ? 'Retiring…' : 'Retire equipment'}
              </button>
            ) : null}
            {isAdministrator ? (
              <button
                type="button"
                disabled={purgingEquipment || purgeEquipmentMutation.isPending}
                onClick={async () => {
                  const choice = await confirm({
                    title: 'Permanently delete equipment',
                    message:
                      'Remove this equipment row from the database (assignments, logs, checkouts, and linked work orders). For test data cleanup only. This cannot be undone.',
                    confirmText: 'Delete permanently',
                    cancelText: 'Cancel',
                  });
                  if (choice !== 'confirm') return;
                  setPurgingEquipment(true);
                  try {
                    await purgeEquipmentMutation.mutateAsync();
                  } finally {
                    setPurgingEquipment(false);
                  }
                }}
                className="rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {purgingEquipment || purgeEquipmentMutation.isPending ? 'Deleting…' : 'Delete permanently'}
              </button>
            ) : null}
            <div className="hidden border-l border-gray-200 pl-4 text-right sm:block">
              <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Today</div>
              <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs + content — underline tabs + brand red, same as EquipmentList category row */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 px-4">
          {(['general', 'work-orders', 'logs'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                nav(`/company-assets/equipment/${id}?tab=${t}`, { replace: true });
              }}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === t
                  ? 'border-brand-red text-brand-red'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>

        <div className="min-w-0 overflow-hidden p-4">
          {tab === 'general' && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <h4 className="font-semibold text-gray-900">Basic information</h4>
                  </div>
                  <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-gray-600">Name</div>
                      <div className="font-medium text-gray-900">{equipment.name}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Unit number</div>
                      <div className="font-medium text-gray-900">{equipment.unit_number || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Category</div>
                      <div className="font-medium capitalize text-gray-900">{categoryLabel}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Serial number</div>
                      <div className="font-medium text-gray-900">{equipment.serial_number || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Brand</div>
                      <div className="font-medium text-gray-900">{equipment.brand || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Model</div>
                      <div className="font-medium text-gray-900">{equipment.model || '—'}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Value</div>
                      <div className="font-medium text-gray-900">
                        {equipment.value != null ? `$${equipment.value.toLocaleString()}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Status</div>
                      <span
                        className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusColors[equipment.status] || 'bg-gray-100 text-gray-800'}`}
                      >
                        {equipment.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <h4 className="font-semibold text-gray-900">Assignment & dates</h4>
                  </div>
                  <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-gray-600">Assignment</div>
                      <span
                        className={`mt-1 inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                          openAssignment ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {openAssignment ? 'Assigned' : 'Available'}
                      </span>
                    </div>
                    {openAssignment ? (
                      <>
                        <div>
                          <div className="text-gray-600">Assigned to</div>
                          <div className="font-medium text-gray-900">
                            {openAssignment.assigned_to_name ||
                              employees.find((e: any) => e.id === openAssignment.assigned_to_user_id)?.profile
                                ?.preferred_name ||
                              employees.find((e: any) => e.id === openAssignment.assigned_to_user_id)?.username ||
                              openAssignment.assigned_to_user_id ||
                              '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Since</div>
                          <div className="font-medium text-gray-900">
                            {formatDateLocal(new Date(openAssignment.assigned_at))}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-600">Department</div>
                          <div className="font-medium text-gray-900">{openAssignment.department_snapshot || '—'}</div>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <div className="text-gray-600">Warranty expiry</div>
                      <div className="font-medium text-gray-900">
                        {equipment.warranty_expiry ? formatDateLocal(new Date(equipment.warranty_expiry)) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Purchase date</div>
                      <div className="font-medium text-gray-900">
                        {equipment.purchase_date ? formatDateLocal(new Date(equipment.purchase_date)) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {equipment.notes ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                    <h4 className="font-semibold text-gray-900">Notes</h4>
                  </div>
                  <div className="p-4 text-sm text-gray-900">{equipment.notes}</div>
                </div>
              ) : null}
            </div>
          )}

          {tab === 'work-orders' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Work orders</h3>
                <p className="mt-0.5 text-xs text-gray-600">Create or open a work order for this equipment.</p>
              </div>

              <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setShowWorkOrderForm(true)}
                  className="flex min-h-[52px] w-full min-w-0 items-center justify-center rounded-t-xl border-2 border-dashed border-gray-300 bg-white p-2.5 text-center transition-all hover:border-brand-red hover:bg-gray-50"
                >
                  <span className="mr-2 text-lg text-gray-400">+</span>
                  <span className="text-xs font-medium text-gray-700">New work order</span>
                </button>

                {workOrdersLoading && (
                  <div className="border-t border-gray-100 px-4 py-4 text-center text-xs text-gray-500">Loading…</div>
                )}

                {!workOrdersLoading &&
                  Array.isArray(workOrders) &&
                  workOrders.length === 0 && (
                    <div className="border-t border-gray-100 px-4 py-6 text-center text-xs text-gray-500">
                      No work orders yet for this equipment.
                    </div>
                  )}

                {!workOrdersLoading &&
                  Array.isArray(workOrders) &&
                  workOrders.map((wo) => {
                    const photoList = flattenWorkOrderPhotos(wo.photos);
                    const categoryLabel = CATEGORY_LABELS[wo.category] ?? wo.category;
                    return (
                      <button
                        key={wo.id}
                        type="button"
                        onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                        className="flex w-full flex-col gap-1 border-t border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:flex-nowrap">
                          <span className="shrink-0 text-sm font-semibold text-gray-900">{wo.work_order_number}</span>
                          <span className="hidden text-[10px] text-gray-300 sm:inline">·</span>
                          <span className="shrink-0 text-[11px] capitalize text-gray-500">{categoryLabel}</span>
                          <span className="min-w-[4px] flex-1" />
                          <span
                            className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${URGENCY_COLORS[wo.urgency] || 'bg-gray-100 text-gray-800'}`}
                          >
                            {URGENCY_LABELS[wo.urgency] ?? wo.urgency}
                          </span>
                          <span
                            className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${WORK_ORDER_STATUS_COLORS[wo.status] || 'bg-gray-100 text-gray-800'}`}
                          >
                            {WORK_ORDER_STATUS_LABELS[wo.status] ?? wo.status.replace(/_/g, ' ')}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-gray-500">
                            {formatDateLocal(new Date(wo.created_at))}
                          </span>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-xs text-gray-600">{wo.description?.trim() || '—'}</p>
                          {photoList.length > 0 ? (
                            <div className="flex shrink-0 gap-0.5">
                              {photoList.slice(0, 3).map((photoId, idx) => (
                                <img
                                  key={idx}
                                  src={withFileAccessToken(`/files/${photoId}/thumbnail?w=64`)}
                                  alt=""
                                  className="h-8 w-8 rounded border border-gray-200 object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Logs & history</h3>
              <div className="space-y-2">
                {Array.isArray(logs) &&
                  logs.map((log) => {
                    const linkedAssignment =
                      log.log_type === 'checkout' || log.log_type === 'checkin' ? findAssignmentForLog(log) : null;
                    const isClickable = !!linkedAssignment;
                    const displayLogType =
                      log.log_type === 'checkout' ? 'assignment' : log.log_type === 'checkin' ? 'return' : log.log_type;
                    return (
                      <div
                        key={log.id}
                        className={`border-l-4 py-2 pl-4 ${
                          isClickable
                            ? 'cursor-pointer border-brand-red hover:rounded-r-lg hover:bg-gray-50'
                            : 'border-gray-300'
                        }`}
                        onClick={
                          isClickable
                            ? () => {
                                setLogDetailAssignment(linkedAssignment!);
                                setLogDetailLogType(
                                  log.log_type === 'checkout' ? 'assignment' : ('return' as 'assignment' | 'return')
                                );
                              }
                            : undefined
                        }
                        role={isClickable ? 'button' : undefined}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium capitalize text-gray-900">
                              {displayLogType.replace(/_/g, ' ')}
                            </div>
                            <div className="text-sm text-gray-600">{log.description}</div>
                            {isClickable ? (
                              <div className="mt-1 text-xs text-brand-red">Click for full details</div>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-sm text-gray-500">
                            {formatDateLocal(new Date(log.log_date))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              {(!logs || logs.length === 0) && (
                <div className="py-8 text-center text-sm text-gray-500">No logs found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <EquipmentAssignModal
          employees={employees}
          onClose={() => setShowAssignModal(false)}
          onSubmit={(data) => assignMutation.mutate(data)}
          isSubmitting={assignMutation.isPending}
        />
      )}
      {showReturnModal && openAssignment && (
        <EquipmentReturnModal
          openAssignment={openAssignment}
          onClose={() => setShowReturnModal(false)}
          onSubmit={(data) => returnMutation.mutate(data)}
          isSubmitting={returnMutation.isPending}
        />
      )}
      {logDetailAssignment && logDetailLogType && (
        <EquipmentAssignmentLogDetailModal
          assignment={logDetailAssignment}
          logType={logDetailLogType}
          onClose={() => {
            setLogDetailAssignment(null);
            setLogDetailLogType(null);
          }}
        />
      )}
      {showWorkOrderForm && (
        <EquipmentWorkOrderFormInline
          equipmentId={id!}
          onSuccess={() => {
            setShowWorkOrderForm(false);
            queryClient.invalidateQueries({ queryKey: ['equipmentWorkOrders', id] });
          }}
          onCancel={() => setShowWorkOrderForm(false)}
          employees={employees}
        />
      )}
    </div>
  );
}

const EQUIPMENT_NEW_WORK_ORDER_FORM_ID = 'equipment-new-work-order-form';

function EquipmentWorkOrderFormInline({
  equipmentId,
  onSuccess,
  onCancel,
  employees,
}: {
  equipmentId: string;
  onSuccess: () => void;
  onCancel: () => void;
  employees: any[];
}) {
  const newWoTitleId = useId();
  const [form, setForm] = useState({
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    assigned_to_user_id: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const labelClass = SAFETY_MODAL_FIELD_LABEL;
  const inputBase = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm shadow-sm focus:border-brand-red focus:outline-none focus:ring-2 focus:ring-red-500/15';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entity_type: 'equipment',
        entity_id: equipmentId,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
        assigned_to_user_id: form.assigned_to_user_id || null,
        photos: photos.length > 0 ? photos : null,
        costs: { labor: [], parts: [], other: [], total: 0 },
        origin_source: 'manual',
      };
      return api('POST', '/fleet/work-orders', payload);
    },
    onSuccess: () => {
      toast.success('Work order created successfully');
      onSuccess();
    },
    onError: () => toast.error('Failed to create work order'),
  });

  const submitDisabled = !form.description.trim() || createMutation.isPending || uploading;

  return (
    <OverlayPortal>
      <div className={SAFETY_MODAL_OVERLAY} onClick={onCancel}>
        <SafetyFormModalLayout
          widthClass="w-[640px]"
          titleId={newWoTitleId}
          title="New work order"
          subtitle="Describe the work needed. Costs and invoice files can be added on the work order after it is created."
          onClose={onCancel}
          footer={
            <>
              <button type="button" onClick={onCancel} className={SAFETY_MODAL_BTN_CANCEL}>
                Cancel
              </button>
              <button
                type="submit"
                form={EQUIPMENT_NEW_WORK_ORDER_FORM_ID}
                disabled={submitDisabled}
                className={SAFETY_MODAL_BTN_PRIMARY}
              >
                {createMutation.isPending ? 'Creating…' : 'Create work order'}
              </button>
            </>
          }
        >
          <form
            id={EQUIPMENT_NEW_WORK_ORDER_FORM_ID}
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.description.trim()) return;
              createMutation.mutate();
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => updateField('category', e.target.value)}
                  className={inputBase}
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="repair">Repair</option>
                  <option value="inspection">Inspection</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Urgency</label>
                <select
                  value={form.urgency}
                  onChange={(e) => updateField('urgency', e.target.value)}
                  className={inputBase}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Assigned to</label>
                <select
                  value={form.assigned_to_user_id}
                  onChange={(e) => updateField('assigned_to_user_id', e.target.value)}
                  className={inputBase}
                >
                  <option value="">Unassigned</option>
                  {Array.isArray(employees) &&
                    employees.map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {getEmployeeDisplayName(emp)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Description / notes <span className="text-red-600">*</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={4}
                className={`${inputBase} resize-y min-h-[5rem]`}
                placeholder="Describe the issue, work needed, and any additional notes…"
                required
              />
            </div>
            <WorkOrderAttachmentsPicker
              fileIds={photos}
              onFileIdsChange={setPhotos}
              onUploadingChange={setUploading}
              disabled={createMutation.isPending || uploading}
            />
            <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-gray-700">
              <strong className="font-medium text-gray-800">Tip:</strong> add line-item costs and invoices from the work
              order detail page after creation.
            </div>
          </form>
        </SafetyFormModalLayout>
      </div>
    </OverlayPortal>
  );
}

function EquipmentAssignModal({
  employees,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  employees: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const [assigned_to_user_id, setAssignedToUserId] = useState('');
  const [phone_snapshot, setPhoneSnapshot] = useState('');
  const [address_snapshot, setAddressSnapshot] = useState('');
  const [department_snapshot, setDepartmentSnapshot] = useState('');
  const [notes_out, setNotesOut] = useState('');
  const [photos_out, setPhotosOut] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [nameSearch, setNameSearch] = useState('');
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const [departmentDropdownOpen, setDepartmentDropdownOpen] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState('');
  const departmentDropdownRef = useRef<HTMLDivElement>(null);

  const departmentsSorted = useMemo(() => {
    const set = new Set<string>();
    Array.isArray(employees) &&
      employees.forEach((emp: any) => {
        const d = (emp.department || emp.division || '').trim();
        if (d) set.add(d);
      });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [employees]);

  const departmentFiltered = useMemo(() => {
    const q = (departmentSearch || '').trim().toLowerCase();
    if (!q) return departmentsSorted;
    return departmentsSorted.filter((d) => d.toLowerCase().includes(q));
  }, [departmentsSorted, departmentSearch]);

  const employeesSorted = useMemo(() => {
    const list = Array.isArray(employees) ? [...employees] : [];
    return list.sort((a, b) =>
      getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b), undefined, { sensitivity: 'base' })
    );
  }, [employees]);

  const selectedUser = employees.find((e: any) => e.id === assigned_to_user_id);
  const selectedDisplayName = selectedUser ? getEmployeeDisplayName(selectedUser) : '';

  const nameFiltered = useMemo(() => {
    const q = (nameSearch || '').trim().toLowerCase();
    if (!q) return employeesSorted;
    return employeesSorted.filter((emp: any) =>
      getEmployeeDisplayName(emp).toLowerCase().includes(q)
    );
  }, [employeesSorted, nameSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(e.target as Node)) {
        setNameDropdownOpen(false);
      }
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(e.target as Node)) {
        setDepartmentDropdownOpen(false);
        if (departmentSearch.trim()) setDepartmentSnapshot(departmentSearch.trim());
        setDepartmentSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [departmentSearch]);

  useEffect(() => {
    if (selectedUser) {
      const p = selectedUser.profile || selectedUser;
      if (phone_snapshot === '' && (p.phone || p.mobile_phone))
        setPhoneSnapshot(p.phone || p.mobile_phone || '');
      if (address_snapshot === '' && p.address) setAddressSnapshot(p.address);
      if (department_snapshot === '' && (p.department || p.division))
        setDepartmentSnapshot(p.department || p.division || '');
    }
  }, [assigned_to_user_id, selectedUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigned_to_user_id) {
      toast.error('Select who to assign the equipment to');
      return;
    }
    const assigned_to_name = selectedUser ? getEmployeeDisplayName(selectedUser) : '';
    const payload: any = {
      assigned_to_user_id,
      assigned_to_name: assigned_to_name || null,
      phone_snapshot: phone_snapshot || null,
      address_snapshot: address_snapshot || null,
      department_snapshot: department_snapshot || null,
      notes_out: notes_out || null,
      photos_out: photos_out.length ? photos_out : null,
    };
    onSubmit(payload);
  };

  const handleSelectUser = useCallback((userId: string) => {
    setAssignedToUserId(userId);
    setNameDropdownOpen(false);
    setNameSearch('');
  }, []);

  const handleSelectDepartment = useCallback((dept: string) => {
    setDepartmentSnapshot(dept);
    setDepartmentDropdownOpen(false);
    setDepartmentSearch('');
  }, []);

  return (
    <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b font-semibold">Assign</div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div ref={nameDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <div className="relative">
              <input
                type="text"
                value={nameDropdownOpen ? nameSearch : selectedDisplayName}
                onChange={(e) => {
                  setNameSearch(e.target.value);
                  setNameDropdownOpen(true);
                }}
                onFocus={() => setNameDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNameDropdownOpen(false);
                    setNameSearch('');
                  }
                }}
                placeholder="Search or select user..."
                className="w-full px-3 py-2 pr-9 border rounded-lg"
                autoComplete="off"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                {nameDropdownOpen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </span>
            </div>
            {nameDropdownOpen && (
              <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                {nameFiltered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
                ) : (
                  nameFiltered.map((emp: any) => (
                    <li
                      key={emp.id}
                      role="option"
                      aria-selected={emp.id === assigned_to_user_id}
                      onClick={() => handleSelectUser(emp.id)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${emp.id === assigned_to_user_id ? 'bg-gray-50 font-medium' : ''}`}
                    >
                      {getEmployeeDisplayName(emp)}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text"
              value={phone_snapshot}
              onChange={(e) => setPhoneSnapshot(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <AddressAutocomplete
              value={address_snapshot}
              onChange={setAddressSnapshot}
              placeholder=""
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div ref={departmentDropdownRef} className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <div className="relative">
              <input
                type="text"
                value={departmentDropdownOpen ? departmentSearch : department_snapshot}
                onChange={(e) => {
                  setDepartmentSearch(e.target.value);
                  setDepartmentDropdownOpen(true);
                }}
                onFocus={() => setDepartmentDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setDepartmentDropdownOpen(false);
                    setDepartmentSearch('');
                  }
                }}
                className="w-full px-3 py-2 pr-9 border rounded-lg"
                autoComplete="off"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                {departmentDropdownOpen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </span>
            </div>
            {departmentDropdownOpen && (
              <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                {departmentFiltered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
                ) : (
                  departmentFiltered.map((dept) => (
                    <li
                      key={dept}
                      role="option"
                      aria-selected={dept === department_snapshot}
                      onClick={() => handleSelectDepartment(dept)}
                      className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 ${dept === department_snapshot ? 'bg-gray-50 font-medium' : ''}`}
                    >
                      {dept}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image out</label>
            <input
              ref={photosInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                setUploadingPhotos(true);
                try {
                  const uploadFile = async (file: File): Promise<string> => {
                    const up: any = await api('POST', '/files/upload', {
                      original_name: file.name,
                      content_type: file.type || 'image/jpeg',
                      employee_id: null,
                      project_id: null,
                      client_id: null,
                      category_id: 'fleet-assignment-photos',
                    });
                    await fetch(up.upload_url, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': file.type || 'image/jpeg',
                        'x-ms-blob-type': 'BlockBlob',
                      },
                      body: file,
                    });
                    const conf: any = await api('POST', '/files/confirm', {
                      key: up.key,
                      size_bytes: file.size,
                      checksum_sha256: 'na',
                      content_type: file.type || 'image/jpeg',
                    });
                    return conf.id;
                  };
                  const ids = await Promise.all(Array.from(files).map((f) => uploadFile(f)));
                  setPhotosOut((prev) => [...prev, ...ids]);
                  toast.success('Photos uploaded');
                } catch {
                  toast.error('Failed to upload photos');
                } finally {
                  setUploadingPhotos(false);
                  if (photosInputRef.current) photosInputRef.current.value = '';
                }
              }}
              disabled={uploadingPhotos}
              className="w-full px-3 py-2 border rounded-lg"
            />
            {photos_out.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos_out.map((photoId, idx) => (
                  <img
                    key={idx}
                    src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
                    alt={`Photo ${idx + 1}`}
                    className="w-16 h-16 object-cover rounded border"
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes out</label>
            <textarea
              value={notes_out}
              onChange={(e) => setNotesOut(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div></OverlayPortal>
  );
}

function EquipmentReturnModal({
  openAssignment,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  openAssignment: AssetAssignment;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const [notes_in, setNotesIn] = useState('');
  const [photos_in, setPhotosIn] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      notes_in: notes_in || null,
      photos_in: photos_in.length ? photos_in : null,
    });
  };

  return (
    <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b font-semibold">Return</div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Images in</label>
            <input
              ref={photosInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                setUploadingPhotos(true);
                try {
                  const uploadFile = async (file: File): Promise<string> => {
                    const up: any = await api('POST', '/files/upload', {
                      original_name: file.name,
                      content_type: file.type || 'image/jpeg',
                      employee_id: null,
                      project_id: null,
                      client_id: null,
                      category_id: 'fleet-assignment-photos',
                    });
                    await fetch(up.upload_url, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': file.type || 'image/jpeg',
                        'x-ms-blob-type': 'BlockBlob',
                      },
                      body: file,
                    });
                    const conf: any = await api('POST', '/files/confirm', {
                      key: up.key,
                      size_bytes: file.size,
                      checksum_sha256: 'na',
                      content_type: file.type || 'image/jpeg',
                    });
                    return conf.id;
                  };
                  const ids = await Promise.all(Array.from(files).map((f) => uploadFile(f)));
                  setPhotosIn((prev) => [...prev, ...ids]);
                  toast.success('Photos uploaded');
                } catch {
                  toast.error('Failed to upload photos');
                } finally {
                  setUploadingPhotos(false);
                  if (photosInputRef.current) photosInputRef.current.value = '';
                }
              }}
              disabled={uploadingPhotos}
              className="w-full px-3 py-2 border rounded-lg"
            />
            {photos_in.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos_in.map((photoId, idx) => (
                  <img
                    key={idx}
                    src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
                    alt={`Photo ${idx + 1}`}
                    className="w-16 h-16 object-cover rounded border"
                  />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes in</label>
            <textarea
              value={notes_in}
              onChange={(e) => setNotesIn(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Return'}
            </button>
          </div>
        </form>
      </div>
    </div></OverlayPortal>
  );
}

function EquipmentAssignmentLogDetailModal({
  assignment,
  logType,
  onClose,
}: {
  assignment: AssetAssignment;
  logType: 'assignment' | 'return';
  onClose: () => void;
}) {
  const showAssign = true;
  const showReturn = !!assignment.returned_at;

  return (
    <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b font-semibold flex items-center justify-between">
          <span>{logType === 'assignment' ? 'Assignment' : 'Return'} details</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-600"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-6">
          {showAssign && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">Assign</h4>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium">{assignment.assigned_to_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium">{assignment.phone_snapshot || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Address</dt>
                  <dd className="font-medium">{assignment.address_snapshot || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Department</dt>
                  <dd className="font-medium">{assignment.department_snapshot || '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Assigned at</dt>
                  <dd className="font-medium">
                    {assignment.assigned_at ? formatDateLocal(new Date(assignment.assigned_at)) : '—'}
                  </dd>
                </div>
                {assignment.notes_out && (
                  <div>
                    <dt className="text-gray-500">Notes out</dt>
                    <dd className="font-medium whitespace-pre-wrap">{assignment.notes_out}</dd>
                  </div>
                )}
                {assignment.photos_out && assignment.photos_out.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">Images out</dt>
                    <dd className="flex gap-2 flex-wrap mt-1">
                      {assignment.photos_out.map((photoId: string, idx: number) => (
                        <img
                          key={idx}
                          src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)}
                          alt={`Out ${idx + 1}`}
                          className="w-24 h-24 object-cover rounded border"
                        />
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
          {showReturn && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">Return</h4>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-gray-500">Returned at</dt>
                  <dd className="font-medium">
                    {assignment.returned_at ? formatDateLocal(new Date(assignment.returned_at)) : '—'}
                  </dd>
                </div>
                {assignment.notes_in && (
                  <div>
                    <dt className="text-gray-500">Notes in</dt>
                    <dd className="font-medium whitespace-pre-wrap">{assignment.notes_in}</dd>
                  </div>
                )}
                {assignment.photos_in && assignment.photos_in.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">Images in</dt>
                    <dd className="flex gap-2 flex-wrap mt-1">
                      {assignment.photos_in.map((photoId: string, idx: number) => (
                        <img
                          key={idx}
                          src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)}
                          alt={`In ${idx + 1}`}
                          className="w-24 h-24 object-cover rounded border"
                        />
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div></OverlayPortal>
  );
}
