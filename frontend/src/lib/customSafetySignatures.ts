/** Payload key for third-party / on-site signatures (dynamic safety inspections). */
export const CUSTOM_SIGNATURES_PAYLOAD_KEY = '_custom_signatures' as const;

export type CustomSafetySignatureSlot = {
  id: string;
  name: string;
  company: string;
  occupation: string;
  file_id?: string;
  signed_at?: string;
  location_label?: string;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function parseCustomSignaturesPayload(raw: unknown): CustomSafetySignatureSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomSafetySignatureSlot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = str(o.id).trim();
    if (!id) continue;
    const file_id = str(o.file_id).trim() || undefined;
    out.push({
      id,
      name: str(o.name),
      company: str(o.company),
      occupation: str(o.occupation),
      file_id,
      signed_at: str(o.signed_at).trim() || undefined,
      location_label: str(o.location_label).trim() || undefined,
    });
  }
  return out;
}

export function getCustomSignaturesFromPayload(payload: Record<string, unknown>): CustomSafetySignatureSlot[] {
  return parseCustomSignaturesPayload(payload[CUSTOM_SIGNATURES_PAYLOAD_KEY]);
}

function slotToJson(e: CustomSafetySignatureSlot): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: e.id,
    name: e.name,
    company: e.company,
    occupation: e.occupation,
  };
  if (e.file_id) {
    base.file_id = e.file_id;
    base.signed_at = e.signed_at || '';
    if (e.location_label) base.location_label = e.location_label;
  }
  return base;
}

export function setCustomSignaturesOnPayload(
  payload: Record<string, unknown>,
  entries: CustomSafetySignatureSlot[]
): Record<string, unknown> {
  if (entries.length === 0) {
    const next = { ...payload };
    delete next[CUSTOM_SIGNATURES_PAYLOAD_KEY];
    return next;
  }
  return { ...payload, [CUSTOM_SIGNATURES_PAYLOAD_KEY]: entries.map(slotToJson) };
}

export function appendCustomSignatureSlot(payload: Record<string, unknown>): Record<string, unknown> {
  const list = getCustomSignaturesFromPayload(payload);
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return setCustomSignaturesOnPayload(payload, [
    ...list,
    { id, name: '', company: '', occupation: '' },
  ]);
}

export function updateCustomSignatureSlot(
  payload: Record<string, unknown>,
  id: string,
  patch: Partial<Omit<CustomSafetySignatureSlot, 'id'>>
): Record<string, unknown> {
  const list = getCustomSignaturesFromPayload(payload);
  const next = list.map((e) => (e.id === id ? { ...e, ...patch } : e));
  return setCustomSignaturesOnPayload(payload, next);
}

export function removeCustomSignatureSlot(payload: Record<string, unknown>, id: string): Record<string, unknown> {
  const list = getCustomSignaturesFromPayload(payload).filter((e) => e.id !== id);
  return setCustomSignaturesOnPayload(payload, list);
}

/** Slots with a name entered but no drawn signature yet (finalize should be blocked). */
export function hasIncompleteCustomSignature(payload: Record<string, unknown>): boolean {
  return getCustomSignaturesFromPayload(payload).some((e) => e.name.trim().length > 0 && !e.file_id);
}
