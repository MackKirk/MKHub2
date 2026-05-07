/**
 * Date utility functions for handling dates in local timezone (Vancouver/Canada)
 * All date formatting should use these functions instead of toISOString() to avoid UTC conversion issues
 */

/**
 * Format date as YYYY-MM-DD in local timezone (not UTC)
 * This ensures dates are displayed correctly regardless of server timezone
 */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date in local timezone as YYYY-MM-DD
 */
export function getTodayLocal(): string {
  return formatDateLocal(new Date());
}

/**
 * Get current month in local timezone as YYYY-MM
 */
export function getCurrentMonthLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Avoid timezone shift for plain YYYY-MM-DD from the API. */
export function parseApiDateForDisplay(isoOrYmd: string | null | undefined): Date | null {
  if (!isoOrYmd) return null;
  const s = String(isoOrYmd).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatFriendlyDate(isoOrYmd: string | null | undefined): string {
  const d = parseApiDateForDisplay(isoOrYmd);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatReviewPeriodRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = parseApiDateForDisplay(start);
  const b = parseApiDateForDisplay(end);
  if (!a && !b) return 'Review period not set';
  if (a && b) return `${formatFriendlyDate(start)} — ${formatFriendlyDate(end)}`;
  if (a) return `From ${formatFriendlyDate(start)}`;
  return `Until ${formatFriendlyDate(end)}`;
}

