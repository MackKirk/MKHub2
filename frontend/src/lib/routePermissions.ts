import { METALS_CUSTOMERS_READ } from '@/lib/productScope';

export type RoutePermissionRule = {
  /** Path prefix or exact path (matched with trailing-slash normalized). */
  path: string;
  /** Permission key passed to evaluatePermission. */
  permission: string;
  /** When true, only exact path match (still allows trailing slash). */
  exact?: boolean;
};

/**
 * Ordered most-specific → most-generic.
 * First match wins. Routes with no match are auth-only (no area gate).
 */
export const ROUTE_PERMISSION_RULES: RoutePermissionRule[] = [
  // R&M (before generic /rm-projects)
  { path: '/rm-warranty-review', permission: 'business:rm:projects:read' },
  { path: '/rm-business', permission: 'business:rm:projects:read' },
  { path: '/rm-opportunities', permission: 'business:rm:projects:read' },
  { path: '/rm-projects', permission: 'business:rm:projects:read' },
  { path: '/rm-leak-investigations', permission: 'business:rm:projects:read' },

  // Production / construction
  { path: '/business/subcontractors', permission: 'business:customers:read' },
  { path: '/business', permission: 'business:construction:projects:read', exact: true },
  { path: '/projects', permission: 'business:construction:projects:read' },
  { path: '/opportunities', permission: 'business:construction:projects:read' },

  // Customers (metals before hub)
  { path: '/metals/customers', permission: METALS_CUSTOMERS_READ },
  { path: '/customers', permission: 'business:customers:read' },

  // Inventory
  { path: '/inventory/suppliers', permission: 'inventory:suppliers:read' },
  { path: '/inventory/products', permission: 'inventory:products:read' },
  { path: '/inventory', permission: 'inventory:suppliers:read' },

  // Print shop
  { path: '/print-shop', permission: 'print_shop:read' },

  // Quotes / proposals
  { path: '/quotes', permission: 'sales:quotations:read' },
  { path: '/proposals', permission: 'sales:quotations:read' },

  // Safety
  { path: '/safety', permission: 'business:projects:safety:read' },

  // Fleet
  { path: '/fleet/assets', permission: 'fleet:vehicles:read' },
  { path: '/fleet/vehicles', permission: 'fleet:vehicles:read' },
  { path: '/fleet/heavy-machinery', permission: 'fleet:vehicles:read' },
  { path: '/fleet/other-assets', permission: 'fleet:vehicles:read' },
  { path: '/fleet/work-orders', permission: 'fleet:work_orders:read' },
  { path: '/fleet/inspections', permission: 'fleet:inspections:read' },
  { path: '/fleet/calendar', permission: 'fleet:access' },
  { path: '/fleet/inspection-schedules', permission: 'fleet:access' },
  { path: '/fleet', permission: 'fleet:access' },

  // Properties
  { path: '/properties/approvals', permission: 'properties:permits:read' },
  { path: '/properties', permission: 'properties:access' },

  // Company assets
  { path: '/company-assets/equipment', permission: 'fleet:equipment:read' },
  { path: '/company-assets/work-orders', permission: 'fleet:equipment:work_orders:read' },
  { path: '/company-assets/credit-cards', permission: 'company_cards:read' },
  { path: '/company-assets/fuel-cards', permission: 'fuel_cards:read' },

  // Documents hub (specific before generic)
  { path: '/documents/create', permission: 'document_hub:builder:read' },
  { path: '/documents/signature-requests', permission: 'document_hub:signature_requests:read' },
  { path: '/documents/signature-editor', permission: 'document_hub:signature_editor:read' },
  { path: '/documents/templates', permission: 'document_hub:templates:read' },
  { path: '/documents/form-templates', permission: 'business:projects:safety:read' },
  { path: '/documents/form-custom-lists', permission: 'business:projects:safety:read' },

  // Company files
  { path: '/company-files', permission: 'documents:read' },

  // Training (admin surfaces; personal /training stays ungated)
  { path: '/training/dashboard', permission: 'training:dashboard:access' },
  { path: '/training/admin', permission: 'training:admin:access' },
  { path: '/training/hr-records', permission: 'training:dashboard:access' },

  // Employee review admin
  { path: '/reviews/cycles', permission: 'hr:reviews:admin' },
  { path: '/reviews/director-meetings', permission: 'hr:reviews:admin' },
  { path: '/reviews/form-templates', permission: 'hr:reviews:admin' },
  { path: '/reviews/admin', permission: 'hr:reviews:admin' },
  { path: '/reviews/compare', permission: 'hr:reviews:admin' },

  // HR
  { path: '/users', permission: 'hr:users:read' },
  { path: '/human-resources/overview', permission: 'hr:pending:read' },
  { path: '/human-resources/requests', permission: 'hr:users:read' },
  { path: '/human-resources/offboarding', permission: 'hr:offboarding:read' },
  { path: '/human-resources/vericlock-import', permission: 'hr:attendance:write' },
  { path: '/onboarding/admin', permission: 'hr:onboarding:read' },
  { path: '/settings/attendance', permission: 'hr:attendance:read' },
  { path: '/community', permission: 'hr:community:read' },

  // Settings (after /settings/attendance)
  { path: '/settings', permission: 'settings:access' },
];

function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  const trimmed = pathname.split('?')[0].split('#')[0] || '/';
  if (trimmed.length > 1 && trimmed.endsWith('/')) return trimmed.slice(0, -1);
  return trimmed || '/';
}

/**
 * Resolve the area permission for a pathname, or null if auth-only (no area gate).
 */
export function matchRoutePermission(pathname: string): string | null {
  const path = normalizePathname(pathname);
  for (const rule of ROUTE_PERMISSION_RULES) {
    const base = rule.path.endsWith('/') && rule.path.length > 1 ? rule.path.slice(0, -1) : rule.path;
    if (rule.exact) {
      if (path === base) return rule.permission;
      continue;
    }
    if (path === base || path.startsWith(`${base}/`)) {
      return rule.permission;
    }
  }
  return null;
}
