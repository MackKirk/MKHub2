/** Shared fleet inspection checklist form helpers (InspectionDetail + schedule inline editors). */

export type FleetInspectionRecord = {
  id: string;
  fleet_asset_id: string;
  notes?: string;
  checklist_results?: {
    _metadata?: Record<string, string>;
    areas?: Array<{ key: string; issues?: string; condition?: string; photo_ids?: string[] }>;
    [key: string]: unknown;
  } | Record<string, unknown>;
  inspection_date?: string;
};

export type FleetAssetFormContext = {
  unit_number?: string | null;
  name?: string | null;
  odometer_current?: number | null;
  hours_current?: number | null;
};

export const BODY_CONDITION_OPTIONS = [
  { value: 'ok', label: 'OK', icon: '✓', title: 'OK', className: 'bg-green-100 text-green-800 border-green-400 hover:bg-green-200' },
  { value: 'damage', label: 'Damage', icon: '✗', title: 'Damage', className: 'bg-red-100 text-red-800 border-red-400 hover:bg-red-200' },
  { value: 'conditional', label: 'Conditional', icon: '⚠', title: 'Conditional', className: 'bg-amber-100 text-amber-800 border-amber-400 hover:bg-amber-200' },
];

/** Non-empty checklist answers (ok | damage | conditional). */
export const INSPECTION_CONDITION_VALUES = ['ok', 'damage', 'conditional'] as const;
export type InspectionConditionValue = (typeof INSPECTION_CONDITION_VALUES)[number];

export function isValidInspectionCondition(condition: string): condition is InspectionConditionValue {
  return INSPECTION_CONDITION_VALUES.includes(condition as InspectionConditionValue);
}

/** Every template area has a valid condition chosen. */
export function isBodyChecklistComplete(areas: Array<{ condition: string }>): boolean {
  return areas.length > 0 && areas.every((a) => isValidInspectionCondition(a.condition));
}

/** Every checklist item has a valid condition chosen. */
export function isMechanicalChecklistComplete(items: Array<{ condition: string }>): boolean {
  return items.length > 0 && items.every((i) => isValidInspectionCondition(i.condition));
}

export function computeResultFromConditions(conditions: Array<{ condition: string }>): string {
  if (conditions.some((a) => a.condition === 'damage')) return 'fail';
  if (conditions.some((a) => a.condition === 'conditional')) return 'conditional';
  return 'pass';
}

export type SubmitInspectionMode = 'draft' | 'finish';

/** Draft always persists `pending`. Finish requires full checklist before returning pass/fail/conditional. */
export function resolveBodyResultForSubmit(
  mode: SubmitInspectionMode,
  areas: Array<{ condition: string }>
): { ok: true; result: string } | { ok: false; message: string } {
  if (mode === 'draft') return { ok: true, result: 'pending' };
  if (!isBodyChecklistComplete(areas)) {
    return { ok: false, message: 'Answer every Body / Exterior area before finishing.' };
  }
  return { ok: true, result: computeResultFromConditions(areas) };
}

export function resolveMechanicalResultForSubmit(
  mode: SubmitInspectionMode,
  items: Array<{ condition: string }>
): { ok: true; result: string } | { ok: false; message: string } {
  if (mode === 'draft') return { ok: true, result: 'pending' };
  if (!isMechanicalChecklistComplete(items)) {
    return { ok: false, message: 'Answer every Mechanical checklist item before finishing.' };
  }
  return { ok: true, result: computeResultFromConditions(items) };
}

export type BodyFormState = {
  _metadata: Record<string, string>;
  areas: Array<{ key: string; condition: string }>;
  notes: string;
};

export function buildBodyFormFromInspection(
  inspection: FleetInspectionRecord,
  templateAreas: Array<{ key: string; label: string; description?: string }>,
  asset?: FleetAssetFormContext
): BodyFormState {
  const cr = inspection.checklist_results as Record<string, unknown> | undefined;
  const metadata = cr?._metadata && typeof cr._metadata === 'object' ? { ...(cr._metadata as Record<string, string>) } : {};
  if (asset) {
    const hasUnit = metadata.unit_number != null && String(metadata.unit_number).trim() !== '';
    if (!hasUnit && asset.unit_number != null && String(asset.unit_number).trim() !== '') metadata.unit_number = asset.unit_number;
    if (!hasUnit && asset.name != null && String(asset.name).trim() !== '') metadata.unit_number = (metadata.unit_number as string) || asset.name;
    if ((metadata.km == null || String(metadata.km).trim() === '') && asset.odometer_current != null) metadata.km = String(asset.odometer_current);
  }
  if (!metadata.date || String(metadata.date).trim() === '') metadata.date = new Date().toISOString().slice(0, 10);
  const areas = (templateAreas || []).map((area) => {
    const areasArr = (cr?.areas as Array<{ key: string; condition?: string }> | undefined) ?? [];
    const existing = areasArr.find((a) => a.key === area.key);
    return {
      key: area.key,
      condition: existing?.condition ?? '',
    };
  });
  return {
    _metadata: metadata,
    areas,
    notes: inspection.notes ?? '',
  };
}

export type MechanicalFormState = {
  _metadata: Record<string, string>;
  items: Array<{ key: string; condition: string }>;
  notes: string;
};

export function buildMechanicalFormFromInspection(
  inspection: FleetInspectionRecord,
  templateSections: Array<{ id: string; title: string; items: Array<{ key: string; label: string; category: string }> }>,
  asset?: FleetAssetFormContext
): MechanicalFormState {
  const cr = inspection.checklist_results as Record<string, unknown> | undefined;
  const metadata = cr?._metadata && typeof cr._metadata === 'object' ? { ...(cr._metadata as Record<string, string>) } : {};
  if (asset) {
    const hasUnit = metadata.unit_number != null && String(metadata.unit_number).trim() !== '';
    if (!hasUnit && asset.unit_number != null && String(asset.unit_number).trim() !== '') metadata.unit_number = asset.unit_number;
    if (!hasUnit && asset.name != null && String(asset.name).trim() !== '') metadata.unit_number = (metadata.unit_number as string) || asset.name;
    if ((metadata.km == null || String(metadata.km).trim() === '') && asset.odometer_current != null) metadata.km = String(asset.odometer_current);
  }
  if (!metadata.date || String(metadata.date).trim() === '') metadata.date = new Date().toISOString().slice(0, 10);
  const items: Array<{ key: string; condition: string }> = [];
  (templateSections || []).forEach((section) => {
    section.items.forEach((item) => {
      const val = cr?.[item.key];
      const condition =
        typeof val === 'object' && val != null
          ? ((val as { status?: string; condition?: string }).status || (val as { condition?: string }).condition || '')
          : ((val as string) || '');
      const norm = condition === 'ok' || condition === 'damage' || condition === 'conditional' ? condition : '';
      items.push({ key: item.key, condition: norm });
    });
  });
  return {
    _metadata: metadata,
    items,
    notes: inspection.notes ?? '',
  };
}
