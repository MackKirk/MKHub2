import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import ProposalForm from '@/components/ProposalForm';
import {
  hasProjectFeatureWritePermission,
  isAdminRole,
  resolveProjectBusinessLine,
} from '@/lib/projectLinePermissionKeys';
import {
  AppCard,
  AppSectionHeader,
  AppTabs,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

export type Proposal = {
  id: string;
  title?: string;
  order_number?: string;
  created_at?: string;
  data?: any;
  is_change_order?: boolean;
  change_order_number?: number;
  parent_proposal_id?: string;
  approved_report_id?: string;
  approval_status?: string;
};

export type ProjectProposalTabProps = {
  projectId: string;
  clientId: string;
  siteId?: string;
  proposals: Proposal[];
  statusLabel: string;
  businessLine?: string | null;
  settings: any;
  isBidding?: boolean;
  onPricingItemsChange?: (items: any[]) => void;
  showOnlyPricing?: boolean;
  proposalFormSaveRef?: MutableRefObject<(() => Promise<void>) | undefined>;
  designSystem?: boolean;
};

export default function ProjectProposalTab({
  projectId,
  clientId,
  siteId,
  proposals,
  statusLabel,
  businessLine,
  settings: _settings,
  isBidding,
  onPricingItemsChange,
  showOnlyPricing = false,
  proposalFormSaveRef,
  designSystem = false,
}: ProjectProposalTabProps) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState<string>('proposal');

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = isAdminRole(me?.roles);
  const permissions = new Set<string>(me?.permissions || []);
  const resolvedBusinessLine = resolveProjectBusinessLine(businessLine, location.pathname);
  const hasEditProposalPermission = hasProjectFeatureWritePermission(
    permissions,
    resolvedBusinessLine,
    'proposal',
    isAdmin,
    location.pathname
  );

  const organizedProposals = useMemo(() => {
    const original = proposals.find((p) => !p.is_change_order);
    const changeOrders = proposals
      .filter((p) => p.is_change_order)
      .sort((a, b) => (a.change_order_number || 0) - (b.change_order_number || 0));
    return { original: original || null, changeOrders };
  }, [proposals]);

  const selectedProposal = useMemo(() => {
    if (selectedTab === 'proposal') return organizedProposals.original;
    if (selectedTab.startsWith('change-order-')) {
      const orderNum = parseInt(selectedTab.replace('change-order-', ''), 10);
      return organizedProposals.changeOrders.find((co) => co.change_order_number === orderNum);
    }
    return null;
  }, [selectedTab, organizedProposals]);

  const { data: proposalData, isLoading: isLoadingProposal } = useQuery({
    queryKey: ['proposal', selectedProposal?.id],
    queryFn: () =>
      selectedProposal?.id ? api<any>('GET', `/proposals/${selectedProposal.id}`) : Promise.resolve(null),
    enabled: !!selectedProposal?.id,
  });

  useEffect(() => {
    if (organizedProposals.original && !selectedTab) setSelectedTab('proposal');
    else if (
      organizedProposals.changeOrders.length > 0 &&
      !organizedProposals.original &&
      selectedTab === 'proposal'
    ) {
      setSelectedTab(`change-order-${organizedProposals.changeOrders[0].change_order_number}`);
    }
  }, [organizedProposals, selectedTab]);

  const { refetch: refetchProposals } = useQuery({
    queryKey: ['projectProposals', projectId],
    queryFn: () => api<Proposal[]>('GET', `/proposals?project_id=${encodeURIComponent(String(projectId || ''))}`),
  });

  const statusAllowsProposalEdit = useMemo(() => {
    if (!statusLabel?.trim()) return true;
    const statusLabelLower = statusLabel.toLowerCase().trim();
    if (isBidding) {
      return statusLabelLower === 'prospecting';
    }
    return statusLabelLower === 'in progress';
  }, [statusLabel, isBidding]);

  const canEdit = useMemo(() => {
    if (!hasEditProposalPermission) return false;
    if (selectedTab.startsWith('change-order-')) {
      const orderNum = parseInt(selectedTab.replace('change-order-', ''), 10);
      const changeOrder = organizedProposals.changeOrders.find((co) => co.change_order_number === orderNum);
      if (changeOrder) {
        const approvalStatus =
          changeOrder.approval_status || (changeOrder.approved_report_id ? 'approved' : null);
        if (approvalStatus === 'approved') return false;
        return true;
      }
    }
    if (selectedTab === 'create-change-order') return hasEditProposalPermission;
    return statusAllowsProposalEdit;
  }, [
    hasEditProposalPermission,
    statusAllowsProposalEdit,
    selectedTab,
    organizedProposals,
  ]);

  const restrictionMessage = useMemo(() => {
    if (canEdit) return undefined;
    if (
      selectedTab.startsWith('change-order-') &&
      selectedProposal?.approval_status === 'approved'
    ) {
      return 'This Change Order has been approved and cannot be edited.';
    }
    if (!hasEditProposalPermission) {
      return 'You do not have permission to edit proposals or pricing for this business line.';
    }
    if (!statusAllowsProposalEdit && statusLabel && !selectedTab.startsWith('change-order-')) {
      return isBidding
        ? `This opportunity has status "${statusLabel}" which does not allow editing proposals or pricing. Editing is allowed while status is Prospecting.`
        : `This project has status "${statusLabel}" which does not allow editing proposals or estimates. Editing is allowed while status is In Progress.`;
    }
    return undefined;
  }, [
    canEdit,
    hasEditProposalPermission,
    statusAllowsProposalEdit,
    statusLabel,
    isBidding,
    selectedTab,
    selectedProposal?.approval_status,
  ]);

  const proposalTabs = useMemo(() => {
    const tabs: { key: string; label: string }[] = [];
    if (organizedProposals.original) {
      tabs.push({ key: 'proposal', label: showOnlyPricing ? 'Pricing' : 'Proposal' });
    }
    organizedProposals.changeOrders.forEach((co) => {
      tabs.push({ key: `change-order-${co.change_order_number}`, label: `Change Order ${co.change_order_number}` });
    });
    return tabs;
  }, [organizedProposals, showOnlyPricing]);

  const sectionPreset = showOnlyPricing ? 'pricing' : 'proposal';
  const sectionTitle = showOnlyPricing ? 'Pricing' : 'Proposal';
  const sectionDescription = showOnlyPricing
    ? 'Pricing items and optional services for this opportunity.'
    : 'Full proposal with General Information, Sections, Pricing, Optional Services, and Terms.';

  const formContent =
    selectedTab === 'create-change-order' ? (
      <div className={uiCx(designSystem ? uiTypography.helper : 'text-center text-gray-500', 'py-6 text-center')}>
        <p className="mb-3 text-xs">Click the &quot;+ Create Change Order&quot; tab to create a new Change Order.</p>
        <p className="text-[10px]">The Change Order will be created with General Information from the original Proposal.</p>
      </div>
    ) : isLoadingProposal && selectedProposal ? (
      <div className="h-20 animate-pulse rounded bg-gray-100" />
    ) : (
      <ProposalForm
        designSystem={designSystem}
        mode={selectedProposal ? 'edit' : 'new'}
        clientId={clientId}
        siteId={siteId}
        projectId={projectId}
        initial={proposalData || null}
        disabled={!canEdit}
        showOnlyPricing={showOnlyPricing}
        saveRef={proposalFormSaveRef}
        showRestrictionWarning={!canEdit && !!restrictionMessage}
        restrictionMessage={restrictionMessage}
        onPricingItemsChange={onPricingItemsChange}
        isBidding={isBidding}
        projectStatusLabel={statusLabel}
        onSave={async () => {
          await refetchProposals();
          queryClient.invalidateQueries({ queryKey: ['projectProposals', projectId] });
          const updatedProposals = await api<Proposal[]>(
            'GET',
            `/proposals?project_id=${encodeURIComponent(String(projectId))}`,
          );
          const updatedOrganized = {
            original: updatedProposals.find((p) => !p.is_change_order) || null,
            changeOrders: updatedProposals
              .filter((p) => p.is_change_order)
              .sort((a, b) => (a.change_order_number || 0) - (b.change_order_number || 0)),
          };
          if (selectedTab.startsWith('change-order-')) {
            const orderNum = parseInt(selectedTab.replace('change-order-', ''), 10);
            const stillExists = updatedOrganized.changeOrders.some(
              (co) => co.change_order_number === orderNum,
            );
            if (!stillExists) setSelectedTab('proposal');
          }
          if (Array.isArray(updatedProposals) && updatedProposals.length > 0) {
            const updatedProposal =
              updatedProposals.find((p) => p.id === selectedProposal?.id) || updatedProposals[0];
            queryClient.invalidateQueries({ queryKey: ['proposal', updatedProposal.id] });
            queryClient.refetchQueries({ queryKey: ['proposal', updatedProposal.id] });
          }
          queryClient.refetchQueries({ queryKey: ['projectProposals', projectId] });
          queryClient.invalidateQueries({ queryKey: ['project', projectId] });
          queryClient.invalidateQueries({ queryKey: ['projectRecentActivity', projectId] });
        }}
      />
    );

  if (designSystem) {
    return (
      <AppCard className="!rounded-2xl" bodyClassName={uiSpacing.cardPadding}>
        <AppSectionHeader
          title={sectionTitle}
          description={sectionDescription}
          {...appSectionPresetProps(sectionPreset)}
        />
        {!isBidding && proposalTabs.length > 0 && (
          <div className="mt-4">
            <AppTabs tabs={proposalTabs} value={selectedTab} onChange={setSelectedTab} />
          </div>
        )}
        <div className={uiCx(!isBidding && proposalTabs.length > 0 ? 'mt-4' : 'mt-4')}>{formContent}</div>
      </AppCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-100">
            <svg className="h-5 w-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">{sectionTitle}</h2>
        </div>
        {!isBidding && proposalTabs.length > 0 && (
          <div className="mb-4 border-b border-gray-200">
            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
              {proposalTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSelectedTab(tab.key)}
                  className={`whitespace-nowrap border-b-2 px-2 py-2 text-xs font-semibold ${
                    selectedTab === tab.key
                      ? 'border-brand-red text-brand-red'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        )}
        {formContent}
      </div>
    </div>
  );
}
