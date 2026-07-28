import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import WarrantyClaimCancelModal from '@/components/warranties/WarrantyClaimCancelModal';
import WarrantyClaimDetailModal from '@/components/warranties/WarrantyClaimDetailModal';
import WarrantyClaimFormModal, { type WarrantyClaimEditSource } from '@/components/warranties/WarrantyClaimFormModal';
import WarrantyDetailModal from '@/components/warranties/WarrantyDetailModal';
import WarrantyFormModal, { type WarrantyEditSource } from '@/components/warranties/WarrantyFormModal';
import { WarrantySummaryKpiCard } from '@/components/warranties/WarrantySummaryKpiCard';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppEmptyState,
  AppSectionHeader,
  AppSelect,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiRadius,
  uiSortableEntityList,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  CLAIM_SEVERITY_LABELS,
  CLAIM_STATUS_LABELS,
  COVERAGE_DECISION_LABELS,
  OVERALL_STATUS_LABELS,
  PROVIDER_TYPE_LABELS,
  WARRANTY_STATUS_LABELS,
  WARRANTY_TYPE_LABELS,
  claimSeverityBadgeVariant,
  claimStatusBadgeVariant,
  warrantyStatusBadgeVariant,
} from '@/lib/warrantyLabels';

type WarrantySummary = {
  overall_status: string;
  active_warranties_count: number;
  pending_warranties_count: number;
  open_claims_count: number;
  next_expiration_date: string | null;
  next_expiration_warranty_id: string | null;
  next_maintenance_date: string | null;
  next_maintenance_warranty_id: string | null;
  overdue_actions_count: number;
};

type Warranty = {
  id: string;
  name: string;
  warranty_type: string;
  provider_type: string;
  provider_name?: string | null;
  status: string;
  coverage_description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  duration_value?: number | null;
  duration_unit?: string | null;
  maintenance_required?: boolean;
  maintenance_frequency?: string | null;
  maintenance_interval_value?: number | null;
  maintenance_interval_unit?: string | null;
  next_maintenance_due_date?: string | null;
  first_maintenance_due_date?: string | null;
  last_maintenance_completed_at?: string | null;
  open_claims_count: number;
};

type WarrantyClaim = WarrantyClaimEditSource;

type ActivityEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string | null;
  created_by_display: string | null;
  warranty_id?: string | null;
  claim_id?: string | null;
};

type Props = {
  projectId: string;
  projectDivisionIds?: string[];
  canRead: boolean;
  canWrite: boolean;
  canViewCosts: boolean;
  designSystem?: boolean;
  onNavigateFiles?: () => void;
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

function formatDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function formatActivityMessage(entry: ActivityEntry): string {
  const d = entry.details || {};
  switch (entry.action) {
    case 'warranty_created':
      return 'Warranty created';
    case 'warranty_updated':
      return 'Warranty updated';
    case 'status_changed':
      return `Status changed from ${WARRANTY_STATUS_LABELS[String(d.old_status)] || d.old_status} to ${WARRANTY_STATUS_LABELS[String(d.new_status)] || d.new_status}`;
    case 'maintenance_completed':
      return 'Maintenance completed';
    case 'document_uploaded':
      return `Document uploaded: ${d.file_name || 'file'}`;
    case 'claim_created':
      return `Claim ${d.claim_number || ''} registered`;
    case 'claim_status_changed':
      return `Claim status changed to ${CLAIM_STATUS_LABELS[String(d.new_status)] || d.new_status}`;
    case 'coverage_decision_changed':
      return `Coverage decision: ${COVERAGE_DECISION_LABELS[String(d.new_decision)] || d.new_decision}`;
    case 'claim_resolved':
      return 'Claim resolved';
    case 'costs_updated':
      return 'Claim costs updated';
    default:
      return entry.action.replace(/_/g, ' ');
  }
}

function SectionLoading({ message }: { message: string }) {
  return <div className={uiCx(uiSpacing.cardPadding, 'text-center', uiTypography.helper)}>{message}</div>;
}

function SectionError({ message }: { message: string }) {
  return <div className={uiCx(uiSpacing.cardPadding, 'text-center text-sm text-red-600')}>{message}</div>;
}

export default function ProjectWarrantiesTab({
  projectId,
  canRead,
  canWrite,
  canViewCosts,
  designSystem = false,
  onNavigateFiles,
}: Props) {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [claimsOpenOnly, setClaimsOpenOnly] = useState(false);
  const [viewWarrantyId, setViewWarrantyId] = useState<string | null>(null);
  const [viewClaimId, setViewClaimId] = useState<string | null>(null);
  const [showWarrantyModal, setShowWarrantyModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showClaimCancelModal, setShowClaimCancelModal] = useState(false);
  const [editingWarranty, setEditingWarranty] = useState<WarrantyEditSource | null>(null);
  const [editingClaim, setEditingClaim] = useState<WarrantyClaimEditSource | null>(null);
  const [cancellingClaim, setCancellingClaim] = useState<WarrantyClaimEditSource | null>(null);
  const [claimDefaultWarrantyId, setClaimDefaultWarrantyId] = useState<string | undefined>();

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id?: string }>('GET', '/auth/me'),
    enabled: canRead,
  });

  const summaryQ = useQuery({
    queryKey: ['projectWarrantySummary', projectId],
    queryFn: () => api<WarrantySummary>('GET', `/projects/${projectId}/warranties/summary`),
    enabled: canRead,
  });

  const warrantiesQ = useQuery({
    queryKey: ['projectWarranties', projectId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const qs = params.toString();
      return api<Warranty[]>('GET', `/projects/${projectId}/warranties${qs ? `?${qs}` : ''}`);
    },
    enabled: canRead,
  });

  const claimsQ = useQuery({
    queryKey: ['projectWarrantyClaims', projectId, claimsOpenOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (claimsOpenOnly) params.set('open_only', 'true');
      const qs = params.toString();
      return api<WarrantyClaim[]>('GET', `/projects/${projectId}/warranty-claims${qs ? `?${qs}` : ''}`);
    },
    enabled: canRead,
  });

  const activitiesQ = useQuery({
    queryKey: ['projectWarrantyActivities', projectId],
    queryFn: () => api<ActivityEntry[]>('GET', `/projects/${projectId}/warranty-activities?limit=50`),
    enabled: canRead,
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projectWarrantySummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarranties', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarrantyClaims', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectWarrantyActivities', projectId] });
    if (viewWarrantyId) {
      queryClient.invalidateQueries({ queryKey: ['projectWarranty', projectId, viewWarrantyId] });
      queryClient.invalidateQueries({ queryKey: ['projectWarrantyDocuments', projectId, viewWarrantyId] });
    }
    if (viewClaimId) {
      queryClient.invalidateQueries({ queryKey: ['projectWarrantyClaim', projectId, viewClaimId] });
    }
  }, [queryClient, projectId, viewWarrantyId, viewClaimId]);

  const summary = summaryQ.data;
  const warranties = warrantiesQ.data || [];
  const claims = claimsQ.data || [];
  const activities = activitiesQ.data || [];

  const openAddWarranty = () => {
    setEditingWarranty(null);
    setShowWarrantyModal(true);
  };

  const openEditWarranty = (w: Warranty) => {
    setEditingWarranty(w);
    setShowWarrantyModal(true);
  };

  const openRegisterClaim = (warrantyId?: string) => {
    setEditingClaim(null);
    setClaimDefaultWarrantyId(warrantyId);
    setShowClaimModal(true);
  };

  const openEditClaim = (claim: WarrantyClaimEditSource) => {
    setEditingClaim(claim);
    setClaimDefaultWarrantyId(undefined);
    setShowClaimModal(true);
  };

  const openCancelClaim = (claim: WarrantyClaimEditSource) => {
    setCancellingClaim(claim);
    setShowClaimCancelModal(true);
  };

  const closeWarrantyModal = () => {
    setShowWarrantyModal(false);
    setEditingWarranty(null);
  };

  const closeClaimModal = () => {
    setShowClaimModal(false);
    setClaimDefaultWarrantyId(undefined);
    setEditingClaim(null);
  };

  const closeClaimCancelModal = () => {
    setShowClaimCancelModal(false);
    setCancellingClaim(null);
  };

  const summaryCards = useMemo(
    () => [
      {
        key: 'overall',
        label: 'Overall Status',
        value: OVERALL_STATUS_LABELS[summary?.overall_status || ''] || summary?.overall_status || '—',
        onClick: () => setStatusFilter(''),
      },
      {
        key: 'active',
        label: 'Active Warranties',
        value: String(summary?.active_warranties_count ?? 0),
        onClick: () => setStatusFilter('active'),
      },
      {
        key: 'pending',
        label: 'Pending',
        value: String(summary?.pending_warranties_count ?? 0),
        onClick: () => setStatusFilter('pending_registration'),
      },
      {
        key: 'claims',
        label: 'Open Claims',
        value: String(summary?.open_claims_count ?? 0),
        onClick: () => {
          setClaimsOpenOnly(true);
          setTimeout(() => document.getElementById('warranty-claims-section')?.scrollIntoView({ behavior: 'smooth' }), 50);
        },
      },
      {
        key: 'expiration',
        label: 'Next Expiration',
        value: formatDate(summary?.next_expiration_date),
        onClick: () => {
          if (summary?.next_expiration_warranty_id) setViewWarrantyId(summary.next_expiration_warranty_id);
        },
      },
      {
        key: 'maintenance',
        label: 'Next Maintenance',
        value: formatDate(summary?.next_maintenance_date),
        onClick: () => {
          if (summary?.next_maintenance_warranty_id) setViewWarrantyId(summary.next_maintenance_warranty_id);
        },
      },
      {
        key: 'overdue',
        label: 'Overdue Actions',
        value: String(summary?.overdue_actions_count ?? 0),
        onClick: () => setStatusFilter(''),
      },
    ],
    [summary]
  );

  if (!canRead) {
    return (
      <AppCard>
        <AppEmptyState title="You do not have permission to view warranties." />
      </AppCard>
    );
  }

  const sectionProps = designSystem ? appSectionPresetProps('warranties') : {};

  const headerActions = canWrite ? (
    <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
      <AppButton variant="primary" size="sm" onClick={openAddWarranty}>
        Add Warranty
      </AppButton>
      <AppButton variant="secondary" size="sm" onClick={() => openRegisterClaim()}>
        Register Claim
      </AppButton>
    </div>
  ) : undefined;

  const tabBody = (
    <>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {summaryCards.map((card) => (
          <WarrantySummaryKpiCard key={card.key} label={card.label} value={card.value} onClick={card.onClick} />
        ))}
      </div>

      <AppCard bodyClassName="!p-0">
        <div className={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Warranty Records"
            description="Coverage periods, maintenance and documents"
            {...(designSystem ? {} : sectionProps)}
          />
          <div className="mt-3 max-w-xs">
            <AppSelect
              label="Status filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
            />
          </div>
        </div>
        {warrantiesQ.isLoading ? (
          <SectionLoading message="Loading warranties…" />
        ) : warrantiesQ.isError ? (
          <SectionError message={(warrantiesQ.error as Error)?.message || 'Failed to load warranties'} />
        ) : warranties.length === 0 ? (
          <div className={uiSpacing.cardPadding}>
            <AppEmptyState
              title="No warranties have been added to this project."
              description="Create a warranty to track coverage periods, required maintenance, documents and claims."
              action={canWrite ? <AppButton onClick={openAddWarranty}>Add Warranty</AppButton> : undefined}
            />
          </div>
        ) : (
          <ul className={uiCx(uiBorders.subtle, 'border-x-0 border-b-0')}>
            {warranties.map((w) => (
              <li key={w.id} className={uiSortableEntityList.rowFlat}>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setViewWarrantyId(w.id)}>
                    <div className={uiCx(uiTypography.body, 'font-medium text-gray-900')}>{w.name}</div>
                    <div className={uiTypography.helper}>
                      {WARRANTY_TYPE_LABELS[w.warranty_type] || w.warranty_type}
                      {' · '}
                      {w.provider_name || PROVIDER_TYPE_LABELS[w.provider_type] || w.provider_type}
                    </div>
                    <div className={uiTypography.helper}>
                      {formatDate(w.start_date)} – {formatDate(w.end_date)}
                      {w.open_claims_count > 0 && ` · ${w.open_claims_count} open claim(s)`}
                    </div>
                  </button>
                  <div className={uiCx(uiLayout.actionsRow, 'shrink-0')}>
                    <AppBadge variant={warrantyStatusBadgeVariant(w.status)}>
                      {WARRANTY_STATUS_LABELS[w.status] || w.status}
                    </AppBadge>
                    <AppButton size="sm" variant="ghost" onClick={() => setViewWarrantyId(w.id)}>
                      View
                    </AppButton>
                    {canWrite ? (
                      <>
                        <AppButton size="sm" variant="ghost" onClick={() => openEditWarranty(w)}>
                          Edit
                        </AppButton>
                        <AppButton size="sm" variant="ghost" onClick={() => openRegisterClaim(w.id)}>
                          Register Claim
                        </AppButton>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>

      <div id="warranty-claims-section">
        <AppCard bodyClassName="!p-0">
          <div className={uiSpacing.cardPadding}>
            <AppSectionHeader title="Claims" description="Warranty claims for this project" {...(designSystem ? {} : sectionProps)} />
            <div className="mt-3">
              <AppCheckbox
                label="Open claims only"
                checked={claimsOpenOnly}
                onChange={setClaimsOpenOnly}
              />
            </div>
          </div>
          {claimsQ.isLoading ? (
            <SectionLoading message="Loading claims…" />
          ) : claimsQ.isError ? (
            <SectionError message={(claimsQ.error as Error)?.message || 'Failed to load claims'} />
          ) : claims.length === 0 ? (
            <div className={uiSpacing.cardPadding}>
              <AppEmptyState title="No warranty claims have been reported." />
            </div>
          ) : (
            <ul className={uiCx(uiBorders.subtle, 'border-x-0 border-b-0')}>
              {claims.map((c) => (
                <li key={c.id} className={uiCx(uiSpacing.cardPadding, 'border-b border-gray-100 last:border-b-0')}>
                  <div className={uiCx(uiLayout.actionsRow, 'items-start justify-between gap-2')}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setViewClaimId(c.id)}>
                      <div className={uiCx(uiLayout.actionsRow, 'min-w-0 items-center gap-2')}>
                        <span className={uiCx(uiTypography.body, 'font-medium')}>{c.claim_number}</span>
                        <AppBadge variant={claimSeverityBadgeVariant(c.severity)}>
                          {CLAIM_SEVERITY_LABELS[c.severity]}
                        </AppBadge>
                        <AppBadge variant={claimStatusBadgeVariant(c.status)}>
                          {CLAIM_STATUS_LABELS[c.status] || c.status}
                        </AppBadge>
                      </div>
                      <p className={uiCx(uiTypography.body, 'mt-1 line-clamp-2 text-gray-600')}>{c.description}</p>
                      <div className={uiTypography.helper}>
                        Reported {formatDate(c.reported_date)}
                        {' · '}
                        {COVERAGE_DECISION_LABELS[c.coverage_decision]}
                        {!c.assigned_user_id && ' · Attention required'}
                        {canViewCosts && c.total_internal_cost != null && ` · $${c.total_internal_cost.toFixed(2)}`}
                      </div>
                    </button>
                    <AppButton size="sm" variant="ghost" className="shrink-0" onClick={() => setViewClaimId(c.id)}>
                      View
                    </AppButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AppCard>
      </div>

      <AppCard bodyClassName="!p-0">
        <div className={uiSpacing.cardPadding}>
          <AppSectionHeader title="Activity History" {...(designSystem ? {} : sectionProps)} />
        </div>
        {activitiesQ.isLoading ? (
          <SectionLoading message="Loading activity…" />
        ) : activitiesQ.isError ? (
          <SectionError message={(activitiesQ.error as Error)?.message || 'Failed to load activity'} />
        ) : activities.length === 0 ? (
          <p className={uiCx(uiSpacing.cardPadding, 'pt-0', uiTypography.helper)}>No activity yet.</p>
        ) : (
          <ul className={uiCx(uiSpacing.cardPadding, 'space-y-3 border-t border-gray-100 pt-4')}>
            {activities.map((entry) => (
              <li key={entry.id} className="border-l-2 border-gray-200 pl-3">
                <div className={uiTypography.helper}>{formatDate(entry.created_at)}</div>
                <div className={uiTypography.body}>
                  {formatActivityMessage(entry)}
                  {entry.created_by_display ? (
                    <span className="text-gray-500"> by {entry.created_by_display}</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppCard>
    </>
  );

  const modals = (
    <>
      <WarrantyDetailModal
        open={Boolean(viewWarrantyId)}
        onClose={() => setViewWarrantyId(null)}
        projectId={projectId}
        warrantyId={viewWarrantyId}
        canWrite={canWrite}
        onEdit={openEditWarranty}
        onRegisterClaim={openRegisterClaim}
        onNavigateFiles={onNavigateFiles}
        onChanged={invalidateAll}
      />

      <WarrantyFormModal
        open={showWarrantyModal}
        onClose={closeWarrantyModal}
        projectId={projectId}
        editingWarranty={editingWarranty}
        onSuccess={invalidateAll}
      />

      <WarrantyClaimDetailModal
        open={Boolean(viewClaimId)}
        onClose={() => setViewClaimId(null)}
        projectId={projectId}
        claimId={viewClaimId}
        canWrite={canWrite}
        canViewCosts={canViewCosts}
        warranties={warranties}
        onEdit={openEditClaim}
        onCancel={openCancelClaim}
      />

      <WarrantyClaimFormModal
        open={showClaimModal}
        onClose={closeClaimModal}
        projectId={projectId}
        warranties={warranties}
        defaultWarrantyId={claimDefaultWarrantyId}
        editingClaim={editingClaim}
        canViewCosts={canViewCosts}
        currentUserId={meQ.data?.id}
        onSuccess={invalidateAll}
      />

      <WarrantyClaimCancelModal
        open={showClaimCancelModal}
        onClose={closeClaimCancelModal}
        projectId={projectId}
        claimId={cancellingClaim?.id || ''}
        claimNumber={cancellingClaim?.claim_number || ''}
        onSuccess={() => {
          invalidateAll();
          setViewClaimId(null);
        }}
      />
    </>
  );

  if (designSystem) {
    return (
      <>
        <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
          <AppSectionHeader
            title="Warranties"
            description="Coverage, maintenance, documents and claims"
            {...appSectionPresetProps('warranties')}
            action={headerActions}
          />
          <div className={uiCx('mt-4 min-w-0', uiSpacing.sectionStack)}>{tabBody}</div>
        </AppCard>
        {modals}
      </>
    );
  }

  return (
    <div className={uiCx(uiSpacing.pageStack, 'min-w-0')}>
      <div className={uiCx(uiLayout.actionsRow, 'items-center justify-between gap-3')}>
        <div className="min-w-0">
          <h2 className={uiTypography.sectionTitle}>Warranties</h2>
          <p className={uiTypography.sectionSubtitle}>Coverage, maintenance, documents and claims</p>
        </div>
        {headerActions}
      </div>
      {tabBody}
      {modals}
    </div>
  );
}
