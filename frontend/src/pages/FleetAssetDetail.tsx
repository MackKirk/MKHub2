import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo, useCallback, useId, type ChangeEvent, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '@/components/AddressAutocomplete';
import { formatDateLocal } from '@/lib/dateUtils';
import { imageFilesFromClipboardData, isLikelyImageFile } from '@/utils/imageUploadHelpers';
import {
  buildFleetAuditChangeRows,
  buildFleetHistoryDescription,
  formatFleetAuditActionVerb,
  formatFleetAuditEntityTitle,
} from '@/lib/fleetActivityLabels';
import {
  CATEGORY_LABELS,
  URGENCY_COLORS,
  URGENCY_LABELS,
  WORK_ORDER_STATUS_COLORS,
  WORK_ORDER_STATUS_LABELS,
} from '@/lib/fleetBadges';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { InspectionScheduleForm } from './InspectionNew';
import OverlayPortal from '@/components/OverlayPortal';
import { WorkOrderAttachmentsPicker } from '@/components/fleet/WorkOrderAttachmentsPicker';
import {
  SAFETY_MODAL_OVERLAY,
  SAFETY_MODAL_BTN_CANCEL,
  SAFETY_MODAL_BTN_PRIMARY,
  SAFETY_MODAL_FIELD_LABEL,
  SafetyFormModalLayout,
} from '@/components/safety/SafetyModalChrome';

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

function flattenWorkOrderPhotos(photos: WorkOrder['photos']): string[] {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos as string[];
  const o = photos as { before?: string[]; after?: string[] };
  return [
    ...(Array.isArray(o.before) ? o.before : []),
    ...(Array.isArray(o.after) ? o.after : []),
  ];
}

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
  /** Audit log entity (when source === 'audit') */
  entity_type?: string | null;
  entity_id?: string | null;
  audit_context?: Record<string, unknown> | null;
};

type FleetGeneralEditCard = 'basic' | 'registration' | 'assignment' | 'odometer' | 'notes';

function FleetGeneralCardHeaderChrome({
  title,
  cardId,
  editingCard,
  lockOtherSections,
  onEdit,
  onCancel,
  onSave,
  savePending,
  dirty,
  childrenUnderTitle,
}: {
  title: string;
  cardId: FleetGeneralEditCard;
  editingCard: FleetGeneralEditCard | null;
  lockOtherSections: boolean;
  onEdit: (id: FleetGeneralEditCard) => void;
  onCancel: () => void;
  onSave: () => void;
  savePending: boolean;
  dirty: boolean;
  childrenUnderTitle?: ReactNode;
}) {
  const editingThisCard = editingCard === cardId;
  const otherSectionBusy =
    editingCard !== null && editingCard !== cardId && lockOtherSections;

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {childrenUnderTitle}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
        {editingThisCard ? (
          <>
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={savePending || !dirty}
              className="px-2.5 py-1.5 bg-brand-red text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {savePending ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onEdit(cardId)}
            disabled={otherSectionBusy}
            className="p-0.5 text-gray-400 hover:text-[#7f1010] transition-colors disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-gray-400"
            title={otherSectionBusy ? 'Save or cancel the section you are editing' : 'Edit'}
            aria-label={`Edit ${title}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function FleetAssetDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance'>(initialTab);
  const [showScheduleInspectionModal, setShowScheduleInspectionModal] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showHeroPhotoViewModal, setShowHeroPhotoViewModal] = useState(false);
  const assetHeroPhotoModalTitleId = useId();
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [editingComplianceId, setEditingComplianceId] = useState<string | null>(null);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssetAssignment | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);
  const [historyAuditDetail, setHistoryAuditDetail] = useState<{
    changes: Record<string, unknown>;
    entityType: string | null;
    auditAction: string | null;
    summary: string;
    auditContext: Record<string, unknown> | null | undefined;
  } | null>(null);
  const [generalEditingCard, setGeneralEditingCard] = useState<FleetGeneralEditCard | null>(null);
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

  const { data: inspections, isLoading: inspectionsLoading } = useQuery({
    queryKey: ['fleetAssetInspections', id],
    queryFn: () => api<Inspection[]>('GET', `/fleet/assets/${id}/inspections`),
    enabled: isValidId,
  });

  const { data: workOrders, isLoading: workOrdersLoading } = useQuery({
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

  // Initialize edit form when entering edit mode on a general tab card
  useEffect(() => {
    if (generalEditingCard && asset) {
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
  }, [generalEditingCard, asset]);

  // Check if form has unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!generalEditingCard) return false;
    return JSON.stringify(editForm) !== JSON.stringify(initialEditForm);
  }, [generalEditingCard, editForm, initialEditForm]);

  const cancelGeneralSectionEdit = useCallback(() => {
    setEditForm({ ...initialEditForm });
    setGeneralEditingCard(null);
  }, [initialEditForm]);

  const startGeneralCardEdit = useCallback((card: FleetGeneralEditCard) => {
    setGeneralEditingCard(card);
  }, []);

  // Save function for unsaved changes guard
  const handleSaveForGuard = async () => {
    if (!hasUnsavedChanges || !generalEditingCard) return;
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
      setGeneralEditingCard(null);
      setInitialEditForm({ ...editForm });
      queryClient.invalidateQueries({ queryKey: ['fleetAsset', id] });
      queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update asset');
    },
  });

  const assetHeroPhotoInputRef = useRef<HTMLInputElement>(null);
  const [heroPhotoBusy, setHeroPhotoBusy] = useState(false);

  const persistAssetPhotos = useCallback(
    async (photos: string[] | null) => {
      await api<FleetAsset>('PUT', `/fleet/assets/${id}`, {
        photos: photos && photos.length > 0 ? photos : null,
      });
      queryClient.invalidateQueries({ queryKey: ['fleetAsset', id] });
      queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
    },
    [id, queryClient],
  );

  const onHeroPhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id || !asset) return;
    if (!isLikelyImageFile(file)) {
      toast.error('Please choose an image file.');
      return;
    }
    setHeroPhotoBusy(true);
    try {
      const newId = await uploadFleetAssetHeroImage(file);
      const rest = (asset.photos || []).slice(1);
      await persistAssetPhotos([newId, ...rest]);
      toast.success('Photo updated');
      setShowHeroPhotoViewModal(false);
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setHeroPhotoBusy(false);
    }
  };

  const removeHeroPhoto = async () => {
    if (!asset?.photos?.length) return;
    setHeroPhotoBusy(true);
    try {
      const next = asset.photos.slice(1);
      await persistAssetPhotos(next.length > 0 ? next : null);
      toast.success('Photo removed');
      setShowHeroPhotoViewModal(false);
    } catch {
      toast.error('Failed to remove photo');
    } finally {
      setHeroPhotoBusy(false);
    }
  };

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
  const lockedScheduleVehicleLabel =
    [asset.name, asset.unit_number ? `Unit #${asset.unit_number}` : null].filter(Boolean).join(' · ') ||
    headerDisplayName;
  const isAssigned = !!openAssignment;
  const heroPhotoThumbUrl = asset.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(asset.photos[0])}/thumbnail?w=400`)
    : null;
  const heroPhotoLargeUrl = asset.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(asset.photos[0])}/thumbnail?w=1200`)
    : null;

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      {/* Header Summary */}
      <div className="rounded-xl border bg-white p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button
              onClick={() => nav(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-600 hover:text-gray-900 flex-shrink-0"
              title="Back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="relative w-48 flex-shrink-0">
              <input
                ref={assetHeroPhotoInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onHeroPhotoFileChange}
                disabled={heroPhotoBusy}
              />
              <div className="w-48 h-36 rounded-xl border border-gray-200 overflow-hidden bg-gray-100">
                <button
                  type="button"
                  disabled={heroPhotoBusy}
                  onClick={() => {
                    if (heroPhotoThumbUrl) setShowHeroPhotoViewModal(true);
                    else assetHeroPhotoInputRef.current?.click();
                  }}
                  title={heroPhotoThumbUrl ? 'View photo' : 'Add photo'}
                  className="relative h-full w-full flex items-center justify-center text-gray-400 transition hover:bg-gray-50/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {heroPhotoBusy ? (
                    <span className="text-xs font-medium text-gray-500">…</span>
                  ) : heroPhotoThumbUrl ? (
                    <img src={heroPhotoThumbUrl} alt={asset.name || 'Asset'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h-1M4 12a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6m16 4a2 2 0 110 4m0-4a2 2 0 100 4m0-4v2m0-4V6" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>
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
            <h3 className="font-semibold text-lg">General Information</h3>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Card 1: Basic Information */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <FleetGeneralCardHeaderChrome
                  title="Basic Information"
                  cardId="basic"
                  editingCard={generalEditingCard}
                  lockOtherSections={hasUnsavedChanges}
                  onEdit={startGeneralCardEdit}
                  onCancel={cancelGeneralSectionEdit}
                  onSave={handleSave}
                  savePending={updateMutation.isPending}
                  dirty={hasUnsavedChanges}
                />
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  <div><div className="text-gray-600">Name</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" required /> : <div className="font-medium">{asset.name}</div>}</div>
                  <div><div className="text-gray-600">Make</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.make || ''} onChange={(e) => setEditForm({...editForm, make: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.make || '-'}</div>}</div>
                  <div><div className="text-gray-600">Model</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.model || ''} onChange={(e) => setEditForm({...editForm, model: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.model || '-'}</div>}</div>
                  <div><div className="text-gray-600">Year</div>{generalEditingCard === 'basic' ? <input type="number" value={editForm.year || ''} onChange={(e) => setEditForm({...editForm, year: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="1900" max={new Date().getFullYear() + 1} /> : <div className="font-medium">{asset.year || '-'}</div>}</div>
                  <div><div className="text-gray-600">VIN / Serial</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.vin} onChange={(e) => setEditForm({...editForm, vin: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.vin || '-'}</div>}</div>
                  <div><div className="text-gray-600">{(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') ? 'License' : 'License Plate'}</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.license_plate || ''} onChange={(e) => setEditForm({...editForm, license_plate: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.license_plate || '-'}</div>}</div>
                  <div><div className="text-gray-600">Unit Number</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.unit_number || ''} onChange={(e) => setEditForm({...editForm, unit_number: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.unit_number || '-'}</div>}</div>
                  {(asset.asset_type !== 'heavy_machinery' && asset.asset_type !== 'other') && (
                    <div><div className="text-gray-600">Vehicle Type</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.vehicle_type || ''} onChange={(e) => setEditForm({...editForm, vehicle_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.vehicle_type || '-'}</div>}</div>
                  )}
                  <div><div className="text-gray-600">Fuel Type</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.fuel_type || ''} onChange={(e) => setEditForm({...editForm, fuel_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.fuel_type || '-'}</div>}</div>
                  {(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                    <div><div className="text-gray-600">{(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') ? 'Type' : 'Equipment Type Label'}</div>{generalEditingCard === 'basic' ? <input type="text" value={editForm.equipment_type_label || ''} onChange={(e) => setEditForm({...editForm, equipment_type_label: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.equipment_type_label || '-'}</div>}</div>
                  )}
                  <div><div className="text-gray-600">Condition</div>{generalEditingCard === 'basic' ? <select value={editForm.condition || ''} onChange={(e) => setEditForm({...editForm, condition: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="">Select</option><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select> : <div className="font-medium capitalize">{asset.condition || '-'}</div>}</div>
                  <div><div className="text-gray-600">Status</div>{generalEditingCard === 'basic' ? <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="active">Active</option><option value="inactive">Inactive</option><option value="maintenance">Maintenance</option><option value="retired">Retired</option></select> : <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[asset.status] || 'bg-gray-100 text-gray-800'}`}>{asset.status}</span>}</div>
                </div>
              </div>

              {/* Card 2: Registration & Compliance */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <FleetGeneralCardHeaderChrome
                  title="Registration & Compliance"
                  cardId="registration"
                  editingCard={generalEditingCard}
                  lockOtherSections={hasUnsavedChanges}
                  onEdit={startGeneralCardEdit}
                  onCancel={cancelGeneralSectionEdit}
                  onSave={handleSave}
                  savePending={updateMutation.isPending}
                  dirty={hasUnsavedChanges}
                  childrenUnderTitle={
                    Object.keys(complianceStatusByType).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(complianceStatusByType).map(([type, s]) => (
                          <span key={type} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.badgeClass}`} title={`${type} expires ${s.expiryDate}`}>
                            {type}: {s.label}
                          </span>
                        ))}
                        <button type="button" onClick={() => { setTab('compliance'); nav(`/fleet/assets/${id}?tab=compliance`, { replace: true }); }} className="text-xs text-brand-red hover:underline ml-1">View all →</button>
                      </div>
                    ) : undefined
                  }
                />
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  {asset.asset_type === 'vehicle' && (
                    <>
                      <div><div className="text-gray-600">ICBC Registration No.</div>{generalEditingCard === 'registration' ? <input type="text" value={editForm.icbc_registration_no || ''} onChange={(e) => setEditForm({...editForm, icbc_registration_no: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.icbc_registration_no || '-'}</div>}</div>
                      <div><div className="text-gray-600">Vancouver Decal #</div>{generalEditingCard === 'registration' ? <input type="text" value={editForm.vancouver_decals || ''} onChange={(e) => setEditForm({...editForm, vancouver_decals: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" placeholder="e.g., 123, 456" /> : <div className="font-medium">{Array.isArray(asset.vancouver_decals) ? asset.vancouver_decals.join(', ') : '-'}</div>}</div>
                      <div><div className="text-gray-600">Ferry Length</div>{generalEditingCard === 'registration' ? <input type="text" value={editForm.ferry_length || ''} onChange={(e) => setEditForm({...editForm, ferry_length: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" placeholder="e.g., 22L 8H" /> : <div className="font-medium">{asset.ferry_length || '-'}</div>}</div>
                      <div><div className="text-gray-600">GVW (kg)</div>{generalEditingCard === 'registration' ? <input type="number" value={editForm.gvw_kg || ''} onChange={(e) => setEditForm({...editForm, gvw_kg: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.gvw_kg ? asset.gvw_kg.toLocaleString() : '-'}</div>}</div>
                    </>
                  )}
                  <div><div className="text-gray-600">GVW Value</div>{generalEditingCard === 'registration' ? <input type="number" value={editForm.gvw_value ?? ''} onChange={(e) => setEditForm({...editForm, gvw_value: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.gvw_value != null ? asset.gvw_value : '-'}</div>}</div>
                  <div><div className="text-gray-600">GVW Unit</div>{generalEditingCard === 'registration' ? <select value={editForm.gvw_unit || ''} onChange={(e) => setEditForm({...editForm, gvw_unit: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm"><option value="">-</option><option value="kg">kg</option><option value="lbs">lbs</option></select> : <div className="font-medium">{asset.gvw_unit || '-'}</div>}</div>
                  <div><div className="text-gray-600">Propane Sticker Cert</div>{generalEditingCard === 'registration' ? <input type="text" value={editForm.propane_sticker_cert || ''} onChange={(e) => setEditForm({...editForm, propane_sticker_cert: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.propane_sticker_cert || '-'}</div>}</div>
                  <div>
                    <div className="text-gray-600">Propane Sticker Date</div>
                    <div className="flex items-center gap-2 mt-1">
                      {generalEditingCard === 'registration' ? (
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
                <FleetGeneralCardHeaderChrome
                  title="Assignment & Location"
                  cardId="assignment"
                  editingCard={generalEditingCard}
                  lockOtherSections={hasUnsavedChanges}
                  onEdit={startGeneralCardEdit}
                  onCancel={cancelGeneralSectionEdit}
                  onSave={handleSave}
                  savePending={updateMutation.isPending}
                  dirty={hasUnsavedChanges}
                />
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
                  <div><div className="text-gray-600">Sleeps</div>{generalEditingCard === 'assignment' ? <input type="text" value={editForm.yard_location || ''} onChange={(e) => setEditForm({...editForm, yard_location: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium">{asset.yard_location || '-'}</div>}</div>
                </div>
              </div>

              {/* Card 4: Odometer & Maintenance */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <FleetGeneralCardHeaderChrome
                  title="Odometer & Maintenance"
                  cardId="odometer"
                  editingCard={generalEditingCard}
                  lockOtherSections={hasUnsavedChanges}
                  onEdit={startGeneralCardEdit}
                  onCancel={cancelGeneralSectionEdit}
                  onSave={handleSave}
                  savePending={updateMutation.isPending}
                  dirty={hasUnsavedChanges}
                />
                <div className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                  {(asset.asset_type === 'vehicle' || asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                    <>
                      {asset.asset_type === 'vehicle' && (
                        <>
                          <div><div className="text-gray-600">Current Odometer</div>{generalEditingCard === 'odometer' ? <input type="number" value={editForm.odometer_current || ''} onChange={(e) => setEditForm({...editForm, odometer_current: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.odometer_current?.toLocaleString() || '-'}</div>}</div>
                          <div><div className="text-gray-600">Last Service Odometer</div>{generalEditingCard === 'odometer' ? <input type="number" value={editForm.odometer_last_service || ''} onChange={(e) => setEditForm({...editForm, odometer_last_service: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.odometer_last_service?.toLocaleString() || '-'}</div>}</div>
                          <div>
                            <div className="text-gray-600">Odometer Next Due At</div>
                            <div className="flex items-center gap-2 mt-1">
                              {generalEditingCard === 'odometer' ? (
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
                          <div className="md:col-span-2"><div className="text-gray-600">Odometer Noted Issues</div>{generalEditingCard === 'odometer' ? <textarea value={editForm.odometer_noted_issues || ''} onChange={(e) => setEditForm({...editForm, odometer_noted_issues: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium mt-1">{asset.odometer_noted_issues || '-'}</div>}</div>
                        </>
                      )}
                      {(asset.asset_type === 'heavy_machinery' || asset.asset_type === 'other') && (
                        <>
                          <div><div className="text-gray-600">Current Hours</div>{generalEditingCard === 'odometer' ? <input type="number" step="0.1" value={editForm.hours_current || ''} onChange={(e) => setEditForm({...editForm, hours_current: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.hours_current?.toLocaleString() || '-'}</div>}</div>
                          <div><div className="text-gray-600">Last Service Hours</div>{generalEditingCard === 'odometer' ? <input type="number" step="0.1" value={editForm.hours_last_service || ''} onChange={(e) => setEditForm({...editForm, hours_last_service: e.target.value})} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" min="0" /> : <div className="font-medium">{asset.hours_last_service?.toLocaleString() || '-'}</div>}</div>
                          <div>
                            <div className="text-gray-600">Hours Next Due At</div>
                            <div className="flex items-center gap-2 mt-1">
                              {generalEditingCard === 'odometer' ? (
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
                          <div className="md:col-span-2"><div className="text-gray-600">Hours Noted Issues</div>{generalEditingCard === 'odometer' ? <textarea value={editForm.hours_noted_issues || ''} onChange={(e) => setEditForm({...editForm, hours_noted_issues: e.target.value})} rows={2} className="w-full px-3 py-2 border rounded-lg mt-1 text-sm" /> : <div className="font-medium mt-1">{asset.hours_noted_issues || '-'}</div>}</div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notes & Photos */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <FleetGeneralCardHeaderChrome
                title="Notes & Photos"
                cardId="notes"
                editingCard={generalEditingCard}
                lockOtherSections={hasUnsavedChanges}
                onEdit={startGeneralCardEdit}
                onCancel={cancelGeneralSectionEdit}
                onSave={handleSave}
                savePending={updateMutation.isPending}
                dirty={hasUnsavedChanges}
              />
              <div className="p-4 space-y-4">
                <div><div className="text-sm text-gray-600 mb-1">Notes</div>{generalEditingCard === 'notes' ? <textarea value={editForm.notes || ''} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} rows={4} className="w-full px-3 py-2 border rounded-lg text-sm" /> : <div className="p-3 bg-gray-50 rounded text-sm">{asset.notes || '-'}</div>}</div>
                {asset.photos && asset.photos.length > 1 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-2">Additional photos</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {asset.photos.slice(1).map((photoId, idx) => (
                        <img
                          key={`${photoId}-${idx}`}
                          src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=300`)}
                          alt=""
                          className="w-full h-24 object-cover rounded border"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'inspections' && (
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Inspections</h3>
              <p className="mt-0.5 text-sm text-gray-600">
                Schedule an inspection for this asset.
              </p>
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setShowScheduleInspectionModal(true)}
                className="flex min-h-[52px] w-full min-w-0 items-center justify-center rounded-t-xl border-2 border-dashed border-gray-300 bg-white p-2.5 text-center transition-all hover:border-brand-red hover:bg-gray-50"
              >
                <span className="mr-2 text-lg text-gray-400">+</span>
                <span className="text-xs font-medium text-gray-700">Schedule inspection</span>
              </button>

              {inspectionsLoading && (
                <div className="border-t border-gray-100 px-4 py-4 text-center text-xs text-gray-500">Loading…</div>
              )}

              {!inspectionsLoading &&
                Array.isArray(inspections) &&
                inspections.length === 0 && (
                  <div className="border-t border-gray-100 px-4 py-6 text-center text-xs text-gray-500">
                    No inspections recorded for this asset yet.
                  </div>
                )}

              {!inspectionsLoading &&
                Array.isArray(inspections) &&
                inspections.map((inspection) => (
                  <div
                    key={inspection.id}
                    className="flex flex-col gap-1 border-t border-gray-100 px-3 py-2.5 transition-colors hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {new Date(inspection.inspection_date).toLocaleDateString()}
                        </div>
                        <div className="text-[11px] text-gray-600">
                          Result:{' '}
                          <span className={inspection.result === 'pass' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {inspection.result}
                          </span>
                        </div>
                        {inspection.notes && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-600">{inspection.notes}</p>
                        )}
                        {inspection.photos && inspection.photos.length > 0 && (
                          <div className="mt-2 flex gap-1">
                            {inspection.photos.map((photoId, idx) => (
                              <img
                                key={idx}
                                src={withFileAccessToken(`/files/${photoId}/thumbnail?w=100`)}
                                alt=""
                                className="h-8 w-8 rounded border border-gray-200 object-cover"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      {inspection.auto_generated_work_order_id && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab('work-orders');
                            nav(`/fleet/assets/${id}?tab=work-orders`, { replace: true });
                          }}
                          className="shrink-0 text-xs font-medium text-brand-red hover:underline"
                        >
                          View work order
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {tab === 'work-orders' && (
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Work Orders</h3>
              <p className="mt-0.5 text-sm text-gray-600">Create or open a work order for this asset.</p>
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setShowWorkOrderForm(true)}
                className="flex min-h-[52px] w-full min-w-0 items-center justify-center rounded-t-xl border-2 border-dashed border-gray-300 bg-white p-2.5 text-center transition-all hover:border-brand-red hover:bg-gray-50"
              >
                <span className="mr-2 text-lg text-gray-400">+</span>
                <span className="text-xs font-medium text-gray-700">New Work Order</span>
              </button>

              {workOrdersLoading && (
                <div className="border-t border-gray-100 px-4 py-4 text-center text-xs text-gray-500">Loading…</div>
              )}

              {!workOrdersLoading &&
                Array.isArray(workOrders) &&
                workOrders.length === 0 && (
                  <div className="border-t border-gray-100 px-4 py-6 text-center text-xs text-gray-500">
                    No work orders yet for this asset.
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
            <div>
              <h3 className="font-semibold text-lg">Activity history</h3>
              <p className="text-sm text-gray-600 mt-1">
                Check-outs and returns, edits to this asset, and other fleet log entries (newest first).
              </p>
            </div>
            <div className="space-y-2">
              {historyItems.map((item) => {
                const isAssignmentAudit =
                  item.source === 'audit' &&
                  item.entity_type === 'asset_assignment' &&
                  !!item.entity_id;
                const assign =
                  item.assignment_id && item.log_subtype
                    ? assignments.find((a) => a.id === item.assignment_id)
                    : isAssignmentAudit
                      ? assignments.find((a) => a.id === item.entity_id) ?? null
                      : null;
                const isSyntheticAssignRow =
                  item.source === 'assignment' &&
                  !!item.log_subtype &&
                  (item.log_subtype === 'assign' || item.log_subtype === 'return');
                const openAssignDetail =
                  !!assign &&
                  (isSyntheticAssignRow ||
                    (isAssignmentAudit &&
                      (item.audit_action === 'CREATE' || item.audit_action === 'UPDATE')));
                const cj = item.changes_json;
                const openAuditDetail =
                  item.source === 'audit' &&
                  !!cj &&
                  typeof cj === 'object' &&
                  ('before' in cj || 'after' in cj || 'deleted' in cj || Object.keys(cj).length > 0) &&
                  !(isAssignmentAudit && assign);
                const borderClass =
                  item.source === 'assignment' && item.kind === 'checkout'
                    ? 'border-brand-red'
                    : item.source === 'assignment' && item.kind === 'return'
                      ? 'border-sky-500'
                      : isAssignmentAudit && item.audit_action === 'CREATE'
                        ? 'border-brand-red'
                        : isAssignmentAudit && item.audit_action === 'UPDATE'
                          ? 'border-sky-500'
                          : item.source === 'audit'
                            ? 'border-amber-500'
                            : 'border-gray-300';
                const clickable = openAssignDetail || !!openAuditDetail;
                const badge =
                  item.source === 'assignment' && item.kind === 'checkout'
                    ? 'Check-out'
                    : item.source === 'assignment' && item.kind === 'return'
                      ? 'Return'
                      : isAssignmentAudit && item.audit_action === 'CREATE'
                        ? 'Check-out'
                        : isAssignmentAudit && item.audit_action === 'UPDATE'
                          ? 'Return'
                          : item.source === 'audit'
                            ? 'Change'
                            : 'Log';
                const summary = buildFleetHistoryDescription(item);
                return (
                  <div
                    key={item.id}
                    className={`border-l-4 pl-4 py-2 ${borderClass} ${clickable ? 'cursor-pointer hover:bg-gray-50 rounded-r-lg transition-colors' : ''}`}
                    onClick={
                      openAssignDetail && assign
                        ? () => {
                            setLogDetailAssignment(assign);
                            if (isSyntheticAssignRow && item.log_subtype) {
                              setLogDetailLogType(item.log_subtype === 'assign' ? 'assignment' : 'return');
                            } else if (isAssignmentAudit) {
                              setLogDetailLogType(item.audit_action === 'UPDATE' ? 'return' : 'assignment');
                            }
                          }
                        : openAuditDetail
                          ? () =>
                              setHistoryAuditDetail({
                                changes: cj as Record<string, unknown>,
                                entityType: item.entity_type ?? null,
                                auditAction: item.audit_action ?? null,
                                summary,
                                auditContext: item.audit_context ?? null,
                              })
                          : undefined
                    }
                    role={clickable ? 'button' : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{summary}</span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{badge}</span>
                        </div>
                        {item.actor_name && (
                          <div className="text-xs text-gray-500 mt-1">By {item.actor_name}</div>
                        )}
                        {item.source === 'fleet_log' && item.odometer_snapshot != null && (
                          <div className="text-xs text-gray-500 mt-1">Odometer: {item.odometer_snapshot.toLocaleString()}</div>
                        )}
                        {item.source === 'fleet_log' && item.hours_snapshot != null && (
                          <div className="text-xs text-gray-500 mt-1">Hours: {Number(item.hours_snapshot).toLocaleString()}</div>
                        )}
                        {clickable && (
                          <div className="text-xs text-brand-red mt-1">
                            {openAssignDetail ? 'Click for assignment details' : 'Click to view change details'}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 shrink-0 text-right">
                        {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : '—'}
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
                            queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
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

      {showScheduleInspectionModal && id && (
        <ScheduleInspectionModalInline
          assetId={id}
          lockedVehicleDisplayName={lockedScheduleVehicleLabel}
          onSuccess={() => {
            setShowScheduleInspectionModal(false);
            queryClient.invalidateQueries({ queryKey: ['inspection-schedules'] });
            queryClient.invalidateQueries({ queryKey: ['fleet-inspection-schedules-calendar'] });
            queryClient.invalidateQueries({ queryKey: ['fleetAssetInspections', id] });
            queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
          }}
          onCancel={() => setShowScheduleInspectionModal(false)}
        />
      )}
      {showWorkOrderForm && (
        <WorkOrderFormInline
          assetId={id!}
          onSuccess={() => {
            setShowWorkOrderForm(false);
            queryClient.invalidateQueries({ queryKey: ['fleetAssetWorkOrders', id] });
            queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
          }}
          onCancel={() => setShowWorkOrderForm(false)}
          employees={employees}
        />
      )}
      {showHeroPhotoViewModal && heroPhotoLargeUrl && (
        <OverlayPortal>
          <div
            className={SAFETY_MODAL_OVERLAY}
            onClick={(e) => e.target === e.currentTarget && setShowHeroPhotoViewModal(false)}
          >
            <SafetyFormModalLayout
              widthClass="w-[min(720px,95vw)]"
              titleId={assetHeroPhotoModalTitleId}
              title="Asset photo"
              onClose={() => setShowHeroPhotoViewModal(false)}
              innerCard={false}
              bodyClassName="overflow-y-auto flex-1 min-h-0 flex items-center justify-center bg-gray-50 p-4"
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => void removeHeroPhoto()}
                    disabled={heroPhotoBusy}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHeroPhotoViewModal(false)}
                    className={SAFETY_MODAL_BTN_CANCEL}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => assetHeroPhotoInputRef.current?.click()}
                    disabled={heroPhotoBusy}
                    className={SAFETY_MODAL_BTN_PRIMARY}
                  >
                    Replace image
                  </button>
                </>
              }
            >
              <img
                src={heroPhotoLargeUrl}
                alt={asset.name || 'Asset'}
                className="max-h-[min(65vh,560px)] w-full max-w-full rounded-lg object-contain shadow-sm"
              />
            </SafetyFormModalLayout>
          </div>
        </OverlayPortal>
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
        <FleetHistoryAuditChangeModal detail={historyAuditDetail} onClose={() => setHistoryAuditDetail(null)} />
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
            queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
            setShowComplianceModal(false);
            setEditingComplianceId(null);
          }}
        />
      )}
    </div>
  );
}

const FLEET_SCHEDULE_INSPECTION_FORM_ID = 'fleet-schedule-inspection-form';

function ScheduleInspectionModalInline({
  assetId,
  lockedVehicleDisplayName,
  onSuccess,
  onCancel,
}: {
  assetId: string;
  lockedVehicleDisplayName: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const [canSubmit, setCanSubmit] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleValidationChange = useCallback((ok: boolean, pending: boolean) => {
    setCanSubmit(ok);
    setIsPending(!!pending);
  }, []);

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

  const submitDisabled = !canSubmit || isPending;

  return (
    <OverlayPortal>
      <div className={SAFETY_MODAL_OVERLAY} onClick={onCancel}>
        <SafetyFormModalLayout
          widthClass="w-[640px]"
          titleId={titleId}
          title="Schedule inspection"
          subtitle="Creates the schedule and both Body and Mechanical inspections as pending. Open them from the calendar or inspection list when ready."
          onClose={onCancel}
          footer={
            <>
              <button type="button" onClick={onCancel} className={SAFETY_MODAL_BTN_CANCEL}>
                Cancel
              </button>
              <button
                type="submit"
                form={FLEET_SCHEDULE_INSPECTION_FORM_ID}
                disabled={submitDisabled}
                className={SAFETY_MODAL_BTN_PRIMARY}
              >
                {isPending ? 'Scheduling…' : 'Schedule inspection'}
              </button>
            </>
          }
        >
          <InspectionScheduleForm
            initialAssetId={assetId}
            vehicleSelectionLocked
            lockedVehicleDisplayName={lockedVehicleDisplayName}
            embedded
            formId={FLEET_SCHEDULE_INSPECTION_FORM_ID}
            onSuccess={() => {
              onSuccess();
            }}
            onCancel={onCancel}
            onValidationChange={handleValidationChange}
          />
        </SafetyFormModalLayout>
      </div>
    </OverlayPortal>
  );
}

const FLEET_NEW_WORK_ORDER_FORM_ID = 'fleet-new-work-order-form';

// Inline Work Order Form Component (SafetyFormModalLayout shell)
function WorkOrderFormInline({ assetId, onSuccess, onCancel, employees }: {
  assetId: string;
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
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        entity_type: 'fleet',
        entity_id: assetId,
        description: form.description.trim(),
        category: form.category,
        urgency: form.urgency,
        status: 'open',
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
                form={FLEET_NEW_WORK_ORDER_FORM_ID}
                disabled={submitDisabled}
                className={SAFETY_MODAL_BTN_PRIMARY}
              >
                {createMutation.isPending ? 'Creating…' : 'Create work order'}
              </button>
            </>
          }
        >
          <form
            id={FLEET_NEW_WORK_ORDER_FORM_ID}
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

async function uploadFleetImageToCategory(file: File, category_id: string): Promise<string> {
  const contentType = file.type || 'image/jpeg';
  const up: any = await api('POST', '/files/upload', {
    original_name: file.name,
    content_type: contentType,
    employee_id: null,
    project_id: null,
    client_id: null,
    category_id,
  });
  await fetch(up.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-ms-blob-type': 'BlockBlob' },
    body: file,
  });
  const conf: any = await api('POST', '/files/confirm', {
    key: up.key,
    size_bytes: file.size,
    checksum_sha256: 'na',
    content_type: contentType,
  });
  return conf.id as string;
}

async function uploadFleetAssignmentImage(file: File): Promise<string> {
  return uploadFleetImageToCategory(file, 'fleet-assignment-photos');
}

async function uploadFleetAssetHeroImage(file: File): Promise<string> {
  return uploadFleetImageToCategory(file, 'fleet-assignment-photos');
}

/** Dashed drop zone: drag-and-drop, Ctrl+V paste, or file picker (one or more images). */
function FleetAssignmentPhotosPicker({
  label,
  photoIds,
  onPhotoIdsChange,
  onUploadingChange,
  disabled,
}: {
  label: string;
  photoIds: string[];
  onPhotoIdsChange: React.Dispatch<React.SetStateAction<string[]>>;
  onUploadingChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addImageFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || disabled) return;
    const list = Array.from(files).filter(isLikelyImageFile);
    if (!list.length) {
      toast.error('Only image files are allowed.');
      return;
    }
    onUploadingChange?.(true);
    try {
      const newIds: string[] = [];
      for (const file of list) {
        newIds.push(await uploadFleetAssignmentImage(file));
      }
      onPhotoIdsChange((prev) => [...prev, ...newIds]);
      toast.success(list.length === 1 ? 'Image uploaded' : `${list.length} images uploaded`);
    } catch {
      toast.error('Failed to upload photos');
    } finally {
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (id: string) => {
    onPhotoIdsChange((prev) => prev.filter((x) => x !== id));
  };

  return (
    <div>
      <label className={SAFETY_MODAL_FIELD_LABEL}>{label}</label>
      <div
        tabIndex={disabled ? -1 : 0}
        onPaste={(e) => {
          if (disabled) return;
          const pasted = imageFilesFromClipboardData(e.clipboardData);
          if (!pasted.length) return;
          e.preventDefault();
          void addImageFiles(pasted);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          void addImageFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed px-3 py-4 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-red/25 ${
          dragOver ? 'border-brand-red bg-red-50/50' : 'border-gray-200 bg-gray-50/80'
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            void addImageFiles(e.target.files);
          }}
        />
        <p className="text-xs text-gray-600 mb-2">Drag and drop images here, paste (Ctrl+V), or upload</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="text-sm font-medium text-brand-red hover:underline disabled:opacity-50 disabled:no-underline"
        >
          Choose images
        </button>
        <p className="text-xs text-gray-500 mt-1.5">Multiple images supported</p>
      </div>
      {photoIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {photoIds.map((id) => (
            <div key={id} className="relative group">
              <img
                src={withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=120`)}
                alt=""
                className="h-20 w-20 object-cover rounded-lg border border-gray-200"
              />
              {!disabled && (
                <button
                  type="button"
                  className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs leading-5 hover:bg-black/80"
                  onClick={() => removePhoto(id)}
                  aria-label="Remove image"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  const minOdometerOut = useMemo(() => {
    if (asset?.asset_type !== 'vehicle') return null;
    const c = asset.odometer_current;
    if (c == null || Number.isNaN(Number(c))) return null;
    return Number(c);
  }, [asset?.asset_type, asset?.odometer_current]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigned_to_user_id) {
      toast.error('Select who to assign the asset to');
      return;
    }
    if (asset?.asset_type === 'vehicle' && odometer_out.trim() !== '' && minOdometerOut != null) {
      const out = parseInt(odometer_out, 10);
      if (!Number.isNaN(out) && out < minOdometerOut) {
        toast.error(
          `Odometer out must be at least the current reading (${minOdometerOut.toLocaleString()}).`
        );
        return;
      }
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const inputBase = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';
  const labelClass = SAFETY_MODAL_FIELD_LABEL;

  return (
    <OverlayPortal>
      <div className={SAFETY_MODAL_OVERLAY}>
        <SafetyFormModalLayout
          widthClass="w-[900px]"
          titleId="fleet-assign-modal-title"
          title="Assign"
          subtitle="Assign this fleet asset to a team member. Checkout details and photos are saved on the assignment."
          onClose={onClose}
          shellOverflow="visible"
          bodyClassName="overflow-y-auto flex-1 p-4 min-h-0 relative z-0"
          innerCardClassName="relative z-0"
          footer={
            <>
              <button type="button" onClick={onClose} className={SAFETY_MODAL_BTN_CANCEL}>
                Cancel
              </button>
              <button
                type="submit"
                form="fleet-assign-form"
                disabled={isSubmitting || uploadingPhotos}
                className={SAFETY_MODAL_BTN_PRIMARY}
              >
                {isSubmitting ? 'Saving...' : 'Assign'}
              </button>
            </>
          }
        >
          <form id="fleet-assign-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-3 min-w-0">
          <div ref={nameDropdownRef} className="relative">
            <label className={labelClass}>
              Name <span className="text-red-600">*</span>
            </label>
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
                    e.stopPropagation();
                    setNameDropdownOpen(false);
                    setNameSearch('');
                  }
                }}
                placeholder="Search or select user..."
                className={`${inputBase} pr-9`}
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
              <ul className="absolute z-[100] mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
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
            <label className={labelClass}>Phone</label>
            <input type="text" value={phone_snapshot} onChange={(e) => setPhoneSnapshot(e.target.value)} className={inputBase} />
          </div>
          <div>
            <label className={labelClass}>Address</label>
            <AddressAutocomplete
              value={address_snapshot}
              onChange={setAddressSnapshot}
              placeholder=""
              className={inputBase}
            />
          </div>
          <div>
            <label className={labelClass}>Sleep</label>
            <AddressAutocomplete
              value={sleeps_snapshot}
              onChange={setSleepsSnapshot}
              placeholder=""
              className={inputBase}
            />
          </div>
          <div ref={departmentDropdownRef} className="relative">
            <label className={labelClass}>Department</label>
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
                    e.stopPropagation();
                    setDepartmentDropdownOpen(false);
                    setDepartmentSearch('');
                  }
                }}
                className={`${inputBase} pr-9`}
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
              <ul className="absolute z-[100] mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
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
            </div>
            <div className="space-y-3 min-w-0">
          {asset?.asset_type === 'vehicle' && (
            <div>
              <label className={labelClass}>Odometer out</label>
              <input
                type="number"
                value={odometer_out}
                onChange={(e) => setOdometerOut(e.target.value)}
                className={inputBase}
                min={minOdometerOut != null ? minOdometerOut : 0}
              />
              {minOdometerOut != null && (
                <p className="text-xs text-gray-500 mt-1">
                  Must be at least current odometer ({minOdometerOut.toLocaleString()}).
                </p>
              )}
            </div>
          )}
          {(asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && (
            <div>
              <label className={labelClass}>Hours out</label>
              <input type="number" step="0.1" value={hours_out} onChange={(e) => setHoursOut(e.target.value)} className={inputBase} min="0" />
            </div>
          )}
          <FleetAssignmentPhotosPicker
            label="Image out"
            photoIds={photos_out}
            onPhotoIdsChange={setPhotosOut}
            onUploadingChange={setUploadingPhotos}
            disabled={isSubmitting || uploadingPhotos}
          />
          <div>
            <label className={labelClass}>Notes out</label>
            <textarea value={notes_out} onChange={(e) => setNotesOut(e.target.value)} rows={3} className={`${inputBase} resize-y min-h-[4.5rem]`} />
          </div>
            </div>
              </div>
          </form>
        </SafetyFormModalLayout>
      </div>
    </OverlayPortal>
  );
}

type FleetHistoryAuditDetailPayload = {
  changes: Record<string, unknown>;
  entityType: string | null;
  auditAction: string | null;
  summary: string;
  auditContext: Record<string, unknown> | null | undefined;
};

function FleetHistoryAuditChangeModal({
  detail,
  onClose,
}: {
  detail: FleetHistoryAuditDetailPayload;
  onClose: () => void;
}) {
  const rows = useMemo(
    () => buildFleetAuditChangeRows(detail.entityType, detail.changes, detail.auditContext),
    [detail.entityType, detail.changes, detail.auditContext]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const headline = `${formatFleetAuditEntityTitle(detail.entityType)} · ${formatFleetAuditActionVerb(detail.auditAction)}`;

  return (
    <OverlayPortal>
      <div className={SAFETY_MODAL_OVERLAY}>
        <SafetyFormModalLayout
          widthClass="w-[720px]"
          titleId="fleet-history-audit-change-title"
          title="Change details"
          subtitle={
            <span>
              <span className="block text-gray-600 font-medium text-[11px] uppercase tracking-wide mb-1">{headline}</span>
              <span className="block text-gray-600">{detail.summary}</span>
            </span>
          }
          onClose={onClose}
          bodyClassName="overflow-y-auto flex-1 p-4 min-h-0"
          innerCardClassName=""
          footer={
            <button type="button" onClick={onClose} className={SAFETY_MODAL_BTN_CANCEL}>
              Close
            </button>
          }
        >
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-gray-800 border-b border-gray-200 w-[30%]">Field</th>
                    <th className="px-3 py-2 font-semibold text-gray-800 border-b border-gray-200">Before</th>
                    <th className="px-3 py-2 font-semibold text-gray-800 border-b border-gray-200">After</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.label}-${i}`} className="border-t border-gray-100 bg-white">
                      <td className="px-3 py-2.5 text-gray-900 font-medium align-top">{r.label}</td>
                      <td className="px-3 py-2.5 text-gray-700 align-top whitespace-pre-wrap break-words max-w-[34vw]">
                        {r.before}
                      </td>
                      <td className="px-3 py-2.5 text-gray-900 align-top whitespace-pre-wrap break-words max-w-[34vw]">
                        {r.after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                No field-by-field breakdown is available for this entry.
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-brand-red hover:underline font-medium">Technical payload</summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 overflow-auto max-h-52 text-[11px] font-mono text-gray-800 whitespace-pre-wrap break-words">
                  {JSON.stringify(detail.changes, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </SafetyFormModalLayout>
      </div>
    </OverlayPortal>
  );
}

function assignmentPhotoViewUrls(photoIds: string[] | undefined): string[] {
  if (!photoIds?.length) return [];
  return photoIds.map((id) => withFileAccessToken(`/files/${encodeURIComponent(id)}/thumbnail?w=1600`));
}

function AssignmentImageLightbox({
  urls,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  if (!urls.length) return null;

  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4 md:p-8"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
      >
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {urls.length > 1 && (
            <span className="text-xs text-white/80 tabular-nums px-2 py-1 rounded bg-white/10">
              {index + 1} / {urls.length}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-white/15 hover:bg-white/25 border border-white/20"
          >
            Close
          </button>
        </div>
        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrev();
              }}
              className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 rounded-full p-2 md:p-3 text-white bg-white/10 hover:bg-white/20 border border-white/20"
              aria-label="Previous image"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 rounded-full p-2 md:p-3 text-white bg-white/10 hover:bg-white/20 border border-white/20"
              aria-label="Next image"
            >
              <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
        <button
          type="button"
          className="max-h-[calc(100vh-5rem)] max-w-full flex items-center justify-center outline-none"
          onClick={(e) => e.stopPropagation()}
          aria-label="View image"
        >
          <img
            src={urls[index]}
            alt={`Attachment ${index + 1}`}
            className="max-h-[calc(100vh-5rem)] max-w-full w-auto object-contain rounded-lg shadow-2xl"
          />
        </button>
      </div>
    </OverlayPortal>
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
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const showAssign = true;
  const showReturn = !!assignment.returned_at;

  const urlsOut = useMemo(() => assignmentPhotoViewUrls(assignment.photos_out), [assignment.photos_out]);
  const urlsIn = useMemo(() => assignmentPhotoViewUrls(assignment.photos_in), [assignment.photos_in]);

  const openLightbox = (urls: string[], index: number) => {
    if (!urls.length) return;
    setLightbox({ urls, index: Math.max(0, Math.min(index, urls.length - 1)) });
  };

  const lightboxPrev = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || lb.urls.length <= 1) return lb;
      const next = lb.index <= 0 ? lb.urls.length - 1 : lb.index - 1;
      return { ...lb, index: next };
    });
  }, []);

  const lightboxNext = useCallback(() => {
    setLightbox((lb) => {
      if (!lb || lb.urls.length <= 1) return lb;
      const next = lb.index >= lb.urls.length - 1 ? 0 : lb.index + 1;
      return { ...lb, index: next };
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const detailLabel = SAFETY_MODAL_FIELD_LABEL;
  const detailValue = 'text-sm text-gray-900 font-medium';

  return (
    <>
      <OverlayPortal>
        <div className={SAFETY_MODAL_OVERLAY}>
          <SafetyFormModalLayout
            widthClass="w-[640px]"
            titleId="fleet-assignment-log-detail-title"
            title={logType === 'assignment' ? 'Check-out details' : 'Return details'}
            subtitle="Information and photos recorded for this assignment."
            onClose={onClose}
            bodyClassName="overflow-y-auto flex-1 p-4 min-h-0"
            innerCardClassName=""
            footer={
              <button type="button" onClick={onClose} className={SAFETY_MODAL_BTN_CANCEL}>
                Close
              </button>
            }
          >
            <div className="space-y-8">
              {showAssign && (
                <div>
                  <div className="space-y-3">
                    <div>
                      <div className={detailLabel}>Name</div>
                      <div className={detailValue}>{assignment.assigned_to_name || '—'}</div>
                    </div>
                    <div>
                      <div className={detailLabel}>Phone</div>
                      <div className={detailValue}>{assignment.phone_snapshot || '—'}</div>
                    </div>
                    <div>
                      <div className={detailLabel}>Address</div>
                      <div className={detailValue}>{assignment.address_snapshot || '—'}</div>
                    </div>
                    <div>
                      <div className={detailLabel}>Department</div>
                      <div className={detailValue}>{assignment.department_snapshot || '—'}</div>
                    </div>
                    <div>
                      <div className={detailLabel}>Assigned at</div>
                      <div className={detailValue}>
                        {assignment.assigned_at ? formatDateLocal(new Date(assignment.assigned_at)) : '—'}
                      </div>
                    </div>
                    {assignment.odometer_out != null && (
                      <div>
                        <div className={detailLabel}>Odometer out</div>
                        <div className={detailValue}>{assignment.odometer_out.toLocaleString()}</div>
                      </div>
                    )}
                    {assignment.hours_out != null && (
                      <div>
                        <div className={detailLabel}>Hours out</div>
                        <div className={detailValue}>{assignment.hours_out}</div>
                      </div>
                    )}
                    {assignment.notes_out && (
                      <div>
                        <div className={detailLabel}>Notes out</div>
                        <div className={`${detailValue} whitespace-pre-wrap`}>{assignment.notes_out}</div>
                      </div>
                    )}
                    {urlsOut.length > 0 && (
                      <div>
                        <div className={detailLabel}>Images out</div>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {assignment.photos_out!.map((photoId: string, idx: number) => (
                            <button
                              key={photoId + idx}
                              type="button"
                              onClick={() => openLightbox(urlsOut, idx)}
                              className="relative rounded-lg border border-gray-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-red/40 hover:opacity-95 transition-opacity"
                              title="View image"
                            >
                              <img
                                src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=200`)}
                                alt={`Out ${idx + 1}`}
                                className="w-24 h-24 object-cover block"
                              />
                              <span className="absolute bottom-1 right-1 rounded bg-black/55 text-white text-[10px] px-1 py-0.5">View</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showReturn && (
                <div className={showAssign ? 'pt-6 border-t border-gray-200' : ''}>
                  <div className="space-y-3">
                    <div>
                      <div className={detailLabel}>Returned at</div>
                      <div className={detailValue}>
                        {assignment.returned_at ? formatDateLocal(new Date(assignment.returned_at)) : '—'}
                      </div>
                    </div>
                    {assignment.odometer_in != null && (
                      <div>
                        <div className={detailLabel}>Odometer in</div>
                        <div className={detailValue}>{assignment.odometer_in.toLocaleString()}</div>
                      </div>
                    )}
                    {assignment.hours_in != null && (
                      <div>
                        <div className={detailLabel}>Hours in</div>
                        <div className={detailValue}>{assignment.hours_in}</div>
                      </div>
                    )}
                    {assignment.notes_in && (
                      <div>
                        <div className={detailLabel}>Notes in</div>
                        <div className={`${detailValue} whitespace-pre-wrap`}>{assignment.notes_in}</div>
                      </div>
                    )}
                    {urlsIn.length > 0 && (
                      <div>
                        <div className={detailLabel}>Images in</div>
                        <div className="flex gap-2 flex-wrap mt-1">
                          {assignment.photos_in!.map((photoId: string, idx: number) => (
                            <button
                              key={photoId + idx}
                              type="button"
                              onClick={() => openLightbox(urlsIn, idx)}
                              className="relative rounded-lg border border-gray-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-red/40 hover:opacity-95 transition-opacity"
                              title="View image"
                            >
                              <img
                                src={withFileAccessToken(`/files/${encodeURIComponent(photoId)}/thumbnail?w=200`)}
                                alt={`In ${idx + 1}`}
                                className="w-24 h-24 object-cover block"
                              />
                              <span className="absolute bottom-1 right-1 rounded bg-black/55 text-white text-[10px] px-1 py-0.5">View</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SafetyFormModalLayout>
        </div>
      </OverlayPortal>
      {lightbox && (
        <AssignmentImageLightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
        />
      )}
    </>
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

  const minOdometerIn = useMemo(() => {
    if (asset?.asset_type !== 'vehicle') return null;
    const out = openAssignment.odometer_out;
    if (out == null || Number.isNaN(Number(out))) return null;
    return Number(out);
  }, [asset?.asset_type, openAssignment.odometer_out]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const inputBase = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm';
  const labelClass = SAFETY_MODAL_FIELD_LABEL;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (asset?.asset_type === 'vehicle' && odometer_in.trim() !== '' && minOdometerIn != null) {
      const v = parseInt(odometer_in, 10);
      if (!Number.isNaN(v) && v < minOdometerIn) {
        toast.error(
          `Odometer in must be at least odometer out at check-out (${minOdometerIn.toLocaleString()}).`
        );
        return;
      }
    }
    const payload: any = {
      odometer_in: odometer_in ? parseInt(odometer_in, 10) : null,
      hours_in: hours_in ? parseFloat(hours_in) : null,
      notes_in: notes_in || null,
      photos_in: photos_in.length ? photos_in : null,
    };
    onSubmit(payload);
  };

  return (
    <OverlayPortal>
      <div className={SAFETY_MODAL_OVERLAY}>
        <SafetyFormModalLayout
          widthClass="w-[640px]"
          titleId="fleet-return-modal-title"
          title="Return"
          subtitle="Record return readings, photos, and notes. Odometer in cannot be below the reading recorded at check-out."
          onClose={onClose}
          shellOverflow="visible"
          bodyClassName="overflow-y-auto flex-1 p-4 min-h-0 relative z-0"
          innerCardClassName="relative z-0"
          footer={
            <>
              <button type="button" onClick={onClose} className={SAFETY_MODAL_BTN_CANCEL}>
                Cancel
              </button>
              <button
                type="submit"
                form="fleet-return-form"
                disabled={isSubmitting || uploadingPhotos}
                className={SAFETY_MODAL_BTN_PRIMARY}
              >
                {isSubmitting ? 'Saving...' : 'Return'}
              </button>
            </>
          }
        >
          <form id="fleet-return-form" onSubmit={handleSubmit} className="space-y-4">
            {asset?.asset_type === 'vehicle' && (
              <div>
                <label className={labelClass}>Odometer in</label>
                <input
                  type="number"
                  value={odometer_in}
                  onChange={(e) => setOdometerIn(e.target.value)}
                  className={inputBase}
                  min={minOdometerIn != null ? minOdometerIn : 0}
                />
                {minOdometerIn != null && (
                  <p className="text-xs text-gray-500 mt-1">
                    Must be at least check-out odometer ({minOdometerIn.toLocaleString()}).
                  </p>
                )}
              </div>
            )}
            {(asset?.asset_type === 'heavy_machinery' || asset?.asset_type === 'other') && (
              <div>
                <label className={labelClass}>Hours in</label>
                <input
                  type="number"
                  step="0.1"
                  value={hours_in}
                  onChange={(e) => setHoursIn(e.target.value)}
                  className={inputBase}
                  min="0"
                />
              </div>
            )}
            <FleetAssignmentPhotosPicker
              label="Images in"
              photoIds={photos_in}
              onPhotoIdsChange={setPhotosIn}
              onUploadingChange={setUploadingPhotos}
              disabled={isSubmitting || uploadingPhotos}
            />
            <div>
              <label className={labelClass}>Notes in</label>
              <textarea
                value={notes_in}
                onChange={(e) => setNotesIn(e.target.value)}
                rows={3}
                className={`${inputBase} resize-y min-h-[4.5rem]`}
              />
            </div>
          </form>
        </SafetyFormModalLayout>
      </div>
    </OverlayPortal>
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
