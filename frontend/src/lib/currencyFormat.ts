/** Canadian dollar display for onboarding signature template "value" fields. */

const LOCALE = 'en-CA';
const CURRENCY = 'CAD';

export function formatCurrencyAmount(amount: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse user input that may include $, spaces, thousands separators, or decimal comma.
 * Returns null if not a finite number.
 */
export function parseCurrencyAmount(raw: string): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let t = s.replace(/[$\s]/g, '');
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    const parts = t.split(',');
    if (parts.length === 2 && parts[1].length <= 2 && /^\d+$/.test(parts[1])) {
      t = parts[0].replace(/\D/g, '') + '.' + parts[1];
    } else {
      t = t.replace(/,/g, '');
    }
  } else {
    t = t.replace(/,/g, '');
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}
