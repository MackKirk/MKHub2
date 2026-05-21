/** Customer list + tab permissions (mirrors backend `has_customer_tab_permission`). */

export const CUSTOMER_MAIN_READ = 'business:customers:read';
export const CUSTOMER_MAIN_WRITE = 'business:customers:write';

export const CUSTOMER_TABS = [
  'overview',
  'general',
  'contacts',
  'files',
  'sites',
  'opportunities',
  'projects',
] as const;

export type CustomerTab = (typeof CUSTOMER_TABS)[number];

function has(permissions: Set<string>, key: string): boolean {
  return permissions.has(key);
}

function hasAnyProjectLineRead(permissions: Set<string>): boolean {
  return (
    has(permissions, 'business:projects:read') ||
    has(permissions, 'business:construction:projects:read') ||
    has(permissions, 'business:rm:projects:read') ||
    has(permissions, 'business:projects:write') ||
    has(permissions, 'business:construction:projects:write') ||
    has(permissions, 'business:rm:projects:write')
  );
}

/** Access to /customers list and create/delete customer records. */
export function canAccessCustomerList(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE);
}

/** Open a customer detail page (list permission or any tab). */
export function canAccessCustomerDetail(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  if (canAccessCustomerList(isAdmin, permissions)) return true;
  return CUSTOMER_TABS.some((tab) => canReadCustomerTab(isAdmin, permissions, tab));
}

/** Strict tab visibility: only the tab's own view/write permission (no legacy fallbacks). */
export function canViewCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  const readKey = `business:customers:${tab}:read`;
  const writeKey = `business:customers:${tab}:write`;
  return has(permissions, readKey) || has(permissions, writeKey);
}

export function canReadCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  if (canViewCustomerTab(isAdmin, permissions, tab)) return true;

  if (tab === 'general' || tab === 'contacts') {
    if (has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'files') {
    if (has(permissions, 'business:projects:files:read') || has(permissions, 'business:projects:files:write')) {
      return true;
    }
    if (has(permissions, CUSTOMER_MAIN_READ) || has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'overview' || tab === 'sites' || tab === 'opportunities' || tab === 'projects') {
    if (hasAnyProjectLineRead(permissions)) return true;
  }
  return false;
}

/** Create/delete customer records and other list-level actions (`Edit Customers`). */
export function canEditCustomerRecord(isAdmin: boolean, permissions: Set<string>): boolean {
  if (isAdmin) return true;
  return has(permissions, CUSTOMER_MAIN_WRITE);
}

/** Strict tab edit: only the tab's own write permission (no legacy fallbacks). */
export function canEditCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  return has(permissions, `business:customers:${tab}:write`);
}

export function canWriteCustomerTab(
  isAdmin: boolean,
  permissions: Set<string>,
  tab: CustomerTab
): boolean {
  if (isAdmin) return true;
  if (canEditCustomerTab(isAdmin, permissions, tab)) return true;

  if (tab === 'general' || tab === 'contacts' || tab === 'sites') {
    if (has(permissions, CUSTOMER_MAIN_WRITE)) return true;
  }
  if (tab === 'files' && has(permissions, 'business:projects:files:write')) return true;
  if (
    (tab === 'opportunities' || tab === 'projects') &&
    (has(permissions, 'business:projects:write') ||
      has(permissions, 'business:construction:projects:write') ||
      has(permissions, 'business:rm:projects:write'))
  ) {
    return true;
  }
  return false;
}

export function isCustomerTabReadKey(key: string): boolean {
  return CUSTOMER_TABS.some((t) => key === `business:customers:${t}:read`);
}

export function isCustomerTabWriteKey(key: string): boolean {
  return CUSTOMER_TABS.some((t) => key === `business:customers:${t}:write`);
}

export function splitCustomerAreaPermissions(areaPerms: { key: string }[]) {
  const mainViewPerm = areaPerms.find((p) => p.key === CUSTOMER_MAIN_READ);
  const mainEditPerm = areaPerms.find((p) => p.key === CUSTOMER_MAIN_WRITE);
  const subViewPerms = areaPerms.filter(
    (p) => p.key.includes(':read') && p.key !== CUSTOMER_MAIN_READ && isCustomerTabReadKey(p.key)
  );
  const subEditPerms = areaPerms.filter(
    (p) => p.key.includes(':write') && p.key !== CUSTOMER_MAIN_WRITE && isCustomerTabWriteKey(p.key)
  );
  return { mainViewPerm, mainEditPerm, subViewPerms, subEditPerms };
}
