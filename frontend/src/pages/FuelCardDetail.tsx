import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fuel } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import FuelCardAssignCustodyModal, {
  type FuelCardAssignCustodyPayload,
} from '@/components/companyAssets/FuelCardAssignCustodyModal';
import FuelCardReturnCustodyModal, {
  type FuelCardReturnCustodyPayload,
} from '@/components/companyAssets/FuelCardReturnCustodyModal';
import FuelCardCustodyLogDetailModal from '@/components/companyAssets/FuelCardCustodyLogDetailModal';
import { FuelCardCustodyTab } from '@/components/companyAssets/FuelCardCustodyTab';
import { FuelCardGeneralTab } from '@/components/companyAssets/FuelCardGeneralTab';
import EditFuelCardModal, { type FuelCardEditSection } from '@/components/companyAssets/EditFuelCardModal';
import {
  buildFuelCardHeroHeading,
  FuelCardHero,
  FuelCardHeroSkeleton,
} from '@/components/companyAssets/FuelCardHero';
import FleetHistoryAuditChangeModal, {
  type FleetHistoryAuditDetailPayload,
} from '@/components/fleet/FleetHistoryAuditChangeModal';
import { FleetAssetLogsTab, type FleetAssetHistoryItem } from '@/components/fleet/FleetAssetLogsTab';
import type { FleetAssignmentLogRecord } from '@/components/fleet/FleetAssignmentLogDetailModal';
import { canEditFuelCards } from '@/lib/companyAssetsPermissions';
import {
  AppButton,
  AppCard,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiSpacing,
  uiTypography,
  type AppTabItem,
} from '@/components/ui';

type CardDto = {
  id: string;
  card_number: string;
  pin: string;
  date_issued?: string | null;
  crew?: string | null;
  status: string;
  notes?: string | null;
};

type AssignmentRow = {
  id: string;
  assigned_to_user_id: string;
  assigned_at: string;
  returned_at?: string | null;
  assigned_to_name?: string | null;
  notes?: string | null;
  notes_in?: string | null;
  reason_out?: string | null;
  reason_in?: string | null;
  attachments_out?: string[] | null;
  attachments_in?: string[] | null;
  is_active: boolean;
};

const TAB_ITEMS: AppTabItem[] = [
  { key: 'details', label: 'Details' },
  { key: 'custody', label: 'Custody' },
  { key: 'history', label: 'History' },
];

type DetailTab = 'details' | 'custody' | 'history';

export default function FuelCardDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const navigateBackToFuelCards = useNavigateBack('/company-assets/fuel-cards');
  const location = useLocation();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as DetailTab | null) || 'details';
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(tab !== 'details');
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [editSection, setEditSection] = useState<FuelCardEditSection | null>(null);
  const [deletingCard, setDeletingCard] = useState(false);
  const [logDetailAssignment, setLogDetailAssignment] = useState<AssignmentRow | null>(null);
  const [logDetailLogType, setLogDetailLogType] = useState<'assignment' | 'return' | null>(null);
  const [logDetailPerformedBy, setLogDetailPerformedBy] = useState<string | null>(null);
  const [historyAuditDetail, setHistoryAuditDetail] = useState<FleetHistoryAuditDetailPayload | null>(null);

  useEffect(() => {
    setIsHeroCollapsed(tab !== 'details');
  }, [tab]);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as DetailTab | null;
    if (tabParam && (tabParam === 'details' || tabParam === 'custody' || tabParam === 'history')) {
      setTab(tabParam);
    }
  }, [location.search]);

  const isValidId = id && id !== 'new';

  const { data: card, isLoading } = useQuery({
    queryKey: ['fuel-card', id],
    queryFn: () => api<CardDto>('GET', `/fuel-cards/${id}`),
    enabled: !!isValidId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['fuel-card-assignments', id],
    queryFn: () => api<AssignmentRow[]>('GET', `/fuel-cards/${id}/assignments`),
    enabled: !!isValidId,
  });

  const { data: historyResponse } = useQuery({
    queryKey: ['fuel-card-history', id],
    queryFn: () => api<{ items: FleetAssetHistoryItem[] }>('GET', `/fuel-cards/${id}/history`),
    enabled: !!isValidId,
  });
  const historyItems = historyResponse?.items ?? [];

  const historyAssignments = useMemo(
    (): FleetAssignmentLogRecord[] =>
      assignments.map((a) => ({
        id: a.id,
        assigned_to_name: a.assigned_to_name ?? undefined,
        assigned_at: a.assigned_at,
        returned_at: a.returned_at ?? undefined,
        notes_out: a.notes ?? undefined,
        notes_in: a.notes_in ?? undefined,
      })),
    [assignments],
  );

  const invalidateHistory = () => {
    qc.invalidateQueries({ queryKey: ['fuel-card-history', id] });
  };

  const invalidateCustody = () => {
    qc.invalidateQueries({ queryKey: ['fuel-card-assignments', id] });
    qc.invalidateQueries({ queryKey: ['fuel-cards'] });
    qc.invalidateQueries({ queryKey: ['fuel-card', id] });
    invalidateHistory();
  };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canEdit = canEditFuelCards(isAdministrator, permissions);

  const activeAssignment = useMemo(() => assignments.find((a) => a.is_active), [assignments]);

  const assignMutation = useMutation({
    mutationFn: (payload: FuelCardAssignCustodyPayload) => api('POST', `/fuel-cards/${id}/assign`, payload),
    onSuccess: () => {
      toast.success('Assigned');
      setShowAssign(false);
      invalidateCustody();
    },
    onError: (e: any) => toast.error(e?.message || 'Assign failed'),
  });

  const returnMutation = useMutation({
    mutationFn: (payload: FuelCardReturnCustodyPayload) => api('POST', `/fuel-cards/${id}/return`, payload),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturn(false);
      invalidateCustody();
    },
    onError: (e: any) => toast.error(e?.message || 'Return failed'),
  });

  const deleteCardMutation = useMutation({
    mutationFn: () => api('DELETE', `/fuel-cards/${id}`),
    onSuccess: () => {
      toast.success('Fuel card removed');
      qc.invalidateQueries({ queryKey: ['fuel-cards'] });
      nav('/company-assets/fuel-cards');
    },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  const isInCustody = !!activeAssignment;
  const canAssign = canEdit && (isInCustody || (!!card && card.status === 'active'));

  const pageShellClass = uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50');

  const headerAdminActions = isAdministrator ? (
    <AppButton
      type="button"
      variant="danger"
      size="sm"
      disabled={deletingCard || deleteCardMutation.isPending}
      loading={deletingCard || deleteCardMutation.isPending}
      onClick={async () => {
        const choice = await confirm({
          title: 'Delete fuel card',
          message:
            'Permanently remove this card record from MKHub (including custody history)? This cannot be undone.',
          confirmText: 'Delete permanently',
          cancelText: 'Cancel',
        });
        if (choice !== 'confirm') return;
        setDeletingCard(true);
        try {
          await deleteCardMutation.mutateAsync();
        } finally {
          setDeletingCard(false);
        }
      }}
    >
      Delete
    </AppButton>
  ) : null;

  const pageHeaderActions = headerAdminActions ? (
    <div className="flex items-center gap-3">{headerAdminActions}</div>
  ) : undefined;

  if (!isValidId) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Company Assets"
          subtitle="Fuel cards"
          onBack={navigateBackToFuelCards}
          backLabel="Fuel cards"
          icon={<Fuel className="h-4 w-4" />}
        />
        <AppCard>
          <p className={uiTypography.helper}>Invalid id</p>
        </AppCard>
      </div>
    );
  }

  if (isLoading || !card) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Company Assets"
          subtitle="Fuel cards"
          onBack={navigateBackToFuelCards}
          backLabel="Fuel cards"
          icon={<Fuel className="h-4 w-4" />}
        />
        <FuelCardHeroSkeleton />
      </div>
    );
  }

  const { primaryTitle, subtitleLine } = buildFuelCardHeroHeading(card);

  return (
    <div className={pageShellClass}>
      <AppPageHeader
        title="Company Assets"
        subtitle="Fuel cards"
        onBack={navigateBackToFuelCards}
        backLabel="Fuel cards"
        icon={<Fuel className="h-4 w-4" />}
        actions={pageHeaderActions}
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <FuelCardHero
          primaryTitle={primaryTitle}
          subtitleLine={subtitleLine}
          card={card}
          isInCustody={isInCustody}
          assignedToName={activeAssignment?.assigned_to_name}
          canAssign={!!canAssign}
          isCollapsed={isHeroCollapsed}
          onToggleCollapsed={() => setIsHeroCollapsed((v) => !v)}
          onAssign={() => setShowAssign(true)}
          onReturn={() => setShowReturn(true)}
        />

        <div className={!isHeroCollapsed ? '-mt-0.5' : undefined}>
          <AppCard bodyClassName={isHeroCollapsed ? 'p-2.5' : '!py-3'}>
            <AppTabs
              tabs={TAB_ITEMS}
              value={tab}
              onChange={(next) => {
                setTab(next as typeof tab);
                nav(`/company-assets/fuel-cards/${id}?tab=${next}`, { replace: true });
              }}
            />
          </AppCard>
        </div>
      </div>

      <AppCard bodyClassName="min-w-0 overflow-hidden">
        {tab === 'details' && (
          <FuelCardGeneralTab card={card} canEdit={canEdit} onEditSection={setEditSection} />
        )}
        {tab === 'custody' && (
          <FuelCardCustodyTab activeAssignment={activeAssignment} assignments={assignments} />
        )}
        {tab === 'history' && (
          <FleetAssetLogsTab
            historyItems={historyItems}
            assignments={historyAssignments}
            assignmentAuditEntityType="fuel_card_assignment"
            activityDescription="Custody changes, edits to this card, and other audit entries (newest first)."
            onOpenAssignmentDetail={(assignment, logType, performedBy) => {
              const row = assignments.find((a) => a.id === assignment.id);
              if (!row) return;
              setLogDetailAssignment(row);
              setLogDetailLogType(logType);
              setLogDetailPerformedBy(performedBy);
            }}
            onOpenAuditDetail={setHistoryAuditDetail}
          />
        )}
      </AppCard>

      <FuelCardAssignCustodyModal
        open={canEdit && showAssign}
        cardLabel={card.card_number}
        onClose={() => setShowAssign(false)}
        onAssign={(data) => assignMutation.mutate(data)}
        isPending={assignMutation.isPending}
      />

      <FuelCardReturnCustodyModal
        open={canEdit && showReturn}
        cardLabel={card.card_number}
        assignedToName={activeAssignment?.assigned_to_name}
        onClose={() => setShowReturn(false)}
        onConfirm={(data) => returnMutation.mutate(data)}
        isPending={returnMutation.isPending}
      />

      <EditFuelCardModal
        open={canEdit && editSection !== null}
        section={editSection}
        onClose={() => setEditSection(null)}
        card={card}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['fuel-card', id] });
          qc.invalidateQueries({ queryKey: ['fuel-cards'] });
          invalidateHistory();
        }}
      />

      {logDetailAssignment && logDetailLogType ? (
        <FuelCardCustodyLogDetailModal
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
      ) : null}

      {historyAuditDetail !== null ? (
        <FleetHistoryAuditChangeModal
          open
          detail={historyAuditDetail}
          onClose={() => setHistoryAuditDetail(null)}
        />
      ) : null}
    </div>
  );
}
