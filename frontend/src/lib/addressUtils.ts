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
