import Constants from "expo-constants";

const API_BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ?? "https://mkhub.example.com";

/** Append JWT for GET /files/* (thumbnails) where Image cannot send Authorization. */
export function withFileAccessToken(url: string, token: string | null): string {
  if (!token || !url) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}access_token=${encodeURIComponent(token)}`;
}

export function resolveFileUrl(
  path: string | null | undefined,
  token: string | null
): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return withFileAccessToken(path, token);
  }
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/files/")) {
    return withFileAccessToken(`${base}${normalized}`, token);
  }
  if (normalized.startsWith("/ui/")) {
    return `${base}${normalized}`;
  }
  return `${base}${normalized}`;
}
