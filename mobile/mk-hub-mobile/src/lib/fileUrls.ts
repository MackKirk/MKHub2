import Constants from "expo-constants";
import { api } from "../services/api";

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

export function buildAuthenticatedFileUrl(
  fileObjectId: string,
  options: {
    token?: string | null;
    variant?: "inline" | "download" | "thumbnail";
    thumbnailWidth?: number;
  } = {}
): { uri: string; headers?: { Authorization: string } } {
  const variant = options.variant ?? "inline";
  const path =
    variant === "thumbnail"
      ? `/files/${fileObjectId}/thumbnail?w=${options.thumbnailWidth ?? 200}`
      : variant === "download"
        ? `/files/${fileObjectId}/download`
        : `/files/${fileObjectId}`;
  const url = new URL(path, api.defaults.baseURL);
  const authHeader = options.token ? `Bearer ${options.token}` : undefined;

  if (authHeader?.startsWith("Bearer ")) {
    url.searchParams.set("access_token", authHeader.slice(7).trim());
  }

  return {
    uri: url.toString(),
    headers: authHeader ? { Authorization: authHeader } : undefined
  };
}

export function isImageContentType(
  contentType?: string | null,
  originalName?: string | null
): boolean {
  if (contentType?.startsWith("image/")) return true;
  const name = String(originalName || "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(name);
}
