import type {
  AccountSignal,
  ParticipationProject,
  RelatedMembershipRow,
} from './customerOverviewTypes';
import { daysAgoLabel, daysSince, formatCurrency, statusNorm } from './customerOverviewUtils';

const STALE_PIPELINE_DAYS = 60;
const HOLD_STALE_DAYS = 90;
const CONCENTRATION_PCT = 0.65;
const RECENT_WIN_DAYS = 30;

type SignalContext = {
  filteredProjects: ParticipationProject[];
  filteredOpportunities: ParticipationProject[];
  projectValueMap: Map<string, number>;
  oppValueMap: Map<string, number>;
  relatedMemberships: RelatedMembershipRow[];
  displayMode: 'quantity' | 'value';
  dateFrom?: string;
  dateTo?: string;
  onOpenPipeline: () => void;
  onOpenRelated: () => void;
  onNavigateProject: (id: string) => void;
  onOpenOpportunities?: () => void;
};

const SEVERITY_ORDER: Record<AccountSignal['severity'], number> = {
  critical: 0,
  watch: 1,
  info: 2,
};

function sortAndCap(signals: AccountSignal[], max = 5): AccountSignal[] {
  return signals
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, max);
}

export function buildAccountSignals(ctx: SignalContext): AccountSignal[] {
  const signals: AccountSignal[] = [];
  const openOpps = ctx.filteredOpportunities.filter((o) => {
    const s = statusNorm(o);
    return s === 'prospecting' || s === 'sent to customer';
  });

  const staleOpps = openOpps.filter((o) => {
    const created = (o.created_at || (o.details?.created_at as string)) as string | undefined;
    return daysSince(created) > STALE_PIPELINE_DAYS;
  });
  if (ctx.dateFrom && ctx.dateTo) {
    const newInPeriod = ctx.filteredOpportunities.filter((o) => {
      const created = (o.created_at || (o.details?.created_at as string)) as string | undefined;
      if (!created) return false;
      const d = created.slice(0, 10);
      return d >= ctx.dateFrom! && d <= ctx.dateTo!;
    });
    if (newInPeriod.length === 0) {
      signals.push({
        id: 'commercial-gap',
        severity: 'watch',
        title: 'Commercial gap',
        body: 'No new opportunities were created in this period.',
        ctaLabel: 'Create opportunity',
        onAction: ctx.onOpenOpportunities,
      });
    }
  }

  if (staleOpps.length > 0) {
    const atRiskValue = staleOpps.reduce((s, o) => s + Number(ctx.oppValueMap.get(o.id) || 0), 0);
    const valuePart =
      ctx.displayMode === 'value' && atRiskValue > 0 ? ` — ${formatCurrency(atRiskValue)} at risk` : '';
    signals.push({
      id: 'stale-pipeline',
      severity: staleOpps.length >= 3 ? 'critical' : 'watch',
      title: 'Pipeline stalled',
      body: `${staleOpps.length} open ${staleOpps.length === 1 ? 'opportunity' : 'opportunities'} with no movement for ${STALE_PIPELINE_DAYS}+ days${valuePart}.`,
      ctaLabel: 'View pipeline',
      onAction: ctx.onOpenPipeline,
    });
  }

  const pipelineTotal = openOpps.reduce((s, o) => s + Number(ctx.oppValueMap.get(o.id) || 0), 0);
  if (pipelineTotal > 0 && openOpps.length >= 2) {
    const sorted = [...openOpps].sort(
      (a, b) => Number(ctx.oppValueMap.get(b.id) || 0) - Number(ctx.oppValueMap.get(a.id) || 0),
    );
    const top2 = sorted.slice(0, 2).reduce((s, o) => s + Number(ctx.oppValueMap.get(o.id) || 0), 0);
    const pct = top2 / pipelineTotal;
    if (pct >= CONCENTRATION_PCT) {
      signals.push({
        id: 'concentration',
        severity: 'watch',
        title: 'Pipeline concentration',
        body: `${Math.round(pct * 100)}% of open pipeline value sits in 2 proposals — high dependency.`,
        ctaLabel: 'View opportunities',
        onAction: ctx.onOpenPipeline,
      });
    }
  }

  const overdueProjects = ctx.filteredProjects.filter((p) => {
    if (statusNorm(p) !== 'in progress') return false;
    const eta = (p.date_eta || (p.details?.date_eta as string)) as string | undefined;
    if (!eta) return false;
    return new Date(eta).getTime() < Date.now();
  });
  if (overdueProjects.length > 0) {
    signals.push({
      id: 'overdue',
      severity: 'critical',
      title: 'Delivery behind schedule',
      body: `${overdueProjects.length} in-progress ${overdueProjects.length === 1 ? 'project has' : 'projects have'} passed the expected completion date.`,
      ctaLabel: 'View projects',
      onAction: () => ctx.onNavigateProject(overdueProjects[0].id),
    });
  }

  const holdStale = ctx.filteredProjects.filter((p) => {
    if (statusNorm(p) !== 'on hold') return false;
    const changed = (p.status_changed_at || (p.details?.status_changed_at as string)) as string | undefined;
    return daysSince(changed || p.created_at) > HOLD_STALE_DAYS;
  });
  if (holdStale.length > 0) {
    signals.push({
      id: 'hold-stale',
      severity: 'watch',
      title: 'Projects on hold',
      body: `${holdStale.length} ${holdStale.length === 1 ? 'project' : 'projects'} on hold for ${HOLD_STALE_DAYS}+ days without status change.`,
      ctaLabel: 'View on hold',
      onAction: () => ctx.onNavigateProject(holdStale[0].id),
    });
  }

  const recentWins = ctx.filteredProjects
    .filter((p) => statusNorm(p) === 'finished')
    .map((p) => {
      const finishedAt =
        (p.details?.finished_at as string) ||
        (p.details?.date_end as string) ||
        p.date_end ||
        p.status_changed_at ||
        p.created_at;
      return { p, finishedAt, value: Number(ctx.projectValueMap.get(p.id) || 0) };
    })
    .filter((x) => x.finishedAt && daysSince(x.finishedAt) <= RECENT_WIN_DAYS)
    .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime());

  if (recentWins.length > 0) {
    const w = recentWins[0];
    const name = w.p.name || w.p.code || 'Project';
    const val =
      w.value > 0 && ctx.displayMode === 'value' ? ` — ${formatCurrency(w.value)}` : '';
    signals.push({
      id: 'recent-win',
      severity: 'info',
      title: 'Recent win',
      body: `${name}${val} finished ${daysAgoLabel(daysSince(w.finishedAt))}.`,
      ctaLabel: 'Open project',
      onAction: () => ctx.onNavigateProject(w.p.id),
    });
  }

  if (openOpps.length > 0) {
    const top = [...openOpps].sort(
      (a, b) => Number(ctx.oppValueMap.get(b.id) || 0) - Number(ctx.oppValueMap.get(a.id) || 0),
    )[0];
    const val = Number(ctx.oppValueMap.get(top.id) || 0);
    const status = (top.details?.status_label || top.status_label || 'Open') as string;
    const age = daysSince((top.created_at || top.details?.created_at) as string);
    if (!signals.some((s) => s.id === 'stale-pipeline' && s.severity === 'critical')) {
      signals.push({
        id: 'top-opp',
        severity: 'info',
        title: 'Largest open opportunity',
        body: `${top.name || top.code || 'Opportunity'}${val > 0 && ctx.displayMode === 'value' ? ` — ${formatCurrency(val)}` : ''} (${status}, ${age}d open).`,
        ctaLabel: 'Open opportunity',
        onAction: () => ctx.onNavigateProject(top.id),
      });
    }
  }

  const relatedProj = ctx.relatedMemberships.filter((m) => !m.is_bidding);
  const relatedOpp = ctx.relatedMemberships.filter((m) => m.is_bidding);
  if (relatedProj.length + relatedOpp.length > 0) {
    const awarded =
      relatedProj.filter((m) => m.is_awarded_related).length +
      relatedOpp.filter((m) => m.is_awarded_related).length;
    signals.push({
      id: 'related',
      severity: 'info',
      title: 'Related participation',
      body: `${relatedProj.length} related ${relatedProj.length === 1 ? 'project' : 'projects'}, ${relatedOpp.length} related ${relatedOpp.length === 1 ? 'opportunity' : 'opportunities'}${awarded > 0 ? ` — ${awarded} awarded` : ''}.`,
      ctaLabel: 'View details',
      onAction: ctx.onOpenRelated,
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: 'all-clear',
      severity: 'info',
      title: 'Account in good shape',
      body: 'No urgent commercial or delivery signals for the selected period.',
    });
  }

  return sortAndCap(signals, 5);
}
