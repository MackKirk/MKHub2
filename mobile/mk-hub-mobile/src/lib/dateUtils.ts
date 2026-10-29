/** YYYY-MM-DD of now + 24 hours, in local timezone */
export function earliestTimeOffDate(from = new Date()): string {
  return formatDateLocal(new Date(from.getTime() + 24 * 60 * 60 * 1000));
}

/** Local calendar date at noon, as an ISO timestamp for the API. */
export function localDateInputToIso(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) throw new Error("Use a date like 2026-04-15.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error("Use a date like 2026-04-15.");
  }
  return date.toISOString();
}

/** YYYY-MM-DD in local timezone */
export function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildMonthGrid(anchorDate: Date): Array<{
  date: Date | null;
  key: string;
}> {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < totalCells; i++) {
    const dayIndex = i - firstWeekday + 1;
    if (dayIndex >= 1 && dayIndex <= daysInMonth) {
      const d = new Date(year, month, dayIndex);
      cells.push({ date: d, key: formatDateLocal(d) });
    } else {
      cells.push({ date: null, key: `blank-${i}` });
    }
  }
  return cells;
}
