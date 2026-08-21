import { formatDateLocal } from "./dateUtils";

export function previousWeekday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

export function isWeekday(date = new Date()): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function formatWeekdayLong(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

export function formatDateKey(date = new Date()): string {
  return formatDateLocal(date);
}
