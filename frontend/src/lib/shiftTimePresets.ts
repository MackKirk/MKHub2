export type ShiftTimePreset = 'all_day' | 'morning' | 'afternoon' | 'evening' | 'custom';

export type ShiftTimeRange = {
  start: string;
  end: string;
};

export const SHIFT_TIME_PRESETS: Record<Exclude<ShiftTimePreset, 'custom'>, ShiftTimeRange> = {
  all_day: { start: '06:00', end: '17:00' },
  morning: { start: '06:00', end: '12:00' },
  afternoon: { start: '12:00', end: '17:00' },
  evening: { start: '17:00', end: '21:00' },
};

export const CUSTOM_TIME_SEED: ShiftTimeRange = { start: '09:00', end: '17:00' };

export const SHIFT_TIME_PRESET_OPTIONS: { value: ShiftTimePreset; label: string }[] = [
  { value: 'all_day', label: 'All day' },
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'custom', label: 'Custom' },
];

function normalizeHm(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = String(value).trim();
  // Accept HH:MM or HH:MM:SS
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed;
}

export function resolvePresetTimes(preset: ShiftTimePreset): ShiftTimeRange {
  if (preset === 'custom') return { ...CUSTOM_TIME_SEED };
  return { ...SHIFT_TIME_PRESETS[preset] };
}

export function detectPreset(
  start: string | null | undefined,
  end: string | null | undefined,
): ShiftTimePreset {
  const s = normalizeHm(start);
  const e = normalizeHm(end);
  for (const [key, range] of Object.entries(SHIFT_TIME_PRESETS) as [
    Exclude<ShiftTimePreset, 'custom'>,
    ShiftTimeRange,
  ][]) {
    if (range.start === s && range.end === e) return key;
  }
  return 'custom';
}
