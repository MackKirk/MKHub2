import { api } from "./api";
import type { ClientListItem, CreateOpportunityPayload, OpportunityResponse } from "../types/opportunities";

// Opportunities are projects with is_bidding=true
// - GET /clients?q=... (search clients)
// - POST /projects (create opportunity/project with is_bidding=true)

export const searchClients = async (query?: string): Promise<ClientListItem[]> => {
  try {
    const params: Record<string, any> = { limit: 50, page: 1 };
    if (query && query.trim()) {
      params.q = query.trim();
    }
    
    const response = await api.get<{ items?: any[]; data?: any[] } | any[]>("/clients", {
      params
    });
    
    // Handle different response formats
    const data = response.data;
    
    // If it's an array, return it directly
    if (Array.isArray(data)) {
      return data.map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : String(item.id),
        name: item.name || '',
        display_name: item.display_name,
        code: item.code,
        legal_name: item.legal_name,
        city: item.city,
        province: item.province
      }));
    }
    
    // If it's an object with items property (paginated response)
    if (data && typeof data === 'object' && 'items' in data) {
      const items = (data as { items: any[] }).items || [];
      return items.map((item: any) => ({
        id: typeof item.id === 'string' ? item.id : String(item.id),
        name: item.name || '',
        display_name: item.display_name,
        code: item.code,
        legal_name: item.legal_name,
        city: item.city,
        province: item.province
      }));
    }
    
    return [];
  } catch (error) {
    console.error("[searchClients] Error:", error);
    throw error;
  }
};

export const createOpportunity = async (
  payload: CreateOpportunityPayload
): Promise<OpportunityResponse> => {
  const response = await api.post<OpportunityResponse>("/projects", {
    ...payload,
    is_bidding: true
  });
  return response.data;
};

