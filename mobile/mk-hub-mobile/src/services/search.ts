import { api } from "./api";

export type GlobalSearchItem = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  code?: string | null;
  name?: string | null;
  address?: string | null;
  href: string;
};

export type GlobalSearchSection = {
  id: string;
  label: string;
  items: GlobalSearchItem[];
};

export type GlobalSearchResponse = {
  sections: GlobalSearchSection[];
};

export async function globalSearch(
  q: string,
  limit = 10
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("limit", String(limit));
  const response = await api.get<GlobalSearchResponse>(`/search?${params.toString()}`);
  return response.data;
}
