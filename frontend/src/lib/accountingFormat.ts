/** Format number to accounting format (1,234.56). */
export function formatAccounting(value: string | number): string {
  if (!value && value !== 0) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) || 0 : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse accounting format back to numeric string. */
export function parseAccounting(value: string): string {
  if (!value) return '';
  const cleaned = value.replace(/,/g, '');
  const match = cleaned.match(/^-?\d*\.?\d*$/);
  if (!match) {
    const numMatch = cleaned.match(/^-?\d+\.?\d*/);
    return numMatch ? numMatch[0] : '';
  }
  return cleaned;
}

export function parseAccountingNumber(value: string | number): number {
  if (typeof value === 'number') return value;
  return Number(parseAccounting(value)) || 0;
}
