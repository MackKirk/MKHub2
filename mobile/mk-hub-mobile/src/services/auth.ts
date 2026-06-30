import { api } from "./api";
import type { TokenResponse, MeProfileResponse, MeResponse } from "../types/auth";

// Uses FastAPI auth endpoints:
// - POST /auth/login (body: { identifier, password }) -> TokenResponse
// - GET /auth/me/profile -> Me profile with user + profile
// - GET /auth/me -> roles + permissions

export interface LoginPayload {
  identifier: string;
  password: string;
}

export const loginRequest = async (
  identifier: string,
  password: string
): Promise<TokenResponse> => {
  const response = await api.post<TokenResponse>("/auth/login", {
    identifier,
    password
  } satisfies LoginPayload);
  return response.data;
};

export const getCurrentUserProfile = async (): Promise<MeProfileResponse> => {
  const response = await api.get<MeProfileResponse>("/auth/me/profile");
  return response.data;
};

export const getCurrentUser = async (): Promise<MeResponse> => {
  const response = await api.get<MeResponse>("/auth/me");
  return response.data;
};


