import { isAdminRole } from "./permissions";

/** Sections that count as useful project access (Overview alone does not). */
export const PROJECT_SECTION_FEATURES = [
  "reports",
  "workload",
  "timesheet",
  "files",
  "documents",
  "proposal",
  "costs",
  "warranties",
  "orders",
  "safety"
] as const;

export type ProjectSectionFeature = (typeof PROJECT_SECTION_FEATURES)[number];

function hasLineFeature(
  permissions: Set<string>,
  feature: string,
  action: "read" | "write"
): boolean {
  const suffixes =
    action === "read"
      ? ([`${feature}:read`, `${feature}:write`] as const)
      : ([`${feature}:write`] as const);
  for (const suffix of suffixes) {
    if (
      permissions.has(`business:construction:projects:${suffix}`) ||
      permissions.has(`business:rm:projects:${suffix}`) ||
      permissions.has(`business:projects:${suffix}`)
    ) {
      return true;
    }
  }
  if (feature === "costs") {
    for (const suffix of action === "read"
      ? (["estimate:read", "estimate:write"] as const)
      : (["estimate:write"] as const)) {
      if (
        permissions.has(`business:construction:projects:${suffix}`) ||
        permissions.has(`business:rm:projects:${suffix}`) ||
        permissions.has(`business:projects:${suffix}`)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function hasProjectSectionRead(
  permissions: Set<string>,
  roles: string[],
  feature: ProjectSectionFeature
): boolean {
  if (isAdminRole(roles)) return true;
  return hasLineFeature(permissions, feature, "read");
}

/** True if the user can open project detail (at least one section/tab). */
export function hasAnyProjectSectionPermission(
  permissions: Set<string>,
  roles: string[]
): boolean {
  if (isAdminRole(roles)) return true;
  return PROJECT_SECTION_FEATURES.some((feature) =>
    hasProjectSectionRead(permissions, roles, feature)
  );
}

export function hasProjectFeatureRead(
  permissions: Set<string>,
  roles: string[],
  feature: "documents" | "proposal" | "pricing" | "safety" | "files" | "reports"
): boolean {
  if (isAdminRole(roles)) return true;
  if (feature === "pricing" || feature === "proposal") {
    return hasProjectSectionRead(permissions, roles, "proposal");
  }
  if (feature === "files") {
    return hasProjectSectionRead(permissions, roles, "files");
  }
  if (feature === "reports") {
    return hasProjectSectionRead(permissions, roles, "reports");
  }
  return hasProjectSectionRead(permissions, roles, feature);
}

export function hasProjectFeatureWrite(
  permissions: Set<string>,
  roles: string[],
  feature: "safety"
): boolean {
  if (isAdminRole(roles)) return true;
  return hasLineFeature(permissions, "safety", "write");
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
