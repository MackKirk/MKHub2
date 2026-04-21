/** Expiry stored as calendar month 1–12 and four-digit year. */

export function endOfExpiryMonth(expiryMonth1to12: number, year: number): Date {
  return new Date(year, expiryMonth1to12, 0, 23, 59, 59, 999);
}

export function isCardExpired(expiryMonth1to12: number, year: number): boolean {
  return Date.now() > endOfExpiryMonth(expiryMonth1to12, year).getTime();
}

export function expiresWithinDays(expiryMonth1to12: number, year: number, days: number): boolean {
  if (isCardExpired(expiryMonth1to12, year)) return false;
  const end = endOfExpiryMonth(expiryMonth1to12, year).getTime();
  const warn = Date.now() + days * 86400000;
  return end <= warn;
}

export function expiryLabel(month: number, year: number): string {
  const mm = String(month).padStart(2, '0');
  return `${mm}/${String(year).slice(-2)}`;
}

export function expiryBadgeClass(month: number, year: number): string {
  if (isCardExpired(month, year)) return 'bg-red-100 text-red-900';
  if (expiresWithinDays(month, year, 60)) return 'bg-amber-100 text-amber-900';
  return 'bg-gray-100 text-gray-800';
}
