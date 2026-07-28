import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mapEmployeeToAppUserSelect } from '@/lib/clientUi';
import { projectWarrantyClaimDetailQuickInfo } from '@/lib/formModalQuickInfo';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import {
  CLAIM_SEVERITY_LABELS,
  CLAIM_STATUS_LABELS,
  COST_RESPONSIBILITY_LABELS,
  COVERAGE_DECISION_LABELS,
  claimSeverityBadgeVariant,
  claimStatusBadgeVariant,
} from '@/lib/warrantyLabels';
import type { WarrantyClaimEditSource } from '@/components/warranties/WarrantyClaimFormModal';

type WarrantyOption = { id: string; name: string };

type WarrantyClaimDetail = WarrantyClaimEditSource;

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  claimId: string | null;
  canWrite: boolean;
  canViewCosts: boolean;
  warranties: WarrantyOption[];
  onEdit: (claim: WarrantyClaimEditSource) => void;
  onCancel: (claim: WarrantyClaimEditSource) => void;
};

function ClaimDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5">
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

function formatDate(s?: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function formatCurrency(n?: number | null) {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}

function formatBool(v?: boolean | null) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

export default function WarrantyClaimDetailModal({
  open,
  onClose,
  projectId,
  claimId,
  canWrite,
  canViewCosts,
  warranties,
  onEdit,
  onCancel,
}: Props) {
  const detailQ = useQuery({
    queryKey: ['projectWarrantyClaim', projectId, claimId],
    queryFn: () => api<WarrantyClaimDetail>('GET', `/projects/${projectId}/warranty-claims/${claimId}`),
    enabled: open && Boolean(claimId),
  });

  const membersQ = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => api<Record<string, unknown>[]>('GET', `/projects/${projectId}/members`),
    enabled: open && Boolean(claimId),
  });

  const employeesQ = useQuery({
    queryKey: ['employeesDirectory', 'all'],
    queryFn: () => api<Record<string, unknown>[]>('GET', '/employees?limit=5000'),
    staleTime: 300_000,
    enabled: open && Boolean(claimId),
  });

  const claim = detailQ.data;

  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    const employees = employeesQ.data || [];
    employees.forEach((e) => {
      const u = mapEmployeeToAppUserSelect(e);
      map.set(u.id, u.name);
    });
    (membersQ.data || []).forEach((m) => {
      const uid = String(m.user_id || m.id || '');
      if (!uid) return;
      const name = String(m.display_name || m.name || m.username || '');
      if (name) map.set(uid, name);
    });
    return map;
  }, [employeesQ.data, membersQ.data]);

  const warrantyName = useMemo(() => {
    if (!claim?.warranty_id) return '—';
    return warranties.find((w) => w.id === claim.warranty_id)?.name || '—';
  }, [claim?.warranty_id, warranties]);

  const resolveUserName = (id?: string | null) => {
    if (!id) return null;
    return userNameById.get(id) || id;
  };

  const isCancelled = Boolean(claim?.cancelled_at);
  const canEdit = canWrite && claim && !isCancelled;
  const canCancelClaim =
    canWrite && claim && !isCancelled && claim.status !== 'closed' && claim.status !== 'resolved';

  return (
    <AppFormModal
      open={open}
      onClose={onClose}
      layout="detail"
      size="md"
      title={claim?.claim_number || 'Claim details'}
      description="Status, coverage assessment, resolution and costs for this warranty claim."
      quickInfo={projectWarrantyClaimDetailQuickInfo}
      bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </AppButton>
          {canCancelClaim && claim ? (
            <AppButton type="button" variant="secondary" size="sm" onClick={() => onCancel(claim)}>
              Cancel claim
            </AppButton>
          ) : null}
          {canEdit && claim ? (
            <AppButton
              type="button"
              size="sm"
              onClick={() => {
                onEdit(claim);
                onClose();
              }}
            >
              Edit
            </AppButton>
          ) : null}
        </div>
      }
    >
      {detailQ.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className={uiTypography.helper}>Loading claim…</p>
        </div>
      ) : detailQ.isError ? (
        <p className="text-sm text-red-600">{(detailQ.error as Error)?.message || 'Failed to load claim'}</p>
      ) : claim ? (
        <div className={uiSpacing.sectionStack}>
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <ClaimDetailField label="Status">
                <AppBadge variant={claimStatusBadgeVariant(claim.status)}>
                  {CLAIM_STATUS_LABELS[claim.status] || claim.status}
                </AppBadge>
              </ClaimDetailField>
              <ClaimDetailField label="Severity">
                <AppBadge variant={claimSeverityBadgeVariant(claim.severity)}>
                  {CLAIM_SEVERITY_LABELS[claim.severity] || claim.severity}
                </AppBadge>
              </ClaimDetailField>
              <ClaimDetailField label="Related warranty">{warrantyName}</ClaimDetailField>
              <ClaimDetailField label="Reported date">{formatDate(claim.reported_date)}</ClaimDetailField>
              <ClaimDetailField label="Issue location">{claim.issue_location || '—'}</ClaimDetailField>
              <ClaimDetailField label="Description">
                <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.description}</span>
              </ClaimDetailField>
            </dl>
          </AppCard>

          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Assignment</h3>
            <dl className="min-w-0">
              <ClaimDetailField label="Assigned to">
                {claim.assigned_user_id ? (
                  resolveUserName(claim.assigned_user_id)
                ) : (
                  <span className="text-amber-700">Attention required</span>
                )}
              </ClaimDetailField>
            </dl>
          </AppCard>

          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Assessment</h3>
            <dl className="min-w-0">
              <ClaimDetailField label="Coverage decision">
                {COVERAGE_DECISION_LABELS[claim.coverage_decision] || claim.coverage_decision}
              </ClaimDetailField>
              <ClaimDetailField label="Decision date">{formatDate(claim.decision_date)}</ClaimDetailField>
              {claim.assessment_notes ? (
                <ClaimDetailField label="Assessment notes">
                  <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.assessment_notes}</span>
                </ClaimDetailField>
              ) : null}
              {claim.denial_reason ? (
                <ClaimDetailField label="Denial reason">
                  <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.denial_reason}</span>
                </ClaimDetailField>
              ) : null}
              <ClaimDetailField label="Customer notified">{formatDate(claim.customer_notified_date)}</ClaimDetailField>
            </dl>
          </AppCard>

          {(claim.root_cause ||
            claim.work_performed ||
            claim.resolution_notes ||
            claim.completion_date ||
            claim.resolved_by_user_id ||
            claim.customer_confirmation != null) && (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Resolution</h3>
              <dl className="min-w-0">
                {claim.root_cause ? (
                  <ClaimDetailField label="Root cause">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.root_cause}</span>
                  </ClaimDetailField>
                ) : null}
                {claim.work_performed ? (
                  <ClaimDetailField label="Work performed">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.work_performed}</span>
                  </ClaimDetailField>
                ) : null}
                {claim.resolution_notes ? (
                  <ClaimDetailField label="Resolution notes">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.resolution_notes}</span>
                  </ClaimDetailField>
                ) : null}
                <ClaimDetailField label="Completion date">{formatDate(claim.completion_date)}</ClaimDetailField>
                <ClaimDetailField label="Resolved by">{resolveUserName(claim.resolved_by_user_id) || '—'}</ClaimDetailField>
                <ClaimDetailField label="Customer confirmation">{formatBool(claim.customer_confirmation)}</ClaimDetailField>
              </dl>
            </AppCard>
          )}

          {(claim.follow_up_required || claim.follow_up_date) && (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Follow-up</h3>
              <dl className="min-w-0">
                <ClaimDetailField label="Follow-up required">{claim.follow_up_required ? 'Yes' : 'No'}</ClaimDetailField>
                <ClaimDetailField label="Follow-up date">{formatDate(claim.follow_up_date)}</ClaimDetailField>
              </dl>
            </AppCard>
          )}

          {canViewCosts &&
          (claim.labour_cost != null ||
            claim.material_cost != null ||
            claim.subcontractor_cost != null ||
            claim.other_cost != null ||
            claim.total_internal_cost != null ||
            claim.amount_charged_to_customer != null ||
            claim.recoverable_amount != null ||
            claim.cost_responsibility) ? (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <h3 className={uiCx(uiTypography.sectionTitle, 'mb-3')}>Costs</h3>
              <dl className="min-w-0">
                <ClaimDetailField label="Labour">{formatCurrency(claim.labour_cost)}</ClaimDetailField>
                <ClaimDetailField label="Material">{formatCurrency(claim.material_cost)}</ClaimDetailField>
                <ClaimDetailField label="Subcontractor">{formatCurrency(claim.subcontractor_cost)}</ClaimDetailField>
                <ClaimDetailField label="Other">{formatCurrency(claim.other_cost)}</ClaimDetailField>
                <ClaimDetailField label="Total internal">{formatCurrency(claim.total_internal_cost)}</ClaimDetailField>
                <ClaimDetailField label="Charged to customer">
                  {formatCurrency(claim.amount_charged_to_customer)}
                </ClaimDetailField>
                <ClaimDetailField label="Recoverable">{formatCurrency(claim.recoverable_amount)}</ClaimDetailField>
                <ClaimDetailField label="Cost responsibility">
                  {claim.cost_responsibility
                    ? COST_RESPONSIBILITY_LABELS[claim.cost_responsibility] || claim.cost_responsibility
                    : '—'}
                </ClaimDetailField>
              </dl>
            </AppCard>
          ) : null}

          {isCancelled ? (
            <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
              <dl className="min-w-0">
                <ClaimDetailField label="Cancelled at">{formatDate(claim.cancelled_at)}</ClaimDetailField>
                {claim.cancelled_reason ? (
                  <ClaimDetailField label="Cancellation reason">
                    <span className="whitespace-pre-wrap font-normal text-gray-700">{claim.cancelled_reason}</span>
                  </ClaimDetailField>
                ) : null}
              </dl>
            </AppCard>
          ) : null}
        </div>
      ) : null}
    </AppFormModal>
  );
}
