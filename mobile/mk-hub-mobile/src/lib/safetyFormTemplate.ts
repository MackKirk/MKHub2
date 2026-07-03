export type SafetyFormFieldType =
  | "pass_fail_na"
  | "checkbox"
  | "short_text"
  | "long_text"
  | "text_info"
  | "dropdown_single"
  | "dropdown_multi"
  | "yes_no_na"
  | "pass_fail_total"
  | "scale_1_5"
  | "number"
  | "date"
  | "time"
  | "user_single"
  | "user_multi"
  | "image_view"
  | "pdf_insert"
  | "pdf_view"
  | "gps"
  | "equipment_single"
  | "equipment_multi";

export type SafetyFormField = {
  id: string;
  key: string;
  type: SafetyFormFieldType;
  label: string;
  order: number;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  optionsSource?: { type: "custom_list"; customListId: string };
  visibility?: {
    when?: {
      fieldKey: string;
      op?: "equals" | "in" | "notEmpty";
      value?: string | string[];
    };
  };
  settings?: Record<string, unknown>;
};

export type SafetyFormSection = {
  id: string;
  title: string;
  order: number;
  fields: SafetyFormField[];
};

export type SignatureRolePolicy = {
  required?: boolean;
  mode?: "typed" | "drawn" | "any";
};

export type SafetyFormDefinition = {
  sections: SafetyFormSection[];
  signature_policy?: { worker?: SignatureRolePolicy; supervisor?: SignatureRolePolicy };
};

const ALL_TYPES = new Set<SafetyFormFieldType>([
  "pass_fail_na",
  "checkbox",
  "short_text",
  "long_text",
  "text_info",
  "dropdown_single",
  "dropdown_multi",
  "yes_no_na",
  "pass_fail_total",
  "scale_1_5",
  "number",
  "date",
  "time",
  "user_single",
  "user_multi",
  "image_view",
  "pdf_insert",
  "pdf_view",
  "gps",
  "equipment_single",
  "equipment_multi"
]);

export function isFieldVisible(
  field: SafetyFormField,
  payload: Record<string, unknown>
): boolean {
  const w = field.visibility?.when;
  if (!w?.fieldKey?.trim()) return true;
  const val = payload[w.fieldKey.trim()];
  const op = w.op || "equals";
  if (op === "notEmpty") {
    if (val == null) return false;
    if (typeof val === "string") return val.trim() !== "";
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val as object).length > 0;
    return true;
  }
  if (op === "equals") return String(val) === String(w.value ?? "");
  if (op === "in" && Array.isArray(w.value)) {
    return w.value.map(String).includes(String(val));
  }
  return true;
}

export function collectPassFailNaKeysOrdered(def: SafetyFormDefinition): string[] {
  const keys: string[] = [];
  for (const section of [...def.sections].sort((a, b) => a.order - b.order)) {
    for (const field of [...section.fields].sort((a, b) => a.order - b.order)) {
      if (field.type === "pass_fail_na") keys.push(field.key);
    }
  }
  return keys;
}

export function computePftAggregate(
  payload: Record<string, unknown>,
  sourceFieldKeys: string[]
): { pass: number; fail: number; na: number } {
  let pass = 0;
  let fail = 0;
  let na = 0;
  for (const key of sourceFieldKeys) {
    const value = payload[key.trim()];
    if (value === "pass") pass += 1;
    else if (value === "fail") fail += 1;
    else if (value === "na") na += 1;
  }
  return { pass, fail, na };
}

export function normalizeDefinition(raw: unknown): SafetyFormDefinition {
  if (!raw || typeof raw !== "object") return { sections: [] };
  const sectionsRaw = Array.isArray((raw as { sections?: unknown }).sections)
    ? (raw as { sections: unknown[] }).sections
    : [];
  const sections: SafetyFormSection[] = [];
  for (const sectionRaw of sectionsRaw) {
    if (!sectionRaw || typeof sectionRaw !== "object") continue;
    const section = sectionRaw as Record<string, unknown>;
    const fieldsRaw = Array.isArray(section.fields) ? section.fields : [];
    const fields: SafetyFormField[] = [];
    for (const fieldRaw of fieldsRaw) {
      if (!fieldRaw || typeof fieldRaw !== "object") continue;
      const field = fieldRaw as Record<string, unknown>;
      const type = field.type as SafetyFormFieldType;
      if (!ALL_TYPES.has(type)) continue;
      fields.push({
        id: String(field.id || field.key || ""),
        key: String(field.key || ""),
        type,
        label: String(field.label || field.key || "Field"),
        order: Number(field.order || 0),
        required: Boolean(field.required),
        placeholder: field.placeholder ? String(field.placeholder) : undefined,
        options: Array.isArray(field.options)
          ? field.options.map((item) => String(item))
          : undefined,
        optionsSource:
          field.optionsSource && typeof field.optionsSource === "object"
            ? (field.optionsSource as SafetyFormField["optionsSource"])
            : undefined,
        visibility:
          field.visibility && typeof field.visibility === "object"
            ? (field.visibility as SafetyFormField["visibility"])
            : undefined,
        settings:
          field.settings && typeof field.settings === "object"
            ? (field.settings as Record<string, unknown>)
            : undefined
      });
    }
    sections.push({
      id: String(section.id || section.title || ""),
      title: String(section.title || "Section"),
      order: Number(section.order || 0),
      fields
    });
  }

  const rawObj = raw as Record<string, unknown>;
  const sigIn =
    rawObj.signature_policy && typeof rawObj.signature_policy === "object"
      ? (rawObj.signature_policy as Record<string, unknown>)
      : null;
  if (!sigIn) {
    return { sections };
  }
  const workerIn =
    sigIn.worker && typeof sigIn.worker === "object"
      ? (sigIn.worker as Record<string, unknown>)
      : {};
  const signature_policy: SafetyFormDefinition["signature_policy"] = {
    worker: {
      required: Boolean(workerIn.required),
      mode:
        workerIn.mode === "typed" || workerIn.mode === "drawn" || workerIn.mode === "any"
          ? workerIn.mode
          : "drawn"
    }
  };

  return { sections, signature_policy };
}

export function isEmptyFieldValue(
  field: SafetyFormField,
  v: unknown
): boolean {
  if (field.type === "text_info" || field.type === "pass_fail_total" || field.type === "pdf_view") {
    return false;
  }
  if (v === undefined || v === null) return true;
  if (field.type === "checkbox") return v !== true;
  if (
    field.type === "dropdown_multi" ||
    field.type === "user_multi" ||
    field.type === "equipment_multi"
  ) {
    return !Array.isArray(v) || v.length === 0;
  }
  if (field.type === "image_view" || field.type === "pdf_insert") {
    if (typeof v === "string") return !v.trim();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const ids = (v as { file_object_ids?: string[] }).file_object_ids;
      return !Array.isArray(ids) || ids.length === 0;
    }
    return true;
  }
  if (field.type === "gps") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return true;
    const o = v as { lat?: unknown; lng?: unknown };
    return (
      typeof o.lat !== "number" ||
      typeof o.lng !== "number" ||
      Number.isNaN(o.lat) ||
      Number.isNaN(o.lng)
    );
  }
  if (field.type === "scale_1_5") {
    const s = typeof v === "string" ? v.trim() : "";
    return s !== "1" && s !== "2" && s !== "3" && s !== "4" && s !== "5";
  }
  if (typeof v === "string") return !v.trim();
  return false;
}

export function validateRequiredFields(
  definition: SafetyFormDefinition,
  payload: Record<string, unknown>
): string[] {
  const missing: string[] = [];
  for (const section of [...definition.sections].sort((a, b) => a.order - b.order)) {
    for (const field of [...section.fields].sort((a, b) => a.order - b.order)) {
      if (!field.required || !isFieldVisible(field, payload)) continue;
      if (field.type === "text_info" || field.type === "pass_fail_total" || field.type === "pdf_view") {
        continue;
      }
      const value = payload[field.key];
      const label = field.label || field.key;
      if (field.type === "checkbox") {
        if (value !== true) missing.push(label);
        continue;
      }
      if (
        field.type === "dropdown_multi" ||
        field.type === "user_multi" ||
        field.type === "equipment_multi"
      ) {
        if (!Array.isArray(value) || value.length === 0) missing.push(label);
        continue;
      }
      if (field.type === "yes_no_na") {
        const o =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as { status?: string })
            : {};
        if (!o.status || !["yes", "no", "na"].includes(o.status)) missing.push(label);
        continue;
      }
      if (field.type === "pass_fail_na") {
        if (value !== "pass" && value !== "fail" && value !== "na") missing.push(label);
        continue;
      }
      if (isEmptyFieldValue(field, value)) missing.push(label);
    }
  }

  const workerSig = definition.signature_policy?.worker;
  if (workerSig?.required) {
    const mode = workerSig.mode || "drawn";
    const typed =
      typeof payload._worker_signature === "string" &&
      payload._worker_signature.trim().length > 0;
    const drawn =
      typeof payload._worker_signature_file_id === "string" &&
      payload._worker_signature_file_id.trim().length > 0;
    if (mode === "typed" && !typed) missing.push("Worker signature");
    if (mode === "drawn" && !drawn) missing.push("Worker signature");
    if (mode === "any" && !typed && !drawn) missing.push("Worker signature");
  }

  return missing;
}
