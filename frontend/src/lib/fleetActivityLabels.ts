/**
 * Human-readable lines for fleet asset Activity history (audit-backed), similar to project Recent Activity.
 */

const FLEET_ASSET_FIELD_LABELS: Record<string, string> = {
  asset_type: 'Asset type',
  name: 'Name',
  unit_number: 'Unit number',
  vin: 'VIN',
  license_plate: 'License',
  make: 'Make',
  model: 'Model',
  year: 'Year',
  condition: 'Condition',
  body_style: 'Body style',
  division_id: 'Division',
  odometer_current: 'Odometer (current)',
  odometer_last_service: 'Odometer (last service)',
  hours_current: 'Hours (current)',
  hours_last_service: 'Hours (last service)',
  status: 'Status',
  driver_id: 'Driver',
  icbc_registration_no: 'ICBC registration',
  vancouver_decals: 'Vancouver decals',
  ferry_length: 'Ferry length',
  gvw_kg: 'GVW (kg)',
  fuel_type: 'Fuel type',
  vehicle_type: 'Vehicle type',
  driver_contact_phone: 'Driver phone',
  yard_location: 'Yard location',
  gvw_value: 'GVW value',
  gvw_unit: 'GVW unit',
  equipment_type_label: 'Equipment type',
  odometer_next_due_at: 'Odometer next due',
  odometer_noted_issues: 'Odometer issues',
  propane_sticker_cert: 'Propane sticker cert',
  propane_sticker_date: 'Propane sticker date',
  hours_next_due_at: 'Hours next due',
  hours_noted_issues: 'Hours issues',
  photos: 'Photos',
  documents: 'Documents',
  notes: 'Notes',
};

const FLEET_INSPECTION_LABELS: Record<string, string> = {
  inspection_date: 'Inspection date',
  inspection_type: 'Inspection type',
  result: 'Result',
  odometer_reading: 'Odometer reading',
  hours_reading: 'Hours reading',
  inspector_user_id: 'Inspector',
  inspection_schedule_id: 'Schedule',
};

const INSPECTION_SCHEDULE_LABELS: Record<string, string> = {
  scheduled_at: 'Scheduled at',
  urgency: 'Urgency',
  category: 'Category',
  status: 'Status',
  notes: 'Notes',
};

const COMPLIANCE_LABELS: Record<string, string> = {
  record_type: 'Record type',
  facility: 'Facility',
  completed_by: 'Completed by',
  equipment_classification: 'Classification',
  equipment_make_model: 'Make / model',
  serial_number: 'Serial number',
  annual_inspection_date: 'Annual inspection',
  expiry_date: 'Expiry',
  file_reference_number: 'File reference',
  notes: 'Notes',
};

const WORK_ORDER_LABELS: Record<string, string> = {
  work_order_number: 'Work order #',
  description: 'Description',
  category: 'Category',
  urgency: 'Urgency',
  status: 'Status',
  assigned_to_user_id: 'Assigned to',
  scheduled_start_at: 'Scheduled start',
  estimated_duration_minutes: 'Expected duration (min)',
  check_in_at: 'Check-in',
  check_out_at: 'Check-out',
  closed_at: 'Closed at',
  odometer_reading: 'Odometer',
  hours_reading: 'Hours',
  costs: 'Costs',
};

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_OR_DATETIME_PREFIX = /^\d{4}-\d{2}-\d{2}(?:[T ]\d|$)/;

function fieldKeyLooksLikeDateTime(fieldKey: string): boolean {
  const k = fieldKey.toLowerCase();
  return (
    k.endsWith('_at') ||
    k.endsWith('_date') ||
    k.includes('timestamp') ||
    k === 'scheduled_at' ||
    k.endsWith('_scheduled_at')
  );
}

/**
 * Formats audit ISO date/datetime strings for display; returns null if not a parseable date value.
 * @param preferDateOnly — for `*_date` fields: show calendar date only (avoids noisy midnight from ISO).
 */
function formatFleetAuditDateTimeString(raw: string, preferDateOnly = false): string | null {
  const t = raw.trim();
  if (!t || !ISO_DATE_OR_DATETIME_PREFIX.test(t)) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  if (preferDateOnly) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
  }
  const hasClock = t.includes('T') || /\d{2}:\d{2}/.test(t.slice(10));
  if (hasClock && t.length >= 13) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

/** True when audit payload is a delete snapshot (no before/after diff). */
export function isFleetAuditDeleteOnlyChanges(changes: Record<string, unknown> | null | undefined): boolean {
  if (!changes || typeof changes !== 'object') return false;
  const del = changes.deleted;
  if (!del || typeof del !== 'object' || Array.isArray(del)) return false;
  const before = changes.before;
  const after = changes.after;
  const bEmpty =
    !before || (typeof before === 'object' && !Array.isArray(before) && Object.keys(before as object).length === 0);
  const aEmpty =
    !after || (typeof after === 'object' && !Array.isArray(after) && Object.keys(after as object).length === 0);
  return bEmpty && aEmpty && Object.keys(del as object).length > 0;
}

/**
 * Human-readable value for a specific audited field (history lines + change modal).
 * Hides raw file UUIDs for photos/documents; shortens bare UUID id fields.
 */
export function formatFleetHistoryFieldValue(
  entityType: string | undefined,
  fieldKey: string,
  value: unknown
): string {
  if (value === null || value === undefined) return '—';
  const fk = fieldKey.toLowerCase();

  if (typeof value === 'string' && fieldKeyLooksLikeDateTime(fk)) {
    const dateOnly = fk.endsWith('_date') && !fk.endsWith('_at');
    const formatted = formatFleetAuditDateTimeString(value, dateOnly);
    if (formatted !== null) return formatted;
  }

  if (fk === 'photos' || fk === 'documents') {
    if (Array.isArray(value)) {
      if (value.length === 0) return 'None';
      const unit = fk === 'photos' ? 'photo' : 'document';
      return `${value.length} ${unit}${value.length === 1 ? '' : 's'}`;
    }
    if (fk === 'photos' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const o = value as { before?: unknown; after?: unknown };
      const nb = Array.isArray(o.before) ? o.before.length : 0;
      const na = Array.isArray(o.after) ? o.after.length : 0;
      if (nb === 0 && na === 0) return 'None';
      return `Attachments (${nb} before / ${na} after)`;
    }
  }

  if (typeof value === 'string') {
    const t = value.trim();
    if (t && UUID_LIKE.test(t) && (fk.endsWith('_id') || fk === 'id')) {
      return `ID …${t.slice(0, 8)}`;
    }
  }

  return formatFleetAuditValue(value);
}

/** Readable single value for audit / history UI (exported for change-detail modal). */
export function formatFleetAuditValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) {
      const s = v.map(String).join(', ');
      return s.length > 80 ? `${s.slice(0, 77)}…` : s;
    }
    return `${v.length} item(s)`;
  }
  if (typeof v === 'object') {
    const j = JSON.stringify(v);
    return j.length > 100 ? `${j.slice(0, 97)}…` : j;
  }
  const s = String(v);
  if (s.length > 120) return `${s.slice(0, 117)}…`;
  return s;
}

/** @deprecated use formatFleetAuditValue */
function fmtVal(v: unknown): string {
  return formatFleetAuditValue(v);
}

function summarizeDiff(
  labels: Record<string, string>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedFields?: string[],
  entityType?: string
): string {
  const keys =
    changedFields && changedFields.length > 0
      ? changedFields
      : Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
        );
  const parts: string[] = [];
  for (const k of keys) {
    const lb = labels[k] || k.replace(/_/g, ' ');
    const b = before[k];
    const a = after[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    parts.push(
      `${lb}: ${formatFleetHistoryFieldValue(entityType, k, b)} → ${formatFleetHistoryFieldValue(entityType, k, a)}`
    );
  }
  return parts.join(' · ');
}

/** Human labels for keys that actually differ (same key resolution as {@link summarizeDiff}). */
function diffChangedFieldLabels(
  labels: Record<string, string>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedFields?: string[]
): string[] {
  const keys =
    changedFields && changedFields.length > 0
      ? changedFields
      : Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})])).filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
        );
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    out.push(labels[k] || k.replace(/_/g, ' '));
  }
  return out;
}

function joinFieldLabelsForUpdatePhrase(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function fleetAssetLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};

  if (act === 'CREATE') {
    const parts = Object.entries(after)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(
        ([k, v]) =>
          `${FLEET_ASSET_FIELD_LABELS[k] || k}: ${formatFleetHistoryFieldValue('fleet_asset', k, v)}`
      );
    return parts.length ? `Fleet asset created · ${parts.join(' · ')}` : 'Fleet asset created';
  }
  if (act === 'UPDATE') {
    return fleetAssetUpdateOneLiner(before, after, ctx);
  }
  if (act === 'DELETE') {
    return 'Fleet asset removed (retired)';
  }
  return `Fleet asset · ${action}`;
}

function fleetInspectionLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const del = changes.deleted as Record<string, unknown> | undefined;
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;

  if (act === 'CREATE') {
    const t = after.inspection_type ? String(after.inspection_type) : '';
    const r = after.result ? String(after.result) : '';
    const d = after.inspection_date
      ? formatFleetHistoryFieldValue('fleet_inspection', 'inspection_date', after.inspection_date)
      : '';
    return `Inspection${t ? ` (${t})` : ''}${d ? ` on ${d}` : ''}${r ? ` — ${r}` : ''}`.trim() || 'Inspection recorded';
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(FLEET_INSPECTION_LABELS, before, after, cf, 'fleet_inspection');
    return diff ? `Inspection updated · ${diff}` : 'Inspection updated';
  }
  if (act === 'DELETE' && del) {
    return `Inspection deleted (${formatFleetHistoryFieldValue('fleet_inspection', 'inspection_date', del.inspection_date)} · ${formatFleetHistoryFieldValue('fleet_inspection', 'result', del.result)})`;
  }
  return `Inspection · ${action}`;
}

function inspectionScheduleLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
  if (act === 'CREATE') {
    return `Inspection scheduled · ${formatFleetHistoryFieldValue('inspection_schedule', 'scheduled_at', after.scheduled_at)}`;
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(INSPECTION_SCHEDULE_LABELS, before, after, cf, 'inspection_schedule');
    return diff ? `Inspection schedule updated · ${diff}` : 'Inspection schedule updated';
  }
  if (act === 'DELETE') {
    return 'Inspection schedule removed';
  }
  return `Inspection schedule · ${action}`;
}

function complianceLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const del = changes.deleted as Record<string, unknown> | undefined;
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
  const rt = (ctx.record_type as string) || (after.record_type as string) || (del?.record_type as string);
  if (act === 'CREATE') {
    return rt ? `Compliance added: ${rt}` : 'Compliance added';
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(COMPLIANCE_LABELS, before, after, cf, 'fleet_compliance_record');
    return diff ? `Compliance updated${rt ? ` (${rt})` : ''} · ${diff}` : `Compliance updated${rt ? ` (${rt})` : ''}`;
  }
  if (act === 'DELETE' && del) {
    return `Compliance record removed (${formatFleetHistoryFieldValue('fleet_compliance_record', 'record_type', del.record_type)} · exp. ${formatFleetHistoryFieldValue('fleet_compliance_record', 'expiry_date', del.expiry_date)})`;
  }
  return `Compliance · ${action}`;
}

function workOrderLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const del = changes.deleted as Record<string, unknown> | undefined;
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
  const num = (ctx.work_order_number as string) || (after.work_order_number as string) || (del?.work_order_number as string) || '';
  const prefix = num ? `Work order ${num}` : 'Work order';

  if (act === 'CREATE') {
    return `${prefix} created`;
  }
  if (act === 'UPDATE') {
    if (changes.legacy_file_removed) {
      return `${prefix}: legacy file removed (${fmtVal(changes.category)})`;
    }
    const via = ctx.via ? ` [${String(ctx.via)}]` : '';
    const fieldLabels = diffChangedFieldLabels(WORK_ORDER_LABELS, before, after, cf);
    const phrase = joinFieldLabelsForUpdatePhrase(fieldLabels);
    return phrase ? `${prefix} ${phrase} updated${via}` : `${prefix} updated${via}`;
  }
  if (act === 'DELETE') {
    return `${prefix} deleted`;
  }
  return `${prefix} · ${action}`;
}

function workOrderFileLines(action: string, changes: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const name = (changes.original_name as string) || '';
  const cat = (changes.category as string) || '';
  const del = changes.deleted as { original_name?: string; category?: string } | undefined;
  if (act === 'CREATE') {
    return `Work order file added${cat ? ` (${cat})` : ''}: "${name}"`;
  }
  if (act === 'UPDATE') {
    const before = (changes.before as Record<string, unknown>) || {};
    const after = (changes.after as Record<string, unknown>) || {};
    return `Work order file updated · ${summarizeDiff({ category: 'Category', original_name: 'Name' }, before, after, undefined, 'work_order_file')}`;
  }
  if (act === 'DELETE' && del) {
    return `Work order file removed: "${del.original_name || ''}" (${del.category || ''})`;
  }
  return `Work order file · ${action}`;
}

function assetAssignmentLines(action: string, changes: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const name = (changes.assigned_to_name as string) || '';
  const uid = changes.assigned_to_user_id as string | undefined;
  const tgt = changes.target_type as string | undefined;
  const ret = changes.returned === true;
  if (act === 'CREATE') {
    return `Check-out recorded${tgt === 'fleet' ? '' : ` (${tgt || 'asset'})`} · assigned to ${name || uid || '—'}`;
  }
  if (act === 'UPDATE' && ret) {
    return `Return recorded · assignment closed`;
  }
  return `Assignment · ${action}`;
}

/** Audit-backed activity row (fleet asset history tab). */
export type FleetHistoryAuditItem = {
  source: string;
  kind?: string;
  title?: string;
  subtitle?: string | null;
  detail?: string | null;
  audit_action?: string | null;
  changes_json?: Record<string, unknown> | null;
  entity_type?: string | null;
  audit_context?: Record<string, unknown> | null;
};

function fleetAssetDiffKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  changedFields: string[] | null | undefined
): string[] {
  if (changedFields && changedFields.length > 0) {
    return changedFields.filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
    );
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

/** True when the only differing fields are `photos` and/or `documents`. */
function fleetAssetUpdateIsPhotosDocsOnly(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  cf: string[] | null | undefined
): boolean {
  const diff = fleetAssetDiffKeys(before, after, cf);
  return diff.length > 0 && diff.every((k) => k === 'photos' || k === 'documents');
}

/** Single-line fleet asset UPDATE label (list + history): field names or Photo/Documents only. */
function fleetAssetUpdateOneLiner(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ctx: Record<string, unknown>
): string {
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
  if (fleetAssetUpdateIsPhotosDocsOnly(before, after, cf)) {
    const diffKeys = fleetAssetDiffKeys(before, after, cf);
    const hasDocs = diffKeys.includes('documents');
    const hasPhotos = diffKeys.includes('photos');
    if (hasDocs && !hasPhotos) return 'Fleet asset Documents updated';
    return 'Fleet asset Photo updated';
  }
  const fieldLabels = diffChangedFieldLabels(FLEET_ASSET_FIELD_LABELS, before, after, cf);
  const phrase = joinFieldLabelsForUpdatePhrase(fieldLabels);
  if (ctx.note && typeof ctx.note === 'string') {
    return phrase
      ? `Fleet asset ${phrase} updated (${ctx.note})`
      : `Fleet asset updated (${ctx.note})`;
  }
  return phrase ? `Fleet asset ${phrase} updated` : 'Fleet asset updated';
}

/** True when this audit is a fleet asset update that only changed photos and/or documents. */
export function isFleetAuditPhotoOnlyAssetUpdate(item: FleetHistoryAuditItem): boolean {
  const et = (item.entity_type || '').toLowerCase();
  if (et !== 'fleet_asset') return false;
  if ((item.audit_action || '').toUpperCase() !== 'UPDATE') return false;
  const changes = item.changes_json;
  if (!changes || typeof changes !== 'object') return false;
  const before = (changes.before as Record<string, unknown>) || {};
  const after = (changes.after as Record<string, unknown>) || {};
  const ctx = item.audit_context || {};
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : null;
  return fleetAssetUpdateIsPhotosDocsOnly(before, after, cf);
}

/**
 * Whether this audit row should open the "change details" modal (UPDATE diffs worth drilling into).
 * Compliance CREATE shows a short list line; full fields open in the modal. DELETE and photo-only asset updates stay as plain list lines.
 */
export function fleetHistoryChangeDetailEligible(item: FleetHistoryAuditItem): boolean {
  if (item.source !== 'audit') return false;
  const action = (item.audit_action || '').toUpperCase();

  const et = (item.entity_type || '').toLowerCase();
  const allowed = new Set([
    'fleet_asset',
    'work_order',
    'fleet_inspection',
    'inspection_schedule',
    'fleet_compliance_record',
    'work_order_file',
    'asset_assignment',
  ]);
  if (!allowed.has(et)) return false;

  const cj = item.changes_json;
  if (!cj || typeof cj !== 'object') return false;
  if (et === 'work_order' && (cj as Record<string, unknown>).legacy_file_removed) return false;
  if (et === 'fleet_asset' && isFleetAuditPhotoOnlyAssetUpdate(item)) return false;

  const hasBefore = 'before' in cj && cj.before != null && typeof cj.before === 'object' && !Array.isArray(cj.before);
  const hasAfter = 'after' in cj && cj.after != null && typeof cj.after === 'object' && !Array.isArray(cj.after);

  if (et === 'fleet_compliance_record' && action === 'CREATE' && hasAfter) {
    return true;
  }

  if (action !== 'UPDATE') return false;

  return hasBefore || hasAfter;
}

/**
 * Short one-line label for the history list when the row opens the change-details modal.
 * Full detail stays in the modal (use {@link buildFleetHistoryDescription} there).
 */
export function buildFleetHistoryListSummary(item: FleetHistoryAuditItem): string {
  const et = (item.entity_type || '').toLowerCase();
  const changes = item.changes_json || {};
  const ctx = item.audit_context || {};

  switch (et) {
    case 'work_order': {
      const action = (item.audit_action || '').toUpperCase();
      const after = (changes.after as Record<string, unknown>) || {};
      const before = (changes.before as Record<string, unknown>) || {};
      const del = changes.deleted as Record<string, unknown> | undefined;
      const num =
        (ctx.work_order_number as string) ||
        (after.work_order_number as string) ||
        (del?.work_order_number as string) ||
        '';
      const prefix = num ? `Work order ${num}` : 'Work order';
      if (action === 'UPDATE' && !(changes as Record<string, unknown>).legacy_file_removed) {
        const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
        const fieldLabels = diffChangedFieldLabels(WORK_ORDER_LABELS, before, after, cf);
        const phrase = joinFieldLabelsForUpdatePhrase(fieldLabels);
        return phrase ? `${prefix} ${phrase} updated` : `${prefix} updated`;
      }
      return `${prefix} updated`;
    }
    case 'fleet_asset': {
      const action = (item.audit_action || '').toUpperCase();
      const after = (changes.after as Record<string, unknown>) || {};
      const before = (changes.before as Record<string, unknown>) || {};
      if (action === 'UPDATE') {
        return fleetAssetUpdateOneLiner(before, after, ctx);
      }
      return 'Fleet asset updated';
    }
    case 'fleet_inspection':
      return 'Inspection updated';
    case 'inspection_schedule':
      return 'Inspection schedule updated';
    case 'fleet_compliance_record': {
      const action = (item.audit_action || '').toUpperCase();
      const rt =
        (ctx.record_type as string) ||
        ((changes.after as Record<string, unknown>)?.record_type as string) ||
        '';
      if (action === 'CREATE') {
        return rt ? `Compliance added: ${rt}` : 'Compliance added';
      }
      return rt ? `Compliance updated (${rt})` : 'Compliance updated';
    }
    case 'work_order_file':
      return 'Work order file updated';
    case 'asset_assignment':
      return 'Assignment updated';
    default:
      return `${formatFleetAuditEntityTitle(item.entity_type)} updated`;
  }
}

/** Primary description for a unified fleet history row (assignment, fleet_log, or audit). */
export function buildFleetHistoryDescription(item: FleetHistoryAuditItem): string {
  if (item.source === 'assignment') {
    const base = item.title || '';
    const sub = item.subtitle ? ` · ${item.subtitle}` : '';
    const out = `${base}${sub}`.trim();
    return out || 'Activity';
  }
  if (item.source === 'fleet_log') {
    const t = item.title || 'Log';
    const d = item.detail?.trim();
    return d ? `${t}: ${d}` : t;
  }
  if (item.source === 'audit') {
    const action = (item.audit_action || 'UNKNOWN').toUpperCase();
    const entityType = (item.entity_type || '').toLowerCase();
    const changes = item.changes_json || {};
    const ctx = item.audit_context || {};

    switch (entityType) {
      case 'fleet_asset':
        return fleetAssetLines(action, changes, ctx);
      case 'fleet_inspection':
        return fleetInspectionLines(action, changes, ctx);
      case 'inspection_schedule':
        return inspectionScheduleLines(action, changes, ctx);
      case 'fleet_compliance_record':
        return complianceLines(action, changes, ctx);
      case 'work_order':
        return workOrderLines(action, changes, ctx);
      case 'work_order_file':
        return workOrderFileLines(action, changes);
      case 'asset_assignment':
        return assetAssignmentLines(action, changes);
      default:
        return `${(item.entity_type || 'Record').replace(/_/g, ' ')} · ${action}`;
    }
  }
  return item.title || 'Activity';
}

const WORK_ORDER_FILE_LABELS: Record<string, string> = {
  category: 'Category',
  original_name: 'File name',
};

const ASSET_ASSIGNMENT_CHANGE_LABELS: Record<string, string> = {
  target_type: 'Target type',
  fleet_asset_id: 'Fleet asset',
  equipment_id: 'Equipment',
  assigned_to_user_id: 'Assigned user',
  assigned_to_name: 'Assigned to',
  returned: 'Return completed',
};

/** Keys omitted from field-by-field change table (redundant on fleet asset page). */
const FLEET_AUDIT_ROW_SKIP_KEYS: Record<string, Set<string>> = {
  work_order: new Set(['entity_id', 'entity_type']),
  fleet_compliance_record: new Set(['fleet_asset_id']),
};

/** Short title segment for the entity that was audited (for modals). */
export function formatFleetAuditEntityTitle(entityType: string | null | undefined): string {
  const t = (entityType || '').toLowerCase();
  const map: Record<string, string> = {
    fleet_asset: 'Fleet asset',
    fleet_inspection: 'Inspection',
    inspection_schedule: 'Inspection schedule',
    fleet_compliance_record: 'Compliance record',
    work_order: 'Work order',
    work_order_file: 'Work order file',
    asset_assignment: 'Assignment',
  };
  return map[t] || (entityType || 'Record').replace(/_/g, ' ');
}

export function formatFleetAuditActionVerb(action: string | null | undefined): string {
  const a = (action || '').toUpperCase();
  if (a === 'CREATE') return 'Created';
  if (a === 'UPDATE') return 'Updated';
  if (a === 'DELETE') return 'Deleted';
  return action ? action.replace(/_/g, ' ') : 'Change';
}

export type FleetAuditChangeRow = {
  label: string;
  before: string;
  after: string;
};

function labelForFleetAuditField(entityType: string, fieldKey: string): string {
  const t = entityType.toLowerCase();
  const maps: Record<string, Record<string, string>> = {
    fleet_asset: FLEET_ASSET_FIELD_LABELS,
    fleet_inspection: FLEET_INSPECTION_LABELS,
    inspection_schedule: INSPECTION_SCHEDULE_LABELS,
    fleet_compliance_record: COMPLIANCE_LABELS,
    work_order: WORK_ORDER_LABELS,
    work_order_file: WORK_ORDER_FILE_LABELS,
    asset_assignment: ASSET_ASSIGNMENT_CHANGE_LABELS,
  };
  const m = maps[t];
  if (m?.[fieldKey]) return m[fieldKey];
  return fieldKey.replace(/_/g, ' ');
}

/**
 * Builds human-readable before/after rows for the fleet activity "change details" modal.
 * Uses audit `changes_json` shape: { before, after }, { after }, { deleted }, or flat key/value.
 * Delete-only snapshots ({ deleted } without before/after) return no rows — the list summary is enough.
 */
export function buildFleetAuditChangeRows(
  entityType: string | null | undefined,
  changes: Record<string, unknown> | null | undefined,
  auditContext?: Record<string, unknown> | null
): FleetAuditChangeRow[] {
  if (!changes || typeof changes !== 'object') return [];

  const et = (entityType || '').toLowerCase();
  const beforeRaw = changes.before;
  const afterRaw = changes.after;
  const deletedRaw = changes.deleted;
  const before =
    beforeRaw && typeof beforeRaw === 'object' && !Array.isArray(beforeRaw)
      ? (beforeRaw as Record<string, unknown>)
      : {};
  const after =
    afterRaw && typeof afterRaw === 'object' && !Array.isArray(afterRaw)
      ? (afterRaw as Record<string, unknown>)
      : {};
  const deleted =
    deletedRaw && typeof deletedRaw === 'object' && !Array.isArray(deletedRaw)
      ? (deletedRaw as Record<string, unknown>)
      : null;

  const changedFields = Array.isArray(auditContext?.changed_fields)
    ? (auditContext!.changed_fields as string[])
    : null;

  const rows: FleetAuditChangeRow[] = [];
  const skipKeys = FLEET_AUDIT_ROW_SKIP_KEYS[et];

  if (Object.keys(before).length > 0 || Object.keys(after).length > 0) {
    let keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    if (changedFields && changedFields.length > 0) {
      const set = new Set(changedFields);
      keys = keys.filter((k) => set.has(k));
    }
    for (const k of keys.sort((a, b) => a.localeCompare(b))) {
      if (skipKeys?.has(k)) continue;
      const b = before[k];
      const a = after[k];
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      rows.push({
        label: labelForFleetAuditField(et, k),
        before: formatFleetHistoryFieldValue(et, k, b),
        after: formatFleetHistoryFieldValue(et, k, a),
      });
    }
    return rows;
  }

  // Delete-only snapshots: summary line in the list is enough; do not list every field → empty "After".
  if (deleted && Object.keys(deleted).length > 0) {
    return [];
  }

  const skip = new Set(['before', 'after', 'deleted']);
  for (const [k, v] of Object.entries(changes)) {
    if (skip.has(k)) continue;
    rows.push({
      label: labelForFleetAuditField(et, k),
      before: '—',
      after: formatFleetAuditValue(v),
    });
  }
  return rows;
}
