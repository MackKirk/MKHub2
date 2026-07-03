export interface CompanyCreditCardItem {
  id: string;
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  cardholder_name?: string | null;
  issuer?: string | null;
  billing_entity?: string | null;
  status: string;
  assigned_to_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export interface CompanyCreditCardListResponse {
  items: CompanyCreditCardItem[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
