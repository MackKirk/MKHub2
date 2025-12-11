export interface ClientListItem {
  id: string;
  name: string;
  display_name?: string;
  code?: string;
  legal_name?: string;
  city?: string;
  province?: string;
}

export interface CreateOpportunityPayload {
  client_id: string;
  name: string;
  description?: string;
  address?: string;
  address_city?: string;
  address_province?: string;
  is_bidding: boolean;
}

export interface OpportunityResponse {
  id: string;
  code: string;
  name: string;
}

