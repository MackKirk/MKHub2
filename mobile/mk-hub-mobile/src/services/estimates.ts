import { api } from "./api";

export interface Estimate {
  id: string;
  project_id?: string;
  total_cost?: number;
  created_at?: string;
}

export interface EstimateItem {
  id: string;
  estimate_id: string;
  item_type?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  total?: number;
}

// GET /estimate/estimates?project_id=...
export const getProjectEstimates = async (projectId: string): Promise<Estimate[]> => {
  const response = await api.get<Estimate[]>("/estimate/estimates", {
    params: { project_id: projectId }
  });
  return response.data;
};

// GET /estimate/estimates/{estimate_id}
export const getEstimate = async (estimateId: string): Promise<any> => {
  const response = await api.get<any>(`/estimate/estimates/${estimateId}`);
  return response.data;
};

// GET /estimate/estimates/{estimate_id}/items
export const getEstimateItems = async (estimateId: string): Promise<EstimateItem[]> => {
  const response = await api.get<EstimateItem[]>(`/estimate/estimates/${estimateId}/items`);
  return response.data;
};

