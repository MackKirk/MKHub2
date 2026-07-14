import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withFileAccessToken } from '@/lib/api';
import toast from 'react-hot-toast';
import { WORK_ORDER_STATUS_LABELS } from '@/lib/fleetBadges';
import { buildWorkOrderHeroHeading, WorkOrderHero, WorkOrderHeroSkeleton } from '@/components/fleet/WorkOrderHero';
import { WorkOrderDetailModals } from '@/components/fleet/WorkOrderDetailModals';
import { WorkOrderGeneralTab } from '@/components/fleet/WorkOrderGeneralTab';
import { WorkOrderCostsTab } from '@/components/fleet/WorkOrderCostsTab';
import { WorkOrderFilesTab } from '@/components/fleet/WorkOrderFilesTab';
import { WorkOrderActivityTab } from '@/components/fleet/WorkOrderActivityTab';
import type { CostItem } from '@/components/fleet/WorkOrderCostModal';
import { useConfirm } from '@/components/ConfirmProvider';
import {
  canEditFleetWorkOrderTab,
  canViewFleetWorkOrderTab,
  type FleetWorkOrderTab,
} from '@/lib/fleetPermissions';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppTabs,
  AppPageHeader,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { ClipboardList } from 'lucide-react';

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
  estimated_duration_minutes?: number | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  body_repair_required?: boolean;
  new_stickers_applied?: boolean;
  quote_file_ids?: string[] | null;
  odometer_reading?: number | null;
  hours_reading?: number | null;
};

const MANUAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['not_approved', 'cancelled'],
  in_progress: ['pending_parts', 'cancelled'],
  pending_parts: ['in_progress', 'cancelled'],
};

type WoHeroFleetAsset = { make?: string | null; model?: string | null; name?: string | null; unit_number?: string | null };
type WoHeroEquipment = { brand?: string | null; model?: string | null; name?: string | null; unit_number?: string | null };

function buildWoHeroAssetOneLine(
  entityType: string,
  fleet: WoHeroFleetAsset | undefined,
  equipment: WoHeroEquipment | undefined,
): string {
  const unitPart = (u: unknown) => {
    if (u == null) return '';
    const s = String(u).trim();
    return s ? `Unit #${s}` : '';
  };
  if (entityType === 'fleet' && fleet) {
    const mm = [fleet.make, fleet.model].filter(Boolean).join(' ').trim();
    const u = unitPart(fleet.unit_number);
    const core = mm || (fleet.name?.trim() ?? '');
    return [core, u].filter(Boolean).join(' ');
  }
  if (entityType === 'equipment' && equipment) {
    const bm = [equipment.brand, equipment.model].filter(Boolean).join(' ').trim();
    const u = unitPart(equipment.unit_number);
    const core = bm || (equipment.name?.trim() ?? '');
    return [core, u].filter(Boolean).join(' ');
  }
  return '';
}

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const totalMinutes = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.min(23 * 60 + 55, Math.round(totalMinutes / 5) * 5);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hours)}:${pad(minutes)}`;
}

export default function WorkOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [showCostForm, setShowCostForm] = useState(false);
  const [editingCost, setEditingCost] = useState<{ category: 'labor' | 'parts' | 'other'; index?: number } | null>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [showStatusReasonModal, setShowStatusReasonModal] = useState(false);
  const [showEditStatusModal, setShowEditStatusModal] = useState(false);
  const [statusEditDraft, setStatusEditDraft] = useState('');
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [statusTarget, setStatusTarget] = useState<string>('');
  const [statusReason, setStatusReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [checkInForm, setCheckInForm] = useState({
    check_in_at: '',
    odometer_reading: '',
    hours_reading: '',
  });
  const [checkOutForm, setCheckOutForm] = useState({
    check_out_at: '',
    odometer_reading: '',
    hours_reading: '',
  });
  const [descriptionEditing, setDescriptionEditing] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'general' | 'costs' | 'files' | 'activity' | null) || 'general';
  const [tab, setTab] = useState<'general' | 'costs' | 'files' | 'activity'>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(tab !== 'general');
  const isValidId = id && id !== 'new';

  useEffect(() => {
    setIsHeroCollapsed(tab !== 'general');
  }, [tab]);

  useEffect(() => {
    if (!showCheckInModal) return;
    setCheckInForm((prev) =>
      prev.check_in_at.trim() ? prev : { ...prev, check_in_at: formatLocalDateTime(new Date()) },
    );
  }, [showCheckInModal]);

  useEffect(() => {
    if (!showCheckOutModal) return;
    setCheckOutForm((prev) =>
      prev.check_out_at.trim() ? prev : { ...prev, check_out_at: formatLocalDateTime(new Date()) },
    );
  }, [showCheckOutModal]);

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

  const { data: asset, isPending: fleetAssetPending } = useQuery({
    queryKey: ['fleetAsset', workOrder?.entity_id],
    queryFn: () =>
      api<{ id: string; make?: string | null; model?: string | null; name?: string | null; unit_number?: string | null; photos?: string[] }>(
        'GET',
        `/fleet/assets/${workOrder!.entity_id}`,
      ),
    enabled: !!workOrder?.entity_id && workOrder?.entity_type === 'fleet',
  });

  const { data: equipment, isPending: equipmentHeroPending } = useQuery({
    queryKey: ['fleetEquipment', workOrder?.entity_id],
    queryFn: () =>
      api<WoHeroEquipment & { id: string }>('GET', `/fleet/equipment/${workOrder!.entity_id}`),
    enabled: !!workOrder?.entity_id && workOrder?.entity_type === 'equipment',
  });

  const assetPhotoUrl = asset?.photos?.[0] ? withFileAccessToken(`/files/${asset.photos[0]}/thumbnail?w=400`) : null;

  const woHeroAssetLine = useMemo(
    () => (workOrder ? buildWoHeroAssetOneLine(workOrder.entity_type, asset, equipment) : ''),
    [workOrder, asset, equipment],
  );

  const woHeroAssetLinePending =
    (workOrder?.entity_type === 'fleet' && fleetAssetPending) || (workOrder?.entity_type === 'equipment' && equipmentHeroPending);

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const permissionsReady = !!me && !meLoading;
  const canEditGeneral = canEditFleetWorkOrderTab(isAdmin, permissions, 'general');
  const canEditCostsPerm = canEditFleetWorkOrderTab(isAdmin, permissions, 'costs');
  const canEditFiles = canEditFleetWorkOrderTab(isAdmin, permissions, 'files');
  const canViewTab = (t: FleetWorkOrderTab) => canViewFleetWorkOrderTab(isAdmin, permissions, t);

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

  const updateDescriptionMutation = useMutation({
    mutationFn: async (description: string) => api('PUT', `/fleet/work-orders/${id}`, { description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Description updated');
      setDescriptionEditing(false);
    },
    onError: () => toast.error('Failed to update description'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { status: string; reason?: string }) => {
      return api('PUT', `/fleet/work-orders/${id}/status`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Status updated');
      setShowStatusReasonModal(false);
      setShowEditStatusModal(false);
      setStatusTarget('');
      setStatusReason('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update status'),
  });

  const checkInMutation = useMutation({
    mutationFn: async (body: { check_in_at?: string; odometer_reading?: number; hours_reading?: number }) => {
      return api('PUT', `/fleet/work-orders/${id}/check-in`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Work order started');
    },
    onError: () => toast.error('Failed to start work order'),
  });

  const checkOutMutation = useMutation({
    mutationFn: async (body: { check_out_at?: string; odometer_reading?: number; hours_reading?: number }) => {
      return api('PUT', `/fleet/work-orders/${id}/check-out`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Work order finished');
      setShowCheckOutModal(false);
      setCheckOutForm({ check_out_at: '', odometer_reading: '', hours_reading: '' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to finish work order'),
  });

  const reopenMutation = useMutation({
    mutationFn: async (payload: { reason: string }) => api('PUT', `/fleet/work-orders/${id}/reopen`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrder', id] });
      queryClient.invalidateQueries({ queryKey: ['workOrderActivity', id] });
      toast.success('Work order reopened');
      setShowReopenModal(false);
      setReopenReason('');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to reopen work order'),
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

  const canEditCostsByStatus = ['open', 'in_progress', 'pending_parts'].includes(workOrder?.status ?? '');
  const canEditCosts = canEditCostsByStatus && canEditCostsPerm;
  const canStartService = workOrder?.status === 'open' && canEditGeneral;
  const canFinishService = ['in_progress', 'pending_parts'].includes(workOrder?.status ?? '') && canEditGeneral;
  const canReopen = ['cancelled', 'not_approved'].includes(workOrder?.status ?? '') && isAdmin && canEditGeneral;
  const allowedManualStatusTargets = MANUAL_STATUS_TRANSITIONS[workOrder?.status ?? ''] || [];
  const statusOptionsForCurrent = workOrder ? [workOrder.status, ...allowedManualStatusTargets] : [];

  const removeCostItem = (category: 'labor' | 'parts' | 'other', index: number) => {
    const currentCosts = workOrder?.costs || {};
    const arr = Array.isArray(currentCosts[category]) ? [...(currentCosts[category] as CostItem[])] : [];
    const newArr = arr.filter((_, i) => i !== index);
    const newCosts = { ...currentCosts, [category]: newArr };
    newCosts.total = getCostTotal(newCosts, 'labor') + getCostTotal(newCosts, 'parts') + getCostTotal(newCosts, 'other');
    updateCostsMutation.mutate(newCosts);
  };

  const handleRemoveCost = async (category: 'labor' | 'parts' | 'other', index: number) => {
    const ok = await confirm({
      title: 'Remove cost',
      message: 'Remove this cost?',
    });
    if (ok) removeCostItem(category, index);
  };

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const goBackFromWorkOrder = () => {
    if (window.history.length > 1) {
      nav(-1);
    } else {
      nav('/fleet/work-orders');
    }
  };

  const toIsoStringOrUndefined = (value: string): string | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) return undefined;
    return dt.toISOString();
  };

  const parseNumberOrUndefined = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const submitCheckIn = () => {
    const payload: { check_in_at?: string; odometer_reading?: number; hours_reading?: number } = {};
    const checkInAt = toIsoStringOrUndefined(checkInForm.check_in_at);
    const odometer = parseNumberOrUndefined(checkInForm.odometer_reading);
    const hours = parseNumberOrUndefined(checkInForm.hours_reading);
    if (checkInAt) payload.check_in_at = checkInAt;
    if (odometer !== undefined) payload.odometer_reading = Math.max(0, Math.trunc(odometer));
    if (hours !== undefined) payload.hours_reading = Math.max(0, hours);
    checkInMutation.mutate(payload, {
      onSuccess: () => {
        setShowCheckInModal(false);
        setCheckInForm({
          check_in_at: '',
          odometer_reading: '',
          hours_reading: '',
        });
      },
    });
  };

  const submitCheckOut = () => {
    const payload: { check_out_at?: string; odometer_reading?: number; hours_reading?: number } = {};
    const checkOutAt = toIsoStringOrUndefined(checkOutForm.check_out_at);
    const odometer = parseNumberOrUndefined(checkOutForm.odometer_reading);
    const hours = parseNumberOrUndefined(checkOutForm.hours_reading);
    if (checkOutAt) payload.check_out_at = checkOutAt;
    if (odometer !== undefined) payload.odometer_reading = Math.max(0, Math.trunc(odometer));
    if (hours !== undefined) payload.hours_reading = Math.max(0, hours);
    checkOutMutation.mutate(payload);
  };

  const requestStatusChange = (nextStatus: string) => {
    if (!workOrder || nextStatus === workOrder.status) return;
    if (nextStatus === 'cancelled') {
      setStatusTarget(nextStatus);
      setStatusReason('');
      setShowEditStatusModal(false);
      setShowStatusReasonModal(true);
      return;
    }
    updateStatusMutation.mutate({ status: nextStatus });
  };

  const applyWorkOrderStatusEdit = () => {
    if (!workOrder) return;
    if (statusEditDraft === workOrder.status) {
      setShowEditStatusModal(false);
      return;
    }
    requestStatusChange(statusEditDraft);
  };

  const woTabItems = useMemo(() => {
    if (!permissionsReady) return [];
    return (
      [
        { key: 'general' as const, label: 'General', permTab: 'general' as const },
        { key: 'costs' as const, label: 'Costs', permTab: 'costs' as const },
        { key: 'files' as const, label: 'Files', permTab: 'files' as const },
        { key: 'activity' as const, label: 'Activity', permTab: 'activity' as const },
      ] as const
    ).filter((t) => canViewFleetWorkOrderTab(isAdmin, permissions, t.permTab));
  }, [permissionsReady, isAdmin, permissions]);

  useEffect(() => {
    if (!permissionsReady || !woTabItems.length) return;
    if (!woTabItems.some((t) => t.key === tab)) {
      const next = woTabItems[0].key;
      setTab(next);
      if (id) nav(`/fleet/work-orders/${id}?tab=${next}`, { replace: true });
    }
  }, [permissionsReady, woTabItems, tab, id, nav]);

  if (!isValidId) {
    return <div className="p-4">Invalid work order ID</div>;
  }

  const pageHeaderToday = (
    <div className="text-right">
      <div className={uiTypography.overline}>Today</div>
      <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
    </div>
  );

  if (isLoading) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppPageHeader
          title="Work order"
          subtitle="Fleet work order details"
          icon={<ClipboardList className="h-4 w-4" />}
          onBack={goBackFromWorkOrder}
          backLabel="Back"
          actions={pageHeaderToday}
        />
        <WorkOrderHeroSkeleton />
        <AppCard bodyClassName="!py-3">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 min-w-[100px] max-w-[140px] flex-1 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        </AppCard>
      </div>
    );
  }

  if (!workOrder) {
    return <div className="p-4">Work order not found</div>;
  }

  const costs = workOrder.costs || {};
  const laborCosts = Array.isArray(costs.labor) ? costs.labor : [];
  const partsCosts = Array.isArray(costs.parts) ? costs.parts : [];
  const otherCosts = Array.isArray(costs.other) ? costs.other : [];

  const { primaryTitle: heroPrimaryTitle, subtitleLine: heroSubtitleLine } = buildWorkOrderHeroHeading(workOrder);

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Work order"
        subtitle={workOrder.work_order_number}
        icon={<ClipboardList className="h-4 w-4" />}
        onBack={goBackFromWorkOrder}
        backLabel="Back"
        actions={
          <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
            {isAdmin ? (
              <AppButton
                type="button"
                variant="danger"
                size="sm"
                disabled={deleteWorkOrderMutation.isPending}
                loading={deleteWorkOrderMutation.isPending}
                onClick={async () => {
                  const result = await confirm({
                    title: 'Delete work order',
                    message:
                      'Are you sure you want to delete this work order permanently? This action cannot be undone.',
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                  });
                  if (result !== 'confirm') return;
                  deleteWorkOrderMutation.mutate();
                }}
              >
                Delete
              </AppButton>
            ) : null}
            {pageHeaderToday}
          </div>
        }
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <WorkOrderHero
          workOrder={workOrder}
          primaryTitle={heroPrimaryTitle}
          subtitleLine={heroSubtitleLine}
          assetPhotoUrl={assetPhotoUrl}
          assetName={asset?.name}
          woHeroAssetLine={woHeroAssetLine}
          woHeroAssetLinePending={woHeroAssetLinePending}
          statusOptionsCount={statusOptionsForCurrent.length}
          statusEditPending={updateStatusMutation.isPending}
          isCollapsed={isHeroCollapsed}
          onToggleCollapsed={() => setIsHeroCollapsed((v) => !v)}
          onEditStatus={() => {
            setStatusEditDraft(workOrder.status);
            setShowEditStatusModal(true);
          }}
          canEditStatus={canEditGeneral}
          canStartService={canStartService}
          canFinishService={canFinishService}
          canReopen={canReopen}
          onStartService={() => setShowCheckInModal(true)}
          onEndService={() => setShowCheckOutModal(true)}
          onReopen={() => setShowReopenModal(true)}
        />

        <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>
          <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : '!py-3'}>
            {!permissionsReady ? (
              <div className="h-8 animate-pulse rounded bg-gray-100" />
            ) : woTabItems.length > 0 ? (
              <AppTabs
                tabs={woTabItems.map((t) => ({ key: t.key, label: t.label }))}
                value={tab}
                onChange={(next) => {
                  setTab(next as typeof tab);
                  nav(`/fleet/work-orders/${id}?tab=${next}`, { replace: true });
                }}
              />
            ) : (
              <p className={uiCx(uiTypography.helper, 'px-1')}>
                No work order tabs are available for your permissions.
              </p>
            )}
          </AppCard>
        </div>
      </div>

      <AppCard bodyClassName="min-w-0 overflow-hidden">
        {permissionsReady && woTabItems.length === 0 ? (
          <AppEmptyState
            title="No tabs available"
            description="Ask an admin to grant View on General, Costs, Files, or Activity for work orders."
            className="border-0 bg-transparent py-10 shadow-none"
          />
        ) : null}
        {tab === 'general' && canViewTab('general') && (
          <WorkOrderGeneralTab
            workOrder={workOrder}
            canEditDescription={canEditCostsByStatus && canEditGeneral}
            descriptionEditing={descriptionEditing}
            descriptionDraft={descriptionDraft}
            descriptionSavePending={updateDescriptionMutation.isPending}
            onStartEditDescription={() => {
              setDescriptionDraft(workOrder.description ?? '');
              setDescriptionEditing(true);
            }}
            onCancelEditDescription={() => {
              setDescriptionEditing(false);
              setDescriptionDraft('');
            }}
            onDescriptionDraftChange={setDescriptionDraft}
            onSaveDescription={() => {
              const t = descriptionDraft.trim();
              if (!t) {
                toast.error('Description cannot be empty');
                return;
              }
              updateDescriptionMutation.mutate(t);
            }}
            onNavigateInspection={(inspectionId) => nav(`/fleet/inspections/${inspectionId}`)}
          />
        )}

        {tab === 'costs' && canViewTab('costs') && (
          <WorkOrderCostsTab
            workOrderId={id!}
            costs={costs}
            laborCosts={laborCosts}
            partsCosts={partsCosts}
            otherCosts={otherCosts}
            canEditCosts={canEditCosts}
            showCostForm={showCostForm}
            editingCost={editingCost}
            isSaving={updateCostsMutation.isPending}
            onStartAdd={(category) => {
              setEditingCost({ category });
              setShowCostForm(true);
            }}
            onStartEdit={(category, index) => {
              setEditingCost({ category, index });
              setShowCostForm(true);
            }}
            onCancelForm={() => {
              setShowCostForm(false);
              setEditingCost(null);
            }}
            onSaveCosts={(newCosts) => updateCostsMutation.mutate(newCosts)}
            onRemoveCost={handleRemoveCost}
            getCostTotal={getCostTotal}
            getTotalCost={getTotalCost}
          />
        )}

        {tab === 'files' && canViewTab('files') && (
          <WorkOrderFilesTab workOrderId={id!} canEdit={canEditFiles} />
        )}

        {tab === 'activity' && canViewTab('activity') && (
          <WorkOrderActivityTab workOrderId={id!} />
        )}
      </AppCard>

      <WorkOrderDetailModals
        showCheckIn={canEditGeneral && showCheckInModal}
        onCloseCheckIn={() => setShowCheckInModal(false)}
        checkInForm={checkInForm}
        onCheckInFormChange={(patch) => setCheckInForm((p) => ({ ...p, ...patch }))}
        onSubmitCheckIn={submitCheckIn}
        checkInPending={checkInMutation.isPending}
        showCheckOut={canEditGeneral && showCheckOutModal}
        onCloseCheckOut={() => setShowCheckOutModal(false)}
        checkOutForm={checkOutForm}
        onCheckOutFormChange={(patch) => setCheckOutForm((p) => ({ ...p, ...patch }))}
        onSubmitCheckOut={submitCheckOut}
        checkOutPending={checkOutMutation.isPending}
        showEditStatus={canEditGeneral && showEditStatusModal && !!workOrder}
        onCloseEditStatus={() => setShowEditStatusModal(false)}
        statusEditDraft={statusEditDraft}
        onStatusEditDraftChange={setStatusEditDraft}
        statusOptionsForCurrent={statusOptionsForCurrent}
        onApplyStatusEdit={applyWorkOrderStatusEdit}
        statusUpdatePending={updateStatusMutation.isPending}
        showStatusReason={showStatusReasonModal}
        onCloseStatusReason={() => setShowStatusReasonModal(false)}
        statusReason={statusReason}
        onStatusReasonChange={setStatusReason}
        onConfirmStatusReason={() => updateStatusMutation.mutate({ status: statusTarget, reason: statusReason })}
        statusReasonPending={updateStatusMutation.isPending}
        showReopen={canEditGeneral && showReopenModal}
        onCloseReopen={() => setShowReopenModal(false)}
        reopenReason={reopenReason}
        onReopenReasonChange={setReopenReason}
        onSubmitReopen={() => reopenMutation.mutate({ reason: reopenReason })}
        reopenPending={reopenMutation.isPending}
      />
    </div>
  );
}
