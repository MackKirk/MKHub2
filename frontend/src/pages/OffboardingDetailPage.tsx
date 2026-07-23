import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ExternalLink, UserMinus } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import StartOffboardingModal from '@/components/offboarding/StartOffboardingModal';
import OffboardingOverviewTab from '@/components/offboarding/OffboardingOverviewTab';
import OffboardingAssetsTab from '@/components/offboarding/OffboardingAssetsTab';
import OffboardingWorkTab from '@/components/offboarding/OffboardingWorkTab';
import OffboardingChecklistTab from '@/components/offboarding/OffboardingChecklistTab';
import OffboardingActivityLogTab from '@/components/offboarding/OffboardingActivityLogTab';
import OffboardingCompleteModal from '@/components/offboarding/OffboardingCompleteModal';
import OffboardingCancelModal from '@/components/offboarding/OffboardingCancelModal';
import { HubAccessBadge, OffboardingStatusBadge } from '@/components/offboarding/OffboardingStatusBadge';
import {
  accessRevocationLabel,
  fmtDate,
  fmtDateTime,
  terminationTypeLabel,
  type OffboardingDetail,
} from '@/components/offboarding/offboardingUtils';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppButton,
  AppCard,
  AppEmptyState,
  AppPageHeader,
  AppSectionHeader,
  AppTabs,
  appSectionPresetProps,
  uiBorders,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'assets', label: 'Assets & Returns' },
  { id: 'work', label: 'Work & Assignments' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'activity', label: 'Activity Log' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={uiTypography.overline}>{label}</div>
      <div className={uiCx(uiTypography.helper, 'mt-0.5 font-semibold text-gray-900')}>{children}</div>
    </div>
  );
}

export default function OffboardingDetailPage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const tab = (searchParams.get('tab') as TabId) || 'overview';
  const [editOpen, setEditOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);



  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const canWrite = useMemo(() => {
    if (!me) return false;
    if ((me.roles || []).includes('admin')) return true;
    const perms = me.permissions || [];
    return perms.includes('hr:offboarding:write') || perms.includes('users:write');
  }, [me]);

  const isAdmin = useMemo(
    () => !!(me?.roles || []).some((r: string) => String(r || '').toLowerCase() === 'admin'),
    [me],
  );

  const { data: detail, isLoading, refetch } = useQuery({
    queryKey: ['offboarding', caseId],
    queryFn: () => api<OffboardingDetail>('GET', `/offboarding/${encodeURIComponent(caseId)}`),
    enabled: !!caseId,
  });

  useEffect(() => {
    if (!TABS.some((t) => t.id === tab)) {
      setSearchParams({ tab: 'overview' }, { replace: true });
    }
  }, [tab, setSearchParams]);

  const handleDeactivate = async () => {
    const result = await confirm({
      title: 'Deactivate Hub Access',
      message: 'This will immediately set the employee to Inactive and revoke Hub access. Continue?',
      confirmText: 'Deactivate',
    });
    if (result !== 'confirm') return;
    setActionLoading(true);
    try {
      await api('POST', `/offboarding/${encodeURIComponent(caseId)}/deactivate-access`, {
        reason: 'Manual offboarding access revocation',
      });
      toast.success('Hub access deactivated');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['offboarding-activity', caseId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to deactivate access');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      await api('POST', `/offboarding/${encodeURIComponent(caseId)}/complete`);
      toast.success('Offboarding completed');
      setCompleteOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Cannot complete offboarding');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (opts: {
    clearTerminationDate: boolean;
    reactivateHubAccess: boolean;
    reason: string;
  }) => {
    setActionLoading(true);
    try {
      await api('POST', `/offboarding/${encodeURIComponent(caseId)}/cancel`, {
        clear_termination_date: opts.clearTerminationDate,
        reactivate_hub_access: opts.reactivateHubAccess,
        reason: opts.reason || undefined,
      });
      toast.success('Offboarding cancelled');
      setCancelOpen(false);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!detail || deleting) return;
    const result = await confirm({
      title: 'Delete offboarding',
      message: `Permanently delete the offboarding case for "${detail.employee_name}"? All checklist items, asset links, and activity log entries will be removed. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });
    if (result !== 'confirm') return;
    setDeleting(true);
    try {
      await api('DELETE', `/offboarding/${encodeURIComponent(caseId)}`);
      toast.success('Offboarding case deleted');
      queryClient.invalidateQueries({ queryKey: ['offboarding'] });
      navigate('/human-resources/offboarding');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete offboarding case');
    } finally {
      setDeleting(false);
    }
  };

  if (!caseId) {
    return (
      <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
        <AppEmptyState title="Offboarding case not found" />
      </div>
    );
  }

  const s = (detail?.operational_summary || {}) as Record<string, number>;
  const showDeactivate =
    canWrite &&
    detail?.status === 'in_progress' &&
    detail.access_revocation_timing === 'manually_later' &&
    detail.hub_access_active;
  const showComplete = canWrite && detail?.status === 'in_progress';
  const showCancel = canWrite && (detail?.status === 'draft' || detail?.status === 'in_progress');
  const showStart = canWrite && detail?.status === 'draft';
  const showEdit = canWrite && detail?.status !== 'completed' && detail?.status !== 'cancelled';

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <LoadingOverlay isLoading={isLoading && !detail} text="Loading offboarding case…">
        {detail ? (
          <>
            <AppPageHeader
              title={detail.employee_name}
              subtitle={
                [detail.position, detail.division].filter(Boolean).join(' · ') ||
                'Employee offboarding case'
              }
              icon={<UserMinus className="h-4 w-4" />}
              onBack={() => navigate('/human-resources/offboarding')}
              backLabel="Back to Offboarding"
            />

            <AppCard bodyClassName={uiSpacing.cardPadding}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
                <MetaField label="Manager">{detail.manager_name || '—'}</MetaField>
                <MetaField label="Termination Date">{fmtDate(detail.termination_date)}</MetaField>
                <MetaField label="Last Working Day">{fmtDate(detail.last_working_day)}</MetaField>
                <MetaField label="Termination Type">{terminationTypeLabel(detail.termination_type)}</MetaField>
                <MetaField label="Access Revocation">{accessRevocationLabel(detail.access_revocation_timing)}</MetaField>
                {detail.access_revocation_timing === 'scheduled' && detail.access_revoke_at_local ? (
                  <MetaField label="Scheduled Revocation">
                    {fmtDateTime(detail.access_revoke_at_local)}
                    <span className="ml-1 font-normal text-gray-500">({detail.company_timezone})</span>
                  </MetaField>
                ) : null}
                <div className="min-w-0">
                  <div className={uiTypography.overline}>Hub Access</div>
                  <div className="mt-1">
                    <HubAccessBadge active={detail.hub_access_active} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className={uiTypography.overline}>Status</div>
                  <div className="mt-1">
                    <OffboardingStatusBadge status={detail.status} actionRequired={detail.action_required} />
                  </div>
                </div>
              </div>

              <div className={uiCx(uiLayout.actionsRow, 'mt-4 flex-wrap border-t border-gray-100 pt-4')}>
                {showEdit ? (
                  <AppButton variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                    Edit Offboarding
                  </AppButton>
                ) : null}
                {showStart ? (
                  <AppButton size="sm" onClick={() => setEditOpen(true)}>
                    Start Offboarding
                  </AppButton>
                ) : null}
                {showDeactivate ? (
                  <AppButton variant="danger" size="sm" onClick={handleDeactivate} loading={actionLoading}>
                    Deactivate Hub Access
                  </AppButton>
                ) : null}
                {showComplete ? (
                  <AppButton size="sm" onClick={() => setCompleteOpen(true)}>
                    Complete Offboarding
                  </AppButton>
                ) : null}
                {showCancel ? (
                  <AppButton variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                    Cancel Offboarding
                  </AppButton>
                ) : null}
                <AppButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                  onClick={() => navigate(`/users/${encodeURIComponent(detail.user_id)}`)}
                >
                  View Employee
                </AppButton>
              </div>
            </AppCard>

            <AppCard bodyClassName="!py-3">
              <AppTabs
                tabs={TABS.map((t) => ({ key: t.id, label: t.label }))}
                value={tab}
                onChange={(id) => setSearchParams({ tab: id })}
              />
            </AppCard>

            <AppCard bodyClassName="min-w-0 overflow-hidden">
              {tab === 'overview' ? <OffboardingOverviewTab detail={detail} /> : null}
              {tab === 'assets' ? <OffboardingAssetsTab caseId={caseId} /> : null}
              {tab === 'work' ? <OffboardingWorkTab detail={detail} /> : null}
              {tab === 'checklist' ? (
                <OffboardingChecklistTab caseId={caseId} canEdit={canWrite} status={detail.status} />
              ) : null}
              {tab === 'activity' ? <OffboardingActivityLogTab caseId={caseId} /> : null}
            </AppCard>

            {isAdmin ? (
              <AppCard className={uiCx(uiBorders.subtle, 'border-red-200 bg-red-50')}>
                <AppSectionHeader
                  title="Danger Zone"
                  description="Permanent actions that cannot be undone. System administrators only."
                  {...appSectionPresetProps('emergency')}
                />
                <div className={uiCx(uiLayout.actionsRow, 'mt-3 flex-wrap')}>
                  <AppButton
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={deleting}
                    disabled={deleting}
                    onClick={handleDelete}
                  >
                    Delete offboarding
                  </AppButton>
                </div>
              </AppCard>
            ) : null}

            <StartOffboardingModal
              open={editOpen}
              onClose={() => setEditOpen(false)}
              initial={detail}
              mode="edit"
              onSaved={() => {
                refetch();
                setEditOpen(false);
              }}
            />

            <OffboardingCompleteModal
              open={completeOpen}
              onClose={() => setCompleteOpen(false)}
              onConfirm={handleComplete}
              loading={actionLoading}
              hubAccessActive={detail.hub_access_active}
              accessRevocationTiming={detail.access_revocation_timing}
              accessRevokeAtLocal={detail.access_revoke_at_local}
              companyTimezone={detail.company_timezone}
              assetsPending={s.assets_pending_return || 0}
              futureShifts={s.future_shifts || 0}
              pendingTimesheets={s.pending_timesheets || 0}
              projectRoles={(s.project_admin_roles || 0) + (s.onsite_lead_roles || 0)}
              blockers={detail.completion_blockers}
              warnings={detail.completion_warnings}
            />

            <OffboardingCancelModal
              open={cancelOpen}
              onClose={() => setCancelOpen(false)}
              onConfirm={handleCancel}
              loading={actionLoading}
            />
          </>
        ) : null}
      </LoadingOverlay>
    </div>
  );
}
