/** Optional service approval status on projects (3-state). */
export type OptionalServiceStatus = 'pending' | 'approved' | 'not_approved';

export const OPTIONAL_SERVICE_STATUSES: readonly OptionalServiceStatus[] = [
  'pending',
  'approved',
  'not_approved',
] as const;

export type NormalizedOptionalService = {
  service: string;
  price: number;
  status: OptionalServiceStatus;
  pst: boolean;
  gst: boolean;
  division_id: string | null;
};

function normalizeDivisionId(value: unknown): string | null {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  return text || null;
}

function isOptionalServiceStatus(value: unknown): value is OptionalServiceStatus {
  return value === 'pending' || value === 'approved' || value === 'not_approved';
}

function asBool(value: unknown, defaultValue = false): boolean {
  if (value === true || value === 'true' || value === 1) return true;
  if (value === false || value === 'false' || value === 0) return false;
  return defaultValue;
}

/**
 * Normalize a raw optional_services row from Proposal.data.
 *
 * Legacy `approved: false` → not_approved.
 * Legacy `approved: true` or missing → pending (avoids totals jumping when approved enter totals).
 */
export function normalizeOptionalServiceStatus(raw: unknown): OptionalServiceStatus {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (isOptionalServiceStatus(obj.status)) return obj.status;
    if (obj.approved === false || obj.approved === 'false' || obj.approved === 0) {
      return 'not_approved';
    }
  }
  return 'pending';
}

export function normalizeOptionalService(raw: unknown): NormalizedOptionalService {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const priceRaw = obj.price;
  let price = 0;
  if (typeof priceRaw === 'number' && Number.isFinite(priceRaw)) {
    price = priceRaw;
  } else if (priceRaw != null && priceRaw !== '') {
    const n = Number(String(priceRaw).replace(/,/g, ''));
    price = Number.isFinite(n) ? n : 0;
  }
  return {
    service: String(obj.service ?? ''),
    price,
    status: normalizeOptionalServiceStatus(obj),
    pst: asBool(obj.pst, false),
    gst: asBool(obj.gst, false),
    division_id: normalizeDivisionId(obj.division_id),
  };
}

/** Whether this optional should appear on the PDF (approved + pending). */
export function optionalServiceVisibleInPdf(raw: unknown): boolean {
  return normalizeOptionalServiceStatus(raw) !== 'not_approved';
}

/** Map convert-modal / API approval entry to a status. */
export function coerceOptionalServiceApproval(value: unknown): OptionalServiceStatus {
  if (isOptionalServiceStatus(value)) return value;
  if (value === true || value === 'true' || value === 1) return 'approved';
  if (value === false || value === 'false' || value === 0) return 'not_approved';
  return 'pending';
}

export function serializeOptionalService(item: {
  service: string;
  price: number;
  status: OptionalServiceStatus;
  pst?: boolean;
  gst?: boolean;
  division_id?: string | null;
}): NormalizedOptionalService {
  return {
    service: item.service,
    price: item.price,
    status: isOptionalServiceStatus(item.status) ? item.status : 'pending',
    pst: item.pst === true,
    gst: item.gst === true,
    division_id: normalizeDivisionId(item.division_id),
  };
}
