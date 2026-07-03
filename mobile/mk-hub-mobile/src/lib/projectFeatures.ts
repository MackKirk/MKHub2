import { isAdminRole } from "./permissions";

export function hasProjectFeatureRead(
  permissions: Set<string>,
  roles: string[],
  feature: "documents" | "proposal" | "pricing" | "safety"
): boolean {
  if (isAdminRole(roles)) return true;
  switch (feature) {
    case "documents":
      return (
        permissions.has("business:projects:documents:read") ||
        permissions.has("documents:read") ||
        permissions.has("documents:access")
      );
    case "proposal":
    case "pricing":
      return (
        permissions.has("business:construction:projects:read") ||
        permissions.has("business:rm:projects:read") ||
        permissions.has("business:projects:read")
      );
    case "safety":
      return (
        permissions.has("business:projects:safety:read") ||
        permissions.has("business:construction:projects:safety:read") ||
        permissions.has("business:rm:projects:safety:read")
      );
    default:
      return false;
  }
}

export function hasProjectFeatureWrite(
  permissions: Set<string>,
  roles: string[],
  feature: "safety"
): boolean {
  if (isAdminRole(roles)) return true;
  return (
    permissions.has("business:projects:safety:write") ||
    permissions.has("business:construction:projects:safety:write") ||
    permissions.has("business:rm:projects:safety:write")
  );
}

export interface ProposalPricingItem {
  name?: string;
  label?: string;
  price?: number | string;
  quantity?: number | string;
  pst?: boolean;
  gst?: boolean;
}

export function extractProposalPricingItems(
  proposalDetail: { data?: { additional_costs?: ProposalPricingItem[] } } | null
): ProposalPricingItem[] {
  const items = proposalDetail?.data?.additional_costs;
  return Array.isArray(items) ? items : [];
}

export function pricingItemLabel(item: ProposalPricingItem): string {
  return item.name || item.label || "Item";
}

export function pricingItemAmount(item: ProposalPricingItem): number {
  const price = Number(item.price ?? 0);
  const qty = Number(item.quantity ?? 1);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return price * qty;
}
