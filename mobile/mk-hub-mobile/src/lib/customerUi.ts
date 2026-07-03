import type { ProjectStatusBadgeVariant } from "./projectUi";
import type { Customer, CustomerSite } from "../types/customers";

export function customerDisplayName(customer: Pick<Customer, "display_name" | "name" | "legal_name">): string {
  return customer.display_name?.trim() || customer.name?.trim() || customer.legal_name?.trim() || "Customer";
}

export function formatCustomerStatus(status?: string | null): string {
  const text = String(status || "").trim();
  if (!text) return "Unknown";
  return text
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getCustomerStatusVariant(status?: string | null): ProjectStatusBadgeVariant {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "neutral";
  if (value === "active" || value === "customer") return "success";
  if (value === "inactive" || value === "lost" || value === "do_not_contact") return "danger";
  if (value === "prospect" || value === "lead") return "info";
  return "neutral";
}

export function formatCustomerAddress(customer: Pick<Customer, "address_line1" | "address_line2" | "city" | "province" | "postal_code" | "country">): string {
  return [
    customer.address_line1,
    customer.address_line2,
    [customer.city, customer.province].filter(Boolean).join(", "),
    customer.postal_code,
    customer.country
  ]
    .filter((part) => String(part || "").trim())
    .join(" - ");
}

export function formatSiteAddress(site: Pick<CustomerSite, "site_address_line1" | "site_address_line2" | "site_city" | "site_province" | "site_postal_code" | "site_country">): string {
  return [
    site.site_address_line1,
    site.site_address_line2,
    [site.site_city, site.site_province].filter(Boolean).join(", "),
    site.site_postal_code,
    site.site_country
  ]
    .filter((part) => String(part || "").trim())
    .join(" - ");
}
