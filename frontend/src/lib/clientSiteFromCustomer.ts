export const SITE_USE_CUSTOMER_ADDRESS = '__use_customer_address__';
export const CUSTOMER_MAIN_SITE_NAME = 'Main address';
export const SITE_USE_CUSTOMER_ADDRESS_LABEL = 'Use customer address as site address';

export type CustomerAddressSource = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type ClientSitePayload = {
  site_name?: string;
  site_address_line1?: string;
  site_address_line2?: string;
  site_city?: string;
  site_province?: string;
  site_postal_code?: string;
  site_country?: string;
  site_lat?: number | null;
  site_lng?: number | null;
  site_notes?: string;
};

export type ClientSiteRow = {
  id: string;
  site_name?: string;
  site_address_line1?: string;
  site_address_line2?: string;
  site_city?: string;
  site_province?: string;
  site_postal_code?: string;
  site_country?: string;
  site_lat?: number | null;
  site_lng?: number | null;
};

function norm(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function hasUsableCustomerAddress(client: CustomerAddressSource | null | undefined): boolean {
  if (!client) return false;
  if (norm(client.address_line1)) return true;
  return !!(norm(client.city) && norm(client.province));
}

export function buildSitePayloadFromCustomer(client: CustomerAddressSource): ClientSitePayload {
  return {
    site_name: CUSTOMER_MAIN_SITE_NAME,
    site_address_line1: client.address_line1?.trim() || undefined,
    site_address_line2: client.address_line2?.trim() || undefined,
    site_city: client.city?.trim() || undefined,
    site_province: client.province?.trim() || undefined,
    site_postal_code: client.postal_code?.trim() || undefined,
    site_country: client.country?.trim() || undefined,
    site_lat: client.lat ?? undefined,
    site_lng: client.lng ?? undefined,
  };
}

function locationKey(
  line1: string | null | undefined,
  city: string | null | undefined,
  province: string | null | undefined,
  postal: string | null | undefined,
): string {
  return [norm(line1), norm(city), norm(province), norm(postal)].join('|');
}

export function findMatchingSite(sites: ClientSiteRow[], payload: ClientSitePayload): ClientSiteRow | null {
  const payloadLine1 = norm(payload.site_address_line1);
  const payloadLoc = locationKey(
    payload.site_address_line1,
    payload.site_city,
    payload.site_province,
    payload.site_postal_code,
  );

  for (const site of sites) {
    const siteLine1 = norm(site.site_address_line1);
    if (payloadLine1 && siteLine1 && payloadLine1 === siteLine1) {
      return site;
    }
    const siteLoc = locationKey(
      site.site_address_line1,
      site.site_city,
      site.site_province,
      site.site_postal_code,
    );
    if (payloadLoc.replace(/\|/g, '').length > 0 && payloadLoc === siteLoc) {
      return site;
    }
  }
  return null;
}

export async function resolveSiteIdForCustomerAddress(
  client: CustomerAddressSource,
  sites: ClientSiteRow[],
  createSite: (payload: ClientSitePayload) => Promise<{ id: string }>,
): Promise<{ siteId: string; created: boolean }> {
  const payload = buildSitePayloadFromCustomer(client);
  const existing = findMatchingSite(sites, payload);
  if (existing?.id) {
    return { siteId: String(existing.id), created: false };
  }
  const created = await createSite(payload);
  return { siteId: String(created.id), created: true };
}
