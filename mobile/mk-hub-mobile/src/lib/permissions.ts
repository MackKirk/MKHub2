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
    return has || permissions.has("business:customers:write") || permissions.has("clients:read");
  }
  if (requiredPermission === "business:customers:write") {
    return has || permissions.has("clients:write");
  }
  if (requiredPermission.startsWith("business:customers:")) {
    const parts = requiredPermission.split(":");
    const tab = parts[2];
    const access = parts[3];
    if (access === "read") {
      return (
        has ||
        permissions.has(`business:customers:${tab}:write`) ||
        permissions.has("business:customers:read") ||
        permissions.has("business:customers:write") ||
        permissions.has("clients:read")
      );
    }
    if (access === "write") {
      return (
        has ||
        permissions.has("business:customers:write") ||
        permissions.has("clients:write")
      );
    }
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
      permissions.has("fleet:dashboard:read") ||
      permissions.has("fleet:vehicles:read") ||
      permissions.has("fleet:vehicles:write") ||
      permissions.has("fleet:work_orders:read") ||
      permissions.has("fleet:work_orders:write") ||
      permissions.has("fleet:inspections:read") ||
      permissions.has("fleet:inspections:write") ||
      permissions.has("work_orders:read") ||
      permissions.has("inspections:read")
    );
  }
  if (requiredPermission === "fleet:dashboard:read") {
    return has || permissions.has("fleet:read");
  }
  if (requiredPermission === "fleet:vehicles:read") {
    return has || permissions.has("fleet:vehicles:write") || permissions.has("fleet:read");
  }
  if (requiredPermission === "fleet:equipment:read") {
    return (
      has ||
      permissions.has("equipment:read") ||
      permissions.has("fleet:equipment:write") ||
      permissions.has("equipment:write")
    );
  }
  if (requiredPermission === "equipment:read") {
    return (
      has ||
      permissions.has("fleet:equipment:read") ||
      permissions.has("fleet:equipment:write") ||
      permissions.has("equipment:write")
    );
  }
  if (requiredPermission === "company_cards:read") {
    return has || permissions.has("company_cards:write");
  }
  if (requiredPermission === "company_cards:write") {
    return has;
  }
  if (requiredPermission === "company_assets:access") {
    return (
      hasPermission(permissions, roles, "equipment:read") ||
      hasPermission(permissions, roles, "company_cards:read")
    );
  }
  if (requiredPermission === "fleet:write") {
    return (
      has ||
      permissions.has("fleet:vehicles:write") ||
      permissions.has("fleet:equipment:write")
    );
  }
  if (requiredPermission === "equipment:write") {
    return has || permissions.has("fleet:equipment:write");
  }
  if (requiredPermission === "work_orders:read") {
    return (
      has ||
      permissions.has("work_orders:write") ||
      permissions.has("fleet:work_orders:read") ||
      permissions.has("fleet:work_orders:write")
    );
  }
  if (requiredPermission === "work_orders:write") {
    return has || permissions.has("fleet:work_orders:write");
  }
  if (requiredPermission === "inspections:read") {
    return (
      has ||
      permissions.has("inspections:write") ||
      permissions.has("fleet:inspections:read") ||
      permissions.has("fleet:inspections:write")
    );
  }
  if (requiredPermission === "inspections:write") {
    return has || permissions.has("fleet:inspections:write");
  }
  if (requiredPermission === "fleet:shop:access") {
    return (
      hasPermission(permissions, roles, "work_orders:read") ||
      hasPermission(permissions, roles, "inspections:read") ||
      hasPermission(permissions, roles, "fleet:vehicles:read")
    );
  }
  if (requiredPermission === "hr:timesheet:unrestricted_clock") {
    return has || permissions.has("timesheet:unrestricted_clock");
  }
  if (requiredPermission === "timesheet:unrestricted_clock") {
    return has || permissions.has("hr:timesheet:unrestricted_clock");
  }

  return has;
}

/** Strict customer tab visibility — own tab view/write only (matches web canViewCustomerTab). */
export function canViewCustomerTab(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  tab: string
): boolean {
  if (isAdminRole(roles)) return true;
  return (
    permissions.has(`business:customers:${tab}:read`) ||
    permissions.has(`business:customers:${tab}:write`)
  );
}

/** Strict customer tab edit — own tab write only (matches web canEditCustomerTab). */
export function canEditCustomerTab(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  tab: string
): boolean {
  if (isAdminRole(roles)) return true;
  return permissions.has(`business:customers:${tab}:write`);
}

/** Map mobile fleet asset tab keys → permission segment (web uses work_orders / history). */
function fleetAssetPermTab(tab: string): string {
  if (tab === "work-orders") return "work_orders";
  if (tab === "logs") return "history";
  return tab;
}

/** Strict fleet asset tab visibility (matches web canViewFleetAssetTab). */
export function canViewFleetAssetTab(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  tab: string
): boolean {
  if (isAdminRole(roles)) return true;
  const permTab = fleetAssetPermTab(tab);
  return (
    permissions.has(`fleet:vehicles:${permTab}:read`) ||
    permissions.has(`fleet:vehicles:${permTab}:write`)
  );
}

/** Strict fleet work-order tab visibility (matches web canViewFleetWorkOrderTab). */
export function canViewFleetWorkOrderTab(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  tab: string
): boolean {
  if (isAdminRole(roles)) return true;
  return (
    permissions.has(`fleet:work_orders:${tab}:read`) ||
    permissions.has(`fleet:work_orders:${tab}:write`)
  );
}

export type HrUserTabKey = "personal" | "job" | "permissions";

/** Matches web UserInfo: admin, users:read (legacy), or specific hr:users:view:* */
export function canViewHrUserTab(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined,
  tab: HrUserTabKey
): boolean {
  if (isAdminRole(roles)) return true;
  if (permissions.has("users:read")) return true;
  if (tab === "personal") {
    return (
      permissions.has("hr:users:view:general") ||
      permissions.has("hr:users:edit:general")
    );
  }
  if (tab === "job") {
    return (
      permissions.has("hr:users:view:general") ||
      permissions.has("hr:users:view:job") ||
      permissions.has("hr:users:edit:job") ||
      permissions.has("hr:users:view:job:compensation")
    );
  }
  return (
    permissions.has("hr:users:view:permissions") ||
    permissions.has("hr:users:edit:permissions")
  );
}

export function canOpenHrUserProfile(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined
): boolean {
  if (isAdminRole(roles)) return true;
  if (permissions.has("users:read")) return true;
  return (
    canViewHrUserTab(permissions, roles, "personal") ||
    canViewHrUserTab(permissions, roles, "job") ||
    canViewHrUserTab(permissions, roles, "permissions")
  );
}

export function canEditHrUserPermissions(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined
): boolean {
  if (isAdminRole(roles)) return true;
  return (
    permissions.has("hr:users:edit:permissions") ||
    permissions.has("users:write")
  );
}

export function canManageHrUserRoles(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined
): boolean {
  if (isAdminRole(roles)) return true;
  return permissions.has("hr:users:write") || permissions.has("users:write");
}

export function canViewHrJobCompensation(
  permissions: Set<string>,
  roles: readonly string[] | null | undefined
): boolean {
  if (isAdminRole(roles)) return true;
  return permissions.has("hr:users:view:job:compensation");
}

export { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS };
