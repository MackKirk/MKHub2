import type { CSSProperties } from 'react';
import { shiftAckMeta, shiftAckNeedsResponse, shiftAckTracked } from '@/lib/shiftAck';
import type {
  ProjectCalendarDivision,
  ProjectCalendarPerson,
  ProjectCalendarShift,
} from './projectCalendar.types';

export type AggregatedShiftAck = {
  status: 'declined' | 'pending' | 'accepted';
  meta: ReturnType<typeof shiftAckMeta>;
  people: { name: string; statusLabel: string }[];
};

/** Worst-first ack rollup for calendar chips. Returns null when nothing is tracked. */
export function aggregateShiftAck(
  shifts: ProjectCalendarShift[] | null | undefined,
): AggregatedShiftAck | null {
  const tracked = (Array.isArray(shifts) ? shifts : []).filter((s) =>
    shiftAckTracked(s.ack_status),
  );
  if (tracked.length === 0) return null;

  let hasDeclined = false;
  let hasPending = false;
  let allAccepted = true;

  const people = tracked.map((s) => {
    const status = (s.ack_status || 'pending').toLowerCase();
    if (status === 'declined') {
      hasDeclined = true;
      allAccepted = false;
    } else if (shiftAckNeedsResponse(s.ack_status) || status === 'pending' || status === 'viewed') {
      hasPending = true;
      allAccepted = false;
    } else if (status !== 'accepted') {
      allAccepted = false;
      hasPending = true;
    }
    return {
      name: s.worker_name?.trim() || 'Worker',
      statusLabel: shiftAckMeta(s.ack_status).shortLabel,
    };
  });

  const status: AggregatedShiftAck['status'] = hasDeclined
    ? 'declined'
    : hasPending || !allAccepted
      ? 'pending'
      : 'accepted';

  return {
    status,
    meta: shiftAckMeta(status === 'pending' ? 'pending' : status),
    people,
  };
}

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

export function normalizeDivisionHex(value?: string | null): string | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(withHash)) return null;
  if (withHash.length === 4) {
    return `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`;
  }
  return withHash;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeDivisionHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function mixWithWhite(hex: string, whiteAmount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#f3f4f6';
  const t = Math.min(1, Math.max(0, whiteAmount));
  const r = Math.round(rgb.r + (255 - rgb.r) * t);
  const g = Math.round(rgb.g + (255 - rgb.g) * t);
  const b = Math.round(rgb.b + (255 - rgb.b) * t);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#111827';
  const t = Math.min(1, Math.max(0, amount));
  const r = Math.round(rgb.r * (1 - t));
  const g = Math.round(rgb.g * (1 - t));
  const b = Math.round(rgb.b * (1 - t));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const FALLBACK_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#ef4444', // red
  '#0ea5e9', // sky
  '#84cc16', // lime
  '#ec4899', // pink
];

/** Stable palette color when settings color is missing / placeholder gray. */
export function fallbackDivisionColor(divisionId?: string | null): string {
  const id = String(divisionId || '');
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

export function resolveDivisionColor(
  color?: string | null,
  divisionId?: string | null,
): string {
  const hex = normalizeDivisionHex(color);
  if (hex && hex !== '#cccccc' && hex !== '#ccc') return hex;
  return fallbackDivisionColor(divisionId);
}

/** Soft chip surface from division settings hex (or stable palette fallback). */
export function divisionChipStyle(
  color?: string | null,
  divisionId?: string | null,
): CSSProperties {
  const hex = resolveDivisionColor(color, divisionId);
  return {
    backgroundColor: mixWithWhite(hex, 0.88),
    borderColor: mixWithWhite(hex, 0.55),
    color: darkenHex(hex, 0.55),
  };
}

export function divisionSwatchColor(color?: string | null, divisionId?: string | null): string {
  return resolveDivisionColor(color, divisionId);
}

export function collectPrimaryDivisionsFromDays(
  daysByKey: Record<string, { primary_division?: ProjectCalendarDivision | null }[]>,
): ProjectCalendarDivision[] {
  const byId = new Map<string, ProjectCalendarDivision>();
  for (const entries of Object.values(daysByKey)) {
    for (const entry of entries || []) {
      const d = entry.primary_division;
      if (!d?.id || byId.has(d.id)) continue;
      byId.set(d.id, { id: d.id, label: d.label, color: d.color });
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
