import type { ScheduleRailProject } from '../../hooks/useInProgressProjectsForSchedule';

export type RailDivisionNode = {
  id: string;
  label?: string | null;
  value?: string | null;
  meta?: { color?: string | null } | null;
  subdivisions?: RailDivisionNode[] | null;
};

export type RailDivisionSectionMeta = {
  id: string;
  label: string;
  color?: string | null;
};

export type RailDivisionSection = RailDivisionSectionMeta & {
  projects: ScheduleRailProject[];
};

export const NO_DIVISION_SECTION_ID = '__no_division__';

/** Flatten parent + each subdivision into ordered catalog entries (parents keep their own row). */
export function flattenDivisionCatalog(tree: RailDivisionNode[] | undefined | null): RailDivisionSectionMeta[] {
  const out: RailDivisionSectionMeta[] = [];
  for (const div of tree || []) {
    const id = String(div.id || '').trim();
    if (!id) continue;
    out.push({
      id,
      label: String(div.label || '').trim() || 'Division',
      color: (div.meta && typeof div.meta === 'object' ? div.meta.color : null) || div.value || null,
    });
    for (const sub of div.subdivisions || []) {
      const subId = String(sub.id || '').trim();
      if (!subId) continue;
      out.push({
        id: subId,
        label: String(sub.label || '').trim() || 'Subdivision',
        color: (sub.meta && typeof sub.meta === 'object' ? sub.meta.color : null) || sub.value || null,
      });
    }
  }
  return out;
}

function projectDivisionIds(project: ScheduleRailProject): string[] {
  const raw = project.project_division_ids;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Group filtered projects into division sections (catalog order).
 * Multi-division projects appear in every matching section.
 * Empty sections are omitted; "No division" is last when needed.
 */
export function groupProjectsByDivisionSections(
  projects: ScheduleRailProject[],
  catalog: RailDivisionSectionMeta[],
): RailDivisionSection[] {
  const byDivision = new Map<string, ScheduleRailProject[]>();
  const noDivision: ScheduleRailProject[] = [];

  for (const project of projects) {
    const ids = projectDivisionIds(project);
    if (ids.length === 0) {
      noDivision.push(project);
      continue;
    }
    for (const id of ids) {
      const list = byDivision.get(id);
      if (list) list.push(project);
      else byDivision.set(id, [project]);
    }
  }

  const sections: RailDivisionSection[] = [];
  for (const meta of catalog) {
    const list = byDivision.get(meta.id);
    if (!list?.length) continue;
    sections.push({ ...meta, projects: list });
    byDivision.delete(meta.id);
  }

  // Unknown division ids (not in catalog) — still show so projects are not lost
  for (const [id, list] of byDivision) {
    if (!list.length) continue;
    sections.push({
      id,
      label: 'Other division',
      color: null,
      projects: list,
    });
  }

  if (noDivision.length > 0) {
    sections.push({
      id: NO_DIVISION_SECTION_ID,
      label: 'No division',
      color: null,
      projects: noDivision,
    });
  }

  return sections;
}

const SECTION_COLLAPSED_PREFIX = 'mkhub.projectCalendar.scheduleRail.sectionCollapsed.';

function sectionStorageKey(businessLine: string): string {
  return `${SECTION_COLLAPSED_PREFIX}${businessLine}`;
}

/** Map of sectionId -> collapsed. Missing key = collapsed (default). */
export function readSectionCollapsedMap(businessLine: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(sectionStorageKey(businessLine));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSectionCollapsedMap(businessLine: string, map: Record<string, boolean>) {
  try {
    localStorage.setItem(sectionStorageKey(businessLine), JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
