/**
 * Home dashboard business-line helpers: Production vs R&M, chart metric parse/compose, service paths.
 */
import {
  BUSINESS_LINE_CONSTRUCTION,
  BUSINESS_LINE_REPAIRS_MAINTENANCE,
} from '@/lib/businessLine';
import {
  canAccessBusinessLineForHome,
  normalizeBusinessLineForHome,
  type MeForHomeWidgets,
} from './widgetVisibility';

export type HomeBusinessLine = typeof BUSINESS_LINE_CONSTRUCTION | typeof BUSINESS_LINE_REPAIRS_MAINTENANCE;

export type ChartEntity = 'opportunities' | 'projects';
export type ChartGroupBy = 'status' | 'division';

export const HOME_BUSINESS_LINE_OPTIONS: { value: HomeBusinessLine; label: string }[] = [
  { value: BUSINESS_LINE_CONSTRUCTION, label: 'Production (Sales)' },
  { value: BUSINESS_LINE_REPAIRS_MAINTENANCE, label: 'Repairs & Maintenance' },
];

export function getAccessibleHomeBusinessLines(me: MeForHomeWidgets | undefined): HomeBusinessLine[] {
  if (!me) return [];
  return HOME_BUSINESS_LINE_OPTIONS.filter((opt) =>
    canAccessBusinessLineForHome(me, opt.value),
  ).map((opt) => opt.value);
}

/** RM-only → R&M; Production-only or both → Production (preserves existing estimator dashboards). */
export function inferDefaultHomeBusinessLine(me: MeForHomeWidgets | undefined): HomeBusinessLine {
  const accessible = getAccessibleHomeBusinessLines(me);
  if (accessible.length === 0) return BUSINESS_LINE_CONSTRUCTION;
  if (accessible.length === 1) return accessible[0];
  const hasProduction = accessible.includes(BUSINESS_LINE_CONSTRUCTION);
  const hasRm = accessible.includes(BUSINESS_LINE_REPAIRS_MAINTENANCE);
  if (hasProduction && !hasRm) return BUSINESS_LINE_CONSTRUCTION;
  if (hasRm && !hasProduction) return BUSINESS_LINE_REPAIRS_MAINTENANCE;
  return BUSINESS_LINE_CONSTRUCTION;
}

export function resolveWidgetBusinessLine(
  config: Record<string, unknown> | undefined,
  me: MeForHomeWidgets | undefined,
): HomeBusinessLine {
  const raw = config?.business_line;
  if (typeof raw === 'string' && raw.trim()) {
    return normalizeBusinessLineForHome(raw) as HomeBusinessLine;
  }
  return inferDefaultHomeBusinessLine(me);
}

export function getBusinessLineLabel(line: string): string {
  const normalized = normalizeBusinessLineForHome(line);
  return (
    HOME_BUSINESS_LINE_OPTIONS.find((o) => o.value === normalized)?.label ??
    normalized
  );
}

export function getBusinessLineShortLabel(line: string): string {
  const normalized = normalizeBusinessLineForHome(line);
  if (normalized === BUSINESS_LINE_REPAIRS_MAINTENANCE) return 'R&M';
  return 'Production';
}

export function parseChartMetric(metric: string | undefined): { entity: ChartEntity; groupBy: ChartGroupBy } {
  const m = metric ?? 'opportunities_by_status';
  if (m.startsWith('projects_by_division')) return { entity: 'projects', groupBy: 'division' };
  if (m.startsWith('projects')) return { entity: 'projects', groupBy: 'status' };
  if (m.startsWith('opportunities_by_division')) return { entity: 'opportunities', groupBy: 'division' };
  return { entity: 'opportunities', groupBy: 'status' };
}

export function composeChartMetric(entity: ChartEntity, groupBy: ChartGroupBy): string {
  return `${entity}_by_${groupBy}`;
}

export type ServicePaths = {
  projects: string;
  opportunities: string;
  business: string;
};

export function getServicePathsForLine(line: string): ServicePaths {
  const normalized = normalizeBusinessLineForHome(line);
  if (normalized === BUSINESS_LINE_REPAIRS_MAINTENANCE) {
    return {
      projects: '/rm-projects',
      opportunities: '/rm-opportunities',
      business: '/rm-business',
    };
  }
  return {
    projects: '/projects',
    opportunities: '/opportunities',
    business: '/business',
  };
}

export const CHART_ENTITY_OPTIONS: { value: ChartEntity; label: string }[] = [
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'projects', label: 'Projects' },
];

export const CHART_GROUP_BY_OPTIONS: { value: ChartGroupBy; label: string }[] = [
  { value: 'status', label: 'Status' },
  { value: 'division', label: 'Division' },
];

export const KPI_METRIC_OPTIONS: { value: string; label: string; group: ChartEntity }[] = [
  { value: 'opportunities', label: 'Opportunities (count)', group: 'opportunities' },
  { value: 'estimated_value', label: 'Estimated value', group: 'opportunities' },
  { value: 'projects', label: 'Projects (count)', group: 'projects' },
  { value: 'actual_value', label: 'Actual value', group: 'projects' },
];

export const SERVICES_SHORTCUT_IDS = new Set(['projects', 'opportunities', 'business']);

export function widgetHasServicesShortcuts(items: string[] | undefined): boolean {
  if (!items?.length) return false;
  return items.some((id) => SERVICES_SHORTCUT_IDS.has(id));
}
