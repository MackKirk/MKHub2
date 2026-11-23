export const PROJECT_DRAG_PREFIX = 'project:';
export const DAY_DROP_PREFIX = 'day:';
/** Separates project id from rail section key when the same project appears in multiple divisions. */
const PROJECT_DRAG_SECTION_SEP = '::';

export function projectDragId(projectId: string, sectionKey?: string | null): string {
  if (sectionKey) return `${PROJECT_DRAG_PREFIX}${projectId}${PROJECT_DRAG_SECTION_SEP}${sectionKey}`;
  return `${PROJECT_DRAG_PREFIX}${projectId}`;
}

export function dayDropId(dayKey: string): string {
  return `${DAY_DROP_PREFIX}${dayKey}`;
}

export function parseProjectDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith(PROJECT_DRAG_PREFIX)) return null;
  const rest = s.slice(PROJECT_DRAG_PREFIX.length);
  if (!rest) return null;
  const sep = rest.indexOf(PROJECT_DRAG_SECTION_SEP);
  return sep >= 0 ? rest.slice(0, sep) || null : rest;
}

export function parseDayDropId(id: string | number | undefined | null): string | null {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith(DAY_DROP_PREFIX)) return null;
  const dayKey = s.slice(DAY_DROP_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : null;
}
