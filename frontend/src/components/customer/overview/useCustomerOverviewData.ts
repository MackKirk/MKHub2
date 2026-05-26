import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { computeDelta } from '@/components/community/insights/insightsTypes';
import type { SparklinePoint } from '@/components/insights';
import type {
  ActivityEvent,
  CustomerInsightsResponse,
  FunnelMetrics,
  KpiDeltas,
  OverviewDisplayMode,
  ParticipationProject,
  RankedAtRiskProject,
  RankedOpportunity,
  RelationshipSnapshot,
} from './customerOverviewTypes';
import { daysAgoLabel, daysSince, formatCurrency, isoLocalDate, statusNorm } from './customerOverviewUtils';

function effectiveRange(dateFrom?: string, dateTo?: string): { from: string; to: string } {
  const to = dateTo || isoLocalDate(new Date());
  const from = dateFrom || '2000-01-01';
  return { from, to };
}

function buildRelationshipSnapshot(
  rollup: ParticipationProject[],
  projectValues: Map<string, number>,
  kpis: CustomerInsightsResponse['kpis'],
  displayMode: OverviewDisplayMode,
  dateFrom: string,
  dateTo: string,
): RelationshipSnapshot {
  const projects = rollup.filter((p) => p.is_bidding !== true);
  const openOpps = rollup.filter((o) => {
    if (o.is_bidding !== true) return false;
    const s = statusNorm(o);
    return s === 'prospecting' || s === 'sent to customer';
  });

  const finishedInPeriod = projects.filter((p) => {
    if (statusNorm(p) !== 'finished') return false;
    const fd = (p.date_end || p.status_changed_at || p.created_at) as string | undefined;
    if (!fd) return false;
    const d = fd.slice(0, 10);
    return d >= dateFrom && d <= dateTo;
  });

  const wins = finishedInPeriod
    .map((p) => ({
      p,
      date: (p.date_end || p.status_changed_at || p.created_at) as string,
      value: Number(projectValues.get(p.id) || 0),
    }))
    .filter((w) => w.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const last = wins[0];
  const lastWinDate = last?.date ? new Date(last.date) : null;
  const daysWin = lastWinDate ? daysSince(lastWinDate.toISOString()) : null;

  const deliveredInPeriod = kpis.delivered_value;
  const pipelineValue = kpis.pipeline_value;
  const parts: string[] = [];
  if (displayMode === 'value') {
    parts.push(`${formatCurrency(deliveredInPeriod)} delivered in period`);
    parts.push(`${formatCurrency(pipelineValue)} in open pipeline`);
  } else {
    parts.push(`${kpis.delivered_count} finished in period`);
    parts.push(`${kpis.pipeline_count} open opportunities`);
  }
  if (daysWin != null) parts.push(`last win ${daysAgoLabel(daysWin)}`);
  else if (pipelineValue === 0 && deliveredInPeriod === 0) parts.push('no wins in this period');

  let nextMilestone: RelationshipSnapshot['nextMilestone'] = null;
  const inProgressWithEta = projects
    .filter((p) => statusNorm(p) === 'in progress' && p.date_eta)
    .sort((a, b) => new Date(a.date_eta!).getTime() - new Date(b.date_eta!).getTime());
  if (inProgressWithEta[0]) {
    const p = inProgressWithEta[0];
    nextMilestone = {
      label: `${p.name || p.code} — ETA ${formatDateShort(p.date_eta!)}`,
      id: p.id,
      kind: 'project',
    };
  } else if (openOpps.length > 0) {
    const top = [...openOpps].sort(
      (a, b) => Number(projectValues.get(b.id) || 0) - Number(projectValues.get(a.id) || 0),
    )[0];
    nextMilestone = {
      label: `${top.name || top.code} — largest open opportunity`,
      id: top.id,
      kind: 'opportunity',
    };
  }

  return {
    deliveredInPeriod,
    deliveredCount: kpis.delivered_count,
    pipelineValue,
    pipelineCount: kpis.pipeline_count,
    wipValue: kpis.wip_value,
    wipCount: kpis.wip_count,
    lastWinDate,
    lastWinValue: last?.value ?? 0,
    lastWinName: last ? (last.p.name || last.p.code || null) : null,
    summaryLine: parts.join(' · '),
    nextMilestone,
  };
}

function formatDateShort(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function useCustomerOverviewData(
  clientId: string,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  displayMode: OverviewDisplayMode,
) {
  const { from, to } = effectiveRange(dateFrom, dateTo);

  const insightsQuery = useQuery({
    queryKey: ['clientInsights', clientId, from, to],
    queryFn: () =>
      api<CustomerInsightsResponse>(
        'GET',
        `/clients/${encodeURIComponent(clientId)}/insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const payload = insightsQuery.data;

  const projectValueMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!payload?.project_values) return m;
    Object.entries(payload.project_values).forEach(([id, v]) => m.set(id, Number(v) || 0));
    return m;
  }, [payload?.project_values]);

  const oppValueMap = projectValueMap;

  const rollup = payload?.rollup ?? [];
  const projects = useMemo(() => rollup.filter((p) => p.is_bidding !== true), [rollup]);
  const opportunities = useMemo(() => rollup.filter((p) => p.is_bidding === true), [rollup]);

  const kpiDeltas = useMemo((): KpiDeltas => {
    if (!payload?.kpis || !payload.previous) {
      return { closed: null, pipeline: null, wip: null, winRate: null, pipelineAge: null };
    }
    const cur = payload.kpis;
    const prev = payload.previous;
    return {
      closed: computeDelta(cur.delivered_value, prev.delivered_value).pct,
      pipeline: computeDelta(cur.pipeline_value, prev.pipeline_value).pct,
      wip: computeDelta(cur.wip_value, prev.wip_value).pct,
      winRate: computeDelta(cur.win_rate_pct, prev.win_rate_pct).pct,
      pipelineAge: computeDelta(cur.avg_pipeline_age_days, prev.avg_pipeline_age_days).pct,
    };
  }, [payload]);

  const kpis = useMemo(() => {
    if (!payload?.kpis) {
      return {
        lifetimeRevenue: 0,
        closed: { count: 0, value: 0 },
        pipeline: { count: 0, value: 0 },
        inProgress: { count: 0, value: 0 },
        onHold: { count: 0, value: 0 },
        winRatePct: 0,
        avgPipelineAge: 0,
      };
    }
    const k = payload.kpis;
    return {
      lifetimeRevenue: k.delivered_value,
      closed: { count: k.delivered_count, value: k.delivered_value },
      pipeline: { count: k.pipeline_count, value: k.pipeline_value },
      inProgress: { count: k.wip_count, value: k.wip_value },
      onHold: { count: k.on_hold_count, value: 0 },
      winRatePct: k.win_rate_pct,
      avgPipelineAge: k.avg_pipeline_age_days,
    };
  }, [payload]);

  const relationshipSnapshot = useMemo(() => {
    if (!payload?.kpis) {
      return {
        deliveredInPeriod: 0,
        deliveredCount: 0,
        pipelineValue: 0,
        pipelineCount: 0,
        wipValue: 0,
        wipCount: 0,
        lastWinDate: null,
        lastWinValue: 0,
        lastWinName: null,
        summaryLine: '',
        nextMilestone: null,
      } satisfies RelationshipSnapshot;
    }
    return buildRelationshipSnapshot(rollup, projectValueMap, payload.kpis, displayMode, from, to);
  }, [payload, rollup, projectValueMap, displayMode, from, to]);

  const funnelMetrics = useMemo((): FunnelMetrics => {
    const f = payload?.funnel;
    if (!f) {
      return {
        prospecting: 0,
        sent: 0,
        refused: 0,
        converted: 0,
        prospectingPct: null,
        sentPct: null,
        refusedPct: null,
        convertedPct: null,
      };
    }
    const metric = displayMode === 'value' ? 'value' : 'count';
    return {
      prospecting: f.prospecting[metric],
      sent: f.sent[metric],
      refused: f.refused[metric],
      converted: f.converted[metric],
      prospectingPct: f.prospecting.pct,
      sentPct: f.sent.pct,
      refusedPct: f.refused.pct,
      convertedPct: f.converted.pct,
    };
  }, [payload, displayMode]);

  const portfolioByStatus = useMemo(() => {
    return (payload?.portfolio_by_status ?? []).map((row) => ({
      status: row.label,
      count: row.count,
      value: row.value,
    }));
  }, [payload]);

  const portfolioByDivision = useMemo(() => {
    return (payload?.portfolio_by_division ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      count: row.count,
      value: row.value,
    }));
  }, [payload]);

  const sparklineClosed = useMemo((): SparklinePoint[] => {
    return (payload?.daily.delivered ?? []).map((p) => ({ date: p.date, count: p.count }));
  }, [payload]);

  const sparklinePipeline = useMemo((): SparklinePoint[] => {
    return (payload?.daily.pipeline ?? []).map((p) => ({ date: p.date, count: p.count }));
  }, [payload]);

  const timelineSeries = useMemo(() => {
    const delivered = payload?.daily.delivered ?? [];
    const pipeline = payload?.daily.pipeline ?? [];
    const awarded = payload?.daily.awarded ?? [];
    const dates = delivered.map((p) => p.date);
    const closedLabel = displayMode === 'value' ? 'Revenue delivered' : 'Projects finished';
    const pipelineLabel = displayMode === 'value' ? 'Pipeline created' : 'Opportunities created';
    const awardedLabel = displayMode === 'value' ? 'Awarded' : 'Projects awarded';
    return {
      dates,
      series: [
        {
          id: 'closed',
          label: closedLabel,
          color: '#0b1739',
          fill: 'rgba(11, 23, 57, 0.08)',
          data: delivered.map((p) => ({ date: p.date, count: p.count })),
        },
        {
          id: 'pipeline',
          label: pipelineLabel,
          color: '#15803d',
          fill: 'rgba(21, 128, 61, 0.08)',
          data: pipeline.map((p) => ({ date: p.date, count: p.count })),
        },
        {
          id: 'awarded',
          label: awardedLabel,
          color: '#b45309',
          fill: 'rgba(180, 83, 9, 0.08)',
          data: awarded.map((p) => ({ date: p.date, count: p.count })),
        },
      ],
    };
  }, [payload, displayMode]);

  const recentActivity = useMemo((): ActivityEvent[] => {
    return payload?.recent_activity ?? [];
  }, [payload]);

  const topOpportunities = useMemo((): RankedOpportunity[] => {
    return payload?.top_opportunities ?? [];
  }, [payload]);

  const atRiskProjects = useMemo((): RankedAtRiskProject[] => {
    return payload?.at_risk_projects ?? [];
  }, [payload]);

  const modalItems = useMemo(
    () =>
      payload?.modal_lists ?? {
        closed: [],
        inProgress: [],
        onHold: [],
        pipeline: [],
      },
    [payload],
  );

  const relatedMemberships = payload?.related_memberships ?? [];
  const relatedStats = useMemo(
    () => ({
      projectsTotal: payload?.related_summary?.projects_total ?? 0,
      projectsAwarded: payload?.related_summary?.projects_awarded ?? 0,
      opportunitiesTotal: payload?.related_summary?.opportunities_total ?? 0,
      opportunitiesAwarded: payload?.related_summary?.opportunities_awarded ?? 0,
    }),
    [payload],
  );

  const limitedDataNote = useMemo(() => {
    const missing = payload?.value_coverage?.missing_proposal_total_count ?? 0;
    if (missing > 0) {
      return `${missing} project${missing === 1 ? '' : 's'} without proposal total — values use estimates where available.`;
    }
    return null;
  }, [payload]);

  const clientSince = payload?.client_since ?? undefined;

  return {
    isLoading: insightsQuery.isLoading,
    kpis,
    kpiDeltas,
    relationshipSnapshot,
    funnelMetrics,
    portfolioByStatus,
    portfolioByDivision,
    timelineSeries,
    sparklineClosed,
    sparklinePipeline,
    recentActivity,
    topOpportunities,
    atRiskProjects,
    modalItems,
    relatedMemberships,
    relatedStats,
    projectValueMap,
    oppValueMap,
    filteredProjects: projects,
    filteredOpportunities: opportunities,
    limitedDataNote,
    clientSince,
    apiSignals: payload?.signals ?? [],
    refetch: () => insightsQuery.refetch(),
  };
}
