import { api } from '@/lib/api';
import type { AppComboboxOption } from '@/components/ui';

const FLEET_ASSETS_PAGE_LIMIT = 100;

export async function fetchAllFleetAssetsAlphabetical(): Promise<Record<string, unknown>[]> {
  const limit = FLEET_ASSETS_PAGE_LIMIT;
  let page = 1;
  const all: Record<string, unknown>[] = [];

  for (;;) {
    const res = (await api<Record<string, unknown>>(
      'GET',
      `/fleet/assets?limit=${limit}&page=${page}&sort=name&dir=asc`,
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

export function fleetAssetToPickerLabel(asset: Record<string, unknown>): string {
  const type = String(asset.asset_type ?? 'asset').replace(/_/g, ' ');
  const unit =
    asset.unit_number != null && String(asset.unit_number).trim() !== ''
      ? ` \u00b7 Unit ${String(asset.unit_number).trim()}`
      : '';
  const name =
    asset.name != null && String(asset.name).trim() !== ''
      ? String(asset.name).trim()
      : [asset.make, asset.model].filter(Boolean).join(' ').trim() || 'Unnamed';
  return `${name} (${type})${unit}`;
}

export function fleetAssetsToComboboxOptions(assets: Record<string, unknown>[]): AppComboboxOption[] {
  return assets
    .filter((asset) => asset?.id != null && String(asset.id).trim() !== '')
    .map((asset) => ({
      value: String(asset.id),
      label: fleetAssetToPickerLabel(asset),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}
