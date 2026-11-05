import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';
import { formatDateLocal } from '@/lib/dateUtils';

export type OpportunityStatusPrefLine = 'construction' | 'repairs';

/** null = all statuses; [] = none; string[] = subset */
export type OpportunityStatusSelection = string[] | null;

export type OpportunityStatusIdsByLine = Record<OpportunityStatusPrefLine, OpportunityStatusSelection>;

/** Which list bucket in user list preferences. */
export type ListStatusPrefBucket = 'opportunity_status_ids' | 'project_status_ids';

export type UserListPreferences = {
  opportunity_status_ids: OpportunityStatusIdsByLine;
  project_status_ids: OpportunityStatusIdsByLine;
};

export const LIST_PREFERENCES_QUERY_KEY = ['me-list-preferences'] as const;

export type CreatedWithinPreset = '30' | '90' | '180';

export const CREATED_WITHIN_PRESETS: Array<{ key: CreatedWithinPreset; label: string; days: number }> = [
  { key: '30', label: 'Last month', days: 30 },
  { key: '90', label: 'Last 3 months', days: 90 },
  { key: '180', label: 'Last 6 months', days: 180 },
];

export function emptyOpportunityStatusIds(): OpportunityStatusIdsByLine {
  return { construction: null, repairs: null };
}

export function emptyUserListPreferences(): UserListPreferences {
  return {
    opportunity_status_ids: emptyOpportunityStatusIds(),
    project_status_ids: emptyOpportunityStatusIds(),
  };
}

export function normalizeOpportunityStatusIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = String(item || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Normalize one line: null/omitted → null (all); list → UUID-ish strings (may be empty). */
export function normalizeOpportunityStatusSelection(raw: unknown): OpportunityStatusSelection {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return normalizeOpportunityStatusIds(raw);
  return null;
}

function normalizeStatusIdsByLine(raw: unknown): OpportunityStatusIdsByLine {
  const bucket = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    construction: normalizeOpportunityStatusSelection(
      Object.prototype.hasOwnProperty.call(bucket, 'construction') ? bucket.construction : null,
    ),
    repairs: normalizeOpportunityStatusSelection(
      Object.prototype.hasOwnProperty.call(bucket, 'repairs') ? bucket.repairs : null,
    ),
  };
}

export function normalizeUserListPreferences(raw: unknown): UserListPreferences {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    opportunity_status_ids: normalizeStatusIdsByLine(data.opportunity_status_ids),
    project_status_ids: normalizeStatusIdsByLine(data.project_status_ids),
  };
}

/** Map page business_line to prefs storage key. */
export function opportunityPrefLineFromBusinessLine(businessLine: string): OpportunityStatusPrefLine {
  return businessLine === BUSINESS_LINE_REPAIRS_MAINTENANCE ? 'repairs' : 'construction';
}

export function statusSelectionForBusinessLine(
  prefs: UserListPreferences | null | undefined,
  businessLine: string,
  bucket: ListStatusPrefBucket = 'opportunity_status_ids',
): OpportunityStatusSelection {
  const line = opportunityPrefLineFromBusinessLine(businessLine);
  return normalizeOpportunityStatusSelection(prefs?.[bucket]?.[line]);
}

/** @deprecated use statusSelectionForBusinessLine — kept for callers expecting array only */
export function statusIdsForBusinessLine(
  prefs: UserListPreferences | null | undefined,
  businessLine: string,
  bucket: ListStatusPrefBucket = 'opportunity_status_ids',
): string[] {
  const sel = statusSelectionForBusinessLine(prefs, businessLine, bucket);
  return sel === null ? [] : sel;
}

export function isAllStatusMode(selection: OpportunityStatusSelection): boolean {
  return selection === null;
}

export function isNoneStatusMode(selection: OpportunityStatusSelection): boolean {
  return Array.isArray(selection) && selection.length === 0;
}

/**
 * Effective ids for API when not in all mode.
 * allOptionIds used only to filter stale ids from a subset.
 */
export function resolveEffectiveStatusIds(
  selection: OpportunityStatusSelection,
  allOptionIds: string[],
): OpportunityStatusSelection {
  if (selection === null) return null;
  const allowed = new Set(allOptionIds.map(String));
  return selection.filter((id) => allowed.has(id));
}

export function isStatusChecked(
  selection: OpportunityStatusSelection,
  statusId: string,
): boolean {
  if (selection === null) return true;
  return selection.includes(statusId);
}

export function toggleStatusSelection(
  selection: OpportunityStatusSelection,
  statusId: string,
  allOptionIds: string[],
): OpportunityStatusSelection {
  const id = String(statusId || '').trim();
  if (!id) return selection;

  if (selection === null) {
    // Leaving all-mode: all except the unchecked id
    return allOptionIds.filter((x) => x !== id);
  }

  const set = new Set(selection);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const next = Array.from(set);

  // If every known option is selected, collapse back to all-mode
  if (
    allOptionIds.length > 0 &&
    allOptionIds.every((opt) => next.includes(opt))
  ) {
    return null;
  }
  return next;
}

export function setAllStatusSelection(checked: boolean): OpportunityStatusSelection {
  return checked ? null : [];
}

/** True when URL has Filter Builder status include/exclude. */
export function urlHasStatusFilterRules(params: URLSearchParams): boolean {
  return params.getAll('status').some(Boolean) || params.getAll('status_not').some(Boolean);
}

export function applyStatusIdsToSearchParams(params: URLSearchParams, statusIds: string[]): void {
  params.delete('status');
  params.delete('status_not');
  for (const id of normalizeOpportunityStatusIds(statusIds)) {
    params.append('status', id);
  }
}

export function putListPreferencesBodyForLine(
  businessLine: string,
  selection: OpportunityStatusSelection,
  bucket: ListStatusPrefBucket = 'opportunity_status_ids',
): Partial<Record<ListStatusPrefBucket, Partial<OpportunityStatusIdsByLine>>> {
  const line = opportunityPrefLineFromBusinessLine(businessLine);
  return {
    [bucket]: {
      [line]: selection === null ? null : normalizeOpportunityStatusIds(selection),
    },
  };
}

/** Detect which created-within preset matches current date_start/date_end (approx). */
export function detectCreatedWithinPreset(params: URLSearchParams): CreatedWithinPreset | null {
  const start = params.get('date_start');
  const end = params.get('date_end');
  if (!start || !end) return null;
  const today = formatDateLocal(new Date());
  if (end !== today) return null;
  for (const preset of CREATED_WITHIN_PRESETS) {
    const expectedStart = formatDateLocal(addDaysLocal(new Date(), -preset.days));
    if (start === expectedStart) return preset.key;
  }
  return null;
}

export function applyCreatedWithinPreset(
  params: URLSearchParams,
  preset: CreatedWithinPreset | null,
): void {
  params.delete('date_start');
  params.delete('date_end');
  if (!preset) return;
  const days = CREATED_WITHIN_PRESETS.find((p) => p.key === preset)?.days;
  if (!days) return;
  const end = new Date();
  const start = addDaysLocal(end, -days);
  params.set('date_start', formatDateLocal(start));
  params.set('date_end', formatDateLocal(end));
}

function addDaysLocal(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
