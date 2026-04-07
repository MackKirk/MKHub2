/**
 * Home widget visibility: mirrors backend home_dashboard_policy + AppShell Services rules.
 */
import { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import type { GalleryItem } from './galleryConfig';
import type { WidgetDef } from './types';

export type MeForHomeWidgets = {
  roles?: string[];
  permissions?: string[];
};

const SHORTCUT_PUBLIC = new Set(['tasks', 'schedule', 'clock']);
const SHORTCUT_SERVICES = new Set(['projects', 'opportunities', 'business']);

export function normalizeBusinessLineForHome(raw?: string | null): string {
  if (raw == null || String(raw).trim() === '') return BUSINESS_LINE_CONSTRUCTION;
  const s = String(raw).trim().toLowerCase().replace(/-/g, '_');
  if (s === 'rm' || s === 'repairs_maintenance' || s === 'repairsandmaintenance') {
    return BUSINESS_LINE_REPAIRS_MAINTENANCE;
  }
  return BUSINESS_LINE_CONSTRUCTION;
}

export function isAdminMe(me: MeForHomeWidgets | undefined): boolean {
  return Boolean(me?.roles?.some((r) => String(r).toLowerCase() === 'admin'));
}

function permSet(me: MeForHomeWidgets | undefined): Set<string> {
  return new Set((me?.permissions ?? []).map((p) => String(p)));
}

/** Same idea as AppShell hasPermission for business lines (read paths). */
export function canAccessBusinessLineForHome(me: MeForHomeWidgets | undefined, line: string): boolean {
  if (!me) return false;
  if (isAdminMe(me)) return true;
  const set = permSet(me);
  if (set.has('business:projects:read')) return true;
  const ln = normalizeBusinessLineForHome(line);
  if (ln === BUSINESS_LINE_CONSTRUCTION) {
    return (
      set.has('business:construction:projects:read') ||
      set.has('business:construction:projects:write')
    );
  }
  if (ln === BUSINESS_LINE_REPAIRS_MAINTENANCE) {
    return set.has('business:rm:projects:read') || set.has('business:rm:projects:write');
  }
  return false;
}

export function canReadCustomersForHome(me: MeForHomeWidgets | undefined): boolean {
  if (!me) return false;
  if (isAdminMe(me)) return true;
  return permSet(me).has('business:customers:read');
}

function lineForWidgetConfig(config: Record<string, unknown> | undefined, activeBusinessLine: string): string {
  const bl = config?.business_line;
  if (typeof bl === 'string' && bl.trim()) return normalizeBusinessLineForHome(bl);
  return normalizeBusinessLineForHome(activeBusinessLine);
}

export function isShortcutItemAllowed(itemId: string, me: MeForHomeWidgets | undefined, activeBusinessLine: string): boolean {
  if (SHORTCUT_PUBLIC.has(itemId)) return true;
  if (SHORTCUT_SERVICES.has(itemId)) {
    return canAccessBusinessLineForHome(me, activeBusinessLine);
  }
  if (itemId === 'customers') {
    return canReadCustomersForHome(me);
  }
  return true;
}

export function isWidgetDefAllowed(
  widget: Pick<WidgetDef, 'type' | 'config'>,
  me: MeForHomeWidgets | undefined,
  activeBusinessLine: string
): boolean {
  const { type, config } = widget;
  const cfg = config && typeof config === 'object' ? config : {};

  if (type === 'list_tasks' || type === 'calendar' || type === 'schedule' || type === 'clock_in_out') {
    return true;
  }

  if (type === 'shortcuts') {
    const items = (cfg.items as string[]) ?? [];
    if (items.length === 0) return true;
    const line = lineForWidgetConfig(cfg as Record<string, unknown>, activeBusinessLine);
    for (const raw of items) {
      const id = String(raw);
      if (!isShortcutItemAllowed(id, me, line)) return false;
    }
    return true;
  }

  if (type === 'kpi' || type === 'chart' || type === 'list_projects' || type === 'list_opportunities') {
    return canAccessBusinessLineForHome(me, lineForWidgetConfig(cfg as Record<string, unknown>, activeBusinessLine));
  }

  return false;
}

export function isGalleryItemAllowed(item: GalleryItem, me: MeForHomeWidgets | undefined, activeBusinessLine: string): boolean {
  return isWidgetDefAllowed({ type: item.type, config: item.config }, me, activeBusinessLine);
}

export function filterWidgetsForHome(
  widgets: WidgetDef[],
  me: MeForHomeWidgets | undefined,
  activeBusinessLine: string
): WidgetDef[] {
  return widgets.filter((w) => isWidgetDefAllowed(w, me, activeBusinessLine));
}

export function filterLayoutForWidgets(layout: { i: string }[], widgets: WidgetDef[]): { i: string }[] {
  const ids = new Set(widgets.map((w) => w.id));
  return layout.filter((cell) => ids.has(cell.i));
}
