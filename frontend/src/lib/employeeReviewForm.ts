import type { SafetyFormDefinition } from '@/types/safetyFormTemplate';

/** Suffix for parallel payload keys: supervisor notes per question (supervisor → direct report only). */
export const SUPERVISOR_COMMENT_KEY_SUFFIX = '__supervisor_comment';

const FIELD_SIDE_COMMENTS_KEY = '_fieldComments';

function sideCommentTextForField(formPayload: Record<string, unknown>, fieldKey: string): string {
  const bucket = formPayload[FIELD_SIDE_COMMENTS_KEY];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  const raw = (bucket as Record<string, unknown>)[fieldKey];
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const t = (raw as { text?: unknown }).text;
    if (typeof t === 'string') return t.trim();
  }
  return '';
}

/**
 * Copies per-field bubble comment text into `*__supervisor_comment` keys. The reviews API skips `_…` payload
 * keys, so without this merge supervisor notes in `_fieldComments` would not be stored.
 */
export function mergeSupervisorSideCommentsForSubmit(
  formPayload: Record<string, unknown>,
  fieldKeys: string[]
): Record<string, unknown> {
  const out = { ...formPayload };
  for (const fk of fieldKeys) {
    const text = sideCommentTextForField(formPayload, fk);
    const ck = `${fk}${SUPERVISOR_COMMENT_KEY_SUFFIX}`;
    if (text) out[ck] = text;
    else delete out[ck];
  }
  return out;
}

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
