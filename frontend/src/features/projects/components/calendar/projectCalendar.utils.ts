import type { ProjectCalendarPerson } from './projectCalendar.types';

export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return timeStr;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${hours12}:${minutes} ${period}`;
}

export function personToAvatarUser(person: ProjectCalendarPerson) {
  return {
    id: person.id,
    name: person.name ?? undefined,
    profile_photo_file_id: person.avatar_file_id ?? undefined,
  };
}

export function formatShiftTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  const start = formatTime12h(startTime);
  const end = formatTime12h(endTime);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}
