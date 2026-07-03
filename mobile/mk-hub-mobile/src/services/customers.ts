import { api } from "./api";
import type {
  Customer,
  CustomerContact,
  CustomerContactPayload,
  CustomerListResponse,
  CustomerPayload,
  CustomerProjectParticipationsResponse,
  CustomerSite,
  CustomerSitePayload
} from "../types/customers";

export async function listCustomers(params: {
  q?: string;
  status?: string;
  type?: string;
  city?: string;
  page?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
}): Promise<CustomerListResponse> {
  const response = await api.get<CustomerListResponse>("/clients", { params });
  return response.data;
}

export async function getCustomer(customerId: string): Promise<Customer> {
  const response = await api.get<Customer>(`/clients/${customerId}`);
  return response.data;
}

export async function createCustomer(body: CustomerPayload): Promise<Customer> {
  const response = await api.post<Customer>("/clients", body);
  return response.data;
}

export async function updateCustomer(
  customerId: string,
  body: Partial<CustomerPayload>
): Promise<Customer> {
  const response = await api.patch<Customer>(`/clients/${customerId}`, body);
  return response.data;
}

export async function listCustomerContacts(customerId: string): Promise<CustomerContact[]> {
  const response = await api.get<CustomerContact[]>(`/clients/${customerId}/contacts`);
  return response.data;
}

export async function createCustomerContact(
  customerId: string,
  body: CustomerContactPayload
): Promise<CustomerContact> {
  const response = await api.post<CustomerContact>(`/clients/${customerId}/contacts`, body);
  return response.data;
}

export async function updateCustomerContact(
  customerId: string,
  contactId: string,
  body: Partial<CustomerContactPayload>
): Promise<CustomerContact> {
  const response = await api.patch<CustomerContact>(
    `/clients/${customerId}/contacts/${contactId}`,
    body
  );
  return response.data;
}

export async function deleteCustomerContact(
  customerId: string,
  contactId: string
): Promise<void> {
  await api.delete(`/clients/${customerId}/contacts/${contactId}`);
}

export async function listCustomerSites(customerId: string): Promise<CustomerSite[]> {
  const response = await api.get<CustomerSite[]>(`/clients/${customerId}/sites`);
  return response.data;
}

export async function createCustomerSite(
  customerId: string,
  body: CustomerSitePayload
): Promise<CustomerSite> {
  const response = await api.post<CustomerSite>(`/clients/${customerId}/sites`, body);
  return response.data;
}

export async function updateCustomerSite(
  customerId: string,
  siteId: string,
  body: Partial<CustomerSitePayload>
): Promise<CustomerSite> {
  const response = await api.patch<CustomerSite>(`/clients/${customerId}/sites/${siteId}`, body);
  return response.data;
}

export async function deleteCustomerSite(customerId: string, siteId: string): Promise<void> {
  await api.delete(`/clients/${customerId}/sites/${siteId}`);
}

export async function getCustomerProjectParticipations(
  customerId: string
): Promise<CustomerProjectParticipationsResponse> {
  const response = await api.get<CustomerProjectParticipationsResponse>(
    `/clients/${customerId}/project-participations`
  );
  return response.data;
}
