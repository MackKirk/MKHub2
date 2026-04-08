/** Normalize Google Place Details `result` (REST shape) for address forms. */

export type ParsedPlaceAddress = {
  address_line1: string;
  address_line2?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
};

export function parseGooglePlaceResult(place: {
  formatted_address?: string;
  name?: string;
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
  geometry?: { location?: { lat: number; lng: number } };
}): ParsedPlaceAddress {
  const displayAddress = (place.formatted_address || place.name || '').trim();
  let address_line2 = '';
  let city = '';
  let province = '';
  let country = '';
  let postal_code = '';
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;

  if (place.address_components && Array.isArray(place.address_components)) {
    for (const component of place.address_components) {
      const types = component.types;
      if (types.includes('subpremise')) {
        address_line2 = component.long_name;
      }
      if (types.includes('locality') && !city) {
        city = component.long_name;
      }
      if (types.includes('sublocality') && !city) {
        city = component.long_name;
      }
      if (types.includes('sublocality_level_1') && !city) {
        city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        province = component.long_name || component.short_name;
      }
      if (types.includes('administrative_area_level_2') && !province) {
        province = component.long_name || component.short_name;
      }
      if (types.includes('country')) {
        country = component.long_name || component.short_name;
      }
      if (types.includes('postal_code')) {
        postal_code = component.long_name;
      }
    }
  }

  return {
    address_line1: displayAddress,
    address_line2: address_line2 || undefined,
    city: city || undefined,
    province: province || undefined,
    country: country || undefined,
    postal_code: postal_code || undefined,
    lat: lat !== undefined && lat !== null ? Number(lat) : undefined,
    lng: lng !== undefined && lng !== null ? Number(lng) : undefined,
  };
}
