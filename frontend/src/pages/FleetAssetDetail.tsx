import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import InspectionChecklist from '@/components/InspectionChecklist';

type FleetAsset = {
  id: string;
  asset_type: string;
  name: string;
  vin?: string;
  model?: string;
  year?: number;
  division_id?: string;
  odometer_current?: number;
  odometer_last_service?: number;
  hours_current?: number;
  hours_last_service?: number;
  status: string;
  photos?: string[];
  documents?: string[];
  notes?: string;
  created_at: string;
};

type Inspection = {
  id: string;
  fleet_asset_id: string;
  inspection_date: string;
  inspector_user_id?: string;
  checklist_results?: Record<string, any>;
  photos?: string[];
  result: string;
  notes?: string;
  auto_generated_work_order_id?: string;
  created_at: string;
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
  assigned_to_user_id?: string;
  photos?: string[];
  costs?: { labor?: number; parts?: number; other?: number; total?: number };
  created_at: string;
};

type FleetLog = {
  id: string;
  fleet_asset_id: string;
  log_type: string;
  log_date: string;
  user_id?: string;
  description: string;
  odometer_snapshot?: number;
  hours_snapshot?: number;
  status_snapshot?: string;
  related_work_order_id?: string;
  created_at: string;
};

const checklistItems = [
  { key: 'tire_condition', label: 'Tire Condition' },
  { key: 'oil_level', label: 'Oil Level' },
  { key: 'fluids', label: 'Fluids' },
  { key: 'lights', label: 'Lights' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'dashboard_warnings', label: 'Dashboard Warnings' },
  { key: 'interior_condition', label: 'Interior Condition' },
  { key: 'exterior_condition', label: 'Exterior Condition' },
];

export default function FleetAssetDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'inspections' | 'work-orders' | 'logs'>(initialTab);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | null;
    if (tabParam && ['general', 'inspections', 'work-orders', 'logs'].includes(tabParam)) {
      setTab(tabParam);
    }
  }, [location.search]);

  const isValidId = id && id !== 'new';

  const { data: asset, isLoading } = useQuery({
    queryKey: ['fleetAsset', id],
    queryFn: () => api<FleetAsset>('GET', `/fleet/assets/${id}`),
    enabled: isValidId,
  });

  const { data: inspections } = useQuery({
    queryKey: ['fleetAssetInspections', id],
    queryFn: () => api<Inspection[]>('GET', `/fleet/assets/${id}/inspections`),
    enabled: isValidId,
  });

  const { data: workOrders } = useQuery({
    queryKey: ['fleetAssetWorkOrders', id],
    queryFn: () => api<WorkOrder[]>('GET', `/fleet/assets/${id}/work-orders`),
    enabled: isValidId,
  });

  const { data: logs } = useQuery({
    queryKey: ['fleetAssetLogs', id],
    queryFn: () => api<FleetLog[]>('GET', `/fleet/assets/${id}/logs`),
    enabled: isValidId,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    maintenance: 'bg-yellow-100 text-yellow-800',
    retired: 'bg-red-100 text-red-800',
  };

  const urgencyColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    normal: 'bg-gray-100 text-gray-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };

  if (!isValidId) {
    return <div className="p-4">Invalid asset ID</div>;
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-gray-100 animate-pulse rounded" />
      </div>
    );
  }

  if (!asset) {
    return <div className="p-4">Asset not found</div>;
  }

  return (
    <div className="space-y-4">
      <div className="mb-3 rounded-xl border bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-extrabold">{asset.name}</div>
            <div className="text-sm opacity-90 capitalize">{asset.asset_type.replace('_', ' ')}</div>
          </div>
          <button
            onClick={() => nav('/fleet')}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm"
          >
            ← Back to Fleet
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['general', 'inspections', 'work-orders', 'logs'] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              nav(`/fleet/assets/${id}?tab=${t}`, { replace: true });
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
                <div className="font-medium">{asset.name}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">VIN/Serial</label>
                <div className="font-medium">{asset.vin || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Model</label>
                <div className="font-medium">{asset.model || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Year</label>
                <div className="font-medium">{asset.year || '-'}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Status</label>
                <div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>
                    {asset.status}
                  </span>
                </div>
              </div>
              {asset.asset_type === 'vehicle' && (
                <>
                  <div>
                    <label className="text-sm text-gray-600">Current Odometer</label>
                    <div className="font-medium">{asset.odometer_current?.toLocaleString() || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Last Service Odometer</label>
                    <div className="font-medium">{asset.odometer_last_service?.toLocaleString() || '-'}</div>
                  </div>
                </>
              )}
              {(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                <>
                  <div>
                    <label className="text-sm text-gray-600">Current Hours</label>
                    <div className="font-medium">{asset.hours_current?.toLocaleString() || '-'}</div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Last Service Hours</label>
                    <div className="font-medium">{asset.hours_last_service?.toLocaleString() || '-'}</div>
                  </div>
                </>
              )}
            </div>
            {asset.notes && (
              <div>
                <label className="text-sm text-gray-600">Notes</label>
                <div className="mt-1 p-3 bg-gray-50 rounded">{asset.notes}</div>
              </div>
            )}
            {asset.photos && asset.photos.length > 0 && (
              <div>
                <label className="text-sm text-gray-600 mb-2 block">Photos</label>
                <div className="grid grid-cols-4 gap-2">
                  {asset.photos.map((photoId, idx) => (
                    <img
                      key={idx}
                      src={`/files/${photoId}/thumbnail?w=300`}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-24 object-cover rounded border"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'inspections' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Inspections</h3>
              <button
                onClick={() => setShowInspectionForm(!showInspectionForm)}
                className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
              >
                {showInspectionForm ? 'Cancel' : '+ New Inspection'}
              </button>
            </div>

            {showInspectionForm && (
              <InspectionFormInline
                assetId={id!}
                onSuccess={() => {
                  setShowInspectionForm(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssetInspections', id] });
                }}
                onCancel={() => setShowInspectionForm(false)}
                employees={employees}
              />
            )}

            <div className="space-y-2">
              {Array.isArray(inspections) && inspections.map(inspection => (
                <div
                  key={inspection.id}
                  className="border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">
                        {new Date(inspection.inspection_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        Result: <span className={inspection.result === 'pass' ? 'text-green-600' : 'text-red-600'}>
                          {inspection.result}
                        </span>
                      </div>
                      {inspection.notes && (
                        <div className="text-sm text-gray-600 mt-1">{inspection.notes}</div>
                      )}
                      {inspection.photos && inspection.photos.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {inspection.photos.map((photoId, idx) => (
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
                    {inspection.auto_generated_work_order_id && (
                      <button
                        onClick={() => {
                          setTab('work-orders');
                          nav(`/fleet/assets/${id}?tab=work-orders`, { replace: true });
                        }}
                        className="text-sm text-brand-red hover:underline ml-4"
                      >
                        View Work Order
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {(!inspections || inspections.length === 0) && !showInspectionForm && (
              <div className="text-center text-gray-500 py-8">No inspections found</div>
            )}
          </div>
        )}

        {tab === 'work-orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Work Orders</h3>
              <button
                onClick={() => setShowWorkOrderForm(!showWorkOrderForm)}
                className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
              >
                {showWorkOrderForm ? 'Cancel' : '+ New Work Order'}
              </button>
            </div>

            {showWorkOrderForm && (
              <WorkOrderFormInline
                assetId={id!}
                onSuccess={() => {
                  setShowWorkOrderForm(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssetWorkOrders', id] });
                }}
                onCancel={() => setShowWorkOrderForm(false)}
                employees={employees}
              />
            )}

            <div className="space-y-2">
              {Array.isArray(workOrders) && workOrders.map(wo => (
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
                        <span className={`px-2 py-1 rounded text-xs ${urgencyColors[wo.urgency] || 'bg-gray-100 text-gray-800'}`}>
                          {wo.urgency}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${statusColors[wo.status] || 'bg-gray-100 text-gray-800'}`}>
                          {wo.status}
                        </span>
                      </div>
                      {wo.photos && wo.photos.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {wo.photos.map((photoId, idx) => (
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
              ))}
            </div>
            {(!workOrders || workOrders.length === 0) && !showWorkOrderForm && (
              <div className="text-center text-gray-500 py-8">No work orders found</div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Logs & History</h3>
            <div className="space-y-2">
              {Array.isArray(logs) && logs.map(log => (
                <div key={log.id} className="border-l-4 border-gray-300 pl-4 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium capitalize">{log.log_type.replace('_', ' ')}</div>
                      <div className="text-sm text-gray-600">{log.description}</div>
                      {log.odometer_snapshot && (
                        <div className="text-xs text-gray-500 mt-1">
                          Odometer: {log.odometer_snapshot.toLocaleString()}
                        </div>
                      )}
                      {log.hours_snapshot && (
                        <div className="text-xs text-gray-500 mt-1">
                          Hours: {log.hours_snapshot.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(log.log_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {(!logs || logs.length === 0) && (
              <div className="text-center text-gray-500 py-8">No logs found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Inline Inspection Form Component
function InspectionFormInline({ assetId, onSuccess, onCancel, employees }: {
  assetId: string;
  onSuccess: () => void;
  onCancel: () => void;
  employees: any[];
}) {
  const [form, setForm] = useState({
    inspection_date: new Date().toISOString().split('T')[0],
    inspector_user_id: '',
    result: 'pass',
    notes: '',
  });
  const [checklist, setChecklist] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const uploadFile = async (file: File): Promise<string> => {
    const name = file.name;
    const type = file.type || 'image/jpeg';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: 'fleet-inspection-photos',
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(file => uploadFile(file));
      const uploadedIds = await Promise.all(uploadPromises);
      setPhotos(prev => [...prev, ...uploadedIds]);
      toast.success('Photos uploaded');
    } catch (error) {
      toast.error('Failed to upload photos');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        fleet_asset_id: assetId,
        inspection_date: new Date(form.inspection_date).toISOString(),
        inspector_user_id: form.inspector_user_id || null,
        checklist_results: Object.keys(checklist).length > 0 ? checklist : null,
        result: form.result,
        notes: form.notes.trim() || null,
        photos: photos.length > 0 ? photos : null,
      };
      return api('POST', '/fleet/inspections', payload);
    },
    onSuccess: () => {
      toast.success('Inspection created successfully');
      onSuccess();
    },
    onError: () => {
      toast.error('Failed to create inspection');
    },
  });

  return (
    <div className="border rounded-lg p-4 bg-gray-50 mb-4">
      <h4 className="font-semibold mb-3">New Inspection</h4>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Date *</label>
            <input
              type="date"
              value={form.inspection_date}
              onChange={(e) => updateField('inspection_date', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inspector</label>
            <select
              value={form.inspector_user_id}
              onChange={(e) => updateField('inspector_user_id', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">Unassigned</option>
              {Array.isArray(employees) && employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.profile?.preferred_name || emp.profile?.first_name || emp.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Result *</label>
            <select
              value={form.result}
              onChange={(e) => updateField('result', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="conditional">Conditional</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Checklist</label>
          <InspectionChecklist
            items={checklistItems}
            results={checklist}
            onChange={setChecklist}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Photos</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="w-full px-3 py-2 border rounded-lg"
          />
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2">
              {photos.map((photoId, idx) => (
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || uploading}
            className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Inspection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline Work Order Form Component
function WorkOrderFormInline({ assetId, onSuccess, onCancel, employees }: {
  assetId: string;
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
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const uploadFile = async (file: File, category: string): Promise<string> => {
    const name = file.name;
    const type = file.type || 'application/octet-stream';
    const up: any = await api('POST', '/files/upload', {
      original_name: name,
      content_type: type,
      employee_id: null,
      project_id: null,
      client_id: null,
      category_id: category,
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

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(file => uploadFile(file, 'fleet-work-order-photos'));
      const uploadedIds = await Promise.all(uploadPromises);
      setPhotos(prev => [...prev, ...uploadedIds]);
      toast.success('Files uploaded');
    } catch (error) {
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entity_type: 'fleet',
        entity_id: assetId,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: form.status,
        assigned_to_user_id: form.assigned_to_user_id || null,
        photos: photos.length > 0 ? photos : null,
        costs: { labor: [], parts: [], other: [], total: 0 }, // Initialize with empty arrays
        origin_source: 'manual',
      };
      return api('POST', '/fleet/work-orders', payload);
    },
    onSuccess: async (data: any) => {
      toast.success('Work order created successfully');
      onSuccess();
    },
    onError: () => {
      toast.error('Failed to create work order');
    },
  });

  return (
    <div className="border rounded-lg p-4 bg-gray-50 mb-4">
      <h4 className="font-semibold mb-3">New Work Order</h4>
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
              {Array.isArray(employees) && employees.map((emp: any) => (
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
          <p className="text-xs text-gray-500 mt-1">You can upload photos and documents (PDF, images, etc.)</p>
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {photos.map((photoId, idx) => (
                <img
                  key={idx}
                  src={`/files/${photoId}/thumbnail?w=100`}
                  alt={`File ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded border"
                  onError={(e) => {
                    // If it's not an image, show a document icon
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded">
          <p>💡 <strong>Tip:</strong> You can add individual costs with descriptions and invoice files after creating the work order.</p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
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
    </div>
  );
}
