/**
 * Hub vs Mack Kirk Metals product scope.
 * Shared categories appear in both products; Hub-only / Metals-only are filtered by active product.
 */

export type ProductId = 'hub' | 'metals';

export const PRODUCT_STORAGE_KEY = 'mk.product';

/** Categories visible in both Hub and Metals (same routes). */
export const SHARED_CATEGORY_IDS = new Set([
  'home',
  'announcements',
  'personal',
  'human-resources',
  'employee-review',
  'training',
  'document-hub',
  'documents',
  'settings',
]);

export const PRODUCT_METALS_ACCESS_PERM = 'product:metals:access';
export const METALS_CUSTOMERS_READ = 'metals:customers:read';
export const METALS_CUSTOMERS_WRITE = 'metals:customers:write';

/** Categories only in Hub product (Business is shared but remapped per product). */
export const HUB_ONLY_CATEGORY_IDS = new Set([
  'services', // Production (Sales)
  'repairs_maintenance',
  'sales', // Quotations
  'safety',
  'fleet',
  'company-assets',
  'properties',
  'print_shop',
]);

/** Hub-only path prefixes / exact paths — redirect to /home when product is metals. */
const HUB_ONLY_PATH_PREFIXES = [
  '/business',
  '/opportunities',
  '/projects',
  '/rm-business',
  '/rm-opportunities',
  '/rm-projects',
  '/rm-warranty-review',
  '/customers',
  '/quotes',
  '/safety',
  '/fleet',
  '/company-assets',
  '/properties',
  '/print-shop',
];

export function isHubOnlyPath(pathname: string): boolean {
  if (pathname.startsWith('/metals')) return false;
  return HUB_ONLY_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`),
  );
}

export function isMetalsOnlyPath(pathname: string): boolean {
  return pathname === '/metals' || pathname.startsWith('/metals/');
}

/**
 * Filter menu categories for the active product.
 * Hub: full menus (no metals-only leftovers).
 * Metals: shared + Business with Metals Customers + Suppliers/Products (same shape as Hub).
 */
export function filterMenuCategoriesForProduct<
  T extends {
    id: string;
    items: Array<{
      id: string;
      path?: string;
      requiredPermission?: string;
      children?: Array<{ id: string }>;
    }>;
  },
>(categories: T[], product: ProductId): T[] {
  if (product === 'hub') {
    return categories.filter((c) => c.id !== 'metals-business');
  }

  const out: T[] = [];
  for (const cat of categories) {
    if (SHARED_CATEGORY_IDS.has(cat.id)) {
      out.push(cat);
      continue;
    }
    if (cat.id === 'business') {
      // Same Business layout as Hub: Customers (Metals path) + Suppliers (+ Products)
      const items = cat.items
        .filter((it) => it.id === 'customers' || it.id === 'suppliers')
        .map((it) => {
          if (it.id === 'customers') {
            return {
              ...it,
              path: '/metals/customers',
              requiredPermission: METALS_CUSTOMERS_READ,
            };
          }
          return it;
        });
      if (items.length > 0) {
        out.push({ ...cat, items });
      }
    }
    // Drop dedicated metals-business category — Customers live under Business
  }
  return out;
}

export function readStoredProduct(): ProductId {
  try {
    const raw = localStorage.getItem(PRODUCT_STORAGE_KEY);
    if (raw === 'metals' || raw === 'hub') return raw;
  } catch {
    /* ignore */
  }
  return 'hub';
}

export function writeStoredProduct(product: ProductId): void {
  try {
    localStorage.setItem(PRODUCT_STORAGE_KEY, product);
  } catch {
    /* ignore */
  }
}

export function canAccessMetalsProduct(
  isAdmin: boolean,
  permissions: Set<string> | string[] | undefined | null,
): boolean {
  if (isAdmin) return true;
  const set =
    permissions instanceof Set
      ? permissions
      : new Set(Array.isArray(permissions) ? permissions : []);
  return set.has(PRODUCT_METALS_ACCESS_PERM);
}

export function productLogoSrc(product: ProductId): string {
  return product === 'metals' ? '/assets/brand/mkm-logo.png' : '/assets/brand/mk-logo.png';
}

/** Destination product name for the avatar switch control (arrows shown in UI). */
export function productSwitchLabel(product: ProductId): string {
  return product === 'hub' ? 'Mack Kirk Metals' : 'Mack Kirk Hub';
}

/** Chrome (header + flyout menu) surfaces — Metals = colder steel, Hub = current gray. Accent stays brand-red. */
export type ProductChrome = {
  header: string;
  menuPanel: string;
  menuBorder: string;
  shortcutsTray: string;
  searchField: string;
  searchToggle: string;
};

export function productChrome(product: ProductId): ProductChrome {
  if (product === 'metals') {
    return {
      header:
        'border-b border-white/10 bg-gradient-to-r from-[#2a2d31] via-[#222528] to-[#1c1e22] transition-colors duration-300',
      menuPanel: 'bg-gradient-to-b from-[#1f2226]/98 via-[#1a1c1f] to-[#121316]',
      menuBorder: 'border border-white/10',
      shortcutsTray:
        'border border-white/10 bg-gradient-to-b from-[#25282c]/90 to-[#16181b]/95',
      searchField:
        'border border-white/10 bg-[#16181b]/80 focus:border-brand-red/50 focus:bg-[#121316]/90',
      searchToggle:
        'border border-white/10 bg-[#16181b]/80 text-gray-300 hover:bg-[#121316]/90 hover:text-white',
    };
  }
  return {
    header:
      'border-b border-gray-700/40 bg-gradient-to-r from-gray-700 via-gray-700 to-gray-800 transition-colors duration-300',
    menuPanel: 'bg-gradient-to-b from-gray-800/95 via-gray-800 to-gray-900',
    menuBorder: 'border border-gray-700/50',
    shortcutsTray: 'border border-white/10 bg-gradient-to-b from-gray-800/85 to-gray-900/90',
    searchField:
      'border border-white/10 bg-gray-900/45 focus:border-brand-red/50 focus:bg-gray-900/60',
    searchToggle:
      'border border-white/10 bg-gray-900/45 text-gray-300 hover:bg-gray-900/60 hover:text-white',
  };
}
