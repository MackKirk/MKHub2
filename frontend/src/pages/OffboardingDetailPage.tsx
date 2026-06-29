import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
import { fmtDate, type OffboardingDetail } from '@/components/offboarding/offboardingUtils';
import {
  AppButton,
  AppCard,
  AppPageHeader,
  AppTabs,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'assets', label: 'Assets & Returns' },
  { id: 'work', label: 'Work & Assignments' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'activity', label: 'Activity Log' },
] as const;

type TabId = (typeof TABS)[number]['id'];

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

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const canWrite = useMemo(() => {
    if (!me) return false;
    if ((me.roles || []).includes('admin')) return true;
    const perms = me.permissions || [];
    return perms.includes('hr:offboarding:write') || perms.includes('users:write');
  }, [me]);

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

  if (isLoading || !detail) {
    return <div className="p-6 text-sm text-gray-500">Loading offboarding case…</div>;
  }

  const s = detail.operational_summary as Record<string, number>;
  const showDeactivate =
    canWrite &&
    detail.status === 'in_progress' &&
    detail.access_revocation_timing === 'manually_later' &&
    detail.hub_access_active;
  const showComplete = canWrite && detail.status === 'in_progress';
  const showCancel = canWrite && (detail.status === 'draft' || detail.status === 'in_progress');
  const showStart = canWrite && detail.status === 'draft';
  const showEdit = canWrite && detail.status !== 'completed' && detail.status !== 'cancelled';

  return (
    <div className={uiCx(uiLayout.pageStack, uiSpacing.sectionGap)}>
      <AppPageHeader
        title={`${detail.employee_name} — Offboarding`}
        subtitle={[detail.position, detail.division].filter(Boolean).join(' · ') || undefined}
        onBack={() => navigate('/human-resources/offboarding')}
      />

      <AppCard className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div><span className="text-gray-500">Manager:</span> {detail.manager_name || '—'}</div>
          <div><span className="text-gray-500">Termination Date:</span> {fmtDate(detail.termination_date)}</div>
          <div><span className="text-gray-500">Last Working Day:</span> {fmtDate(detail.last_working_day)}</div>
          <div><span className="text-gray-500">Termination Type:</span> {detail.termination_type || '—'}</div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Hub Access:</span>
            <HubAccessBadge active={detail.hub_access_active} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-500">Status:</span>
            <OffboardingStatusBadge status={detail.status} actionRequired={detail.action_required} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
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
          <Link className="text-sm text-brand-red hover:underline self-center" to={`/users/${encodeURIComponent(detail.user_id)}`}>
            View Employee
          </Link>
        </div>
      </AppCard>

      <AppTabs
        tabs={TABS.map((t) => ({ key: t.id, label: t.label }))}
        value={tab}
        onChange={(id) => setSearchParams({ tab: id })}
      />

      <AppCard className="p-4">
        {tab === 'overview' ? <OffboardingOverviewTab detail={detail} /> : null}
        {tab === 'assets' ? <OffboardingAssetsTab caseId={caseId} /> : null}
        {tab === 'work' ? <OffboardingWorkTab detail={detail} /> : null}
        {tab === 'checklist' ? (
          <OffboardingChecklistTab caseId={caseId} canEdit={canWrite} status={detail.status} />
        ) : null}
        {tab === 'activity' ? <OffboardingActivityLogTab caseId={caseId} /> : null}
      </AppCard>

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
    </div>
  );
}
