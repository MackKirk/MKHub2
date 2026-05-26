export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function toIsoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0);
}

export function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 12, 0, 0, 0);
}

export function formatDateDisplay(iso: string) {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Overline on card trigger — "Today" or weekday short (Mon, Tue, …). */
export function formatDatePickerCardOverline(iso: string, todayIso?: string) {
  const today = todayIso ?? toIsoDateLocal(new Date());
  if (iso === today) return 'Today';
  const d = parseIsoDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** Primary line on card trigger — e.g. "May 26, 2026". */
export function formatDatePickerCardValue(iso: string) {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildMonthGrid(viewMonth: Date) {
  const first = startOfMonth(viewMonth);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const cells: { date: Date; iso: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      iso: toIsoDateLocal(date),
      inMonth: date.getMonth() === viewMonth.getMonth(),
    });
  }
  return cells;
}

export function isIsoInRange(iso: string, min?: string, max?: string) {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}
