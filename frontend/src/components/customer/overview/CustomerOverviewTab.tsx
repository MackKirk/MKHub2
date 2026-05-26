import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useCustomerOverviewData } from './useCustomerOverviewData';
import { CustomerOverviewToolbar } from './CustomerOverviewToolbar';
import { CustomerOverviewAccountStrip } from './CustomerOverviewAccountStrip';
import { CustomerOverviewKpiStrip } from './CustomerOverviewKpiStrip';
import { CustomerOverviewTimeline } from './CustomerOverviewTimeline';
import { CustomerOverviewPipelineFunnel } from './CustomerOverviewPipelineFunnel';
import { CustomerOverviewPortfolioMix } from './CustomerOverviewPortfolioMix';
import { CustomerOverviewSignals } from './CustomerOverviewSignals';
import {
  CustomerOverviewAtRiskProjects,
  CustomerOverviewTopOpportunities,
} from './CustomerOverviewRankedLists';
import { CustomerOverviewActivity } from './CustomerOverviewActivity';
import { CustomerOverviewRelated } from './CustomerOverviewRelated';
import {
  CustomerOverviewProjectListModal,
  CustomerOverviewRelatedModal,
} from './CustomerOverviewModals';
import { buildAccountSignals } from './buildAccountSignals';
import { presetToRange } from './customerOverviewUtils';
import type { OverviewDatePreset, OverviewDisplayMode, OverviewKpiModalKind } from './customerOverviewTypes';

const DEFAULT_PRESET: OverviewDatePreset = '12mo';

function presetForRange(from: string, to: string): OverviewDatePreset {
  const candidates: OverviewDatePreset[] = ['7d', '14d', '30d', '90d', '12mo'];
  for (const id of candidates) {
    const r = presetToRange(id);
    if (r.date_from === from && r.date_to === to) return id;
  }
  if (!from && !to) return 'all';
  return 'custom';
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm min-w-0 w-full h-full min-h-[148px] flex flex-col gap-2">
      <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
      <div className="h-5 w-20 bg-gray-100 rounded animate-pulse" />
      <div className="h-8 w-28 bg-gray-100 rounded animate-pulse" />
      <div className="flex-1 min-h-[32px] bg-gray-50 rounded animate-pulse" />
      <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

function SectionSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="h-4 w-40 bg-gray-100 rounded animate-pulse mb-3" />
      <div className="bg-gray-50 rounded animate-pulse" style={{ height }} />
    </div>
  );
}

type ClientRecord = {
  id?: string;
  display_name?: string;
  name?: string;
  client_status?: string;
  client_type?: string;
  created_at?: string;
};

type Contact = { id: string; name?: string; email?: string; is_primary?: boolean };

export function CustomerOverviewTab({
  clientId,
  client,
  onTabChange,
}: {
  clientId: string;
  client?: ClientRecord;
  onTabChange: (tab: 'contacts' | 'sites' | 'opportunities') => void;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialPreset = (searchParams.get('overviewPreset') as OverviewDatePreset) || DEFAULT_PRESET;
  const initialFrom =
    searchParams.get('overviewFrom') || presetToRange(initialPreset === 'custom' ? '12mo' : initialPreset).date_from || '';
  const initialTo =
    searchParams.get('overviewTo') || presetToRange(initialPreset === 'custom' ? '12mo' : initialPreset).date_to || '';
  const initialMode = (searchParams.get('overviewMode') as OverviewDisplayMode) || 'value';

  const [preset, setPreset] = useState<OverviewDatePreset>(() =>
    initialPreset === 'custom' && initialFrom ? 'custom' : presetForRange(initialFrom, initialTo),
  );
  const [dateFrom, setDateFrom] = useState(initialFrom);
  const [dateTo, setDateTo] = useState(initialTo);
  const [displayMode, setDisplayMode] = useState<OverviewDisplayMode>(initialMode);
  const [kpiModal, setKpiModal] = useState<OverviewKpiModalKind>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  const { data: contacts } = useQuery({
    queryKey: ['clientContacts', clientId],
    queryFn: () => api<Contact[]>('GET', `/clients/${clientId}/contacts`),
  });
  const { data: sites } = useQuery({
    queryKey: ['clientSites', clientId],
    queryFn: () => api<unknown[]>('GET', `/clients/${clientId}/sites`),
  });

  const dateFromParam = dateFrom || undefined;
  const dateToParam = dateTo || undefined;

  const data = useCustomerOverviewData(clientId, dateFromParam, dateToParam, displayMode);

  useEffect(() => {
    if (!data.isLoading && !hasAnimated) {
      const t = setTimeout(() => setHasAnimated(true), 80);
      return () => clearTimeout(t);
    }
  }, [data.isLoading, hasAnimated]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('overviewPreset', preset);
    if (dateFrom) next.set('overviewFrom', dateFrom);
    else next.delete('overviewFrom');
    if (dateTo) next.set('overviewTo', dateTo);
    else next.delete('overviewTo');
    next.set('overviewMode', displayMode);
    setSearchParams(next, { replace: true });
  }, [preset, dateFrom, dateTo, displayMode]);

  const primaryContact = useMemo(
    () => contacts?.find((c) => c.is_primary) || contacts?.[0],
    [contacts],
  );

  const clientSince = data.clientSince || client?.created_at;

  const navigateProject = useCallback((id: string) => navigate(`/projects/${encodeURIComponent(id)}`), [navigate]);

  const signals = useMemo(
    () =>
      buildAccountSignals({
        filteredProjects: data.filteredProjects,
        filteredOpportunities: data.filteredOpportunities,
        projectValueMap: data.projectValueMap,
        oppValueMap: data.oppValueMap,
        relatedMemberships: data.relatedMemberships,
        displayMode,
        dateFrom: dateFromParam,
        dateTo: dateToParam,
        onOpenPipeline: () => setKpiModal('pipeline'),
        onOpenRelated: () => setKpiModal('related'),
        onNavigateProject: navigateProject,
        onOpenOpportunities: () => onTabChange('opportunities'),
      }),
    [data, displayMode, navigateProject, dateFromParam, dateToParam, onTabChange],
  );

  if (!client) {
    return <div className="h-24 animate-pulse bg-gray-100 rounded" />;
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      <CustomerOverviewToolbar
        preset={preset}
        onPresetChange={setPreset}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        onRefresh={() => data.refetch()}
        isRefreshing={data.isLoading}
      />

      {data.limitedDataNote ? (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {data.limitedDataNote}
        </p>
      ) : null}

      <CustomerOverviewAccountStrip
        client={client}
        contactsCount={contacts?.length ?? 0}
        sitesCount={sites?.length ?? 0}
        primaryContact={primaryContact}
        clientSince={clientSince}
        snapshot={data.relationshipSnapshot}
        displayMode={displayMode}
        onContactsClick={() => onTabChange('contacts')}
        onSitesClick={() => onTabChange('sites')}
      />

      {data.isLoading && !hasAnimated ? (
        <div className="grid gap-4 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-full min-h-0">
              <KpiSkeleton />
            </div>
          ))}
        </div>
      ) : (
        <CustomerOverviewKpiStrip
          kpis={data.kpis}
          kpiDeltas={data.kpiDeltas}
          displayMode={displayMode}
          sparklineClosed={data.sparklineClosed}
          sparklinePipeline={data.sparklinePipeline}
          onKpiClick={setKpiModal}
        />
      )}

      {data.isLoading && !hasAnimated ? (
        <SectionSkeleton height={260} />
      ) : (
        <CustomerOverviewTimeline
          displayMode={displayMode}
          timelineSeries={data.timelineSeries}
          isLoading={false}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.isLoading && !hasAnimated ? (
          <>
            <SectionSkeleton height={200} />
            <SectionSkeleton height={200} />
          </>
        ) : (
          <>
            <CustomerOverviewPipelineFunnel funnel={data.funnelMetrics} displayMode={displayMode} />
            <CustomerOverviewPortfolioMix
              byStatus={data.portfolioByStatus}
              byDivision={data.portfolioByDivision}
              displayMode={displayMode}
            />
          </>
        )}
      </div>

      {data.isLoading && !hasAnimated ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SectionSkeleton height={160} />
          <SectionSkeleton height={160} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CustomerOverviewSignals signals={signals} />
          <CustomerOverviewAtRiskProjects
            atRiskProjects={data.atRiskProjects}
            displayMode={displayMode}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.isLoading && !hasAnimated ? (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        ) : (
          <>
            <CustomerOverviewTopOpportunities
              topOpportunities={data.topOpportunities}
              displayMode={displayMode}
            />
            <CustomerOverviewActivity
              events={data.recentActivity}
              onCreateOpportunity={() => onTabChange('opportunities')}
            />
          </>
        )}
      </div>

      <CustomerOverviewRelated stats={data.relatedStats} onViewDetails={() => setKpiModal('related')} />

      <CustomerOverviewProjectListModal
        open={kpiModal === 'closed'}
        onClose={() => setKpiModal(null)}
        title="Finished projects"
        items={data.modalItems.closed}
        emptyMessage="No finished projects"
      />
      <CustomerOverviewProjectListModal
        open={kpiModal === 'pipeline'}
        onClose={() => setKpiModal(null)}
        title="Open opportunities"
        items={data.modalItems.pipeline}
        emptyMessage="No open opportunities"
      />
      <CustomerOverviewProjectListModal
        open={kpiModal === 'inProgress'}
        onClose={() => setKpiModal(null)}
        title="In progress projects"
        items={data.modalItems.inProgress}
        emptyMessage="No in progress projects"
      />
      <CustomerOverviewProjectListModal
        open={kpiModal === 'onHold'}
        onClose={() => setKpiModal(null)}
        title="On hold projects"
        items={data.modalItems.onHold}
        emptyMessage="No on hold projects"
      />
      <CustomerOverviewRelatedModal
        open={kpiModal === 'related'}
        onClose={() => setKpiModal(null)}
        memberships={data.relatedMemberships}
      />
    </div>
  );
}
