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

