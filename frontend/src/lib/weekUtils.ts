import { formatDateLocal } from '@/lib/dateUtils';

/** Sunday 00:00 local of the week containing `d`. */
export function startOfSundayWeek(d: Date = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function weekDateStrings(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => formatDateLocal(addDays(weekStart, i)));
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayShort(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  if (!y || !m || !day) return '';
  const d = new Date(y, m - 1, day);
  return WEEKDAY_SHORT[d.getDay()] || '';
}

export function formatWeekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(end)}`;
}
