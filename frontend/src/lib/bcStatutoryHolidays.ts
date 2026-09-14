import { formatDateLocal } from '@/lib/dateUtils';

/** Local calendar date at noon to avoid DST edge cases. */
function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

/** nth weekday in a month (weekday: 0=Sun … 6=Sat). n is 1-based. */
function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, n: number): Date {
  const first = localDate(year, monthIndex, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return localDate(year, monthIndex, 1 + offset + (n - 1) * 7);
}

/** Monday on or before May 24 (Victoria Day). */
function victoriaDay(year: number): Date {
  const may24 = localDate(year, 4, 24);
  const day = may24.getDay();
  const daysBack = day === 0 ? 6 : day - 1;
  return localDate(year, 4, 24 - daysBack);
}

/**
 * Easter Sunday (Anonymous Gregorian algorithm).
 * Good Friday is two days earlier.
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return localDate(year, month - 1, day);
}

function setHoliday(map: Map<string, string>, date: Date, name: string): void {
  map.set(formatDateLocal(date), name);
}

/** Next weekday on or after `from` that is not already a holiday. */
function nextFreeWeekday(map: Map<string, string>, from: Date): Date {
  let d = localDate(from.getFullYear(), from.getMonth(), from.getDate());
  while (d.getDay() === 0 || d.getDay() === 6 || map.has(formatDateLocal(d))) {
    d = localDate(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return d;
}

/**
 * When a fixed holiday falls on Saturday or Sunday, label the common weekday
 * observance on the next free weekday after the weekend.
 */
function addWeekendObservance(map: Map<string, string>, date: Date, name: string): void {
  const dow = date.getDay();
  if (dow !== 0 && dow !== 6) return;
  const start = localDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + (dow === 6 ? 2 : 1),
  );
  const observed = nextFreeWeekday(map, start);
  const key = formatDateLocal(observed);
  if (!map.has(key)) map.set(key, `${name} (observed)`);
}

/**
 * British Columbia statutory holidays for a calendar year.
 * Keys are YYYY-MM-DD in local time.
 */
export function getBcStatutoryHolidays(year: number): Map<string, string> {
  const map = new Map<string, string>();

  const newYears = localDate(year, 0, 1);
  const familyDay = nthWeekdayOfMonth(year, 1, 1, 3);
  const easter = easterSunday(year);
  const goodFriday = localDate(year, easter.getMonth(), easter.getDate() - 2);
  const victoria = victoriaDay(year);
  const canadaDay = localDate(year, 6, 1);
  const bcDay = nthWeekdayOfMonth(year, 7, 1, 1);
  const labourDay = nthWeekdayOfMonth(year, 8, 1, 1);
  const truthReconciliation = localDate(year, 8, 30);
  const thanksgiving = nthWeekdayOfMonth(year, 9, 1, 2);
  const remembrance = localDate(year, 10, 11);
  const christmas = localDate(year, 11, 25);
  const boxingDay = localDate(year, 11, 26);

  // Calendar dates first so consecutive holidays (e.g. Christmas + Boxing Day)
  // do not overwrite each other when adding weekend observances.
  setHoliday(map, newYears, "New Year's Day");
  setHoliday(map, familyDay, 'Family Day');
  setHoliday(map, goodFriday, 'Good Friday');
  setHoliday(map, victoria, 'Victoria Day');
  setHoliday(map, canadaDay, 'Canada Day');
  setHoliday(map, bcDay, 'B.C. Day');
  setHoliday(map, labourDay, 'Labour Day');
  setHoliday(map, truthReconciliation, 'National Day for Truth and Reconciliation');
  setHoliday(map, thanksgiving, 'Thanksgiving');
  setHoliday(map, remembrance, 'Remembrance Day');
  setHoliday(map, christmas, 'Christmas Day');
  setHoliday(map, boxingDay, 'Boxing Day');

  addWeekendObservance(map, newYears, "New Year's Day");
  addWeekendObservance(map, canadaDay, 'Canada Day');
  addWeekendObservance(map, truthReconciliation, 'National Day for Truth and Reconciliation');
  addWeekendObservance(map, remembrance, 'Remembrance Day');
  addWeekendObservance(map, christmas, 'Christmas Day');
  addWeekendObservance(map, boxingDay, 'Boxing Day');

  return map;
}

export function getBcHolidayName(date: Date): string | null {
  return getBcStatutoryHolidays(date.getFullYear()).get(formatDateLocal(date)) ?? null;
}
