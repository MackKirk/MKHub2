import { describe, expect, it } from 'vitest';
import { evaluatePermission } from '@/lib/permissionAccess';
import { matchRoutePermission } from '@/lib/routePermissions';
import { METALS_CUSTOMERS_READ } from '@/lib/productScope';
import {
  DOCUMENT_HUB_BUILDER_READ,
  DOCUMENT_HUB_BUILDER_WRITE,
} from '@/lib/documentHubPermissions';

describe('matchRoutePermission', () => {
  it('matches Production projects list and detail', () => {
    expect(matchRoutePermission('/projects')).toBe('business:construction:projects:read');
    expect(matchRoutePermission('/projects/abc')).toBe('business:construction:projects:read');
    expect(matchRoutePermission('/projects/new')).toBe('business:construction:projects:read');
    expect(matchRoutePermission('/opportunities/x')).toBe('business:construction:projects:read');
    expect(matchRoutePermission('/business')).toBe('business:construction:projects:read');
  });

  it('matches R&M before generic and warranty specifically', () => {
    expect(matchRoutePermission('/rm-warranty-review')).toBe('business:rm:projects:read');
    expect(matchRoutePermission('/rm-projects/xyz')).toBe('business:rm:projects:read');
    expect(matchRoutePermission('/rm-business')).toBe('business:rm:projects:read');
    expect(matchRoutePermission('/rm-opportunities')).toBe('business:rm:projects:read');
  });

  it('matches metals vs hub customers', () => {
    expect(matchRoutePermission('/metals/customers')).toBe(METALS_CUSTOMERS_READ);
    expect(matchRoutePermission('/metals/customers/1')).toBe(METALS_CUSTOMERS_READ);
    expect(matchRoutePermission('/customers')).toBe('business:customers:read');
    expect(matchRoutePermission('/customers/1/sites/2')).toBe('business:customers:read');
  });

  it('matches document builder and keeps attendance before settings', () => {
    expect(matchRoutePermission('/documents/create')).toBe('document_hub:builder:read');
    expect(matchRoutePermission('/documents/create/doc-1')).toBe('document_hub:builder:read');
    expect(matchRoutePermission('/settings/attendance')).toBe('hr:attendance:read');
    expect(matchRoutePermission('/settings')).toBe('settings:access');
  });

  it('returns null for auth-only personal routes', () => {
    expect(matchRoutePermission('/home')).toBeNull();
    expect(matchRoutePermission('/profile')).toBeNull();
    expect(matchRoutePermission('/tasks')).toBeNull();
    expect(matchRoutePermission('/personal/signatures')).toBeNull();
    expect(matchRoutePermission('/reviews/my')).toBeNull();
    expect(matchRoutePermission('/training')).toBeNull();
  });
});

describe('evaluatePermission', () => {
  it('allows admin always', () => {
    expect(evaluatePermission('business:customers:read', new Set(), true)).toBe(true);
  });

  it('allows Production via construction Projects & Opportunities key', () => {
    const perms = new Set(['business:construction:projects:read']);
    expect(evaluatePermission('business:construction:projects:read', perms, false)).toBe(true);
    expect(evaluatePermission('business:projects:read', perms, false)).toBe(true);
  });

  it('denies Production when only legacy business:projects:read without line scope', () => {
    // hasConstructionProjectsOpportunitiesPermission does not treat residual crumbs alone
    const perms = new Set(['business:construction:projects:overview:read']);
    expect(evaluatePermission('business:construction:projects:read', perms, false)).toBe(false);
  });

  it('allows R&M via rm Projects & Opportunities key', () => {
    const perms = new Set(['business:rm:projects:read']);
    expect(evaluatePermission('business:rm:projects:read', perms, false)).toBe(true);
  });

  it('allows document builder via hub builder read', () => {
    const perms = new Set([DOCUMENT_HUB_BUILDER_READ]);
    expect(evaluatePermission('document_hub:builder:read', perms, false)).toBe(true);
    expect(
      evaluatePermission('document_hub:builder:read', new Set([DOCUMENT_HUB_BUILDER_WRITE]), false),
    ).toBe(true);
    expect(evaluatePermission('document_hub:builder:read', new Set(), false)).toBe(false);
  });

  it('allows metals customers read key', () => {
    expect(
      evaluatePermission(METALS_CUSTOMERS_READ, new Set([METALS_CUSTOMERS_READ]), false),
    ).toBe(true);
    expect(evaluatePermission(METALS_CUSTOMERS_READ, new Set(['business:customers:read']), false)).toBe(
      false,
    );
  });

  it('uses canAccessSettings option for settings:access', () => {
    expect(
      evaluatePermission('settings:access', new Set(), false, { canAccessSettings: true }),
    ).toBe(true);
    expect(
      evaluatePermission('settings:access', new Set(), false, { canAccessSettings: false }),
    ).toBe(false);
  });
});
