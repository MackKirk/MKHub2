export const PROJECT_DRAG_PREFIX = 'project:';
export const DAY_DROP_PREFIX = 'day:';

export function projectDragId(projectId: string): string {
  return `${PROJECT_DRAG_PREFIX}${projectId}`;
}

export function dayDropId(dayKey: string): string {
  return `${DAY_DROP_PREFIX}${dayKey}`;
}

export function parseProjectDragId(id: string | number): string | null {
  const s = String(id);
  if (!s.startsWith(PROJECT_DRAG_PREFIX)) return null;
  const projectId = s.slice(PROJECT_DRAG_PREFIX.length);
  return projectId || null;
}

export function parseDayDropId(id: string | number | undefined | null): string | null {
  if (id == null) return null;
  const s = String(id);
  if (!s.startsWith(DAY_DROP_PREFIX)) return null;
  const dayKey = s.slice(DAY_DROP_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(dayKey) ? dayKey : null;
}
