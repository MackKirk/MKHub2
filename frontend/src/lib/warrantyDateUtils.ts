import { formatDateLocal, parseApiDateForDisplay } from '@/lib/dateUtils';

export type WarrantyDurationUnit = 'days' | 'months' | 'years';

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(d: Date, months: number): Date {
  const month = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(month / 12);
  const normalizedMonth = ((month % 12) + 12) % 12;
  const day = Math.min(d.getDate(), daysInMonth(year, normalizedMonth + 1));
  return new Date(year, normalizedMonth, day);
}

function addYears(d: Date, years: number): Date {
  const targetYear = d.getFullYear() + years;
  const month = d.getMonth();
  const day = d.getDate();
  const lastDay = daysInMonth(targetYear, month + 1);
  return new Date(targetYear, month, Math.min(day, lastDay));
}

/**
 * Mirrors backend calculate_end_date (app/services/warranty.py).
 * Returns YYYY-MM-DD or null when inputs are incomplete/invalid.
 */
export function calculateWarrantyEndDate(
  startYmd: string,
  durationValue: number | string,
  durationUnit: string,
): string | null {
  const start = parseApiDateForDisplay(startYmd);
  if (!start) return null;

  const value = typeof durationValue === 'string' ? Number(durationValue) : durationValue;
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = (durationUnit || '').trim().toLowerCase() as WarrantyDurationUnit;
  let end: Date;
  if (unit === 'days') {
    end = new Date(start);
    end.setDate(end.getDate() + value);
  } else if (unit === 'months') {
    end = addMonths(start, value);
  } else if (unit === 'years') {
    end = addYears(start, value);
  } else {
    return null;
  }

  return formatDateLocal(end);
}
