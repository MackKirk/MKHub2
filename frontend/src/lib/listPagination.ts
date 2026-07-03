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
  viewMode: 'cards' | 'list',
  rawLimit: string | null | undefined,
): number {
  if (viewMode === 'cards') return CARD_VIEW_PAGE_SIZE;
  return parseListPageLimit(rawLimit);
}
