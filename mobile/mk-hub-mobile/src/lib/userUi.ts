import { resolveFileUrl } from "./fileUrls";

export function hubUserDisplayName(user: {
  name?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
}): string {
  const preferred = user.preferred_name?.trim();
  if (preferred) return preferred;
  if (user.name?.trim()) return user.name.trim();
  const combined = [user.first_name, user.last_name]
    .filter((part) => part && String(part).trim())
    .join(" ")
    .trim();
  return combined || user.username || "Unknown";
}

export function hubUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function hubUserPhotoUrl(
  fileId: string | null | undefined,
  token: string | null,
  width = 200
): string | null {
  if (!fileId) return null;
  return resolveFileUrl(`/files/${fileId}/thumbnail?w=${width}`, token);
}

export function formatHubUserDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const sliced = String(value).slice(0, 10);
    return sliced || null;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function formatHubUserAddress(profile: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string | null {
  const line1 = [profile.address_line1, profile.address_line2]
    .filter((part) => part && String(part).trim())
    .join(", ");
  const cityLine = [profile.city, profile.province, profile.postal_code]
    .filter((part) => part && String(part).trim())
    .join(", ");
  const parts = [line1, cityLine, profile.country?.trim()]
    .filter(Boolean)
    .join("\n");
  return parts || null;
}

export function formatHubUserPayRate(value?: string | number | null): string | null {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && String(value).trim() !== "") {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: "CAD"
    }).format(numeric);
  }
  return String(value);
}

export function displayValue(value?: string | number | null): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}
