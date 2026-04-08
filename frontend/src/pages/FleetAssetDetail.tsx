import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import InspectionChecklist from '@/components/InspectionChecklist';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatDateLocal } from '@/lib/dateUtils';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { InspectionScheduleForm } from './InspectionNew';
import OverlayPortal from '@/components/OverlayPortal';

type FleetAsset = {
  id: string;
  asset_type: string;
  name: string;
  unit_number?: string;
  vin?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  year?: number;
  condition?: string;
  division_id?: string;
  odometer_current?: number;
  odometer_last_service?: number;
  hours_current?: number;
  hours_last_service?: number;
  status: string;
  icbc_registration_no?: string;
  vancouver_decals?: string[];
  ferry_length?: string;
  gvw_kg?: number;
  fuel_type?: string;
  vehicle_type?: string;
  driver_contact_phone?: string;
  yard_location?: string;
  gvw_value?: number;
  gvw_unit?: string;
  equipment_type_label?: string;
  odometer_next_due_at?: number;
  odometer_noted_issues?: string;
  propane_sticker_cert?: string;
  propane_sticker_date?: string;
  hours_next_due_at?: number;
  hours_noted_issues?: string;
  photos?: string[];
  documents?: string[];
  notes?: string;
  created_at: string;
};

type AssetAssignment = {
  id: string;
  target_type: string;
  fleet_asset_id?: string;
  equipment_id?: string;
  assigned_to_user_id?: string;
  assigned_to_name?: string;
  phone_snapshot?: string;
  address_snapshot?: string;
  department_snapshot?: string;
  assigned_at: string;
  expected_return_at?: string;
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

type FleetComplianceRecord = {
  id: string;
  fleet_asset_id: string;
  record_type: string;
  facility?: string;
  completed_by?: string;
  equipment_classification?: string;
  equipment_make_model?: string;
  serial_number?: string;
  annual_inspection_date?: string;
  expiry_date?: string;
  file_reference_number?: string;
  notes?: string;
  documents?: string[];
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

type FleetAssetHistoryItem = {
  id: string;
  source: 'assignment' | 'audit' | 'fleet_log';
  kind: string;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  occurred_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
  assignment_id?: string | null;
  log_subtype?: 'assign' | 'return' | null;
  audit_action?: string | null;
  changes_json?: Record<string, unknown> | null;
  odometer_snapshot?: number | null;
  hours_snapshot?: number | null;
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
  const initialTab = (searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance'>(initialTab);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [showScheduleInspectionModal, setShowScheduleInspectionModal] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [editingComplianceId, setEditingComplianceId] = useState<string | null>(null);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssetAssignment | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);
  const [historyAuditDetail, setHistoryAuditDetail] = useState<Record<string, unknown> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [initialEditForm, setInitialEditForm] = useState<any>({});

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance' | null;
    if (tabParam && ['general', 'inspections', 'work-orders', 'logs', 'compliance'].includes(tabParam)) {
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

  const { data: historyResponse } = useQuery({
    queryKey: ['fleetAssetHistory', id],
    queryFn: () => api<{ items: FleetAssetHistoryItem[] }>('GET', `/fleet/assets/${id}/history`),
    enabled: isValidId,
  });
  const historyItems = historyResponse?.items ?? [];

  const { data: assignments = [] } = useQuery({
    queryKey: ['fleetAssetAssignments', id],
    queryFn: () => api<AssetAssignment[]>('GET', `/fleet/assets/${id}/assignments`),
    enabled: isValidId,
  });

  const { data: complianceRecords = [] } = useQuery({
    queryKey: ['fleetAssetCompliance', id],
    queryFn: () => api<FleetComplianceRecord[]>('GET', `/fleet/assets/${id}/compliance`),
    enabled: isValidId,
  });

  const openAssignment = useMemo(() => assignments.find((a) => !a.returned_at), [assignments]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<any>('GET', '/settings'),
  });
  const divisions = Array.isArray(settings?.divisions) ? settings.divisions : [];

  // Initialize edit form when entering edit mode
  useEffect(() => {
    if (isEditing && asset) {
      const initial = {
        name: asset.name || '',
        vin: asset.vin || '',
        license_plate: asset.license_plate || '',
        make: asset.make || '',
        model: asset.model || '',
        year: asset.year || '',
        unit_number: asset.unit_number || '',
        condition: asset.condition || '',
        division_id: asset.division_id || '',
        odometer_current: asset.odometer_current || '',
        odometer_last_service: asset.odometer_last_service || '',
        hours_current: asset.hours_current || '',
        hours_last_service: asset.hours_last_service || '',
        status: asset.status || 'active',
        icbc_registration_no: asset.icbc_registration_no || '',
        vancouver_decals: Array.isArray(asset.vancouver_decals) ? asset.vancouver_decals.join(', ') : '',
        ferry_length: asset.ferry_length || '',
        gvw_kg: asset.gvw_kg || '',
        fuel_type: asset.fuel_type || '',
        vehicle_type: asset.vehicle_type || '',
        driver_contact_phone: asset.driver_contact_phone || '',
        yard_location: asset.yard_location || '',
        gvw_value: asset.gvw_value ?? '',
        gvw_unit: asset.gvw_unit || '',
        equipment_type_label: asset.equipment_type_label || '',
        odometer_next_due_at: asset.odometer_next_due_at ?? '',
        odometer_noted_issues: asset.odometer_noted_issues || '',
        propane_sticker_cert: asset.propane_sticker_cert || '',
        propane_sticker_date: asset.propane_sticker_date ? asset.propane_sticker_date.slice(0, 10) : '',
        hours_next_due_at: asset.hours_next_due_at ?? '',
        hours_noted_issues: asset.hours_noted_issues || '',
        notes: asset.notes || '',
      };
      setEditForm(initial);
      setInitialEditForm(initial);
    }
  }, [isEditing, asset]);

  // Check if form has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing) return false;
    return JSON.stringify(editForm) !== JSON.stringify(initialEditForm);
  }, [isEditing, editForm, initialEditForm]);

  // Save function for unsaved changes guard
  const handleSaveForGuard = async () => {
    if (!hasUnsavedChanges || !isEditing) return;
    handleSave();
  };

  // Use unsaved changes guard
  useUnsavedChangesGuard(hasUnsavedChanges, handleSaveForGuard);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return api('PUT', `/fleet/assets/${id}`, data);
    },
    onSuccess: () => {
      toast.success('Asset updated successfully');
      setIsEditing(false);
      setInitialEditForm({ ...editForm });
      queryClient.invalidateQueries({ queryKey: ['fleetAsset', id] });
      queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update asset');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: any) => api('POST', `/fleet/assets/${id}/assign`, data),
    onSuccess: () => {
      toast.success('Assigned successfully');
      setShowAssignModal(false);
      queryClient.invalidateQueries({ queryKey: ['fleetAssetAssignments', id] });
      queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to assign'),
  });

  const returnMutation = useMutation({
    mutationFn: async (data: any) => api('POST', `/fleet/assets/${id}/return`, data),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturnModal(false);
      queryClient.invalidateQueries({ queryKey: ['fleetAssetAssignments', id] });
      queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to return'),
  });

  const handleSave = () => {
    const payload: any = {
      name: editForm.name.trim(),
      vin: editForm.vin.trim() || null,
      license_plate: editForm.license_plate?.trim() || null,
      make: editForm.make?.trim() || null,
      model: editForm.model?.trim() || null,
      year: editForm.year ? parseInt(editForm.year) : null,
      unit_number: editForm.unit_number?.trim() || null,
      condition: editForm.condition || null,
      division_id: editForm.division_id || null,
      status: editForm.status,
      icbc_registration_no: editForm.icbc_registration_no?.trim() || null,
      vancouver_decals: editForm.vancouver_decals ? editForm.vancouver_decals.split(',').map((s: string) => s.trim()).filter(Boolean) : null,
      ferry_length: editForm.ferry_length?.trim() || null,
      gvw_kg: editForm.gvw_kg ? parseInt(editForm.gvw_kg) : null,
      fuel_type: editForm.fuel_type?.trim() || null,
      vehicle_type: editForm.vehicle_type?.trim() || null,
      driver_contact_phone: editForm.driver_contact_phone?.trim() || null,
      yard_location: editForm.yard_location?.trim() || null,
      gvw_value: editForm.gvw_value !== '' && editForm.gvw_value != null ? parseInt(editForm.gvw_value) : null,
      gvw_unit: editForm.gvw_unit?.trim() || null,
      equipment_type_label: editForm.equipment_type_label?.trim() || null,
      odometer_next_due_at: editForm.odometer_next_due_at !== '' && editForm.odometer_next_due_at != null ? parseInt(editForm.odometer_next_due_at) : null,
      odometer_noted_issues: editForm.odometer_noted_issues?.trim() || null,
      propane_sticker_cert: editForm.propane_sticker_cert?.trim() || null,
      propane_sticker_date: editForm.propane_sticker_date || null,
      hours_next_due_at: editForm.hours_next_due_at !== '' && editForm.hours_next_due_at != null ? parseFloat(editForm.hours_next_due_at) : null,
      hours_noted_issues: editForm.hours_noted_issues?.trim() || null,
      notes: editForm.notes?.trim() || null,
    };

    if (asset?.asset_type === 'vehicle') {
      payload.odometer_current = editForm.odometer_current ? parseInt(editForm.odometer_current) : null;
      payload.odometer_last_service = editForm.odometer_last_service ? parseInt(editForm.odometer_last_service) : null;
    } else {
      payload.hours_current = editForm.hours_current ? parseFloat(editForm.hours_current) : null;
      payload.hours_last_service = editForm.hours_last_service ? parseFloat(editForm.hours_last_service) : null;
    }

    updateMutation.mutate(payload);
  };

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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  // Compliance expiry status per record type (latest record only)
  const complianceStatusByType = useMemo(() => {
    const map: Record<string, { daysLeft: number | null; expiryDate: string; label: string; badgeClass: string }> = {};
    const types = ['CVIP', 'NDT', 'CRANE', 'PROPANE'];
    for (const t of types) {
      const rec = Array.isArray(complianceRecords) ? complianceRecords.find((r) => r.record_type === t) : null;
      if (!rec?.expiry_date) continue;
      const exp = new Date(rec.expiry_date);
      const now = new Date();
      const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let label = 'Valid';
      let badgeClass = 'bg-green-100 text-green-800';
      if (daysLeft < 0) {
        label = 'Expired';
        badgeClass = 'bg-red-100 text-red-800';
      } else if (daysLeft <= 30) {
        label = 'Due Soon';
        badgeClass = 'bg-amber-100 text-amber-800';
      }
      map[t] = { daysLeft, expiryDate: rec.expiry_date.slice(0, 10), label, badgeClass };
    }
    return map;
  }, [complianceRecords]);

  // Odometer next-service status (vehicle)
  const odometerStatus = useMemo(() => {
    if (asset?.asset_type !== 'vehicle' || asset?.odometer_next_due_at == null) return null;
    const current = asset.odometer_current ?? 0;
    const nextDue = asset.odometer_next_due_at;
    if (current >= nextDue) return { label: 'Overdue', badgeClass: 'bg-red-100 text-red-800' };
    const kmLeft = nextDue - current;
    if (kmLeft <= 5000) return { label: 'Due Soon', badgeClass: 'bg-amber-100 text-amber-800' };
    return { label: 'Valid', badgeClass: 'bg-green-100 text-green-800' };
  }, [asset]);

  // Hours next-service status (machinery/other)
  const hoursStatus = useMemo(() => {
    if (!asset || (asset.asset_type !== 'heavy_machinery' && asset.asset_type !== 'other') || asset.hours_next_due_at == null) return null;
    const current = asset.hours_current ?? 0;
    const nextDue = asset.hours_next_due_at;
    if (current >= nextDue) return { label: 'Overdue', badgeClass: 'bg-red-100 text-red-800' };
    const hoursLeft = nextDue - current;
    if (hoursLeft <= 50) return { label: 'Due Soon', badgeClass: 'bg-amber-100 text-amber-800' };
    return { label: 'Valid', badgeClass: 'bg-green-100 text-green-800' };
  }, [asset]);

  // Propane sticker status (date-based)
  const propaneStatus = useMemo(() => {
    if (!asset?.propane_sticker_date) return null;
    const exp = new Date(asset.propane_sticker_date);
    const now = new Date();
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'Expired', badgeClass: 'bg-red-100 text-red-800' };
    if (daysLeft <= 30) return { label: 'Due Soon', badgeClass: 'bg-amber-100 text-amber-800' };
    return { label: 'Valid', badgeClass: 'bg-green-100 text-green-800' };
  }, [asset?.propane_sticker_date]);

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

  const headerDisplayName = [asset.make, asset.model].filter(Boolean).join(' ') || asset.name || 'Asset';
  const isAssigned = !!openAssignment;

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Header Summary - Profile-style */}
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
              <h1 className="text-lg font-bold text-gray-900 truncate">{headerDisplayName}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {asset.unit_number && (
                  <span className="text-xs text-gray-600">Unit #{asset.unit_number}</span>
                )}
                <span className="text-xs text-gray-500 capitalize">{asset.asset_type.replace('_', ' ')}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>
                  {asset.status}
                </span>
                {asset.condition && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                    {asset.condition}
                  </span>
                )}
                {(asset.odometer_current != null || asset.hours_current != null) && (
                  <span className="text-xs text-gray-600">
                    {asset.odometer_current != null
                      ? `Odometer: ${asset.odometer_current.toLocaleString()}`
                      : `Hours: ${asset.hours_current?.toLocaleString() ?? '-'}`}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isAssigned ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
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

      {/* Tabs - same style as TaskRequests */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex gap-1 border-b border-gray-200 px-4">
          {(['general', 'inspections', 'work-orders', 'logs', 'compliance'] as const).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                nav(`/fleet/assets/${id}?tab=${t}`, { replace: true });
              }}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
                tab === t ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t === 'logs' ? 'History' : t.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white p-4 min-w-0 overflow-hidden">
        {tab === 'general' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">General Information</h3>
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm">
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                  <button onClick={handleSave} disabled={updateMutation.isPending} className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50">
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Card 1: Basic Information */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Basic Information</h4>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div><div className="text-gray-600">Name</div>{isEditing ? <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" required /> : <div className="font-medium">{asset.name}</div>}</div>
                  <div><div className="text-gray-600">Make</div>{isEditing ? <input type="text" value={editForm.make || ''} onChange={(e) => setEditForm({...editForm, make: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.make || '-'}</div>}</div>
                  <div><div className="text-gray-600">Model</div>{isEditing ? <input type="text" value={editForm.model || ''} onChange={(e) => setEditForm({...editForm, model: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.model || '-'}</div>}</div>
                  <div><div className="text-gray-600">Year</div>{isEditing ? <input type="number" value={editForm.year || ''} onChange={(e) => setEditForm({...editForm, year: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="1900" max={new Date().getFullYear() + 1} /> : <div className="font-medium">{asset.year || '-'}</div>}</div>
                  <div><div className="text-gray-600">VIN / Serial</div>{isEditing ? <input type="text" value={editForm.vin} onChange={(e) => setEditForm({...editForm, vin: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.vin || '-'}</div>}</div>
                  <div><div className="text-gray-600">{(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') ? 'License' : 'License Plate'}</div>{isEditing ? <input type="text" value={editForm.license_plate || ''} onChange={(e) => setEditForm({...editForm, license_plate: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.license_plate || '-'}</div>}</div>
                  <div><div className="text-gray-600">Unit Number</div>{isEditing ? <input type="text" value={editForm.unit_number || ''} onChange={(e) => setEditForm({...editForm, unit_number: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.unit_number || '-'}</div>}</div>
                  {(asset.asset_type !== 'heavy_machinery' && asset.asset_type !== 'other') && (
                    <div><div className="text-gray-600">Vehicle Type</div>{isEditing ? <input type="text" value={editForm.vehicle_type || ''} onChange={(e) => setEditForm({...editForm, vehicle_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.vehicle_type || '-'}</div>}</div>
                  )}
                  <div><div className="text-gray-600">Fuel Type</div>{isEditing ? <input type="text" value={editForm.fuel_type || ''} onChange={(e) => setEditForm({...editForm, fuel_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.fuel_type || '-'}</div>}</div>
                  {(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                    <div><div className="text-gray-600">{(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') ? 'Type' : 'Equipment Type Label'}</div>{isEditing ? <input type="text" value={editForm.equipment_type_label || ''} onChange={(e) => setEditForm({...editForm, equipment_type_label: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.equipment_type_label || '-'}</div>}</div>
                  )}
                  <div><div className="text-gray-600">Condition</div>{isEditing ? <select value={editForm.condition || ''} onChange={(e) => setEditForm({...editForm, condition: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="">Select</option><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select> : <div className="font-medium capitalize">{asset.condition || '-'}</div>}</div>
                  <div><div className="text-gray-600">Status</div>{isEditing ? <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select> : <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>{asset.status}</span>}</div>
                </div>
              </div>

              {/* Card 2: Registration & Compliance */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Registration & Compliance</h4>
                  {Object.keys(complianceStatusByType).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(complianceStatusByType).map(([type, s]) => (
                        <span key={type} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.badgeClass}`} title={`${type} expires ${s.expiryDate}`}>
                          {type}: {s.label}
                        </span>
                      ))}
                      <button type="button" onClick={() => { setTab('compliance'); nav(`/fleet/assets/${id}?tab=compliance`, { replace: true }); }} className="text-xs text-brand-red hover:underline ml-1">View all →</button>
                    </div>
                  )}
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  {asset.asset_type === 'vehicle' && (
                    <>
                      <div><div className="text-gray-600">ICBC Registration No.</div>{isEditing ? <input type="text" value={editForm.icbc_registration_no || ''} onChange={(e) => setEditForm({...editForm, icbc_registration_no: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.icbc_registration_no || '-'}</div>}</div>
                      <div><div className="text-gray-600">Vancouver Decal #</div>{isEditing ? <input type="text" value={editForm.vancouver_decals || ''} onChange={(e) => setEditForm({...editForm, vancouver_decals: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" placeholder="e.g., 123, 456" /> : <div className="font-medium">{Array.isArray(asset.vancouver_decals) ? asset.vancouver_decals.join(', ') : '-'}</div>}</div>
                      <div><div className="text-gray-600">Ferry Length</div>{isEditing ? <input type="text" value={editForm.ferry_length || ''} onChange={(e) => setEditForm({...editForm, ferry_length: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" placeholder="e.g., 22L 8H" /> : <div className="font-medium">{asset.ferry_length || '-'}</div>}</div>
                      <div><div className="text-gray-600">GVW (kg)</div>{isEditing ? <input type="number" value={editForm.gvw_kg || ''} onChange={(e) => setEditForm({...editForm, gvw_kg: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.gvw_kg ? asset.gvw_kg.toLocaleString() : '-'}</div>}</div>
                    </>
                  )}
                  <div><div className="text-gray-600">GVW Value</div>{isEditing ? <input type="number" value={editForm.gvw_value ?? ''} onChange={(e) => setEditForm({...editForm, gvw_value: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.gvw_value != null ? asset.gvw_value : '-'}</div>}</div>
                  <div><div className="text-gray-600">GVW Unit</div>{isEditing ? <select value={editForm.gvw_unit || ''} onChange={(e) => setEditForm({...editForm, gvw_unit: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="">-</option><option value="kg">kg</option><option value="lbs">lbs</option></select> : <div className="font-medium">{asset.gvw_unit || '-'}</div>}</div>
                  <div><div className="text-gray-600">Propane Sticker Cert</div>{isEditing ? <input type="text" value={editForm.propane_sticker_cert || ''} onChange={(e) => setEditForm({...editForm, propane_sticker_cert: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.propane_sticker_cert || '-'}</div>}</div>
                  <div>
                    <div className="text-gray-600">Propane Sticker Date</div>
                    <div className="flex items-center gap-2 mt-1">
                      {isEditing ? (
                        <input type="date" value={editForm.propane_sticker_date || ''} onChange={(e) => setEditForm({...editForm, propane_sticker_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                      ) : (
                        <>
                          <div className="font-medium">{asset.propane_sticker_date ? asset.propane_sticker_date.slice(0, 10) : '-'}</div>
                          {propaneStatus && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${propaneStatus.badgeClass}`}>{propaneStatus.label}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Assignment & Location */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Assignment & Location</h4>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-600">Assignment Status</div>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${openAssignment ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{openAssignment ? 'Assigned' : 'Available'}</span>
                  </div>
                  {openAssignment && (
                    <>
                      <div><div className="text-gray-600">Assigned to</div><div className="font-medium">{openAssignment.assigned_to_name || (employees.find((e: any) => e.id === openAssignment.assigned_to_user_id)?.name) || openAssignment.assigned_to_user_id || '-'}</div></div>
                      <div><div className="text-gray-600">Since</div><div className="font-medium">{formatDateLocal(new Date(openAssignment.assigned_at))}</div></div>
                      {openAssignment.odometer_out != null && <div><div className="text-gray-600">Odometer out</div><div className="font-medium">{openAssignment.odometer_out}</div></div>}
                      {openAssignment.hours_out != null && <div><div className="text-gray-600">Hours out</div><div className="font-medium">{openAssignment.hours_out}</div></div>}
                    </>
                  )}
                  <div><div className="text-gray-600">Phone</div><div className="font-medium">{(openAssignment?.phone_snapshot ?? asset.driver_contact_phone) || '-'}</div></div>
                  <div><div className="text-gray-600">Department</div><div className="font-medium">{openAssignment?.department_snapshot || '-'}</div></div>
                  <div><div className="text-gray-600">Sleeps</div>{isEditing ? <input type="text" value={editForm.yard_location || ''} onChange={(e) => setEditForm({...editForm, yard_location: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.yard_location || '-'}</div>}</div>
                </div>
              </div>

              {/* Card 4: Odometer & Maintenance */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <h4 className="font-semibold text-gray-900">Odometer & Maintenance</h4>
                </div>
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  {(asset.asset_type === 'vehicle' || asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                    <>
                      {asset.asset_type === 'vehicle' && (
                        <>
                          <div><div className="text-gray-600">Current Odometer</div>{isEditing ? <input type="number" value={editForm.odometer_current || ''} onChange={(e) => setEditForm({...editForm, odometer_current: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.odometer_current?.toLocaleString() || '-'}</div>}</div>
                          <div><div className="text-gray-600">Last Service Odometer</div>{isEditing ? <input type="number" value={editForm.odometer_last_service || ''} onChange={(e) => setEditForm({...editForm, odometer_last_service: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.odometer_last_service?.toLocaleString() || '-'}</div>}</div>
                          <div>
                            <div className="text-gray-600">Odometer Next Due At</div>
                            <div className="flex items-center gap-2 mt-1">
                              {isEditing ? (
                                <input type="number" value={editForm.odometer_next_due_at ?? ''} onChange={(e) => setEditForm({...editForm, odometer_next_due_at: e.target.value})} className="w-full max-w-[140px] px-3 py-2 border rounded-lg text-sm" min="0" />
                              ) : (
                                <>
                                  <div className="font-medium">{asset.odometer_next_due_at != null ? asset.odometer_next_due_at : '-'}</div>
                                  {odometerStatus && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${odometerStatus.badgeClass}`}>{odometerStatus.label}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="md:col-span-2"><div className="text-gray-600">Odometer Noted Issues</div>{isEditing ? <textarea value={editForm.odometer_noted_issues || ''} onChange={(e) => setEditForm({...editForm, odometer_noted_issues: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium mt-1">{asset.odometer_noted_issues || '-'}</div>}</div>
                        </>
                      )}
                      {(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                        <>
                          <div><div className="text-gray-600">Current Hours</div>{isEditing ? <input type="number" step="0.1" value={editForm.hours_current || ''} onChange={(e) => setEditForm({...editForm, hours_current: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.hours_current?.toLocaleString() || '-'}</div>}</div>
                          <div><div className="text-gray-600">Last Service Hours</div>{isEditing ? <input type="number" step="0.1" value={editForm.hours_last_service || ''} onChange={(e) => setEditForm({...editForm, hours_last_service: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.hours_last_service?.toLocaleString() || '-'}</div>}</div>
                          <div>
                            <div className="text-gray-600">Hours Next Due At</div>
                            <div className="flex items-center gap-2 mt-1">
                              {isEditing ? (
                                <input type="number" step="0.1" value={editForm.hours_next_due_at ?? ''} onChange={(e) => setEditForm({...editForm, hours_next_due_at: e.target.value})} className="w-full max-w-[140px] px-3 py-2 border rounded-lg text-sm" min="0" />
                              ) : (
                                <>
                                  <div className="font-medium">{asset.hours_next_due_at != null ? asset.hours_next_due_at : '-'}</div>
                                  {hoursStatus && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${hoursStatus.badgeClass}`}>{hoursStatus.label}</span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="md:col-span-2"><div className="text-gray-600">Hours Noted Issues</div>{isEditing ? <textarea value={editForm.hours_noted_issues || ''} onChange={(e) => setEditForm({...editForm, hours_noted_issues: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium mt-1">{asset.hours_noted_issues || '-'}</div>}</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notes & Photos */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h4 className="font-semibold text-gray-900">Notes & Photos</h4>
              </div>
              <div className="p-4 space-y-4">
                <div><div className="text-sm text-gray-600 mb-1">Notes</div>{isEditing ? <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} rows={4} className="w-full px-3 py-2 border rounded-lg text-sm" /> : <div className="p-3 bg-gray-50 rounded text-sm">{asset.notes || '-'}</div>}</div>
                {asset.photos && asset.photos.length > 0 && (
                  <div><div className="text-sm text-gray-600 mb-2">Photos</div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{asset.photos.map((photoId, idx) => <img key={idx} src={withFileAccessToken(`/files/${photoId}/thumbnail?w=300`)} alt={`Photo ${idx + 1}`} className="w-full h-24 object-cover rounded border" loading="lazy" />)}</div></div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'inspections' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-semibold text-lg">Inspections</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowScheduleInspectionModal(true)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Schedule inspection
                </button>
                <button
                  onClick={() => setShowInspectionForm(true)}
                  className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  + New Inspection
                </button>
              </div>
            </div>

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
                              src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
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
            {(!inspections || inspections.length === 0) && (
              <div className="text-center text-gray-500 py-8">No inspections found</div>
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
                      {wo.photos && (() => {
                        const p = wo.photos as string[] | { before?: string[]; after?: string[] } | null;
                        const photoList = Array.isArray(p) ? p : (p && typeof p === 'object' ? [...(Array.isArray((p as any).before) ? (p as any).before : []), ...(Array.isArray((p as any).after) ? (p as any).after : [])] : []);
                        return photoList.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {photoList.slice(0, 3).map((photoId: string, idx: number) => (
                              <img
                                key={idx}
                                src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
                                alt={`Photo ${idx + 1}`}
                                className="w-16 h-16 object-cover rounded border"
                              />
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-sm text-gray-500 ml-4">
                      {new Date(wo.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {(!workOrders || workOrders.length === 0) && (
              <div className="text-center text-gray-500 py-8">No work orders found</div>
            )}
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg">Activity history</h3>
              <p className="text-sm text-gray-600 mt-1">
                Check-outs and returns, edits to this asset, and other fleet log entries (newest first).
              </p>
            </div>
            <div className="space-y-2">
              {historyItems.map((item) => {
                const assign =
                  item.assignment_id && item.log_subtype
                    ? assignments.find((a) => a.id === item.assignment_id)
                    : null;
                const openAssignDetail =
                  !!assign &&
                  item.source === 'assignment' &&
                  (item.log_subtype === 'assign' || item.log_subtype === 'return');
                const openAuditDetail =
                  item.source === 'audit' && item.changes_json && Object.keys(item.changes_json).length > 0;
                const borderClass =
                  item.source === 'assignment' && item.kind === 'checkout'
                    ? 'border-brand-red'
                    : item.source === 'assignment' && item.kind === 'return'
                      ? 'border-sky-500'
                      : item.source === 'audit'
                        ? 'border-amber-500'
                        : 'border-gray-300';
                const clickable = openAssignDetail || openAuditDetail;
                const badge =
                  item.source === 'assignment' && item.kind === 'checkout'
                    ? 'Check-out'
                    : item.source === 'assignment' && item.kind === 'return'
                      ? 'Return'
                      : item.source === 'audit'
                        ? 'Change'
                        : 'Log';
                return (
                  <div
                    key={item.id}
                    className={`border-l-4 pl-4 py-2 ${borderClass} ${clickable ? 'cursor-pointer hover:bg-gray-50 rounded-r-lg transition-colors' : ''}`}
                    onClick={
                      openAssignDetail && assign && item.log_subtype
                        ? () => {
                            setLogDetailAssignment(assign);
                            setLogDetailLogType(item.log_subtype === 'assign' ? 'assignment' : 'return');
                          }
                        : openAuditDetail
                          ? () => setHistoryAuditDetail(item.changes_json as Record<string, unknown>)
                          : undefined
                    }
                    role={clickable ? 'button' : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.title}</span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{badge}</span>
                        </div>
                        {item.subtitle && <div className="text-sm text-gray-600 mt-0.5">{item.subtitle}</div>}
                        {item.detail && <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{item.detail}</div>}
                        {item.actor_name && (
                          <div className="text-xs text-gray-500 mt-1">By {item.actor_name}</div>
                        )}
                        {item.odometer_snapshot != null && (
                          <div className="text-xs text-gray-500 mt-1">Odometer: {item.odometer_snapshot.toLocaleString()}</div>
                        )}
                        {item.hours_snapshot != null && (
                          <div className="text-xs text-gray-500 mt-1">Hours: {Number(item.hours_snapshot).toLocaleString()}</div>
                        )}
                        {clickable && (
                          <div className="text-xs text-brand-red mt-1">
                            {openAssignDetail ? 'Click for assignment details' : 'Click to view change details'}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 shrink-0 text-right">
                        {item.occurred_at
                          ? new Date(item.occurred_at).toLocaleString()
                          : '—'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {historyItems.length === 0 && (
              <div className="text-center text-gray-500 py-8">No activity recorded yet</div>
            )}
          </div>
        )}

        {tab === 'compliance' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-lg">Compliance (CVIP / CRANE / NDT / PROPANE)</h3>
              <button
                type="button"
                onClick={() => { setEditingComplianceId(null); setShowComplianceModal(true); }}
                className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Add record
              </button>
            </div>
            <div className="space-y-2">
              {Array.isArray(complianceRecords) && complianceRecords.map((rec) => {
                const exp = rec.expiry_date ? new Date(rec.expiry_date) : null;
                const now = new Date();
                const daysLeft = exp ? Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                let badge = 'bg-gray-100 text-gray-800';
                if (daysLeft != null) {
                  if (daysLeft < 0) badge = 'bg-red-100 text-red-800';
                  else if (daysLeft <= 30) badge = 'bg-amber-100 text-amber-800';
                }
                return (
                  <div key={rec.id} className="border rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <span className="font-medium">{rec.record_type}</span>
                      {rec.expiry_date && (
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${badge}`}>
                          {daysLeft != null && daysLeft < 0 ? 'Overdue' : daysLeft != null && daysLeft <= 30 ? 'Due soon' : 'OK'} — {rec.expiry_date.slice(0, 10)}
                        </span>
                      )}
                      {rec.facility && <div className="text-sm text-gray-600">{rec.facility}</div>}
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditingComplianceId(rec.id); setShowComplianceModal(true); }} className="text-sm text-brand-red hover:underline">Edit</button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('Delete this compliance record?')) return;
                          try {
                            await api('DELETE', `/fleet/compliance/${rec.id}`);
                            queryClient.invalidateQueries({ queryKey: ['fleetAssetCompliance', id] });
                            toast.success('Record deleted');
                          } catch (e: any) {
                            toast.error(e?.message || 'Delete failed');
                          }
                        }}
                        className="text-sm text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {(!complianceRecords || complianceRecords.length === 0) && (
              <div className="text-center text-gray-500 py-8">No compliance records</div>
            )}
          </div>
        )}
      </div>

      {/* New Inspection Modal */}
      {showScheduleInspectionModal && id && (
        <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowScheduleInspectionModal(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              <span>Schedule inspection</span>
              <button type="button" onClick={() => setShowScheduleInspectionModal(false)} className="p-1 rounded hover:bg-gray-100 text-gray-600">✕</button>
            </div>
            <div className="p-4">
              <InspectionScheduleForm
                initialAssetId={id}
                onSuccess={(data) => {
                  setShowScheduleInspectionModal(false);
                  queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
                  queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
                  nav('/fleet/calendar');
                }}
                onCancel={() => setShowScheduleInspectionModal(false)}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
      {showInspectionForm && (
        <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInspectionForm(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              <span>New Inspection</span>
              <button type="button" onClick={() => setShowInspectionForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-600">✕</button>
            </div>
            <div className="p-4">
              <InspectionFormInline
                assetId={id!}
                onSuccess={() => {
                  setShowInspectionForm(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssetInspections', id] });
                }}
                onCancel={() => setShowInspectionForm(false)}
                employees={employees}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
      {/* New Work Order Modal */}
      {showWorkOrderForm && (
        <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowWorkOrderForm(false)}>
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b font-semibold flex items-center justify-between">
              <span>New Work Order</span>
              <button type="button" onClick={() => setShowWorkOrderForm(false)} className="p-1 rounded hover:bg-gray-100 text-gray-600">✕</button>
            </div>
            <div className="p-4">
              <WorkOrderFormInline
                assetId={id!}
                onSuccess={() => {
                  setShowWorkOrderForm(false);
                  queryClient.invalidateQueries({ queryKey: ['fleetAssetWorkOrders', id] });
                }}
                onCancel={() => setShowWorkOrderForm(false)}
                employees={employees}
              />
            </div>
          </div>
        </div></OverlayPortal>
      )}
      {/* Assign Modal */}
      {showAssignModal && (
        <AssignModal
          asset={asset}
          employees={employees}
          onClose={() => setShowAssignModal(false)}
          onSubmit={(data) => assignMutation.mutate(data)}
          isSubmitting={assignMutation.isPending}
        />
      )}
      {/* Return Modal */}
      {showReturnModal && openAssignment && (
        <ReturnModal
          openAssignment={openAssignment}
          asset={asset}
          onClose={() => setShowReturnModal(false)}
          onSubmit={(data) => returnMutation.mutate(data)}
          isSubmitting={returnMutation.isPending}
        />
      )}
      {/* Assignment/Return log detail modal */}
      {logDetailAssignment && logDetailLogType && (
        <AssignmentLogDetailModal
          assignment={logDetailAssignment}
          logType={logDetailLogType}
          onClose={() => { setLogDetailAssignment(null); setLogDetailLogType(null); }}
        />
      )}
      {historyAuditDetail !== null && (
        <OverlayPortal>
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setHistoryAuditDetail(null)}
          >
            <div
              className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b font-semibold flex items-center justify-between shrink-0">
                <span>Change details</span>
                <button
                  type="button"
                  onClick={() => setHistoryAuditDetail(null)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-600"
                >
                  ✕
                </button>
              </div>
              <pre className="p-4 text-xs overflow-auto flex-1 bg-gray-50 text-gray-800 font-mono whitespace-pre-wrap break-words">
                {JSON.stringify(historyAuditDetail, null, 2)}
              </pre>
            </div>
          </div>
        </OverlayPortal>
      )}
      {/* Compliance create/edit modal - simple inline */}
      {showComplianceModal && (
        <ComplianceModal
          assetId={id!}
          recordId={editingComplianceId}
          initialRecord={editingComplianceId ? complianceRecords.find((r) => r.id === editingComplianceId) : undefined}
          onClose={() => { setShowComplianceModal(false); setEditingComplianceId(null); }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['fleetAssetCompliance', id] });
            setShowComplianceModal(false);
            setEditingComplianceId(null);
          }}
        />
      )}
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
    inspection_date: formatDateLocal(new Date()),
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
                  src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
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
                  src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
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
  );
}

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

function AssignModal({
  asset,
  employees,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  asset: FleetAsset;
  employees: any[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const [assigned_to_user_id, setAssignedToUserId] = useState('');
  const [phone_snapshot, setPhoneSnapshot] = useState('');
  const [address_snapshot, setAddressSnapshot] = useState('');
  const [sleeps_snapshot, setSleepsSnapshot] = useState('');
  const [department_snapshot, setDepartmentSnapshot] = useState('');
  const [odometer_out, setOdometerOut] = useState('');
  const [hours_out, setHoursOut] = useState('');
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
    Array.isArray(employees) && employees.forEach((emp: any) => {
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
      if (phone_snapshot === '' && (p.phone || p.mobile_phone)) setPhoneSnapshot(p.phone || p.mobile_phone || '');
      if (address_snapshot === '' && p.address) setAddressSnapshot(p.address);
      if (department_snapshot === '' && (p.department || p.division)) setDepartmentSnapshot(p.department || p.division || '');
    }
  }, [assigned_to_user_id, selectedUser]);

  useEffect(() => {
    if (asset?.yard_location && sleeps_snapshot === '') {
      setSleepsSnapshot(asset.yard_location);
    }
  }, [asset?.yard_location]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigned_to_user_id) {
      toast.error('Select who to assign the asset to');
      return;
    }
    const assigned_to_name = selectedUser ? getEmployeeDisplayName(selectedUser) : '';
    const payload: any = {
      assigned_to_user_id,
      assigned_to_name: assigned_to_name || null,
      phone_snapshot: phone_snapshot || null,
      address_snapshot: address_snapshot || null,
      sleeps_snapshot: sleeps_snapshot || null,
      department_snapshot: department_snapshot || null,
      odometer_out: asset?.asset_type === 'vehicle' && odometer_out ? parseInt(odometer_out) : (odometer_out ? parseInt(odometer_out) : null),
      hours_out: (asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && hours_out ? parseFloat(hours_out) : (hours_out ? parseFloat(hours_out) : null),
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
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
            <input type="hidden" name="assigned_to_user_id" value={assigned_to_user_id} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="text" value={phone_snapshot} onChange={(e) => setPhoneSnapshot(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sleep</label>
            <AddressAutocomplete
              value={sleeps_snapshot}
              onChange={setSleepsSnapshot}
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
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
          {asset?.asset_type === 'vehicle' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Odometer out</label>
              <input type="number" value={odometer_out} onChange={(e) => setOdometerOut(e.target.value)} className="w-full px-3 py-2 border rounded-lg" min="0" />
            </div>
          )}
          {(asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hours out</label>
              <input type="number" step="0.1" value={hours_out} onChange={(e) => setHoursOut(e.target.value)} className="w-full px-3 py-2 border rounded-lg" min="0" />
            </div>
          )}
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
                      headers: { 'Content-Type': file.type || 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
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
                  const ids = await Promise.all(Array.from(files).map(f => uploadFile(f)));
                  setPhotosOut(prev => [...prev, ...ids]);
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
                  <img key={idx} src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)} alt={`Photo ${idx + 1}`} className="w-16 h-16 object-cover rounded border" loading="lazy" />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes out</label>
            <textarea value={notes_out} onChange={(e) => setNotesOut(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div></OverlayPortal>
  );
}

function AssignmentLogDetailModal({
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
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b font-semibold flex items-center justify-between">
          <span>{logType === 'assignment' ? 'Assignment' : 'Return'} details</span>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-600">✕</button>
        </div>
        <div className="p-4 space-y-6">
          {showAssign && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">Assign</h4>
              <dl className="grid gap-2 text-sm">
                <div><dt className="text-gray-500">Name</dt><dd className="font-medium">{assignment.assigned_to_name || '—'}</dd></div>
                <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{assignment.phone_snapshot || '—'}</dd></div>
                <div><dt className="text-gray-500">Address</dt><dd className="font-medium">{assignment.address_snapshot || '—'}</dd></div>
                <div><dt className="text-gray-500">Department</dt><dd className="font-medium">{assignment.department_snapshot || '—'}</dd></div>
                <div><dt className="text-gray-500">Assigned at</dt><dd className="font-medium">{assignment.assigned_at ? formatDateLocal(new Date(assignment.assigned_at)) : '—'}</dd></div>
                {assignment.odometer_out != null && <div><dt className="text-gray-500">Odometer out</dt><dd className="font-medium">{assignment.odometer_out.toLocaleString()}</dd></div>}
                {assignment.hours_out != null && <div><dt className="text-gray-500">Hours out</dt><dd className="font-medium">{assignment.hours_out}</dd></div>}
                {assignment.notes_out && <div><dt className="text-gray-500">Notes out</dt><dd className="font-medium whitespace-pre-wrap">{assignment.notes_out}</dd></div>}
                {assignment.photos_out && assignment.photos_out.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">Images out</dt>
                    <dd className="flex gap-2 flex-wrap mt-1">
                      {assignment.photos_out.map((photoId: string, idx: number) => (
                        <img key={idx} src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)} alt={`Out ${idx + 1}`} className="w-24 h-24 object-cover rounded border" />
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
                <div><dt className="text-gray-500">Returned at</dt><dd className="font-medium">{assignment.returned_at ? formatDateLocal(new Date(assignment.returned_at)) : '—'}</dd></div>
                {assignment.odometer_in != null && <div><dt className="text-gray-500">Odometer in</dt><dd className="font-medium">{assignment.odometer_in.toLocaleString()}</dd></div>}
                {assignment.hours_in != null && <div><dt className="text-gray-500">Hours in</dt><dd className="font-medium">{assignment.hours_in}</dd></div>}
                {assignment.notes_in && <div><dt className="text-gray-500">Notes in</dt><dd className="font-medium whitespace-pre-wrap">{assignment.notes_in}</dd></div>}
                {assignment.photos_in && assignment.photos_in.length > 0 && (
                  <div>
                    <dt className="text-gray-500 mb-1">Images in</dt>
                    <dd className="flex gap-2 flex-wrap mt-1">
                      {assignment.photos_in.map((photoId: string, idx: number) => (
                        <img key={idx} src={withFileAccessToken(`/files/${photoId}/thumbnail?w=200`)} alt={`In ${idx + 1}`} className="w-24 h-24 object-cover rounded border" />
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

function ReturnModal({
  openAssignment,
  asset,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  openAssignment: AssetAssignment;
  asset: FleetAsset | undefined;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}) {
  const [odometer_in, setOdometerIn] = useState('');
  const [hours_in, setHoursIn] = useState('');
  const [notes_in, setNotesIn] = useState('');
  const [photos_in, setPhotosIn] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const photosInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      odometer_in: odometer_in ? parseInt(odometer_in) : null,
      hours_in: hours_in ? parseFloat(hours_in) : null,
      notes_in: notes_in || null,
      photos_in: photos_in.length ? photos_in : null,
    };
    onSubmit(payload);
  };

  return (
    <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b font-semibold">Return</div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {asset?.asset_type === 'vehicle' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Odometer in</label>
              <input type="number" value={odometer_in} onChange={(e) => setOdometerIn(e.target.value)} className="w-full px-3 py-2 border rounded-lg" min={openAssignment.odometer_out ?? 0} />
            </div>
          )}
          {(asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hours in</label>
              <input type="number" step="0.1" value={hours_in} onChange={(e) => setHoursIn(e.target.value)} className="w-full px-3 py-2 border rounded-lg" min="0" />
            </div>
          )}
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
                      headers: { 'Content-Type': file.type || 'image/jpeg', 'x-ms-blob-type': 'BlockBlob' },
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
                  const ids = await Promise.all(Array.from(files).map(f => uploadFile(f)));
                  setPhotosIn(prev => [...prev, ...ids]);
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
                  <img key={idx} src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)} alt={`Photo ${idx + 1}`} className="w-16 h-16 object-cover rounded border" loading="lazy" />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes in</label>
            <textarea value={notes_in} onChange={(e) => setNotesIn(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Return'}</button>
          </div>
        </form>
      </div>
    </div></OverlayPortal>
  );
}

function ComplianceModal({
  assetId,
  recordId,
  initialRecord,
  onClose,
  onSuccess,
}: {
  assetId: string;
  recordId: string | null;
  initialRecord?: FleetComplianceRecord;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [record_type, setRecordType] = useState(initialRecord?.record_type || 'CVIP');
  const [facility, setFacility] = useState(initialRecord?.facility || '');
  const [completed_by, setCompletedBy] = useState(initialRecord?.completed_by || '');
  const [equipment_classification, setEquipmentClassification] = useState(initialRecord?.equipment_classification || '');
  const [equipment_make_model, setEquipmentMakeModel] = useState(initialRecord?.equipment_make_model || '');
  const [serial_number, setSerialNumber] = useState(initialRecord?.serial_number || '');
  const [annual_inspection_date, setAnnualInspectionDate] = useState(initialRecord?.annual_inspection_date?.slice(0, 10) || '');
  const [expiry_date, setExpiryDate] = useState(initialRecord?.expiry_date?.slice(0, 10) || '');
  const [file_reference_number, setFileReferenceNumber] = useState(initialRecord?.file_reference_number || '');
  const [notes, setNotes] = useState(initialRecord?.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        fleet_asset_id: assetId,
        record_type: record_type,
        facility: facility || null,
        completed_by: completed_by || null,
        equipment_classification: equipment_classification || null,
        equipment_make_model: equipment_make_model || null,
        serial_number: serial_number || null,
        annual_inspection_date: annual_inspection_date || null,
        expiry_date: expiry_date || null,
        file_reference_number: file_reference_number || null,
        notes: notes || null,
      };
      if (recordId) {
        await api('PUT', `/fleet/compliance/${recordId}`, { record_type: payload.record_type, facility: payload.facility, completed_by: payload.completed_by, equipment_classification: payload.equipment_classification, equipment_make_model: payload.equipment_make_model, serial_number: payload.serial_number, annual_inspection_date: payload.annual_inspection_date, expiry_date: payload.expiry_date, file_reference_number: payload.file_reference_number, notes: payload.notes });
        toast.success('Record updated');
      } else {
        await api('POST', `/fleet/assets/${assetId}/compliance`, payload);
        toast.success('Record created');
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OverlayPortal><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b font-semibold">{recordId ? 'Edit compliance record' : 'Add compliance record'}</div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Record type</label>
            <select value={record_type} onChange={(e) => setRecordType(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
              <option value="CVIP">CVIP</option>
              <option value="CRANE">CRANE</option>
              <option value="NDT">NDT</option>
              <option value="PROPANE">PROPANE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Facility</label>
            <input type="text" value={facility} onChange={(e) => setFacility(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Completed by</label>
            <input type="text" value={completed_by} onChange={(e) => setCompletedBy(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment classification</label>
            <input type="text" value={equipment_classification} onChange={(e) => setEquipmentClassification(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Equipment make/model</label>
            <input type="text" value={equipment_make_model} onChange={(e) => setEquipmentMakeModel(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial number</label>
            <input type="text" value={serial_number} onChange={(e) => setSerialNumber(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Annual inspection date</label>
            <input type="date" value={annual_inspection_date} onChange={(e) => setAnnualInspectionDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry date</label>
            <input type="date" value={expiry_date} onChange={(e) => setExpiryDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File reference number</label>
            <input type="text" value={file_reference_number} onChange={(e) => setFileReferenceNumber(e.target.value)} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div></OverlayPortal>
  );
}
