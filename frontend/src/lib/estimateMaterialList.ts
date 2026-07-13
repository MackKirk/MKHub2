import { isProductSection } from '@/lib/estimateProductInfo';

export type CrewMaterialItem = {
  id: string;
  name: string;
  quantity?: string | null;
  unit?: string | null;
  notes?: string | null;
  source?: 'estimate' | 'manual';
  source_ref?: string;
};

export type EstimateMaterialSourceItem = {
  name?: string;
  description?: string;
  quantity?: number;
  qty_required?: number;
  unit?: string;
  unit_required?: string;
  section?: string;
  material_id?: number;
  item_type?: string;
};

function sectionDisplayName(section: string, sectionNames: Record<string, string>): string {
  return (
    sectionNames[section] ||
    (section.startsWith('Product Section') ? 'Product Section' : section)
  );
}

/** Stable key to match estimate products across saves. */
export function buildEstimateSourceRef(item: EstimateMaterialSourceItem): string {
  const section = item.section || '';
  const key =
    item.material_id != null
      ? `m:${item.material_id}`
      : `n:${String(item.name || item.description || '')
          .trim()
          .toLowerCase()}`;
  return `${section}|${key}`;
}

/**
 * Map product-section estimate lines into crew_material_list rows (source=estimate).
 * Reuses id/notes from previous estimate rows with the same source_ref.
 */
export function mapEstimateProductsToCrewMaterials(
  items: EstimateMaterialSourceItem[],
  sectionNames: Record<string, string> = {},
  previous: CrewMaterialItem[] = [],
): CrewMaterialItem[] {
  const previousByRef = new Map(
    previous
      .filter((row) => row.source === 'estimate' && row.source_ref)
      .map((row) => [row.source_ref as string, row]),
  );

  const seen = new Set<string>();
  const rows: CrewMaterialItem[] = [];

  for (const item of items) {
    const section = item.section || '';
    if (!isProductSection(section)) continue;

    const name = String(item.name || item.description || '').trim();
    if (!name) continue;

    const source_ref = buildEstimateSourceRef({ ...item, name, section });
    if (seen.has(source_ref)) continue;
    seen.add(source_ref);

    const prev = previousByRef.get(source_ref);
    const qtyValue = item.qty_required ?? item.quantity;
    const quantity =
      qtyValue != null && !Number.isNaN(Number(qtyValue))
        ? String(qtyValue)
        : prev?.quantity != null
          ? String(prev.quantity)
          : '';
    const unit = String(item.unit_required || item.unit || prev?.unit || '').trim();
    const defaultNotes = sectionDisplayName(section, sectionNames);
    const notes = prev?.notes?.trim() ? prev.notes : defaultNotes;

    rows.push({
      id: prev?.id || crypto.randomUUID(),
      name,
      quantity: quantity || null,
      unit: unit || null,
      notes: notes || null,
      source: 'estimate',
      source_ref,
    });
  }

  return rows;
}

/** Keep only Costs-sourced rows (manual Overview materials are no longer used). */
export function mergeCrewMaterialList(
  _existing: CrewMaterialItem[] | null | undefined,
  estimateRows: CrewMaterialItem[],
): CrewMaterialItem[] {
  return estimateRows;
}
