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
  changedFields?: string[]
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
    parts.push(`${lb}: ${fmtVal(b)} → ${fmtVal(a)}`);
  }
  return parts.join(' · ');
}

function fleetAssetLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;

  if (act === 'CREATE') {
    const parts = Object.entries(after)
      .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
      .map(([k, v]) => `${FLEET_ASSET_FIELD_LABELS[k] || k}: ${fmtVal(v)}`);
    return parts.length ? `Fleet asset created · ${parts.join(' · ')}` : 'Fleet asset created';
  }
  if (act === 'UPDATE') {
    if (ctx.note && typeof ctx.note === 'string') {
      const diff = summarizeDiff(FLEET_ASSET_FIELD_LABELS, before, after, cf);
      return diff ? `Fleet asset updated (${ctx.note}) · ${diff}` : `Fleet asset updated (${ctx.note})`;
    }
    const diff = summarizeDiff(FLEET_ASSET_FIELD_LABELS, before, after, cf);
    return diff ? `Fleet asset updated · ${diff}` : 'Fleet asset updated';
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
    const d = after.inspection_date ? String(after.inspection_date).slice(0, 10) : '';
    return `Inspection${t ? ` (${t})` : ''}${d ? ` on ${d}` : ''}${r ? ` — ${r}` : ''}`.trim() || 'Inspection recorded';
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(FLEET_INSPECTION_LABELS, before, after, cf);
    return diff ? `Inspection updated · ${diff}` : 'Inspection updated';
  }
  if (act === 'DELETE' && del) {
    return `Inspection deleted (${fmtVal(del.inspection_date)} · ${fmtVal(del.result)})`;
  }
  return `Inspection · ${action}`;
}

function inspectionScheduleLines(action: string, changes: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const act = action.toUpperCase();
  const after = (changes.after as Record<string, unknown>) || {};
  const before = (changes.before as Record<string, unknown>) || {};
  const cf = Array.isArray(ctx.changed_fields) ? (ctx.changed_fields as string[]) : undefined;
  if (act === 'CREATE') {
    return `Inspection scheduled · ${fmtVal(after.scheduled_at)} (${fmtVal(after.status)})`;
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(INSPECTION_SCHEDULE_LABELS, before, after, cf);
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
    const body = summarizeDiff(COMPLIANCE_LABELS, {}, after);
    return body ? `Compliance added${rt ? `: ${rt}` : ''} · ${body}` : `Compliance added${rt ? `: ${rt}` : ''}`;
  }
  if (act === 'UPDATE') {
    const diff = summarizeDiff(COMPLIANCE_LABELS, before, after, cf);
    return diff ? `Compliance updated${rt ? ` (${rt})` : ''} · ${diff}` : `Compliance updated${rt ? ` (${rt})` : ''}`;
  }
  if (act === 'DELETE' && del) {
    return `Compliance record removed (${fmtVal(del.record_type)} · exp. ${fmtVal(del.expiry_date)})`;
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
    const origin = changes.origin ? ` (${String(changes.origin).replace(/_/g, ' ')})` : '';
    return `${prefix} created${origin} · ${fmtVal(after.description)} · ${fmtVal(after.status)}`;
  }
  if (act === 'UPDATE') {
    if (changes.legacy_file_removed) {
      return `${prefix}: legacy file removed (${fmtVal(changes.category)})`;
    }
    const via = ctx.via ? ` [${String(ctx.via)}]` : '';
    const diff = summarizeDiff(WORK_ORDER_LABELS, before, after, cf);
    return diff ? `${prefix} updated${via} · ${diff}` : `${prefix} updated${via}`;
  }
  if (act === 'DELETE' && del) {
    return `${prefix} deleted · was: ${fmtVal(del.description)}`;
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
    return `Work order file updated · ${summarizeDiff({ category: 'Category', original_name: 'Name' }, before, after)}`;
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

/** Primary description for a unified fleet history row (assignment, fleet_log, or audit). */
export function buildFleetHistoryDescription(item: {
  source: string;
  kind: string;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  audit_action?: string | null;
  changes_json?: Record<string, unknown> | null;
  entity_type?: string | null;
  audit_context?: Record<string, unknown> | null;
}): string {
  if (item.source === 'assignment') {
    const base = item.title;
    const sub = item.subtitle ? ` · ${item.subtitle}` : '';
    return `${base}${sub}`;
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

  if (Object.keys(before).length > 0 || Object.keys(after).length > 0) {
    let keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    if (changedFields && changedFields.length > 0) {
      const set = new Set(changedFields);
      keys = keys.filter((k) => set.has(k));
    }
    for (const k of keys.sort((a, b) => a.localeCompare(b))) {
      const b = before[k];
      const a = after[k];
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      rows.push({
        label: labelForFleetAuditField(et, k),
        before: formatFleetAuditValue(b),
        after: formatFleetAuditValue(a),
      });
    }
    return rows;
  }

  if (deleted && Object.keys(deleted).length > 0) {
    for (const k of Object.keys(deleted).sort((a, b) => a.localeCompare(b))) {
      rows.push({
        label: labelForFleetAuditField(et, k),
        before: formatFleetAuditValue(deleted[k]),
        after: '—',
      });
    }
    return rows;
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
