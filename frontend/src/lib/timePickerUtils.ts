/** 12-hour clock options (1–12). */
export const TIME_HOUR_12_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/** Five-minute steps (00, 05, …, 55). */
export const TIME_MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = String(i * 5).padStart(2, '0');
  return { value: m, label: m };
});

export const TIME_AM_PM_OPTIONS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
] as const;

export type TimeAmPm = (typeof TIME_AM_PM_OPTIONS)[number]['value'];

export function parseHhmm(value: string): {
  hour12: string;
  minute: string;
  amPm: TimeAmPm | '';
} {
  const raw = String(value || '').trim();
  if (!raw.includes(':')) {
    return { hour12: '', minute: '', amPm: '' };
  }
  const [h24Str, minStr = ''] = raw.split(':');
  const h24 = parseInt(h24Str, 10);
  const minute = minStr.slice(0, 2).padStart(2, '0');
  if (Number.isNaN(h24) || !/^\d{2}$/.test(minute)) {
    return { hour12: '', minute: '', amPm: '' };
  }
  const amPm: TimeAmPm = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour12: String(hour12), minute, amPm };
}

export function buildHhmm(hour12: string, minute: string, amPm: TimeAmPm | ''): string {
  if (!hour12 || !minute || !amPm) return '';
  const h12 = parseInt(hour12, 10);
  if (Number.isNaN(h12) || h12 < 1 || h12 > 12) return '';
  const h24 = amPm === 'PM' && h12 !== 12 ? h12 + 12 : amPm === 'AM' && h12 === 12 ? 0 : h12;
  return `${String(h24).padStart(2, '0')}:${minute}`;
}

/** Display for trigger, e.g. `9:30 AM`. */
export function formatTimeDisplay(hhmm: string): string {
  const { hour12, minute, amPm } = parseHhmm(hhmm);
  if (!hour12 || !minute || !amPm) return '';
  return `${hour12}:${minute} ${amPm}`;
}
