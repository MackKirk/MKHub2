const BUSINESS_LINE_CONSTRUCTION = "construction";
const BUSINESS_LINE_REPAIRS = "repairs_maintenance";

export function isAdminRole(roles: readonly string[] | null | undefined): boolean {
  return (roles ?? []).some((r) => String(r).toLowerCase() === "admin");
}

function canAccessProjectLineMenu(
  permissions: Set<string>,
  line: "construction" | "repairs",
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (line === "construction") {
    return (
      permissions.has("business:construction:projects:read") ||
      permissions.has("business:construction:projects:write") ||
      permissions.has("business:projects:read") ||
      permissions.has("business:projects:write")
    );
  }
  return (
    permissions.has("business:rm:projects:read") ||
    permissions.has("business:rm:projects:write")
  );
}

export function hasPermission(
  permissions: Set<string>,
  roles: string[],
  requiredPermission?: string
): boolean {
  if (!requiredPermission) return true;
  const isAdmin = isAdminRole(roles);
  if (isAdmin) return true;

  const has = permissions.has(requiredPermission);
  const legacyBizRead = permissions.has("business:projects:read");
  const legacyBizWrite = permissions.has("business:projects:write");

  if (requiredPermission === "business:construction:projects:read") {
    return canAccessProjectLineMenu(permissions, "construction", isAdmin);
  }
  if (requiredPermission === "business:rm:projects:read") {
    return canAccessProjectLineMenu(permissions, "repairs", isAdmin);
  }
  if (requiredPermission === "business:projects:read") {
    return (
      has ||
      legacyBizRead ||
      canAccessProjectLineMenu(permissions, "construction", isAdmin)
    );
  }
  if (
    requiredPermission === "business:construction:projects:write" ||
    requiredPermission === "business:projects:write"
  ) {
    return (
      has ||
      legacyBizWrite ||
      permissions.has("business:construction:projects:write")
    );
  }
  if (requiredPermission === "business:rm:projects:write") {
    return has || legacyBizWrite || permissions.has("business:rm:projects:write");
  }
  if (requiredPermission.startsWith("hr:")) {
    const legacyPerm = requiredPermission.replace("hr:", "");
    return has || permissions.has(legacyPerm);
  }
  if (requiredPermission === "business:customers:read") {
    return has || permissions.has("clients:read");
  }
  if (requiredPermission === "inventory:suppliers:read") {
    return has || permissions.has("inventory:read");
  }
  if (requiredPermission === "inventory:products:read") {
    return has || permissions.has("inventory:read");
  }
  if (requiredPermission === "business:projects:safety:read") {
    return (
      has ||
      permissions.has("business:projects:safety:write") ||
      permissions.has("business:construction:projects:safety:read") ||
      permissions.has("business:rm:projects:safety:read")
    );
  }
  if (requiredPermission === "fleet:access") {
    return (
      has ||
      permissions.has("fleet:read") ||
      permissions.has("fleet:vehicles:read") ||
      permissions.has("fleet:vehicles:write")
    );
  }

  return has;
}

export { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS };
