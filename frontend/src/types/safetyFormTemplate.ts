/** Matches backend `ALLOWED_FIELD_TYPES` in app/routes/form_templates.py */

export type SafetyFormFieldType =
  | 'pass_fail_na'
  | 'checkbox'
  | 'short_text'
  | 'long_text'
  | 'text_info'
  | 'dropdown_single'
  | 'dropdown_multi'
  | 'yes_no_na'
  | 'pass_fail_total'
  | 'number'
  | 'date'
  | 'time'
  | 'user_single'
  | 'user_multi'
  | 'image_view'
  | 'pdf_insert'
  | 'pdf_view'
  | 'gps'
  | 'equipment_single'
  | 'equipment_multi';

export type VisibilityWhen = {
  fieldKey: string;
  op: 'equals' | 'in' | 'notEmpty';
  value?: string | string[];
};

/** Dropdown options from a global custom list (see Form Custom Lists page). */
export type OptionsSourceCustomList = { type: 'custom_list'; customListId: string };

export type SafetyFormField = {
  id: string;
  key: string;
  type: SafetyFormFieldType;
  label: string;
  order: number;
  required?: boolean;
  placeholder?: string;
  /** Legacy inline options; prefer optionsSource for dropdown types. */
  options?: string[];
  optionsSource?: OptionsSourceCustomList;
  visibility?: { when?: VisibilityWhen };
  settings?: {
    allowMultipleFiles?: boolean;
    maxFiles?: number;
    /** Legacy; Pass / Fail Total is always computed from all Pass/Fail/NA fields. */
    mode?: 'manual' | 'aggregate';
    /** @deprecated Template PDFs use referencePdfAttachments; respondent never uploads. */
    readOnlyPdf?: boolean;
    /** PDFs attached in the template editor; shown read-only to respondents. */
    referencePdfAttachments?: { id: string; originalName: string }[];
    [k: string]: unknown;
  };
};

export type SafetyFormSection = {
  id: string;
  title: string;
  order: number;
  fields: SafetyFormField[];
};

export type SignatureRolePolicy = {
  required?: boolean;
  /** typed = name field; drawn = canvas upload; any = either */
  mode?: 'typed' | 'drawn' | 'any';
};

export type SafetyFormDefinition = {
  sections: SafetyFormSection[];
  signature_policy?: { worker?: SignatureRolePolicy; supervisor?: SignatureRolePolicy };
};

export const DEFAULT_DEFINITION: SafetyFormDefinition = {
  sections: [],
  signature_policy: { worker: { required: false, mode: 'drawn' } },
};

export type FieldTypeOption = { type: SafetyFormFieldType; label: string };

export const FIELD_TYPE_OPTIONS: FieldTypeOption[] = [
  { type: 'pass_fail_na', label: 'Pass / Fail / NA' },
  { type: 'checkbox', label: 'Check Box' },
  { type: 'short_text', label: 'Short Answer' },
  { type: 'long_text', label: 'Long Answer' },
  { type: 'text_info', label: 'Text Info Block' },
  { type: 'dropdown_single', label: 'Drop-down List: Select One' },
  { type: 'dropdown_multi', label: 'Drop-down List: Select Multiple' },
  { type: 'yes_no_na', label: 'Yes / No / NA' },
  { type: 'pass_fail_total', label: 'Pass / Fail Total' },
  { type: 'number', label: 'Number Only' },
  { type: 'date', label: 'Select Date' },
  { type: 'time', label: 'Select Time' },
  { type: 'user_single', label: 'Select Worker' },
  { type: 'user_multi', label: 'Select Multiple Workers' },
  { type: 'image_view', label: 'View / Attach Image' },
  { type: 'pdf_insert', label: 'Insert PDF' },
  { type: 'pdf_view', label: 'View PDF' },
  { type: 'gps', label: 'GPS Coordinates' },
  { type: 'equipment_single', label: 'Equipment: Select One' },
  { type: 'equipment_multi', label: 'Equipment: Select Multiple' },
];

const ALL_TYPES = new Set(FIELD_TYPE_OPTIONS.map((x) => x.type));

export function isFieldVisible(field: SafetyFormField, payload: Record<string, unknown>): boolean {
  const w = field.visibility?.when;
  if (!w || !w.fieldKey?.trim()) return true;
  const fk = w.fieldKey.trim();
  const val = payload[fk];
  const op = w.op || 'equals';
  if (op === 'notEmpty') {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val.trim() !== '';
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val as object).length > 0;
    return true;
  }
  if (op === 'equals') {
    return String(val) === String(w.value ?? '');
  }
  if (op === 'in' && Array.isArray(w.value)) {
    return w.value.map(String).includes(String(val));
  }
  return true;
}

/** Keys of all Pass / Fail / NA fields in display order (section order, then field order). */
export function collectPassFailNaKeysOrdered(def: SafetyFormDefinition): string[] {
  const keys: string[] = [];
  const sections = [...def.sections].sort((a, b) => a.order - b.order);
  for (const s of sections) {
    const fields = [...s.fields].sort((a, b) => a.order - b.order);
    for (const f of fields) {
      if (f.type === 'pass_fail_na') keys.push(f.key);
    }
  }
  return keys;
}

/** Sum pass/fail/na counts from string values only (Pass / Fail / NA field type). */
export function computePftAggregate(
  payload: Record<string, unknown>,
  sourceFieldKeys: string[]
): { pass: number; fail: number; na: number } {
  let pass = 0;
  let fail = 0;
  let na = 0;
  for (const key of sourceFieldKeys) {
    const v = payload[key.trim()];
    if (v === 'pass') pass += 1;
    else if (v === 'fail') fail += 1;
    else if (v === 'na') na += 1;
  }
  return { pass, fail, na };
}

export function normalizeDefinition(raw: unknown): SafetyFormDefinition {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DEFINITION };
  const o = raw as Record<string, unknown>;
  const sections = Array.isArray(o.sections) ? o.sections : [];
  const out: SafetyFormSection[] = [];
  for (const s of sections) {
    if (!s || typeof s !== 'object') continue;
    const sec = s as Record<string, unknown>;
    const fieldsRaw = Array.isArray(sec.fields) ? sec.fields : [];
    const fields: SafetyFormField[] = [];
    for (const f of fieldsRaw) {
      if (!f || typeof f !== 'object') continue;
      const fr = f as Record<string, unknown>;
      const t = fr.type as SafetyFormFieldType;
      if (!ALL_TYPES.has(t)) continue;
      let visibility: SafetyFormField['visibility'];
      if (fr.visibility && typeof fr.visibility === 'object') {
        const vi = fr.visibility as Record<string, unknown>;
        const when = vi.when && typeof vi.when === 'object' ? (vi.when as Record<string, unknown>) : null;
        if (when && typeof when.fieldKey === 'string') {
          visibility = {
            when: {
              fieldKey: when.fieldKey,
              op: (when.op as VisibilityWhen['op']) || 'equals',
              value: when.value as VisibilityWhen['value'],
            },
          };
        }
      }
      let optionsSource: SafetyFormField['optionsSource'];
      const os = fr.optionsSource;
      if (os && typeof os === 'object' && !Array.isArray(os) && (os as Record<string, unknown>).type === 'custom_list') {
        const cid = String((os as Record<string, unknown>).customListId ?? '').trim();
        if (cid) optionsSource = { type: 'custom_list', customListId: cid };
      }
      let settings: SafetyFormField['settings'] =
        fr.settings && typeof fr.settings === 'object' ? (fr.settings as SafetyFormField['settings']) : undefined;
      if (t === 'image_view') {
        const base = settings && typeof settings === 'object' ? { ...settings } : {};
        const mf = base.maxFiles;
        settings = {
          ...base,
          allowMultipleFiles: base.allowMultipleFiles !== false,
          maxFiles:
            typeof mf === 'number' && Number.isFinite(mf) ? Math.min(50, Math.max(1, mf)) : 8,
        };
      }
      if (t === 'pdf_view') {
        const base = settings && typeof settings === 'object' ? { ...settings } : {};
        const raw = (base as Record<string, unknown>).referencePdfAttachments;
        const referencePdfAttachments: { id: string; originalName: string }[] = [];
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
              const id = String((item as { id: string }).id).trim();
              if (!id) continue;
              const on = (item as { originalName?: unknown }).originalName;
              referencePdfAttachments.push({
                id,
                originalName: typeof on === 'string' && on.trim() ? on.trim() : 'Document.pdf',
              });
            }
          }
        }
        const { readOnlyPdf: _r, ...rest } = base as Record<string, unknown>;
        settings = {
          ...rest,
          referencePdfAttachments,
        } as SafetyFormField['settings'];
      }
      fields.push({
        id: String(fr.id || crypto.randomUUID()),
        key: String(fr.key || '').trim() || `field_${crypto.randomUUID().slice(0, 8)}`,
        type: t,
        label: String(fr.label || 'Field'),
        order: typeof fr.order === 'number' ? fr.order : fields.length,
        required: Boolean(fr.required),
        placeholder: fr.placeholder != null ? String(fr.placeholder) : undefined,
        options: Array.isArray(fr.options) ? fr.options.filter((x): x is string => typeof x === 'string') : undefined,
        optionsSource,
        visibility,
        settings,
      });
    }
    out.push({
      id: String(sec.id || crypto.randomUUID()),
      title: String(sec.title || 'Section'),
      order: typeof sec.order === 'number' ? sec.order : out.length,
      fields,
    });
  }
  const sigIn = o.signature_policy && typeof o.signature_policy === 'object' ? (o.signature_policy as Record<string, unknown>) : {};
  const wIn = sigIn.worker && typeof sigIn.worker === 'object' ? (sigIn.worker as Record<string, unknown>) : {};
  return {
    sections: out,
    signature_policy: {
      ...sigIn,
      worker: {
        ...wIn,
        required: Boolean(wIn.required),
        mode: 'drawn',
      },
    } as SafetyFormDefinition['signature_policy'],
  };
}

function isEmptyValue(field: SafetyFormField, v: unknown): boolean {
  if (field.type === 'pdf_view') return false;
  if (v === undefined || v === null) return true;
  if (field.type === 'checkbox') return v !== true;
  if (field.type === 'dropdown_multi' || field.type === 'user_multi' || field.type === 'equipment_multi') {
    return !Array.isArray(v) || v.length === 0;
  }
  if (field.type === 'image_view') {
    if (typeof v === 'string') return !v.trim();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ids = (v as { file_object_ids?: string[] }).file_object_ids;
      return !Array.isArray(ids) || ids.length === 0;
    }
    return true;
  }
  if (field.type === 'pdf_insert') {
    if (typeof v === 'string') return !v.trim();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ids = (v as { file_object_ids?: string[] }).file_object_ids;
      return !Array.isArray(ids) || ids.length === 0;
    }
    return true;
  }
  if (field.type === 'gps') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
    const o = v as { lat?: unknown; lng?: unknown };
    return typeof o.lat !== 'number' || typeof o.lng !== 'number' || Number.isNaN(o.lat) || Number.isNaN(o.lng);
  }
  if (typeof v === 'string') return !v.trim();
  return false;
}

/** Synthetic key for required worker signature validation (not a payload key). */
export const DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY = '__dynamic_worker_signature__';

export type DynamicFormMissingField = { key: string; label: string };

export function validateDynamicFormMissing(
  definition: SafetyFormDefinition,
  payload: Record<string, unknown>
): DynamicFormMissingField[] {
  const errs: DynamicFormMissingField[] = [];
  const push = (key: string, label: string) => errs.push({ key, label });

  for (const sec of definition.sections) {
    for (const field of sec.fields) {
      if (!field.required) continue;
      if (field.type === 'text_info') continue;
      if (!isFieldVisible(field, payload)) continue;
      if (field.type === 'pass_fail_total') continue;
      const v = payload[field.key];
      const label = field.label || field.key;
      if (field.type === 'checkbox') {
        if (v !== true) push(field.key, label);
        continue;
      }
      if (field.type === 'dropdown_multi' || field.type === 'user_multi' || field.type === 'equipment_multi') {
        if (!Array.isArray(v) || v.length === 0) push(field.key, label);
        continue;
      }
      if (field.type === 'yes_no_na') {
        const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as { status?: string }) : {};
        if (!o.status || !['yes', 'no', 'na'].includes(o.status)) push(field.key, label);
        continue;
      }
      if (field.type === 'pass_fail_na') {
        if (v !== 'pass' && v !== 'fail' && v !== 'na') push(field.key, label);
        continue;
      }
      if (isEmptyValue(field, v)) push(field.key, label);
    }
  }
  const workerSig = definition.signature_policy?.worker;
  if (workerSig?.required) {
    const mode = workerSig.mode || 'drawn';
    const typed = typeof payload._worker_signature === 'string' && payload._worker_signature.trim().length > 0;
    const drawn = typeof payload._worker_signature_file_id === 'string' && payload._worker_signature_file_id.trim().length > 0;
    if (mode === 'typed' && !typed) push(DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY, 'Worker signature');
    if (mode === 'drawn' && !drawn) push(DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY, 'Worker signature');
    if (mode === 'any' && !typed && !drawn) push(DYNAMIC_FORM_WORKER_SIGNATURE_HIGHLIGHT_KEY, 'Worker signature');
  }
  return errs;
}

export function validateDynamicForm(definition: SafetyFormDefinition, payload: Record<string, unknown>): string[] {
  return validateDynamicFormMissing(definition, payload).map((e) => e.label);
}

/** Whether to show a required asterisk next to the field label in the respondent UI. */
export function fieldShowsRequiredIndicator(field: SafetyFormField): boolean {
  if (!field.required) return false;
  if (field.type === 'text_info' || field.type === 'pass_fail_total') return false;
  return true;
}
