import axios from "axios";
import Constants from "expo-constants";

// Base URL is configured via Expo extra config.
// TODO: Set EXPO_PUBLIC_API_BASE_URL (or extra.apiBaseUrl) to the real MK Hub backend URL.
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
}

export const toApiError = (error: unknown): ApiErrorShape => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail =
      (error.response?.data as { detail?: string })?.detail ??
      error.message ??
      "Unknown error";

    if (!status) {
      return { message: "Connection error, please try again." };
    }
    return { message: detail };
  }
  return { message: "Unexpected error, please try again." };
};


