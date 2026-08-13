import {
  BUSINESS_LINE_REPAIRS,
  isAdminRole
} from "./permissions";

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

type ProjectLine = "construction" | "repairs";

const LINE_PREFIX: Record<ProjectLine, string> = {
  construction: "business:construction:projects",
  repairs: "business:rm:projects"
};

function projectLineFromBusinessLine(
  businessLine?: string | null
): ProjectLine {
  return businessLine === BUSINESS_LINE_REPAIRS ? "repairs" : "construction";
}

function hasLegacyFeature(
  permissions: Set<string>,
  feature: string,
  action: "read" | "write"
): boolean {
  if (feature === "costs") {
    const keys =
      action === "read"
        ? ([
            "business:projects:costs:read",
            "business:projects:costs:write",
            "business:projects:estimate:read",
            "business:projects:estimate:write"
          ] as const)
        : (["business:projects:costs:write", "business:projects:estimate:write"] as const);
    return keys.some((k) => permissions.has(k));
  }
  if (action === "read") {
    return (
      permissions.has(`business:projects:${feature}:read`) ||
      permissions.has(`business:projects:${feature}:write`)
    );
  }
  return permissions.has(`business:projects:${feature}:write`);
}

function hasLineFeature(
  permissions: Set<string>,
  feature: string,
  action: "read" | "write",
  businessLine?: string | null
): boolean {
  const line = projectLineFromBusinessLine(businessLine);
  const prefix = LINE_PREFIX[line];
  const suffixes =
    action === "read"
      ? ([`${feature}:read`, `${feature}:write`] as const)
      : ([`${feature}:write`] as const);
  for (const suffix of suffixes) {
    if (permissions.has(`${prefix}:${suffix}`)) return true;
  }
  if (feature === "costs") {
    for (const suffix of action === "read"
      ? (["estimate:read", "estimate:write"] as const)
      : (["estimate:write"] as const)) {
      if (permissions.has(`${prefix}:${suffix}`)) return true;
    }
  }
  return hasLegacyFeature(permissions, feature, action);
}

export function hasProjectSectionRead(
  permissions: Set<string>,
  roles: string[],
  feature: ProjectSectionFeature,
  businessLine?: string | null
): boolean {
  if (isAdminRole(roles)) return true;
  return hasLineFeature(permissions, feature, "read", businessLine);
}

/** True if the user can open project detail (at least one section/tab). */
export function hasAnyProjectSectionPermission(
  permissions: Set<string>,
  roles: string[],
  businessLine?: string | null
): boolean {
  if (isAdminRole(roles)) return true;
  return PROJECT_SECTION_FEATURES.some((feature) =>
    hasProjectSectionRead(permissions, roles, feature, businessLine)
  );
}

export function hasProjectFeatureRead(
  permissions: Set<string>,
  roles: string[],
  feature: "documents" | "proposal" | "pricing" | "safety" | "files" | "reports",
  businessLine?: string | null
): boolean {
  if (isAdminRole(roles)) return true;
  if (feature === "pricing" || feature === "proposal") {
    return hasProjectSectionRead(permissions, roles, "proposal", businessLine);
  }
  if (feature === "files") {
    return hasProjectSectionRead(permissions, roles, "files", businessLine);
  }
  if (feature === "reports") {
    return hasProjectSectionRead(permissions, roles, "reports", businessLine);
  }
  return hasProjectSectionRead(permissions, roles, feature, businessLine);
}

export function hasProjectFeatureWrite(
  permissions: Set<string>,
  roles: string[],
  feature: "safety",
  businessLine?: string | null
): boolean {
  if (isAdminRole(roles)) return true;
  return hasLineFeature(permissions, "safety", "write", businessLine);
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
