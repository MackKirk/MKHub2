import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useId,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { formatDateLocal } from '@/lib/dateUtils';
import { isLikelyImageFile } from '@/utils/imageUploadHelpers';
import { getFleetDueStatusBadgeVariant } from '@/lib/fleetUi';
import { useConfirm } from '@/components/ConfirmProvider';
import ScheduleFleetInspectionModal from '@/components/fleet/ScheduleFleetInspectionModal';
import EditFleetAssetGeneralModal, {
  type FleetAssetGeneralEditSection,
} from '@/components/fleet/EditFleetAssetGeneralModal';
import { FleetAssetGeneralTab } from '@/components/fleet/FleetAssetGeneralTab';
import {
  FleetAssetInspectionsTab,
  type FleetAssetInspectionRow,
} from '@/components/fleet/FleetAssetInspectionsTab';
import {
  FleetAssetWorkOrdersTab,
  type FleetAssetWorkOrderRow,
} from '@/components/fleet/FleetAssetWorkOrdersTab';
import NewFleetWorkOrderModal from '@/components/fleet/NewFleetWorkOrderModal';
import {
  FleetAssetComplianceTab,
  type FleetAssetComplianceRow,
} from '@/components/fleet/FleetAssetComplianceTab';
import FleetComplianceModal, {
  type FleetComplianceRecord,
} from '@/components/fleet/FleetComplianceModal';
import { FleetAssetLogsTab, type FleetAssetHistoryItem } from '@/components/fleet/FleetAssetLogsTab';
import {
  canEditFleetAssetTab,
  canViewFleetAssetTab,
  canAssignFleetWorkOrder,
  type FleetAssetTab,
} from '@/lib/fleetPermissions';
import FleetHistoryAuditChangeModal, {
  type FleetHistoryAuditDetailPayload,
} from '@/components/fleet/FleetHistoryAuditChangeModal';
import FleetAssignmentLogDetailModal from '@/components/fleet/FleetAssignmentLogDetailModal';
import FleetAssignModal from '@/components/fleet/FleetAssignModal';
import FleetReturnModal from '@/components/fleet/FleetReturnModal';
import { FleetAssetHero, FleetAssetHeroSkeleton } from '@/components/fleet/FleetAssetHero';
import {
  AppButton,
  AppCard,
  AppDatePicker,
  AppEmptyState,
  AppFormModal,
  AppInput,
  AppListCreateItem,
  AppModal,
  AppPageHeader,
  AppSelect,
  AppTabs,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Truck } from 'lucide-react';

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

type Inspection = {
  id: string;
  fleet_asset_id: string;
  inspection_date: string;
  inspection_type?: string;
  inspection_schedule_id?: string;
  inspector_user_id?: string;
  inspector_name?: string;
  checklist_results?: Record<string, any>;
  photos?: string[];
  result: string;
  notes?: string;
  odometer_reading?: number;
  hours_reading?: number;
  auto_generated_work_order_id?: string;
  created_at: string;
};

function buildFleetAssetHeroHeading(asset: FleetAsset): { primaryTitle: string; subtitleLine: string | null } {
  const makeModel = [asset.make, asset.model].filter(Boolean).join(' ').trim();
  const unitLabel =
    asset.unit_number != null && String(asset.unit_number).trim() !== ''
      ? `Unit #${asset.unit_number}`
      : '';

  let primaryTitle: string;
  if (makeModel) {
    primaryTitle = asset.year != null ? `${makeModel} (${asset.year})` : makeModel;
  } else if (asset.name?.trim()) {
    primaryTitle = asset.name.trim();
  } else if (unitLabel) {
    primaryTitle = unitLabel;
  } else {
    primaryTitle = 'Asset';
  }

  const parts: string[] = [];
  if (makeModel && asset.name?.trim()) {
    const n = asset.name.trim();
    if (n !== makeModel && n !== primaryTitle) parts.push(n);
  }
  // Unit is shown in the hero metadata grid; keep subtitle to name/plate only.
  const plate = asset.license_plate?.trim();
  if (plate) {
    parts.push(plate);
  }

  const subtitleLine = parts.length > 0 ? parts.join(' \u00b7 ') : null;
  return { primaryTitle, subtitleLine };
}

const INSPECTION_LIST_SORT_COLS = [
  'inspection_date',
  'inspection_type',
  'result',
  'created_at',
] as const;

type InspectionListSortCol = (typeof INSPECTION_LIST_SORT_COLS)[number];

function parseInspectionListSort(search: string): {
  sort: InspectionListSortCol;
  dir: 'asc' | 'desc';
  q: string;
  qInput: string;
} {
  const p = new URLSearchParams(search);
  const raw = p.get('insp_sort');
  const sort: InspectionListSortCol = INSPECTION_LIST_SORT_COLS.includes(raw as InspectionListSortCol)
    ? (raw as InspectionListSortCol)
    : 'inspection_date';
  const dr = p.get('insp_dir');
  const dir: 'asc' | 'desc' = dr === 'asc' || dr === 'desc' ? dr : 'desc';
  const qInput = (p.get('insp_q') ?? '').trim();
  const q = qInput.toLowerCase();
  return { sort, dir, q, qInput };
}

function compareFleetAssetInspections(
  a: Inspection,
  b: Inspection,
  sort: InspectionListSortCol,
  dir: 'asc' | 'desc'
): number {
  const m = dir === 'asc' ? 1 : -1;
  switch (sort) {
    case 'inspection_date': {
      const ta = new Date(a.inspection_date).getTime();
      const tb = new Date(b.inspection_date).getTime();
      return (ta - tb) * m;
    }
    case 'inspection_type':
      return (a.inspection_type || 'mechanical').localeCompare(b.inspection_type || 'mechanical') * m;
    case 'result':
      return (a.result || '').toLowerCase().localeCompare((b.result || '').toLowerCase()) * m;
    case 'created_at': {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return (ta - tb) * m;
    }
    default:
      return 0;
  }
}

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

const FLEET_ASSET_WO_SORT_COLS = [
  'work_order_number',
  'description',
  'category',
  'urgency',
  'status',
  'created_at',
] as const;

type FleetAssetWorkOrderSortCol = (typeof FLEET_ASSET_WO_SORT_COLS)[number];

function parseFleetAssetWorkOrderListSort(search: string): {
  sort: FleetAssetWorkOrderSortCol;
  dir: 'asc' | 'desc';
  q: string;
  qInput: string;
} {
  const p = new URLSearchParams(search);
  const raw = p.get('wo_sort');
  const sort: FleetAssetWorkOrderSortCol = FLEET_ASSET_WO_SORT_COLS.includes(raw as FleetAssetWorkOrderSortCol)
    ? (raw as FleetAssetWorkOrderSortCol)
    : 'created_at';
  const dr = p.get('wo_dir');
  const dir: 'asc' | 'desc' = dr === 'asc' || dr === 'desc' ? dr : 'desc';
  const qInput = (p.get('wo_q') ?? '').trim();
  const q = qInput.toLowerCase();
  return { sort, dir, q, qInput };
}

function compareFleetAssetWorkOrders(
  a: WorkOrder,
  b: WorkOrder,
  sort: FleetAssetWorkOrderSortCol,
  dir: 'asc' | 'desc'
): number {
  const m = dir === 'asc' ? 1 : -1;
  switch (sort) {
    case 'work_order_number':
      return (
        (a.work_order_number || '').localeCompare(b.work_order_number || '', undefined, { numeric: true }) * m
      );
    case 'description':
      return (a.description || '').localeCompare(b.description || '', undefined, { sensitivity: 'base' }) * m;
    case 'category':
      return (a.category || '').localeCompare(b.category || '') * m;
    case 'urgency':
      return (a.urgency || '').localeCompare(b.urgency || '') * m;
    case 'status':
      return (a.status || '').localeCompare(b.status || '') * m;
    case 'created_at': {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return (ta - tb) * m;
    }
    default:
      return 0;
  }
}

const FLEET_COMPLIANCE_SORT_COLS = [
  'record_type',
  'facility',
  'annual_inspection_date',
  'expiry_date',
  'notes',
] as const;

type FleetComplianceSortCol = (typeof FLEET_COMPLIANCE_SORT_COLS)[number];

function complianceDateValue(s: string | null | undefined): number | null {
  if (!s?.trim()) return null;
  const t = new Date(s.slice(0, 10)).getTime();
  return Number.isNaN(t) ? null : t;
}

function cmpComplianceNullableDate(
  a: number | null,
  b: number | null,
  m: number
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * m;
}

function parseFleetComplianceListSort(search: string): {
  sort: FleetComplianceSortCol;
  dir: 'asc' | 'desc';
  q: string;
  qInput: string;
} {
  const p = new URLSearchParams(search);
  const raw = p.get('comp_sort');
  const sort: FleetComplianceSortCol = FLEET_COMPLIANCE_SORT_COLS.includes(raw as FleetComplianceSortCol)
    ? (raw as FleetComplianceSortCol)
    : 'expiry_date';
  const dr = p.get('comp_dir');
  const dir: 'asc' | 'desc' = dr === 'asc' || dr === 'desc' ? dr : 'asc';
  const qInput = (p.get('comp_q') ?? '').trim();
  const q = qInput.toLowerCase();
  return { sort, dir, q, qInput };
}

function compareFleetComplianceRecords(
  a: FleetComplianceRecord,
  b: FleetComplianceRecord,
  sort: FleetComplianceSortCol,
  dir: 'asc' | 'desc'
): number {
  const m = dir === 'asc' ? 1 : -1;
  switch (sort) {
    case 'record_type':
      return (a.record_type || '').localeCompare(b.record_type || '') * m;
    case 'facility':
      return (a.facility || '').localeCompare(b.facility || '', undefined, { sensitivity: 'base' }) * m;
    case 'annual_inspection_date':
      return cmpComplianceNullableDate(
        complianceDateValue(a.annual_inspection_date),
        complianceDateValue(b.annual_inspection_date),
        m
      );
    case 'expiry_date':
      return cmpComplianceNullableDate(
        complianceDateValue(a.expiry_date),
        complianceDateValue(b.expiry_date),
        m
      );
    case 'notes':
      return (a.notes || '').localeCompare(b.notes || '', undefined, { sensitivity: 'base' }) * m;
    default:
      return 0;
  }
}

export default function FleetAssetDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'inspections' | 'work-orders' | 'logs' | 'compliance'>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(tab !== 'general');

  useEffect(() => {
    setIsHeroCollapsed(tab !== 'general');
  }, [tab]);
  const [showScheduleInspectionModal, setShowScheduleInspectionModal] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showHeroPhotoViewModal, setShowHeroPhotoViewModal] = useState(false);
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [editingComplianceId, setEditingComplianceId] = useState<string | null>(null);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssetAssignment | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);
  const [logDetailPerformedBy, setLogDetailPerformedBy] = useState<string | null>(null);
  const [historyAuditDetail, setHistoryAuditDetail] = useState<FleetHistoryAuditDetailPayload | null>(
    null,
  );
  const [generalEditSection, setGeneralEditSection] = useState<FleetAssetGeneralEditSection | null>(null);

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const permissionsReady = !!me && !meLoading;
  const canEditGeneral = canEditFleetAssetTab(isAdmin, permissions, 'general');
  const canEditInspections = canEditFleetAssetTab(isAdmin, permissions, 'inspections');
  const canEditWorkOrders = canEditFleetAssetTab(isAdmin, permissions, 'work_orders');
  const canEditCompliance = canEditFleetAssetTab(isAdmin, permissions, 'compliance');
  const canAssignWorkOrder = canAssignFleetWorkOrder(isAdmin, permissions);
  const canViewTab = (t: FleetAssetTab) => canViewFleetAssetTab(isAdmin, permissions, t);

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

  const inspListParams = useMemo(() => parseInspectionListSort(location.search), [location.search]);

  const sortedFilteredInspections = useMemo(() => {
    if (!Array.isArray(inspections)) return [];
    let rows = [...inspections];
    const { q, sort, dir } = inspListParams;
    if (q) {
      rows = rows.filter((i) => {
        const blob = [
          i.inspection_date,
          i.inspection_type,
          i.result,
          i.inspector_name ?? '',
          i.notes ?? '',
          i.odometer_reading != null ? String(i.odometer_reading) : '',
          i.hours_reading != null ? String(i.hours_reading) : '',
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => compareFleetAssetInspections(a, b, sort, dir));
    return rows;
  }, [inspections, inspListParams]);

  const setInspectionTableSort = useCallback(
    (column: InspectionListSortCol) => {
      const p = new URLSearchParams(location.search);
      const curCol = (p.get('insp_sort') as InspectionListSortCol) || 'inspection_date';
      const curDirRaw = p.get('insp_dir');
      const curDir: 'asc' | 'desc' =
        curDirRaw === 'asc' || curDirRaw === 'desc' ? curDirRaw : 'desc';
      const nextDir = curCol === column && curDir === 'asc' ? 'desc' : 'asc';
      p.set('tab', 'inspections');
      p.set('insp_sort', column);
      p.set('insp_dir', nextDir);
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

  const setInspectionSearchQuery = useCallback(
    (value: string) => {
      const p = new URLSearchParams(location.search);
      p.set('tab', 'inspections');
      if (value.trim()) p.set('insp_q', value);
      else p.delete('insp_q');
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

  const { data: workOrders, isLoading: workOrdersLoading } = useQuery({
    queryKey: ['fleetAssetWorkOrders', id],
    queryFn: () => api<WorkOrder[]>('GET', `/fleet/assets/${id}/work-orders`),
    enabled: isValidId,
  });

  const woListParams = useMemo(() => parseFleetAssetWorkOrderListSort(location.search), [location.search]);

  const sortedFilteredWorkOrders = useMemo(() => {
    if (!Array.isArray(workOrders)) return [];
    let rows = [...workOrders];
    const { q, sort, dir } = woListParams;
    if (q) {
      rows = rows.filter((wo) => {
        const blob = [
          wo.work_order_number,
          wo.description ?? '',
          wo.category,
          wo.urgency,
          wo.status,
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => compareFleetAssetWorkOrders(a, b, sort, dir));
    return rows;
  }, [workOrders, woListParams]);

  const setWorkOrderTableSort = useCallback(
    (column: FleetAssetWorkOrderSortCol) => {
      const p = new URLSearchParams(location.search);
      const curCol = (p.get('wo_sort') as FleetAssetWorkOrderSortCol) || 'created_at';
      const curDirRaw = p.get('wo_dir');
      const curDir: 'asc' | 'desc' =
        curDirRaw === 'asc' || curDirRaw === 'desc' ? curDirRaw : 'desc';
      const nextDir = curCol === column && curDir === 'asc' ? 'desc' : 'asc';
      p.set('tab', 'work-orders');
      p.set('wo_sort', column);
      p.set('wo_dir', nextDir);
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

  const setWorkOrderSearchQuery = useCallback(
    (value: string) => {
      const p = new URLSearchParams(location.search);
      p.set('tab', 'work-orders');
      if (value.trim()) p.set('wo_q', value);
      else p.delete('wo_q');
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

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

  const { data: complianceRecords = [], isLoading: complianceLoading } = useQuery({
    queryKey: ['fleetAssetCompliance', id],
    queryFn: () => api<FleetComplianceRecord[]>('GET', `/fleet/assets/${id}/compliance`),
    enabled: isValidId,
  });

  const compListParams = useMemo(() => parseFleetComplianceListSort(location.search), [location.search]);

  const sortedFilteredComplianceRecords = useMemo(() => {
    if (!Array.isArray(complianceRecords)) return [];
    let rows = [...complianceRecords];
    const { q, sort, dir } = compListParams;
    if (q) {
      rows = rows.filter((rec) => {
        const blob = [
          rec.record_type,
          rec.facility ?? '',
          rec.completed_by ?? '',
          rec.equipment_classification ?? '',
          rec.equipment_make_model ?? '',
          rec.serial_number ?? '',
          rec.annual_inspection_date ?? '',
          rec.expiry_date ?? '',
          rec.file_reference_number ?? '',
          rec.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => compareFleetComplianceRecords(a, b, sort, dir));
    return rows;
  }, [complianceRecords, compListParams]);

  const setComplianceTableSort = useCallback(
    (column: FleetComplianceSortCol) => {
      const p = new URLSearchParams(location.search);
      const curCol = (p.get('comp_sort') as FleetComplianceSortCol) || 'expiry_date';
      const curDirRaw = p.get('comp_dir');
      const curDir: 'asc' | 'desc' =
        curDirRaw === 'asc' || curDirRaw === 'desc' ? curDirRaw : 'asc';
      const nextDir = curCol === column && curDir === 'asc' ? 'desc' : 'asc';
      p.set('tab', 'compliance');
      p.set('comp_sort', column);
      p.set('comp_dir', nextDir);
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

  const setComplianceSearchQuery = useCallback(
    (value: string) => {
      const p = new URLSearchParams(location.search);
      p.set('tab', 'compliance');
      if (value.trim()) p.set('comp_q', value);
      else p.delete('comp_q');
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav]
  );

  const handleDeleteComplianceRecord = useCallback(
    async (rec: FleetAssetComplianceRow) => {
      const facility = rec.facility?.trim();
      const detail =
        facility && facility.length > 0 ? `${rec.record_type} \u00b7 ${facility}` : rec.record_type;
      const result = await confirm({
        title: 'Delete compliance record',
        message: `Are you sure you want to delete this compliance record?\n\n${detail}\n\nThis action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
      });
      if (result !== 'confirm') return;
      try {
        await api('DELETE', `/fleet/compliance/${rec.id}`);
        queryClient.invalidateQueries({ queryKey: ['fleetAssetCompliance', id] });
        queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
        toast.success('Record deleted');
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [confirm, id, queryClient],
  );

  const openAssignment = useMemo(() => assignments.find((a) => !a.returned_at), [assignments]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
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
    const map: Record<string, { daysLeft: number | null; expiryDate: string; label: string; variant: ReturnType<typeof getFleetDueStatusBadgeVariant> }> = {};
    const types = ['CVIP', 'NDT', 'CRANE', 'PROPANE'];
    for (const t of types) {
      const rec = Array.isArray(complianceRecords) ? complianceRecords.find((r) => r.record_type === t) : null;
      if (!rec?.expiry_date) continue;
      const exp = new Date(rec.expiry_date);
      const now = new Date();
      const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      let label = 'Valid';
      if (daysLeft < 0) {
        label = 'Expired';
      } else if (daysLeft <= 30) {
        label = 'Due Soon';
      }
      map[t] = {
        daysLeft,
        expiryDate: rec.expiry_date.slice(0, 10),
        label,
        variant: getFleetDueStatusBadgeVariant(label),
      };
    }
    return map;
  }, [complianceRecords]);

  // Odometer next-service status (vehicle)
  const odometerStatus = useMemo(() => {
    if (asset?.asset_type !== 'vehicle' || asset?.odometer_next_due_at == null) return null;
    const current = asset.odometer_current ?? 0;
    const nextDue = asset.odometer_next_due_at;
    if (current >= nextDue) return { label: 'Overdue', variant: getFleetDueStatusBadgeVariant('Overdue') };
    const kmLeft = nextDue - current;
    if (kmLeft <= 5000) return { label: 'Due Soon', variant: getFleetDueStatusBadgeVariant('Due Soon') };
    return { label: 'Valid', variant: getFleetDueStatusBadgeVariant('Valid') };
  }, [asset]);

  // Hours next-service status (machinery/other)
  const hoursStatus = useMemo(() => {
    if (!asset || (asset.asset_type !== 'heavy_machinery' && asset.asset_type !== 'other') || asset.hours_next_due_at == null) return null;
    const current = asset.hours_current ?? 0;
    const nextDue = asset.hours_next_due_at;
    if (current >= nextDue) return { label: 'Overdue', variant: getFleetDueStatusBadgeVariant('Overdue') };
    const hoursLeft = nextDue - current;
    if (hoursLeft <= 50) return { label: 'Due Soon', variant: getFleetDueStatusBadgeVariant('Due Soon') };
    return { label: 'Valid', variant: getFleetDueStatusBadgeVariant('Valid') };
  }, [asset]);

  // Propane sticker status (date-based)
  const propaneStatus = useMemo(() => {
    if (!asset?.propane_sticker_date) return null;
    const exp = new Date(asset.propane_sticker_date);
    const now = new Date();
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'Expired', variant: getFleetDueStatusBadgeVariant('Expired') };
    if (daysLeft <= 30) return { label: 'Due Soon', variant: getFleetDueStatusBadgeVariant('Due Soon') };
    return { label: 'Valid', variant: getFleetDueStatusBadgeVariant('Valid') };
  }, [asset?.propane_sticker_date]);

  const fleetTabItems = useMemo(
    () => {
      if (!permissionsReady) return [];
      return (
        [
          { key: 'general', label: 'General', permTab: 'general' as const },
          { key: 'inspections', label: 'Inspections', permTab: 'inspections' as const },
          { key: 'work-orders', label: 'Work Orders', permTab: 'work_orders' as const },
          { key: 'compliance', label: 'Compliance', permTab: 'compliance' as const },
          { key: 'logs', label: 'History', permTab: 'history' as const },
        ] as const
      ).filter((t) => canViewFleetAssetTab(isAdmin, permissions, t.permTab));
    },
    [permissionsReady, isAdmin, permissions],
  );

  useEffect(() => {
    if (!permissionsReady || !fleetTabItems.length) return;
    if (!fleetTabItems.some((t) => t.key === tab)) {
      const next = fleetTabItems[0].key;
      setTab(next);
      if (id) nav(`/fleet/assets/${id}?tab=${next}`, { replace: true });
    }
  }, [permissionsReady, fleetTabItems, tab, id, nav]);

  const pageHeaderToday = (
    <div className="text-right">
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Today</div>
      <div className="mt-0.5 text-xs font-semibold text-gray-700">{todayLabel}</div>
    </div>
  );

  if (!isValidId) {
    return <div className="p-4">Invalid asset ID</div>;
  }

  if (isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Fleet & Equipment"
          subtitle="Executive overview"
          icon={<Truck className="h-4 w-4" />}
          onBack={() => nav(-1)}
          backLabel="Back"
          actions={pageHeaderToday}
        />
        <FleetAssetHeroSkeleton />
      </div>
    );
  }

  if (!asset) {
    return <div className="p-4">Asset not found</div>;
  }

  const { primaryTitle: heroPrimaryTitle, subtitleLine: heroSubtitleLine } = buildFleetAssetHeroHeading(asset);
  const lockedScheduleVehicleLabel =
    [asset.name, asset.unit_number ? `Unit #${asset.unit_number}` : null].filter(Boolean).join(' \u00b7 ') ||
    heroPrimaryTitle;
  const isAssigned = !!openAssignment;
  const heroPhotoThumbUrl = asset.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(asset.photos[0])}/thumbnail?w=400`)
    : null;
  const heroPhotoLargeUrl = asset.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(asset.photos[0])}/thumbnail?w=1200`)
    : null;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fleet & Equipment"
        subtitle="Executive overview"
        icon={<Truck className="h-4 w-4" />}
        onBack={() => nav(-1)}
        backLabel="Back"
        actions={pageHeaderToday}
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <FleetAssetHero
          primaryTitle={heroPrimaryTitle}
          subtitleLine={heroSubtitleLine}
          asset={asset}
          isAssigned={isAssigned}
          photoUrl={heroPhotoThumbUrl}
          photoBusy={heroPhotoBusy}
          photoInputRef={assetHeroPhotoInputRef}
          canEdit={canEditGeneral}
          isCollapsed={isHeroCollapsed}
          onToggleCollapsed={() => setIsHeroCollapsed((v) => !v)}
          onPhotoClick={() => setShowHeroPhotoViewModal(true)}
          onPhotoFileChange={onHeroPhotoFileChange}
          onAssign={() => setShowAssignModal(true)}
          onReturn={() => setShowReturnModal(true)}
        />

        <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>
          <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : '!py-3'}>
            {!permissionsReady ? (
              <div className="h-8 animate-pulse rounded bg-gray-100" />
            ) : fleetTabItems.length > 0 ? (
              <AppTabs
                tabs={fleetTabItems.map((t) => ({ key: t.key, label: t.label }))}
                value={tab}
                onChange={(next) => {
                  setTab(next as typeof tab);
                  nav(`/fleet/assets/${id}?tab=${next}`, { replace: true });
                }}
              />
            ) : (
              <p className={uiCx(uiTypography.helper, 'px-1')}>
                No asset tabs are available for your permissions.
              </p>
            )}
          </AppCard>
        </div>
      </div>

      <AppCard bodyClassName="min-w-0 overflow-hidden">
        {permissionsReady && fleetTabItems.length === 0 ? (
          <AppEmptyState
            title="No tabs available"
            description="Ask an admin to grant View on General, Inspections, Work Orders, Compliance, or History for fleet assets."
            className="border-0 bg-transparent py-10 shadow-none"
          />
        ) : null}
        {tab === 'general' && canViewTab('general') && (
          <FleetAssetGeneralTab
            asset={asset}
            openAssignment={openAssignment}
            employeeName={
              openAssignment
                ? (employees.find((e: any) => e.id === openAssignment.assigned_to_user_id) as any)?.name
                : undefined
            }
            complianceStatusByType={complianceStatusByType}
            propaneStatus={propaneStatus}
            odometerStatus={odometerStatus}
            hoursStatus={hoursStatus}
            canEdit={canEditGeneral}
            onEditSection={setGeneralEditSection}
            onViewCompliance={() => {
              setTab('compliance');
              nav(`/fleet/assets/${id}?tab=compliance`, { replace: true });
            }}
          />
        )}

        {tab === 'inspections' && canViewTab('inspections') && (
          <FleetAssetInspectionsTab
            isLoading={inspectionsLoading}
            inspections={inspections}
            rows={sortedFilteredInspections}
            sortBy={inspListParams.sort}
            sortDir={inspListParams.dir}
            searchInput={inspListParams.qInput}
            onSearchChange={setInspectionSearchQuery}
            onSort={setInspectionTableSort}
            canEdit={canEditInspections}
            onScheduleClick={() => setShowScheduleInspectionModal(true)}
            onOpenInspection={(inspection: FleetAssetInspectionRow) => {
              const sched = inspection.inspection_schedule_id;
              const t = (inspection.inspection_type || 'mechanical').toLowerCase();
              const focus = t === 'body' ? 'body' : 'mechanical';
              if (sched) {
                nav(`/fleet/inspections/${sched}?focus=${focus}`);
              } else {
                nav(`/fleet/inspections/${inspection.id}`);
              }
            }}
          />
        )}

        {tab === 'work-orders' && canViewTab('work_orders') && (
          <FleetAssetWorkOrdersTab
            isLoading={workOrdersLoading}
            workOrders={workOrders as FleetAssetWorkOrderRow[] | undefined}
            rows={sortedFilteredWorkOrders as FleetAssetWorkOrderRow[]}
            sortBy={woListParams.sort}
            sortDir={woListParams.dir}
            searchInput={woListParams.qInput}
            onSearchChange={setWorkOrderSearchQuery}
            onSort={setWorkOrderTableSort}
            canEdit={canEditWorkOrders}
            onCreateClick={() => setShowWorkOrderForm(true)}
            onOpenWorkOrder={(workOrderId) => nav(`/fleet/work-orders/${workOrderId}`)}
          />
        )}

        {tab === 'logs' && canViewTab('history') && (
          <FleetAssetLogsTab
            historyItems={historyItems}
            assignments={assignments}
            onOpenAssignmentDetail={(assignment, logType, performedBy) => {
              setLogDetailAssignment(assignment as AssetAssignment);
              setLogDetailLogType(logType);
              setLogDetailPerformedBy(performedBy);
            }}
            onOpenAuditDetail={setHistoryAuditDetail}
          />
        )}

        {tab === 'compliance' && canViewTab('compliance') && (
          <FleetAssetComplianceTab
            isLoading={complianceLoading}
            complianceRecords={complianceRecords as FleetComplianceRecord[] | undefined}
            rows={sortedFilteredComplianceRecords as FleetAssetComplianceRow[]}
            sortBy={compListParams.sort}
            sortDir={compListParams.dir}
            searchInput={compListParams.qInput}
            onSearchChange={setComplianceSearchQuery}
            onSort={setComplianceTableSort}
            canEdit={canEditCompliance}
            onCreateClick={() => {
              setEditingComplianceId(null);
              setShowComplianceModal(true);
            }}
            onEditRecord={(recordId) => {
              setEditingComplianceId(recordId);
              setShowComplianceModal(true);
            }}
            onDeleteRecord={handleDeleteComplianceRecord}
          />
        )}
      </AppCard>

      <ScheduleFleetInspectionModal
        open={canEditInspections && showScheduleInspectionModal && !!id}
        assetId={id ?? ''}
        lockedVehicleDisplayName={lockedScheduleVehicleLabel}
        onClose={() => setShowScheduleInspectionModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
        }}
      />
      <NewFleetWorkOrderModal
        open={canEditWorkOrders && showWorkOrderForm && !!id}
        assetId={id ?? ''}
        assetDisplayName={lockedScheduleVehicleLabel}
        employees={employees}
        canAssign={canAssignWorkOrder}
        onClose={() => setShowWorkOrderForm(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['fleetAssetWorkOrders', id] });
          queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
        }}
      />
      {showHeroPhotoViewModal && heroPhotoLargeUrl && (
        <AppModal
          open
          onClose={() => setShowHeroPhotoViewModal(false)}
          title="Asset photo"
          size="lg"
          bodyClassName="flex items-center justify-center bg-gray-50 p-4"
          footer={
            <div className={uiCx(uiLayout.actionsRow, 'w-full justify-between')}>
              {canEditGeneral ? (
                <AppButton variant="danger" onClick={() => void removeHeroPhoto()} disabled={heroPhotoBusy}>
                  Remove
                </AppButton>
              ) : (
                <span />
              )}
              <div className={uiCx(uiLayout.actionsRow, 'justify-end')}>
                <AppButton variant="secondary" onClick={() => setShowHeroPhotoViewModal(false)}>
                  Close
                </AppButton>
                {canEditGeneral ? (
                  <AppButton onClick={() => assetHeroPhotoInputRef.current?.click()} disabled={heroPhotoBusy}>
                    Replace image
                  </AppButton>
                ) : null}
              </div>
            </div>
          }
        >
          <img
            src={heroPhotoLargeUrl}
            alt={asset.name || 'Asset'}
            className="max-h-[min(65vh,560px)] w-full max-w-full rounded-lg object-contain shadow-sm"
          />
        </AppModal>
      )}
      {/* Assign Modal */}
      <FleetAssignModal
        open={canEditGeneral && showAssignModal}
        asset={asset}
        assetDisplayName={lockedScheduleVehicleLabel}
        employees={employees}
        onClose={() => setShowAssignModal(false)}
        onSubmit={(data) => assignMutation.mutate(data)}
        isSubmitting={assignMutation.isPending}
      />
      {openAssignment ? (
        <FleetReturnModal
          open={canEditGeneral && showReturnModal}
          openAssignment={openAssignment}
          asset={asset}
          assetDisplayName={lockedScheduleVehicleLabel}
          onClose={() => setShowReturnModal(false)}
          onSubmit={(data) => returnMutation.mutate(data)}
          isSubmitting={returnMutation.isPending}
        />
      ) : null}
      {/* Assignment/Return log detail modal */}
      {logDetailAssignment && logDetailLogType && (
        <FleetAssignmentLogDetailModal
          open
          assignment={logDetailAssignment}
          logType={logDetailLogType}
          performedBy={logDetailPerformedBy}
          onClose={() => {
            setLogDetailAssignment(null);
            setLogDetailLogType(null);
            setLogDetailPerformedBy(null);
          }}
        />
      )}
      {historyAuditDetail !== null && (
        <FleetHistoryAuditChangeModal
          open
          detail={historyAuditDetail}
          onClose={() => setHistoryAuditDetail(null)}
        />
      )}
      <EditFleetAssetGeneralModal
        open={canEditGeneral && generalEditSection !== null}
        section={generalEditSection}
        onClose={() => setGeneralEditSection(null)}
        asset={asset ?? undefined}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['fleetAsset', id] });
          queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
        }}
      />
      <FleetComplianceModal
        open={canEditCompliance && showComplianceModal && !!id}
        assetId={id ?? ''}
        recordId={editingComplianceId}
        initialRecord={
          editingComplianceId
            ? complianceRecords.find((r) => r.id === editingComplianceId)
            : undefined
        }
        onClose={() => {
          setShowComplianceModal(false);
          setEditingComplianceId(null);
        }}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['fleetAssetCompliance', id] });
          queryClient.invalidateQueries({ queryKey: ['fleetAssetHistory', id] });
          setEditingComplianceId(null);
        }}
      />
    </div>
  );
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

async function uploadFleetAssetHeroImage(file: File): Promise<string> {
  return uploadFleetImageToCategory(file, 'fleet-assignment-photos');
}
