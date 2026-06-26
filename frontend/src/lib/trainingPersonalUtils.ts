import { formatDateLocal, getTodayLocal } from '@/lib/dateUtils';

export const MATRIX_EXPIRY_WARNING_DAYS = 183;
export const EXPIRING_ALERT_HORIZON_DAYS = 90;

export type MatrixTone = 'green' | 'yellow' | 'red' | null;

export type HrTrainingRecord = {
  id: string;
  title: string;
  provider?: string | null;
  category?: string | null;
  delivery_format?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  completion_date?: string | null;
  status?: string | null;
  expiry_date?: string | null;
  training_source?: string;
  crew?: string | null;
  location?: string | null;
  session_time?: string | null;
  duration_hours?: number | null;
  certificate_number?: string | null;
  notes?: string | null;
  matrix_training_id?: string | null;
  item_type_label?: string | null;
};

export type PersonalCalendarEvent = {
  id: string;
  title: string;
  status: string;
  event_start: string;
  event_end: string;
  provider?: string | null;
  category?: string | null;
};

export type ExpiringAlert = {
  id: string;
  title: string;
  source: 'lms' | 'hr';
  expiry_date: string;
  days_until_expiry: number;
  urgency: 'green' | 'yellow' | 'red';
  course_id?: string;
};

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = String(s).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysInRange(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const start = parseYmd(startStr);
  const end = parseYmd(endStr);
  if (!start || !end) return startStr ? [startStr.slice(0, 10)] : [];
  if (end < start) return [formatDateLocal(start)];
  const d = new Date(start);
  while (d <= end) {
    out.push(formatDateLocal(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function trainingCalendarSpan(r: HrTrainingRecord): { start: string; end: string } | null {
  const st = (r.status || 'completed').trim().toLowerCase();
  const start = r.start_date?.slice(0, 10);
  const end = r.end_date?.slice(0, 10);
  const completion = r.completion_date?.slice(0, 10);

  if (st === 'scheduled' || st === 'in_progress') {
    if (!start) return null;
    return { start, end: end || start };
  }
  if (st === 'completed' || st === 'expired') {
    if (start && end) return { start, end };
    if (completion) return { start: completion, end: completion };
    if (start) return { start, end: start };
    return null;
  }
  return null;
}

export function buildCalendarEventsFromRecords(records: HrTrainingRecord[]): PersonalCalendarEvent[] {
  const out: PersonalCalendarEvent[] = [];
  for (const r of records) {
    const span = trainingCalendarSpan(r);
    if (!span) continue;
    out.push({
      id: r.id,
      title: r.title,
      status: r.status || 'completed',
      event_start: span.start,
      event_end: span.end,
      provider: r.provider,
      category: r.category,
    });
  }
  out.sort((a, b) => `${a.event_start}${a.title}`.localeCompare(`${b.event_start}${b.title}`));
  return out;
}

export function matrixCellTone(record: HrTrainingRecord | null | undefined): MatrixTone {
  if (!record) return null;
  const today = parseYmd(getTodayLocal())!;
  const st = (record.status || 'completed').trim().toLowerCase();
  const ex = parseYmd(record.expiry_date);

  if (ex) {
    if (ex < today) return 'red';
    const daysLeft = Math.round((ex.getTime() - today.getTime()) / 86400000);
    if (daysLeft <= MATRIX_EXPIRY_WARNING_DAYS) return 'yellow';
    return 'green';
  }
  if (st === 'expired') return 'red';
  if (st === 'in_progress' || st === 'scheduled') return 'yellow';
  if (record.completion_date || record.start_date || st === 'completed') return 'green';
  return 'green';
}

function urgencyFromDays(days: number): 'green' | 'yellow' | 'red' {
  if (days < 0) return 'red';
  if (days <= 30) return 'red';
  if (days <= MATRIX_EXPIRY_WARNING_DAYS) return 'yellow';
  return 'green';
}

export function buildExpiringAlerts(
  certificates: Array<{ id: string; course_title?: string; expires_at?: string; is_expired: boolean; course_id: string }>,
  records: HrTrainingRecord[],
): ExpiringAlert[] {
  const today = parseYmd(getTodayLocal())!;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + EXPIRING_ALERT_HORIZON_DAYS);
  const alerts: ExpiringAlert[] = [];

  for (const c of certificates) {
    if (!c.expires_at || c.is_expired) continue;
    const ex = parseYmd(c.expires_at);
    if (!ex || ex > horizon) continue;
    const days = Math.round((ex.getTime() - today.getTime()) / 86400000);
    alerts.push({
      id: `lms-${c.id}`,
      title: c.course_title || 'LMS certificate',
      source: 'lms',
      expiry_date: c.expires_at.slice(0, 10),
      days_until_expiry: days,
      urgency: urgencyFromDays(days),
      course_id: c.course_id,
    });
  }

  for (const r of records) {
    if (!r.expiry_date) continue;
    const ex = parseYmd(r.expiry_date);
    if (!ex) continue;
    if (ex > horizon && ex >= today) continue;
    const days = Math.round((ex.getTime() - today.getTime()) / 86400000);
    if (days > EXPIRING_ALERT_HORIZON_DAYS) continue;
    alerts.push({
      id: `hr-${r.id}`,
      title: r.title,
      source: 'hr',
      expiry_date: r.expiry_date.slice(0, 10),
      days_until_expiry: days,
      urgency: urgencyFromDays(days),
    });
  }

  alerts.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  return alerts;
}

export function upcomingScheduledRecords(records: HrTrainingRecord[], limit = 5): HrTrainingRecord[] {
  const today = getTodayLocal();
  return records
    .filter((r) => {
      const st = (r.status || '').toLowerCase();
      if (st !== 'scheduled' && st !== 'in_progress') return false;
      const start = r.start_date?.slice(0, 10);
      return start ? start >= today : st === 'in_progress';
    })
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
    .slice(0, limit);
}

export function formatRecordTypeLabel(r: HrTrainingRecord): string {
  if (r.item_type_label) return r.item_type_label;
  if (r.category) return r.category;
  if (r.delivery_format) {
    if (r.delivery_format === 'in_person') return 'In person';
    if (r.delivery_format === 'online') return 'Online';
    if (r.delivery_format === 'hybrid') return 'Hybrid';
    return r.delivery_format;
  }
  return '—';
}

export function formatStatusLabel(status: string | null | undefined): string {
  const t = (status || '').replace(/_/g, ' ');
  return t ? t.replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
}
