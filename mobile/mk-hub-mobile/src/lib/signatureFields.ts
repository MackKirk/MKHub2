import type { SignatureTemplateField } from "../types/signatures";

export function fieldHasValue(
  field: SignatureTemplateField,
  values: Record<string, string | boolean>
): boolean {
  if (field.type === "employee_info") {
    // Server fills from profile when omitted; treat as satisfied for required check.
    return true;
  }
  if (field.type === "checkbox") {
    return values[field.id] === true;
  }
  if (field.type === "date") {
    const v = values[field.id];
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
  }
  const v = values[field.id];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return false;
}

export function localDateYYYYMMDD(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatSignDateLong(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!match) return (iso || "").trim();
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !mo || !d) return iso.trim();
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return iso.trim();
  return dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function fieldLabel(field: SignatureTemplateField): string {
  const name = (field.field_name || "").trim();
  if (name) return name;
  if (field.type === "signature") return "Signature";
  if (field.type === "initials") return "Initials";
  if (field.type === "checkbox") return "Checkbox";
  if (field.type === "date") return "Date";
  if (field.type === "employee_info") return "Employee info";
  return "Field";
}

export function sortFields(
  fields: SignatureTemplateField[]
): SignatureTemplateField[] {
  return [...fields].sort((a, b) => {
    if (a.page_index !== b.page_index) return a.page_index - b.page_index;
    return (a.rect?.y ?? 0) - (b.rect?.y ?? 0);
  });
}
