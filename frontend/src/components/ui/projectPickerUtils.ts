export type ProjectPickerItem = {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
};

/** Closed trigger / list primary line: "Name (CODE)" or name only. */
export function formatProjectPrimaryLine(p: ProjectPickerItem): string {
  const code = p.code?.trim();
  return code ? `${p.name} (${code})` : p.name;
}

export function formatProjectAddressLine(p: ProjectPickerItem): string {
  return [p.address, p.address_city, p.address_province, p.address_postal_code, p.address_country]
    .filter((x) => x && String(x).trim())
    .join(', ');
}
