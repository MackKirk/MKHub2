import type { ProjectEvent } from "../services/projectEvents";
import { formatDateLocal } from "./dateUtils";

type Occurrence = { date: string; event: ProjectEvent };

export function generateEventOccurrences(
  event: ProjectEvent,
  startDate: Date,
  endDate: Date
): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const eventStart = new Date(event.start_datetime);
  const eventEnd = new Date(event.end_datetime);
  const repeatType = event.repeat_type || "none";

  if (repeatType === "none") {
    const current = new Date(Math.max(eventStart.getTime(), startDate.getTime()));
    const end = new Date(Math.min(eventEnd.getTime(), endDate.getTime()));
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    while (current <= end) {
      const dateKey = formatDateLocal(current);
      const exceptions = Array.isArray(event.exceptions) ? event.exceptions : [];
      if (!exceptions.includes(dateKey)) {
        occurrences.push({ date: dateKey, event });
      }
      current.setDate(current.getDate() + 1);
    }
    return occurrences;
  }

  const repeatConfig = (event.repeat_config ?? {}) as {
    interval?: number;
    daysOfWeek?: boolean[];
  };
  const repeatInterval = repeatConfig.interval || 1;
  const repeatDaysOfWeek = Array.isArray(repeatConfig.daysOfWeek)
    ? repeatConfig.daysOfWeek
    : undefined;
  const repeatUntil = event.repeat_until ? new Date(event.repeat_until) : null;
  const repeatCount = event.repeat_count;

  let current = new Date(eventStart);
  let count = 0;
  const maxCount = repeatCount || 365;
  const viewEnd = repeatUntil
    ? new Date(Math.min(repeatUntil.getTime(), endDate.getTime()))
    : endDate;

  while (current <= viewEnd && count < maxCount) {
    const dateKey = formatDateLocal(current);

    if (current < startDate) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    const exceptions = Array.isArray(event.exceptions) ? event.exceptions : [];
    if (exceptions.includes(dateKey)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    let shouldInclude = false;
    const daysDiff = Math.floor(
      (current.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (repeatType === "daily") {
      shouldInclude = daysDiff % repeatInterval === 0 && daysDiff >= 0;
    } else if (repeatType === "weekly" && repeatDaysOfWeek) {
      const dayOfWeek = current.getDay();
      if (repeatDaysOfWeek[dayOfWeek]) {
        const startDateDayOfWeek = eventStart.getDay();
        const startWeekStart = new Date(eventStart);
        startWeekStart.setDate(startWeekStart.getDate() - startDateDayOfWeek);
        startWeekStart.setHours(0, 0, 0, 0);

        const currentDayOfWeek = current.getDay();
        const currentWeekStart = new Date(current);
        currentWeekStart.setDate(currentWeekStart.getDate() - currentDayOfWeek);
        currentWeekStart.setHours(0, 0, 0, 0);

        const weeksDiff = Math.floor(
          (currentWeekStart.getTime() - startWeekStart.getTime()) /
            (1000 * 60 * 60 * 24 * 7)
        );
        shouldInclude = weeksDiff >= 0 && weeksDiff % repeatInterval === 0;
      }
    } else if (repeatType === "monthly") {
      if (current.getDate() === eventStart.getDate()) {
        const monthsDiff =
          (current.getFullYear() - eventStart.getFullYear()) * 12 +
          (current.getMonth() - eventStart.getMonth());
        shouldInclude = monthsDiff % repeatInterval === 0 && monthsDiff >= 0;
      }
    } else if (repeatType === "yearly") {
      if (
        current.getMonth() === eventStart.getMonth() &&
        current.getDate() === eventStart.getDate()
      ) {
        const yearsDiff = current.getFullYear() - eventStart.getFullYear();
        shouldInclude = yearsDiff % repeatInterval === 0 && yearsDiff >= 0;
      }
    }

    if (shouldInclude || (daysDiff === 0 && repeatType !== "none")) {
      occurrences.push({ date: dateKey, event });
      count++;
    }

    current.setDate(current.getDate() + 1);
    if (daysDiff > 1000) break;
  }

  if (Array.isArray(event.extra_dates)) {
    for (const dateStr of event.extra_dates) {
      const extraDate = new Date(dateStr);
      if (extraDate >= startDate && extraDate <= endDate) {
        if (!occurrences.find((o) => o.date === dateStr)) {
          occurrences.push({ date: dateStr, event });
        }
      }
    }
  }

  return occurrences;
}

export function groupEventsByDate(
  events: ProjectEvent[],
  anchorDate: Date
): Record<string, ProjectEvent[]> {
  const grouped: Record<string, ProjectEvent[]> = {};

  const viewStart = new Date(anchorDate);
  viewStart.setMonth(viewStart.getMonth() - 1);
  viewStart.setDate(1);
  viewStart.setHours(0, 0, 0, 0);

  const viewEnd = new Date(anchorDate);
  viewEnd.setMonth(viewEnd.getMonth() + 2);
  viewEnd.setDate(0);
  viewEnd.setHours(23, 59, 59);

  for (const event of events) {
    const occurrences = generateEventOccurrences(event, viewStart, viewEnd);
    for (const { date, event: eventRef } of occurrences) {
      if (!grouped[date]) grouped[date] = [];
      if (!grouped[date].find((e) => e.id === eventRef.id)) {
        grouped[date].push(eventRef);
      }
    }
  }

  return grouped;
}

export function formatEventTimeRange(event: ProjectEvent): string {
  if (event.is_all_day) return "All day";
  const start = new Date(event.start_datetime);
  const end = new Date(event.end_datetime);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit"
  };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}
