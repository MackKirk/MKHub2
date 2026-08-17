import { api } from '@/lib/api';
import type { AppComboboxOption } from '@/components/ui';

const EQUIPMENT_PAGE_LIMIT = 100;

export async function fetchAllEquipmentAlphabetical(): Promise<Record<string, unknown>[]> {
  const limit = EQUIPMENT_PAGE_LIMIT;
  let page = 1;
  const all: Record<string, unknown>[] = [];

  for (;;) {
    const res = (await api<Record<string, unknown>>(
      'GET',
      `/fleet/equipment?limit=${limit}&page=${page}&sort=name&dir=asc`,
    )) as Record<string, unknown>;

    const raw = res?.items ?? res?.data;
    const items = Array.isArray(raw) ? raw : [];
    if (items.length === 0) break;

    all.push(...items);

    const total = typeof res.total === 'number' ? res.total : null;
    const totalPagesField =
      typeof res.total_pages === 'number' ? Math.max(1, res.total_pages as number) : null;
    const totalPagesComputed =
      total != null && total > 0 ? Math.max(1, Math.ceil(total / limit)) : null;
    const totalPages = totalPagesField ?? totalPagesComputed;

    if (totalPages != null) {
      if (page >= totalPages) break;
    } else if (items.length < limit) {
      break;
    }
    page += 1;
  }

  return all;
}

export function equipmentToPickerLabel(equipment: Record<string, unknown>): string {
  const category = String(equipment.category ?? '').replace(/_/g, ' ');
  const unit =
    equipment.unit_number != null && String(equipment.unit_number).trim() !== ''
      ? ` \u00b7 Unit ${String(equipment.unit_number).trim()}`
      : '';
  const name =
    equipment.name != null && String(equipment.name).trim() !== ''
      ? String(equipment.name).trim()
      : [equipment.brand, equipment.model].filter(Boolean).join(' ').trim() || 'Unnamed';
  return `${name}${category ? ` (${category})` : ''}${unit}`;
}

export function equipmentToComboboxOptions(items: Record<string, unknown>[]): AppComboboxOption[] {
  return items
    .filter((item) => item?.id != null && String(item.id).trim() !== '')
    .map((item) => ({
      value: String(item.id),
      label: equipmentToPickerLabel(item),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
