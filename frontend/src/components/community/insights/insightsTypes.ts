/** Shape of the response returned by GET /community/insights. */

export type InsightsRange = {
  from: string;
  to: string;
  days: number;
};

export type InsightsKpis = {
  posts_published: number;
  post_views: number;
  comments_made: number;
  likes_total: number;
  active_members: number;
  engagement_rate_pct: number;
  avg_read_rate_pct: number;
};

export type DailyPoint = { date: string; count: number };

export type InsightsDaily = {
  posts_published: DailyPoint[];
  views: DailyPoint[];
  likes: DailyPoint[];
  comments: DailyPoint[];
  active_users: DailyPoint[];
};

export type EngagementBucket = {
  posts: number;
  views: number;
  likes: number;
  comments: number;
  read_rate_pct: number;
};

export type TopPost = {
  post_id: string;
  title: string;
  author_name: string | null;
  author_avatar_url: string | null;
  related_area: string;
  priority: string;
  tags: string[];
  views: number;
  likes: number;
  comments: number;
  confirmations: number;
  audience: number;
  read_rate_pct: number;
  confirmation_rate_pct: number | null;
  requires_read_confirmation: boolean;
  published_at: string | null;
};

export type TopContributor = {
  user_id: string;
  user_name: string | null;
  user_avatar_url: string | null;
  posts_count: number;
  views_total: number;
  likes_total: number;
  comments_total: number;
  engagement_score: number;
};

export type ReadHealth = {
  required_posts_count: number;
  avg_confirmation_rate_pct: number;
  total_pending_confirmations: number;
  pending_posts: Array<{
    post_id: string;
    title: string;
    audience: number;
    confirmed: number;
    pending: number;
    confirmation_rate_pct: number;
  }>;
};

export type WorkforceReach = {
  total_members: number;
  active_members: number;
  active_percentage: number;
  posts_per_active_user: number;
  views_per_active_user: number;
  engagement_per_active_user: number;
};

export type InsightsPayload = {
  range: InsightsRange;
  previous_range: InsightsRange;
  kpis: InsightsKpis;
  previous: InsightsKpis;
  daily: InsightsDaily;
  engagement_by_area: Record<string, EngagementBucket>;
  engagement_by_priority: Record<string, EngagementBucket>;
  top_posts: TopPost[];
  top_contributors: TopContributor[];
  read_health: ReadHealth;
  workforce_reach: WorkforceReach;
};

// ---------------------------------------------------------------------------
// Display helpers shared across sections.
// ---------------------------------------------------------------------------

export const AREA_LABELS: Record<string, string> = {
  general: 'General',
  projects: 'Projects',
  opportunities: 'Opportunities',
  repairs_maintenance: 'Repairs & Maintenance',
  safety: 'Safety',
  fleet: 'Fleet',
  hr: 'HR',
  payroll: 'Payroll',
  training: 'Training',
};

export const PRIORITY_LABELS: Record<string, string> = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
  critical: 'Critical',
};

export const PRIORITY_ORDER = ['normal', 'important', 'urgent', 'critical'] as const;

export function formatAreaLabel(area: string): string {
  return AREA_LABELS[area] || area.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] || priority;
}

export function computeDelta(current: number, previous: number): { delta: number; pct: number | null } {
  const delta = current - previous;
  if (previous === 0) {
    return { delta, pct: current === 0 ? 0 : null };
  }
  return { delta, pct: (delta / previous) * 100 };
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '??';
}
