import type { SafetyFormDefinition } from '@/types/safetyFormTemplate';

/** Suffix for parallel payload keys: supervisor notes per question (supervisor → direct report only). */
export const SUPERVISOR_COMMENT_KEY_SUFFIX = '__supervisor_comment';

export function collectEmployeeReviewFieldRows(def: SafetyFormDefinition): { key: string; label: string }[] {
  const rows: { key: string; label: string }[] = [];
  for (const sec of def.sections || []) {
    for (const f of sec.fields || []) {
      const k = f.key;
      if (typeof k === 'string' && k.trim()) {
        const key = k.trim();
        rows.push({ key, label: ((f.label || key) as string).trim() || key });
      }
    }
  }
  return rows;
}

export function fieldLabelFromDefinition(def: SafetyFormDefinition, fieldKey: string): string {
  for (const sec of def.sections || []) {
    for (const f of sec.fields || []) {
      if (typeof f.key === 'string' && f.key.trim() === fieldKey) {
        return (((f.label || f.key) as string) || fieldKey).trim();
      }
    }
  }
  return fieldKey;
}
