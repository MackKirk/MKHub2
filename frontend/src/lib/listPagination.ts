export type ProjectViewMode = 'cards' | 'list' | 'map' | 'calendar';

export type ListCardViewMode = Exclude<ProjectViewMode, 'map' | 'calendar'>;

const LIST_CARD_VIEW_MODES = new Set<ListCardViewMode>(['list', 'cards']);

/** Initial view on page entry: list or cards only (never map/calendar). */
export function resolveInitialListViewMode(
  urlView: string | null,
  storageKey: string,
  fallback: ListCardViewMode = 'list',
): ListCardViewMode {
  if (urlView && LIST_CARD_VIEW_MODES.has(urlView as ListCardViewMode)) {
    return urlView as ListCardViewMode;
  }
  const saved = localStorage.getItem(storageKey);
  if (saved && LIST_CARD_VIEW_MODES.has(saved as ListCardViewMode)) {
    return saved as ListCardViewMode;
  }
  return fallback;
}

/** Full project list view including map and calendar from URL. */
export function resolveInitialProjectViewMode(
  urlView: string | null,
  storageKey: string,
  fallback: ListCardViewMode = 'list',
): ProjectViewMode {
  if (urlView === 'map' || urlView === 'calendar') return urlView;
  return resolveInitialListViewMode(urlView, storageKey, fallback);
}

export const LIST_PAGE_SIZE_OPTIONS = [25, 50, 100, 150, 200] as const;
export const LIST_PAGE_SIZE_DEFAULT = 25;
export const CARD_VIEW_PAGE_SIZE = 25;

export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

const ALLOWED = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

export function clampListPageLimit(limit: number): ListPageSize {
  if (ALLOWED.has(limit)) return limit as ListPageSize;
  if (limit <= 25) return 25;
  if (limit <= 50) return 50;
  if (limit <= 100) return 100;
  if (limit <= 150) return 150;
  return 200;
}

export function parseListPageLimit(raw: string | null | undefined): ListPageSize {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return LIST_PAGE_SIZE_DEFAULT;
  return clampListPageLimit(Math.floor(n));
}

export function listPageSizeSelectOptions() {
  return LIST_PAGE_SIZE_OPTIONS.map((value) => ({
    value: String(value),
    label: String(value),
  }));
}

export function effectiveListPageLimit(
  viewMode: ProjectViewMode,
  rawLimit: string | null | undefined,
): number {
  if (viewMode === 'cards' || viewMode === 'map' || viewMode === 'calendar') return CARD_VIEW_PAGE_SIZE;
  return parseListPageLimit(rawLimit);
}
