import type { OverviewDatePreset } from './customerOverviewTypes';

export function isoLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function presetToRange(preset: OverviewDatePreset): { date_from?: string; date_to?: string } {
  if (preset === 'all') {
    return { date_from: undefined, date_to: undefined };
  }
  const today = new Date();
  const date_to = isoLocalDate(today);
  if (preset === '12mo') {
    const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    return { date_from: isoLocalDate(start), date_to };
  }
  const days =
    preset === '7d' ? 7 : preset === '14d' ? 14 : preset === '30d' ? 30 : preset === '90d' ? 90 : 0;
  if (days > 0) {
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    return { date_from: isoLocalDate(start), date_to };
  }
  return { date_from: undefined, date_to: undefined };
}

export function formatDateForDisplay(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function statusNorm(entity: { details?: { status_label?: string }; status_label?: string }): string {
  return (entity.details?.status_label || entity.status_label || '').trim().toLowerCase();
}

export function applyDateRange<T extends { created_at?: string; status_changed_at?: string; date_start?: string; date_end?: string }>(
  items: T[],
  date_from?: string,
  date_to?: string,
): T[] {
  if (!date_from && !date_to) return items;
  return items.filter((item) => {
    const dateStr = item.status_changed_at || item.date_start || item.created_at || item.date_end;
    if (!dateStr) return true;
    const itemDate = new Date(dateStr).toISOString().split('T')[0];
    if (date_from && itemDate < date_from) return false;
    if (date_to && itemDate > date_to) return false;
    return true;
  });
}

/** Base pricing Value: approved additional_costs (value × qty), without PST/GST. */
export function calculateProposalTotalFromAdditionalCosts(proposalData: unknown): number {
  if (!proposalData || typeof proposalData !== 'object') return 0;
  const root = proposalData as Record<string, unknown>;
  const data = (root.data as Record<string, unknown>) || root;
  const raw = Array.isArray(data.additional_costs) ? data.additional_costs : [];
  const additionalCosts = raw.filter((item: unknown) => item && typeof item === 'object' && (item as { approved?: boolean }).approved !== false);

  return additionalCosts.reduce((sum: number, item: unknown) => {
    const row = item as { value?: number; quantity?: number };
    return sum + Number(row?.value || 0) * Number(row?.quantity || 1);
  }, 0);
}

export function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysAgoLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  'In Progress': '#1d4ed8',
  'On Hold': '#f59e0b',
  Finished: '#15803d',
  Cancelled: '#b91c1c',
};

export const FUNNEL_COLORS = {
  prospecting: '#64748b',
  sent: '#0284c7',
  refused: '#d11616',
  converted: '#15803d',
};

export type ProjectDivisionSetting = {
  id: string;
  label?: string;
  subdivisions?: Array<{ id: string; label?: string }>;
};

/** Map division/subdivision UUID → display label (from GET /settings/project-divisions). */
export function buildProjectDivisionLabelMap(
  divisions: ProjectDivisionSetting[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!divisions?.length) return map;
  for (const d of divisions) {
    const parent = (d.label || 'Division').trim();
    map.set(String(d.id).toLowerCase(), parent);
    for (const sub of d.subdivisions || []) {
      const subLabel = (sub.label || 'Subdivision').trim();
      map.set(String(sub.id).toLowerCase(), `${parent} — ${subLabel}`);
    }
  }
  return map;
}

export function resolveProjectDivisionLabel(id: string, labelMap: Map<string, string>): string {
  if (!id || id === 'Unassigned') return 'Unassigned';
  return labelMap.get(String(id).toLowerCase()) ?? 'Other division';
}
