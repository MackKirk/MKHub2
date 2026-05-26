export type OverviewDatePreset =
  | '7d'
  | '14d'
  | '30d'
  | '90d'
  | '12mo'
  | 'all'
  | 'custom';

export type OverviewDisplayMode = 'quantity' | 'value';

export type ProjectLinkRow = { id: string; name?: string; code?: string };

export type RelatedMembershipRow = {
  id: string;
  code?: string;
  name?: string;
  is_bidding: boolean;
  is_awarded_related: boolean;
};

export type ParticipationProject = {
  id: string;
  code?: string;
  name?: string;
  slug?: string;
  created_at?: string;
  date_start?: string;
  date_end?: string;
  date_eta?: string;
  progress?: number;
  status_label?: string;
  status_changed_at?: string;
  is_bidding?: boolean;
  division_ids?: string[];
  details?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ClientParticipationsResponse = {
  rollup: ParticipationProject[];
  related_memberships: RelatedMembershipRow[];
};

export type OverviewKpiModalKind =
  | 'closed'
  | 'pipeline'
  | 'inProgress'
  | 'onHold'
  | 'related'
  | null;

export type ActivityEvent = {
  type: string;
  label: string;
  date: string;
  id: string;
};

export type SignalSeverity = 'info' | 'watch' | 'critical';

export type AccountSignal = {
  id: string;
  severity: SignalSeverity;
  title: string;
  body: string;
  ctaLabel?: string;
  onAction?: () => void;
};

export type RankedOpportunity = {
  id: string;
  name: string;
  code?: string;
  status: string;
  value: number;
  ageDays: number;
};

export type RankedAtRiskProject = {
  id: string;
  name: string;
  code?: string;
  status: string;
  value: number;
  reason: string;
};

export type RelationshipSnapshot = {
  deliveredInPeriod: number;
  deliveredCount: number;
  pipelineValue: number;
  pipelineCount: number;
  wipValue: number;
  wipCount: number;
  lastWinDate: Date | null;
  lastWinValue: number;
  lastWinName: string | null;
  summaryLine: string;
  nextMilestone: { label: string; id: string; kind: 'project' | 'opportunity' } | null;
};

export type FunnelMetrics = {
  prospecting: number;
  sent: number;
  refused: number;
  converted: number;
  prospectingPct: number | null;
  sentPct: number | null;
  refusedPct: number | null;
  convertedPct: number | null;
};

export type CustomerInsightsKpis = {
  delivered_value: number;
  delivered_count: number;
  pipeline_value: number;
  pipeline_count: number;
  wip_value: number;
  wip_count: number;
  on_hold_count: number;
  win_rate_pct: number;
  avg_pipeline_age_days: number;
};

export type CustomerInsightsResponse = {
  range: { from: string; to: string; days: number };
  previous_range: { from: string; to: string; days: number };
  kpis: CustomerInsightsKpis;
  previous: CustomerInsightsKpis;
  daily: {
    delivered: { date: string; count: number }[];
    pipeline: { date: string; count: number }[];
    awarded: { date: string; count: number }[];
  };
  funnel: {
    prospecting: { count: number; value: number; pct: number | null };
    sent: { count: number; value: number; pct: number | null };
    refused: { count: number; value: number; pct: number | null };
    converted: { count: number; value: number; pct: number | null };
  };
  portfolio_by_status: Array<{ id: string; label: string; count: number; value: number }>;
  portfolio_by_division: Array<{ id: string; label: string; count: number; value: number }>;
  top_opportunities: RankedOpportunity[];
  at_risk_projects: RankedAtRiskProject[];
  signals: Array<{ id: string; severity: SignalSeverity; title: string; body: string }>;
  recent_activity: ActivityEvent[];
  related_summary: {
    projects_total: number;
    projects_awarded: number;
    opportunities_total: number;
    opportunities_awarded: number;
  };
  value_coverage: { rollup_count: number; missing_proposal_total_count: number };
  rollup: ParticipationProject[];
  related_memberships: RelatedMembershipRow[];
  modal_lists: {
    closed: ProjectLinkRow[];
    inProgress: ProjectLinkRow[];
    onHold: ProjectLinkRow[];
    pipeline: ProjectLinkRow[];
  };
  client_since?: string | null;
  project_values: Record<string, number>;
};

export type KpiDeltas = {
  closed: number | null;
  pipeline: number | null;
  wip: number | null;
  winRate: number | null;
  pipelineAge: number | null;
};

export type ValueOverTimeEntry = [
  string,
  {
    closed: number;
    pipeline: number;
    closedByStatus: Record<string, number>;
    pipelineByStatus: Record<string, number>;
    closedCount?: number;
    pipelineCount?: number;
  },
];
