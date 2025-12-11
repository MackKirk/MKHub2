import { api } from "./api";

export interface Proposal {
  id: string;
  project_id?: string;
  client_id?: string;
  site_id?: string;
  order_number?: string;
  title?: string;
  created_at?: string;
}

// GET /proposals?project_id=...
export const getProjectProposals = async (projectId: string): Promise<Proposal[]> => {
  const response = await api.get<Proposal[]>("/proposals", {
    params: { project_id: projectId }
  });
  return response.data;
};

// GET /proposals/{proposal_id}
export const getProposal = async (proposalId: string): Promise<any> => {
  const response = await api.get<any>(`/proposals/${proposalId}`);
  return response.data;
};

