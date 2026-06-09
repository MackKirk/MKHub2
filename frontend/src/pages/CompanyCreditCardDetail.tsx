import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ConfirmProvider';
import CompanyCreditCardAssignCustodyModal from '@/components/companyAssets/CompanyCreditCardAssignCustodyModal';
import CompanyCreditCardReturnCustodyModal from '@/components/companyAssets/CompanyCreditCardReturnCustodyModal';
import CompanyCreditCardCustodyLogDetailModal from '@/components/companyAssets/CompanyCreditCardCustodyLogDetailModal';
import { CompanyCreditCardCustodyTab } from '@/components/companyAssets/CompanyCreditCardCustodyTab';
import { CompanyCreditCardGeneralTab } from '@/components/companyAssets/CompanyCreditCardGeneralTab';
import EditCompanyCreditCardModal, {
  type CompanyCreditCardEditSection,
} from '@/components/companyAssets/EditCompanyCreditCardModal';
import {
  buildCompanyCreditCardHeroHeading,
  CompanyCreditCardHero,
  CompanyCreditCardHeroSkeleton,
} from '@/components/companyAssets/CompanyCreditCardHero';
import FleetHistoryAuditChangeModal, {
  type FleetHistoryAuditDetailPayload,
} from '@/components/fleet/FleetHistoryAuditChangeModal';
import { FleetAssetLogsTab, type FleetAssetHistoryItem } from '@/components/fleet/FleetAssetLogsTab';
import type { FleetAssignmentLogRecord } from '@/components/fleet/FleetAssignmentLogDetailModal';
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
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
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
  is_active: boolean;
};

const TAB_ITEMS: AppTabItem[] = [
  { key: 'details', label: 'Details' },
  { key: 'custody', label: 'Custody' },
  { key: 'history', label: 'History' },
];

type DetailTab = 'details' | 'custody' | 'history';

export default function CompanyCreditCardDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as DetailTab | null) || 'details';
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(tab !== 'details');
  const [showAssign, setShowAssign] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [editSection, setEditSection] = useState<CompanyCreditCardEditSection | null>(null);
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
    queryKey: ['company-credit-card', id],
    queryFn: () => api<CardDto>('GET', `/company-credit-cards/${id}`),
    enabled: !!isValidId,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['company-credit-card-assignments', id],
    queryFn: () => api<AssignmentRow[]>('GET', `/company-credit-cards/${id}/assignments`),
    enabled: !!isValidId,
  });

  const { data: historyResponse } = useQuery({
    queryKey: ['company-credit-card-history', id],
    queryFn: () => api<{ items: FleetAssetHistoryItem[] }>('GET', `/company-credit-cards/${id}/history`),
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
      })),
    [assignments],
  );

  const invalidateHistory = () => {
    qc.invalidateQueries({ queryKey: ['company-credit-card-history', id] });
  };

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdministrator = !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin');

  const activeAssignment = useMemo(() => assignments.find((a) => a.is_active), [assignments]);

  const assignMutation = useMutation({
    mutationFn: (payload: { assigned_to_user_id: string; notes?: string }) =>
      api('POST', `/company-credit-cards/${id}/assign`, payload),
    onSuccess: () => {
      toast.success('Assigned');
      setShowAssign(false);
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
      invalidateHistory();
    },
    onError: (e: any) => toast.error(e?.message || 'Assign failed'),
  });

  const returnMutation = useMutation({
    mutationFn: (notes?: string) =>
      api('POST', `/company-credit-cards/${id}/return`, {
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success('Return recorded');
      setShowReturn(false);
      qc.invalidateQueries({ queryKey: ['company-credit-card-assignments', id] });
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      invalidateHistory();
    },
    onError: (e: any) => toast.error(e?.message || 'Return failed'),
  });

  const deleteCardMutation = useMutation({
    mutationFn: () => api('DELETE', `/company-credit-cards/${id}`),
    onSuccess: () => {
      toast.success('Card record removed');
      qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
      nav('/company-assets/credit-cards');
    },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  const pageShellClass = uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50');

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
      disabled={deletingCard || deleteCardMutation.isPending}
      loading={deletingCard || deleteCardMutation.isPending}
      onClick={async () => {
        const choice = await confirm({
          title: 'Delete corporate card',
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

  const pageHeaderActions = (
    <div className="flex items-center gap-3">
      {headerAdminActions}
      {pageHeaderToday}
    </div>
  );

  if (!isValidId) {
    return (
      <div className={pageShellClass}>
        <AppPageHeader
          title="Company Assets"
          subtitle="Corporate cards"
          onBack={() => nav('/company-assets/credit-cards')}
          backLabel="Corporate cards"
          icon={<CreditCard className="h-4 w-4" />}
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
          subtitle="Corporate cards"
          onBack={() => nav('/company-assets/credit-cards')}
          backLabel="Corporate cards"
          icon={<CreditCard className="h-4 w-4" />}
          actions={pageHeaderToday}
        />
        <CompanyCreditCardHeroSkeleton />
      </div>
    );
  }

  const { primaryTitle, subtitleLine } = buildCompanyCreditCardHeroHeading(card);
  const isInCustody = !!activeAssignment;
  const canAssign = card.status === 'active';

  return (
    <div className={pageShellClass}>
      <AppPageHeader
        title="Company Assets"
        subtitle="Corporate cards"
        onBack={() => nav('/company-assets/credit-cards')}
        backLabel="Corporate cards"
        icon={<CreditCard className="h-4 w-4" />}
        actions={pageHeaderActions}
      />

      <div className={uiCx('flex flex-col', isHeroCollapsed ? 'gap-1.5' : 'gap-2')}>
        <CompanyCreditCardHero
          primaryTitle={primaryTitle}
          subtitleLine={subtitleLine}
          card={card}
          isInCustody={isInCustody}
          canAssign={canAssign}
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
                nav(`/company-assets/credit-cards/${id}?tab=${next}`, { replace: true });
              }}
            />
          </AppCard>
        </div>
      </div>

      <AppCard bodyClassName="min-w-0 overflow-hidden">
        {tab === 'details' && (
          <CompanyCreditCardGeneralTab card={card} onEditSection={setEditSection} />
        )}
        {tab === 'custody' && (
          <CompanyCreditCardCustodyTab activeAssignment={activeAssignment} assignments={assignments} />
        )}
        {tab === 'history' && (
          <FleetAssetLogsTab
            historyItems={historyItems}
            assignments={historyAssignments}
            assignmentAuditEntityType="company_credit_card_assignment"
            activityDescription="Custody assign/return events, edits to this card, and other audit entries (newest first)."
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

      <CompanyCreditCardAssignCustodyModal
        open={showAssign}
        cardLabel={card.label}
        onClose={() => setShowAssign(false)}
        onAssign={(data) => assignMutation.mutate(data)}
        isPending={assignMutation.isPending}
      />

      <CompanyCreditCardReturnCustodyModal
        open={showReturn}
        cardLabel={card.label}
        onClose={() => setShowReturn(false)}
        onConfirm={(notes) => returnMutation.mutate(notes)}
        isPending={returnMutation.isPending}
      />

      <EditCompanyCreditCardModal
        open={editSection !== null}
        section={editSection}
        onClose={() => setEditSection(null)}
        card={card}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['company-credit-card', id] });
          qc.invalidateQueries({ queryKey: ['company-credit-cards'] });
          invalidateHistory();
        }}
      />

      {logDetailAssignment && logDetailLogType ? (
        <CompanyCreditCardCustodyLogDetailModal
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
