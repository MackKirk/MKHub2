import { api } from "./api";
import type { CompanyCreditCardListResponse } from "../types/companyAssets";

export async function listCompanyCreditCards(params: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sort?: "label" | "expiry" | "status";
  dir?: "asc" | "desc";
}): Promise<CompanyCreditCardListResponse> {
  const response = await api.get<CompanyCreditCardListResponse>("/company-credit-cards", {
    params
  });
  return response.data;
}
