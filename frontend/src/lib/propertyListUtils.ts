export type PropertyListRow = {
  id: string;
  name: string;
  property_type?: string;
  ownership: string;
  visibility: string;
  status: string;
  city?: string;
  province?: string;
  address_line1?: string;
  owner_summary?: string;
  image_file_object_id?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function formatPropertyAddress(p: Pick<PropertyListRow, 'address_line1' | 'city' | 'province'>): string {
  const line = [p.address_line1, [p.city, p.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return line || 'No address';
}

export const PROPERTY_PLACEHOLDER_COVER = '/ui/assets/placeholders/project.png';
