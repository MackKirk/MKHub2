import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { isLikelyImageFile } from '@/utils/imageUploadHelpers';
import FleetAssignmentLogDetailModal from '@/components/fleet/FleetAssignmentLogDetailModal';
import FleetHistoryAuditChangeModal, {
  type FleetHistoryAuditDetailPayload,
} from '@/components/fleet/FleetHistoryAuditChangeModal';
import { FleetAssetLogsTab, type FleetAssetHistoryItem } from '@/components/fleet/FleetAssetLogsTab';
import {
  FleetAssetWorkOrdersTab,
  type FleetAssetWorkOrderRow,
} from '@/components/fleet/FleetAssetWorkOrdersTab';
import {
  buildEquipmentHeroHeading,
  EquipmentHero,
  EquipmentHeroSkeleton,
} from '@/components/companyAssets/EquipmentHero';
import EditEquipmentGeneralModal, {
  type EquipmentGeneralEditSection,
} from '@/components/companyAssets/EditEquipmentGeneralModal';
import { EquipmentGeneralTab } from '@/components/companyAssets/EquipmentGeneralTab';
import EquipmentAssignModal from '@/components/companyAssets/EquipmentAssignModal';
import EquipmentReturnModal from '@/components/companyAssets/EquipmentReturnModal';
import NewEquipmentWorkOrderModal from '@/components/companyAssets/NewEquipmentWorkOrderModal';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  canEditEquipmentTab,
  canViewEquipmentTab,
  type EquipmentTab,
} from '@/lib/companyAssetsPermissions';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppModal,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { Wrench } from 'lucide-react';

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

const EQUIPMENT_WO_SORT_COLS = [
  'work_order_number',
  'description',
  'category',
  'urgency',
  'status',
  'created_at',
] as const;

type EquipmentWorkOrderSortCol = (typeof EQUIPMENT_WO_SORT_COLS)[number];

function parseEquipmentWorkOrderListSort(search: string): {
  sort: EquipmentWorkOrderSortCol;
  dir: 'asc' | 'desc';
  q: string;
  qInput: string;
} {
  const p = new URLSearchParams(search);
  const raw = p.get('wo_sort');
  const sort: EquipmentWorkOrderSortCol = EQUIPMENT_WO_SORT_COLS.includes(raw as EquipmentWorkOrderSortCol)
    ? (raw as EquipmentWorkOrderSortCol)
    : 'created_at';
  const dr = p.get('wo_dir');
  const dir: 'asc' | 'desc' = dr === 'asc' || dr === 'desc' ? dr : 'desc';
  const qInput = (p.get('wo_q') ?? '').trim();
  const q = qInput.toLowerCase();
  return { sort, dir, q, qInput };
}

function compareEquipmentWorkOrders(
  a: WorkOrder,
  b: WorkOrder,
  sort: EquipmentWorkOrderSortCol,
  dir: 'asc' | 'desc',
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

export default function EquipmentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'work-orders' | 'logs' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'work-orders' | 'logs'>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(tab !== 'general');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showWorkOrderForm, setShowWorkOrderForm] = useState(false);
  const [showHeroPhotoViewModal, setShowHeroPhotoViewModal] = useState(false);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssetAssignment | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);
  const [logDetailPerformedBy, setLogDetailPerformedBy] = useState<string | null>(null);
  const [historyAuditDetail, setHistoryAuditDetail] = useState<FleetHistoryAuditDetailPayload | null>(null);
  const [generalEditSection, setGeneralEditSection] = useState<EquipmentGeneralEditSection | null>(null);
  const equipmentHeroPhotoInputRef = useRef<HTMLInputElement>(null);
  const [heroPhotoBusy, setHeroPhotoBusy] = useState(false);

  useEffect(() => {
    setIsHeroCollapsed(tab !== 'general');
  }, [tab]);

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

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const permissionsReady = !!me && !meLoading;
  const canEditGeneral = canEditEquipmentTab(isAdministrator, permissions, 'general');
  const canEditWorkOrders = canEditEquipmentTab(isAdministrator, permissions, 'work_orders');
  const canViewGeneral = canViewEquipmentTab(isAdministrator, permissions, 'general');
  const canViewWorkOrders = canViewEquipmentTab(isAdministrator, permissions, 'work_orders');
  const canViewHistory = canViewEquipmentTab(isAdministrator, permissions, 'history');

  const { data: workOrders, isLoading: workOrdersLoading } = useQuery({
    queryKey: ['equipmentWorkOrders', id],
    queryFn: () => api<WorkOrder[]>('GET', `/fleet/equipment/${id}/work-orders`),
    enabled: !!isValidId && canViewWorkOrders,
  });

  const woListParams = useMemo(() => parseEquipmentWorkOrderListSort(location.search), [location.search]);

  const sortedFilteredWorkOrders = useMemo(() => {
    if (!Array.isArray(workOrders)) return [];
    let rows = [...workOrders];
    const { q, sort, dir } = woListParams;
    if (q) {
      rows = rows.filter((wo) => {
        const blob = [wo.work_order_number, wo.description ?? '', wo.category, wo.urgency, wo.status]
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    rows.sort((a, b) => compareEquipmentWorkOrders(a, b, sort, dir));
    return rows;
  }, [workOrders, woListParams]);

  const setWorkOrderTableSort = useCallback(
    (column: EquipmentWorkOrderSortCol) => {
      const p = new URLSearchParams(location.search);
      const curCol = (p.get('wo_sort') as EquipmentWorkOrderSortCol) || 'created_at';
      const curDirRaw = p.get('wo_dir');
      const curDir: 'asc' | 'desc' = curDirRaw === 'asc' || curDirRaw === 'desc' ? curDirRaw : 'desc';
      const nextDir = curCol === column && curDir === 'asc' ? 'desc' : 'asc';
      p.set('tab', 'work-orders');
      p.set('wo_sort', column);
      p.set('wo_dir', nextDir);
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav],
  );

  const setWorkOrderSearchQuery = useCallback(
    (value: string) => {
      const p = new URLSearchParams(location.search);
      p.set('tab', 'work-orders');
      if (value.trim()) p.set('wo_q', value);
      else p.delete('wo_q');
      nav({ pathname: location.pathname, search: p.toString() }, { replace: true });
    },
    [location.pathname, location.search, nav],
  );

  const { data: historyResponse } = useQuery({
    queryKey: ['equipmentHistory', id],
    queryFn: () => api<{ items: FleetAssetHistoryItem[] }>('GET', `/fleet/equipment/${id}/history`),
    enabled: !!isValidId && canViewHistory,
  });
  const historyItems = historyResponse?.items ?? [];

  const { data: assignments = [] } = useQuery({
    queryKey: ['equipmentAssignments', id],
    queryFn: () => api<AssetAssignment[]>('GET', `/fleet/equipment/${id}/assignments`),
    enabled: !!isValidId && (canViewGeneral || canViewHistory),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api<any[]>('GET', '/employees'),
  });

  const openAssignment = useMemo(() => assignments.find((a) => !a.returned_at), [assignments]);

  const assignMutation = useMutation({
    mutationFn: async (data: any) => api('POST', `/fleet/equipment/${id}/assign`, data),
    onSuccess: () => {
      toast.success('Assigned successfully');
      setShowAssignModal(false);
      queryClient.invalidateQueries({ queryKey: ['equipmentAssignments', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment', id] });
      queryClient.invalidateQueries({ queryKey: ['equipmentHistory', id] });
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
      queryClient.invalidateQueries({ queryKey: ['equipmentHistory', id] });
    },
    onError: (error: any) => toast.error(error?.message || 'Failed to return'),
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

  const persistEquipmentPhotos = useCallback(
    async (photos: string[] | null) => {
      await api<Equipment>('PUT', `/fleet/equipment/${id}`, {
        photos: photos && photos.length > 0 ? photos : null,
      });
      queryClient.invalidateQueries({ queryKey: ['equipment', id] });
    },
    [id, queryClient],
  );

  const onHeroPhotoFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id || !equipment) return;
    if (!isLikelyImageFile(file)) {
      toast.error('Please choose an image file.');
      return;
    }
    setHeroPhotoBusy(true);
    try {
      const newId = await uploadEquipmentHeroImage(file);
      const rest = (equipment.photos || []).slice(1);
      await persistEquipmentPhotos([newId, ...rest]);
      toast.success('Photo updated');
      setShowHeroPhotoViewModal(false);
    } catch {
      toast.error('Failed to upload photo');
    } finally {
      setHeroPhotoBusy(false);
    }
  };

  const removeHeroPhoto = async () => {
    if (!equipment?.photos?.length) return;
    setHeroPhotoBusy(true);
    try {
      const next = equipment.photos.slice(1);
      await persistEquipmentPhotos(next.length > 0 ? next : null);
      toast.success('Photo removed');
      setShowHeroPhotoViewModal(false);
    } catch {
      toast.error('Failed to remove photo');
    } finally {
      setHeroPhotoBusy(false);
    }
  };

  const equipmentTabItems = useMemo(() => {
    if (!permissionsReady) return [];
    return (
      [
        { key: 'general' as const, label: 'General', permTab: 'general' as EquipmentTab },
        { key: 'work-orders' as const, label: 'Work Orders', permTab: 'work_orders' as EquipmentTab },
        { key: 'logs' as const, label: 'History', permTab: 'history' as EquipmentTab },
      ] as const
    ).filter((t) => canViewEquipmentTab(isAdministrator, permissions, t.permTab));
  }, [permissionsReady, isAdministrator, permissions]);

  useEffect(() => {
    if (!permissionsReady || !equipmentTabItems.length) return;
    if (!equipmentTabItems.some((t) => t.key === tab)) {
      const next = equipmentTabItems[0].key;
      setTab(next);
      if (id) nav(`/company-assets/equipment/${id}?tab=${next}`, { replace: true });
    }
  }, [permissionsReady, equipmentTabItems, tab, id, nav]);

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const pageHeaderToday = (
    <div className="text-right">
      <div className={uiTypography.overline}>Today</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
    </div>
  );

  const headerAdminActions = isAdministrator ? (
    <AppButton
      type="button"
      variant="danger"
      size="sm"
      disabled={purgingEquipment || purgeEquipmentMutation.isPending}
      loading={purgingEquipment || purgeEquipmentMutation.isPending}
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
    >
      Delete
    </AppButton>
  ) : null;

  const pageHeaderActions = (
    <div className="flex items-center gap-3">
      {headerAdminActions}
      {pageHeaderToday}
    </div>
  );

  if (!isValidId) {
    return <div className="p-4">Invalid equipment ID</div>;
  }

  if (isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Company Assets"
          subtitle="Tools and equipment"
          icon={<Wrench className="h-4 w-4" />}
          onBack={() => nav('/company-assets/equipment')}
          backLabel="Equipment"
          actions={pageHeaderToday}
        />
        <EquipmentHeroSkeleton />
      </div>
    );
  }

  if (!equipment) {
    return <div className="p-4">Equipment not found</div>;
  }

  const { primaryTitle: heroPrimaryTitle, subtitleLine: heroSubtitleLine } = buildEquipmentHeroHeading(equipment);
  const isAssigned = !!openAssignment;
  const heroPhotoThumbUrl = equipment.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(equipment.photos[0])}/thumbnail?w=400`)
    : null;
  const heroPhotoLargeUrl = equipment.photos?.[0]
    ? withFileAccessToken(`/files/${encodeURIComponent(equipment.photos[0])}/thumbnail?w=1200`)
    : null;
  const employeeName = openAssignment
    ? (employees.find((e: any) => e.id === openAssignment.assigned_to_user_id) as any)?.name
    : undefined;
  const lockedEquipmentDisplayName =
    [equipment.name, equipment.unit_number ? `Unit #${equipment.unit_number}` : null].filter(Boolean).join(' \u00b7 ') ||
    heroPrimaryTitle;

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Company Assets"
        subtitle="Tools and equipment"
        icon={<Wrench className="h-4 w-4" />}
        onBack={() => nav('/company-assets/equipment')}
        backLabel="Equipment"
        actions={pageHeaderActions}
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <EquipmentHero
          primaryTitle={heroPrimaryTitle}
          subtitleLine={heroSubtitleLine}
          equipment={equipment}
          isAssigned={isAssigned}
          photoUrl={heroPhotoThumbUrl}
          photoBusy={heroPhotoBusy}
          photoInputRef={equipmentHeroPhotoInputRef}
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
            <AppTabs
              tabs={equipmentTabItems.map((t) => ({ key: t.key, label: t.label }))}
              value={tab}
              onChange={(next) => {
                setTab(next as typeof tab);
                nav(`/company-assets/equipment/${id}?tab=${next}`, { replace: true });
              }}
            />
          </AppCard>
        </div>
      </div>

      {!permissionsReady ? null : equipmentTabItems.length === 0 ? (
        <AppCard>
          <AppEmptyState
            title="No tab access"
            description="You can open this equipment record, but no tabs are enabled for your role."
          />
        </AppCard>
      ) : (
      <AppCard bodyClassName="min-w-0 overflow-hidden">
        {tab === 'general' && canViewGeneral && (
          <EquipmentGeneralTab
            equipment={equipment}
            openAssignment={openAssignment}
            employeeName={employeeName}
            canEdit={canEditGeneral}
            onEditSection={setGeneralEditSection}
          />
        )}

        {tab === 'work-orders' && canViewWorkOrders && (
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

        {tab === 'logs' && canViewHistory && (
          <FleetAssetLogsTab
            historyItems={historyItems}
            assignments={assignments}
            onOpenAssignmentDetail={(assignment, logType, performedBy) => {
              setLogDetailAssignment(assignment);
              setLogDetailLogType(logType);
              setLogDetailPerformedBy(performedBy);
            }}
            onOpenAuditDetail={setHistoryAuditDetail}
          />
        )}
      </AppCard>
      )}

      {showHeroPhotoViewModal && heroPhotoLargeUrl && (
        <AppModal
          open
          onClose={() => setShowHeroPhotoViewModal(false)}
          title="Equipment photo"
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
                  <AppButton onClick={() => equipmentHeroPhotoInputRef.current?.click()} disabled={heroPhotoBusy}>
                    Replace image
                  </AppButton>
                ) : null}
              </div>
            </div>
          }
        >
          <img
            src={heroPhotoLargeUrl}
            alt={equipment.name || 'Equipment'}
            className="max-h-[min(65vh,560px)] w-full max-w-full rounded-lg object-contain shadow-sm"
          />
        </AppModal>
      )}

      <EquipmentAssignModal
        open={canEditGeneral && showAssignModal}
        equipmentDisplayName={lockedEquipmentDisplayName}
        employees={employees}
        onClose={() => setShowAssignModal(false)}
        onSubmit={(data) => assignMutation.mutate(data)}
        isSubmitting={assignMutation.isPending}
      />
      {openAssignment ? (
        <EquipmentReturnModal
          open={canEditGeneral && showReturnModal}
          equipmentDisplayName={lockedEquipmentDisplayName}
          onClose={() => setShowReturnModal(false)}
          onSubmit={(data) => returnMutation.mutate(data)}
          isSubmitting={returnMutation.isPending}
        />
      ) : null}
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
      <NewEquipmentWorkOrderModal
        open={canEditWorkOrders && showWorkOrderForm && !!id}
        equipmentId={id ?? ''}
        equipmentDisplayName={lockedEquipmentDisplayName}
        employees={employees}
        onClose={() => setShowWorkOrderForm(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['equipmentWorkOrders', id] });
          queryClient.invalidateQueries({ queryKey: ['equipmentHistory', id] });
        }}
      />
      <EditEquipmentGeneralModal
        open={canEditGeneral && generalEditSection !== null}
        section={generalEditSection}
        onClose={() => setGeneralEditSection(null)}
        equipment={equipment}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['equipment', id] });
          queryClient.invalidateQueries({ queryKey: ['equipmentHistory', id] });
        }}
      />
    </div>
  );
}

async function uploadEquipmentImageToCategory(file: File, category_id: string): Promise<string> {
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

async function uploadEquipmentHeroImage(file: File): Promise<string> {
  return uploadEquipmentImageToCategory(file, 'fleet-assignment-photos');
}
