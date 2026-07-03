export type CustomerDetailTabKey = "general" | "contacts" | "sites" | "projects";

export interface Customer {
  id: string;
  code?: string | null;
  name: string;
  legal_name?: string | null;
  display_name?: string | null;
  client_type?: string | null;
  client_status?: string | null;
  lead_source?: string | null;
  estimator_id?: string | null;
  description?: string | null;
  logo_url?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  billing_same_as_address?: boolean | null;
  billing_email?: string | null;
  po_required?: boolean | null;
  tax_number?: string | null;
  preferred_language?: string | null;
  preferred_channels?: string[] | null;
  marketing_opt_in?: boolean | null;
  invoice_delivery_method?: string | null;
  statement_delivery_method?: string | null;
  cc_emails_for_invoices?: string[] | null;
  cc_emails_for_estimates?: string[] | null;
  do_not_contact?: boolean | null;
  do_not_contact_reason?: string | null;
}

export interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export type CustomerPayload = {
  name: string;
  legal_name?: string | null;
  display_name?: string | null;
  client_type?: string | null;
  client_status?: string | null;
  lead_source?: string | null;
  description?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_province?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  billing_same_as_address?: boolean;
  billing_email?: string | null;
  po_required?: boolean;
  tax_number?: string | null;
};

export interface CustomerContact {
  id: string;
  client_id: string;
  name: string;
  role_title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  is_primary?: boolean | null;
  sort_index?: number | null;
  notes?: string | null;
  role_tags?: string[] | null;
}

export type CustomerContactPayload = {
  name: string;
  role_title?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
  role_tags?: string[] | null;
};

export interface CustomerSite {
  id: string;
  client_id: string;
  site_name?: string | null;
  site_address_line1?: string | null;
  site_address_line2?: string | null;
  site_city?: string | null;
  site_province?: string | null;
  site_postal_code?: string | null;
  site_country?: string | null;
  site_lat?: number | null;
  site_lng?: number | null;
  site_notes?: string | null;
  sort_index?: number | null;
}

export type CustomerSitePayload = {
  site_name?: string | null;
  site_address_line1?: string | null;
  site_address_line2?: string | null;
  site_city?: string | null;
  site_province?: string | null;
  site_postal_code?: string | null;
  site_country?: string | null;
  site_notes?: string | null;
};

export interface CustomerProjectParticipation {
  id: string;
  code?: string | null;
  name: string;
  client_id?: string | null;
  created_at?: string | null;
  date_start?: string | null;
  date_eta?: string | null;
  date_awarded?: string | null;
  date_end?: string | null;
  progress?: number | null;
  cost_estimated?: number | null;
  service_value?: number | null;
  status_label?: string | null;
  is_bidding?: boolean;
  business_line?: string | null;
  participation?: "owner" | "awarded_related" | string;
}

export interface CustomerRelatedMembership {
  id: string;
  code?: string | null;
  name: string;
  is_bidding?: boolean;
  is_awarded_related?: boolean;
}

export interface CustomerProjectParticipationsResponse {
  rollup: CustomerProjectParticipation[];
  related_memberships: CustomerRelatedMembership[];
}
