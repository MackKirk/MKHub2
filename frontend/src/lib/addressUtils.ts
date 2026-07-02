/**
 * Format address for display without duplicating city/province/country.
 * When address_line1 is a full address from Google (contains comma), we don't append city/province/country.
 * Address line 1 and 2 are joined with " / " when both exist.
 */
export function formatAddressDisplay(opts: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  const l1 = (opts.address_line1 || '').trim();
  const l2 = (opts.address_line2 || '').trim();
  const line1IsFullAddress = l1.includes(',');
  const parts: string[] = [];
  if (l1 && l2) {
    parts.push(l1 + ' / ' + l2);
  } else if (l1) {
    parts.push(l1);
  } else if (l2) {
    parts.push(l2);
  }
  if (!line1IsFullAddress) {
    const rest = [opts.city, opts.province, opts.postal_code, opts.country]
      .filter(Boolean)
      .map(String)
      .join(', ');
    if (rest) parts.push(rest);
  }
  return parts.join(', ') || '—';
}

/** Hero site line: street, city, postal — no province or country. */
export function formatSiteHeroAddress(opts: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
}): string | null {
  const l1 = (opts.address_line1 || '').trim();
  const l2 = (opts.address_line2 || '').trim();
  const cityField = (opts.city || '').trim();
  const postalField = (opts.postal_code || '').trim();

  if (!l1 && !l2 && !cityField && !postalField) return null;

  if (l1.includes(',')) {
    const parsed = parseFullAddressForHero(l1);
    const parts = [parsed.street, parsed.city, parsed.postal].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  const streetParts: string[] = [];
  if (l1 && l2) streetParts.push(`${l1} / ${l2}`);
  else if (l1) streetParts.push(l1);
  else if (l2) streetParts.push(l2);

  const parts = [...streetParts, cityField, postalField].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

const HERO_POSTAL_RE = /\b([A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d)\b/;

const HERO_COUNTRY_SEGMENTS = new Set([
  'canada',
  'usa',
  'us',
  'united states',
  'united states of america',
]);

const HERO_PROVINCE_CODES = new Set([
  'ab',
  'bc',
  'mb',
  'nb',
  'nl',
  'ns',
  'nt',
  'nu',
  'on',
  'pe',
  'qc',
  'sk',
  'yt',
]);

const HERO_PROVINCE_NAMES = new Set([
  'alberta',
  'british columbia',
  'manitoba',
  'new brunswick',
  'newfoundland and labrador',
  'northwest territories',
  'nova scotia',
  'nunavut',
  'ontario',
  'prince edward island',
  'quebec',
  'saskatchewan',
  'yukon',
]);

function normalizeHeroPostal(value: string): string {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  if (compact.length === 6) {
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return value.toUpperCase().trim();
}

function extractHeroPostal(text: string): string | null {
  const match = text.match(HERO_POSTAL_RE);
  return match ? normalizeHeroPostal(match[1]) : null;
}

function isHeroCountrySegment(segment: string): boolean {
  return HERO_COUNTRY_SEGMENTS.has(segment.trim().toLowerCase());
}

function isHeroProvinceSegment(segment: string): boolean {
  const normalized = segment.trim().toLowerCase();
  if (!normalized) return false;
  if (HERO_PROVINCE_CODES.has(normalized)) return true;
  if (HERO_PROVINCE_NAMES.has(normalized)) return true;
  return false;
}

function parseFullAddressForHero(line1: string): {
  street: string;
  city?: string;
  postal?: string;
} {
  const segments = line1
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length === 0) return { street: '' };

  const street = segments[0];
  let city: string | undefined;
  let postal: string | undefined;

  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    if (isHeroCountrySegment(segment)) continue;

    const segmentPostal = extractHeroPostal(segment);
    if (segmentPostal) {
      postal = postal || segmentPostal;
      continue;
    }

    if (isHeroProvinceSegment(segment)) continue;

    if (!city) city = segment;
  }

  return { street, city, postal };
}
