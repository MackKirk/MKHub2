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
