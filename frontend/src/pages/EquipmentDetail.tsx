import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatDateLocal } from '@/lib/dateUtils';

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

  const { data: assignments = [] } = useQuery({
    queryKey: ['equipmentAssignments', id],
    queryFn: () => api<AssetAssignment[]>('GET', `/fleet/equipment/${id}/assignments`),
    enabled: isValidId,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

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

  const statusColors: Record<string, string> = {
    available: 'bg-green-100 text-green-800',
    checked_out: 'bg-blue-100 text-blue-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
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

  if (!isValidId) {
    return <div className="p-4">Invalid equipment ID</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  if (!equipment) {
    return <div className="p-4">Equipment not found</div>;
  }

  const isAssigned = !!openAssignment;

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Header - same layout as FleetAssetDetail */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              onClick={() => nav(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900 flex-shrink-0"
              title="Back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold text-gray-900 truncate">{equipment.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {equipment.unit_number && (
                  <span className="text-xs text-gray-600">Unit #{equipment.unit_number}</span>
                )}
                <span className="text-xs text-gray-500 capitalize">{equipment.category.replace('_', ' ')}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[equipment.status] || 'bg-gray-100 text-gray-800'}`}
                >
                  {equipment.status.replace('_', ' ')}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${isAssigned ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
                >
                  {isAssigned ? 'Assigned' : 'Available'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {openAssignment ? (
              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Return
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAssignModal(true)}
                className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Assign
              </button>
            )}
            <div className="text-right pl-4 border-l border-gray-200">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Today</div>
              <div className="text-xs font-semibold text-gray-700">{todayLabel}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-4">
          {(['general', 'work-orders', 'logs'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                nav(`/fleet/equipment/${id}?tab=${t}`, { replace: true });
              }}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
                tab === t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white p-4 min-w-0 overflow-hidden">
        {tab === 'general' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Basic Information</h4>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-600">Name</div>
                    <div className="font-medium">{equipment.name}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Unit Number</div>
                    <div className="font-medium">{equipment.unit_number || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Category</div>
                    <div className="font-medium capitalize">{equipment.category.replace('_', ' ')}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Serial Number</div>
                    <div className="font-medium">{equipment.serial_number || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Brand</div>
                    <div className="font-medium">{equipment.brand || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Model</div>
                    <div className="font-medium">{equipment.model || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-600">Value</div>
                    <div className="font-medium">
                      {equipment.value ? `$${equipment.value.toLocaleString()}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Status</div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColors[equipment.status] || 'bg-gray-100 text-gray-800'}`}
                    >
                      {equipment.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Assignment & Dates</h4>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-600">Assignment Status</div>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${openAssignment ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}
                    >
                      {openAssignment ? 'Assigned' : 'Available'}
                    </span>
                  </div>
                  {openAssignment && (
                    <>
                      <div>
                        <div className="text-gray-600">Assigned to</div>
                        <div className="font-medium">
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
                        <div className="font-medium">{formatDateLocal(new Date(openAssignment.assigned_at))}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Department</div>
                        <div className="font-medium">{openAssignment.department_snapshot || '—'}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div className="text-gray-600">Warranty Expiry</div>
                    <div className="font-medium">
                      {equipment.warranty_expiry ? new Date(equipment.warranty_expiry).toLocaleDateString() : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Purchase Date</div>
                    <div className="font-medium">
                      {equipment.purchase_date ? new Date(equipment.purchase_date).toLocaleDateString() : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {equipment.notes && (
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Notes</h4>
                </div>
                <div className="p-4 text-sm">{equipment.notes}</div>
              </div>
            )}
          </div>
        )}

        {tab === 'work-orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Work Orders</h3>
              <button
                onClick={() => setShowWorkOrderForm(true)}
                className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
              >
                + New Work Order
              </button>
            </div>
            <div className="space-y-2">
              {Array.isArray(workOrders) &&
                workOrders.map((wo) => {
                  const p = wo.photos as string[] | { before?: string[]; after?: string[] } | null;
                  const photoList = Array.isArray(p)
                    ? p
                    : p && typeof p === 'object'
                      ? [...(Array.isArray((p as any).before) ? (p as any).before : []), ...(Array.isArray((p as any).after) ? (p as any).after : [])]
                      : [];
                  return (
                    <div
                      key={wo.id}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => nav(`/fleet/work-orders/${wo.id}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{wo.work_order_number}</div>
                          <div className="text-sm text-gray-600">{wo.description}</div>
                          <div className="flex gap-2 mt-2">
                            <span
                              className={`px-2 py-1 rounded text-xs ${urgencyColors[wo.urgency] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {wo.urgency}
                            </span>
                            <span
                              className={`px-2 py-1 rounded text-xs ${statusColors[wo.status] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {wo.status}
                            </span>
                          </div>
                          {photoList.length > 0 && (
                            <div className="flex gap-2 mt-2">
                              {photoList.slice(0, 3).map((photoId: string, idx: number) => (
                                <img
                                  key={idx}
                                  src={`/files/${photoId}/thumbnail?w=100`}
                                  alt={`Photo ${idx + 1}`}
                                  className="w-16 h-16 object-cover rounded border"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 ml-4">
                          {new Date(wo.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {(!workOrders || workOrders.length === 0) && (
              <div className="text-center text-gray-500 py-8">No work orders found</div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Logs & History</h3>
            <div className="space-y-2">
              {Array.isArray(logs) &&
                logs.map((log) => {
                  const linkedAssignment =
                    log.log_type === 'checkout' || log.log_type === 'checkin' ? findAssignmentForLog(log) : null;
                  const isClickable = !!linkedAssignment;
                  const displayLogType = log.log_type === 'checkout' ? 'assignment' : log.log_type === 'checkin' ? 'return' : log.log_type;
                  return (
                    <div
                      key={log.id}
                      className={`border-l-4 pl-4 py-2 ${isClickable ? 'border-brand-red cursor-pointer hover:bg-gray-50 rounded-r-lg transition-colors' : 'border-gray-300'}`}
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
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium capitalize">{displayLogType.replace('_', ' ')}</div>
                          <div className="text-sm text-gray-600">{log.description}</div>
                          {isClickable && (
                            <div className="text-xs text-brand-red mt-1">Click for full details</div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{new Date(log.log_date).toLocaleDateString()}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {(!logs || logs.length === 0) && (
              <div className="text-center text-gray-500 py-8">No logs found</div>
            )}
          </div>
        )}
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
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowWorkOrderForm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              <span>New Work Order</span>
              <button
                type="button"
                onClick={() => setShowWorkOrderForm(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <EquipmentWorkOrderFormInline
                equipmentId={id!}
                onSuccess={() => {
                  setShowWorkOrderForm(false);
                  queryClient.invalidateQueries({ queryKey: ['equipmentWorkOrders', id] });
                }}
                onCancel={() => setShowWorkOrderForm(false)}
                employees={employees}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [form, setForm] = useState({
    description: '',
    category: 'maintenance',
    urgency: 'normal',
    status: 'open',
    assigned_to_user_id: '',
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const uploadFile = async (file: File, category: string): Promise<string> => {
    const up: any = await api('POST', '/files/upload', {
      original_name: file.name,
      content_type: file.type || 'application/octet-stream',
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: category,
    });
    await fetch(up.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-ms-blob-type': 'BlockBlob' },
      body: file,
    });
    const conf: any = await api('POST', '/files/confirm', {
      key: up.key,
      size_bytes: file.size,
      checksum_sha256: 'na',
      content_type: file.type || 'application/octet-stream',
    });
    return conf.id;
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map((file) => uploadFile(file, 'fleet-work-order-photos'));
      const uploadedIds = await Promise.all(uploadPromises);
      setPhotos((prev) => [...prev, ...uploadedIds]);
      toast.success('Files uploaded');
    } catch {
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entity_type: 'equipment',
        entity_id: equipmentId,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: form.status,
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="maintenance">Maintenance</option>
            <option value="repair">Repair</option>
            <option value="inspection">Inspection</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Urgency</label>
          <select
            value={form.urgency}
            onChange={(e) => updateField('urgency', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={form.status}
            onChange={(e) => updateField('status', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_parts">Pending Parts</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
          <select
            value={form.assigned_to_user_id}
            onChange={(e) => updateField('assigned_to_user_id', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="">Unassigned</option>
            {Array.isArray(employees) &&
              employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.profile?.preferred_name || emp.profile?.first_name || emp.username}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description / Notes *</label>
        <textarea
          value={form.description}
          onChange={(e) => updateField('description', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border rounded-lg"
          placeholder="Describe the issue, work needed, and any additional notes..."
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Photos & Documents</label>
        <input
          ref={photoInputRef}
          type="file"
          multiple
          onChange={handlePhotoChange}
          disabled={uploading}
          className="w-full px-3 py-2 border rounded-lg"
        />
        {photos.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {photos.map((photoId, idx) => (
              <img
                key={idx}
                src={`/files/${photoId}/thumbnail?w=100`}
                alt={`File ${idx + 1}`}
                className="w-16 h-16 object-cover rounded border"
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!form.description.trim() || createMutation.isPending || uploading}
          className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Work Order'}
        </button>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
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
                    src={`/files/${photoId}/thumbnail?w=100`}
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
    </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
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
                    src={`/files/${photoId}/thumbnail?w=100`}
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
    </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
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
                          src={`/files/${photoId}/thumbnail?w=200`}
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
                          src={`/files/${photoId}/thumbnail?w=200`}
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
    </div>
  );
}
