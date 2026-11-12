import axios from "axios";
import Constants from "expo-constants";

// Base URL from Expo extra (set EXPO_PUBLIC_API_BASE_URL; see README).
const API_BASE_URL: string =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)
    ?.apiBaseUrl ?? "https://mkhub.example.com";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

// Log API base URL for debugging (remove in production)
console.log("[API] Base URL:", API_BASE_URL);

export interface ApiErrorShape {
  message: string;
  status?: number;
}

function formatDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    if ("message" in detail && (detail as { message: unknown }).message != null) {
      return String((detail as { message: unknown }).message);
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }
  return String(detail);
}

export const toApiError = (error: unknown): ApiErrorShape => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const rawDetail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    const detail = formatDetail(rawDetail) || error.message || "Unknown error";

    if (!status) {
      return { message: "Connection error, please try again." };
    }
    return { message: detail, status };
  }
  return { message: "Unexpected error, please try again." };
};

export function getApiErrorRowVersion(error: unknown): number | null {
  if (!axios.isAxiosError(error)) return null;
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail) && "row_version" in detail) {
    const n = Number((detail as { row_version: unknown }).row_version);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


