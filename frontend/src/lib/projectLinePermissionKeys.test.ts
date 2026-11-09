import { describe, expect, it } from 'vitest';
import {
  clearLegacyProjectMainPermissions,
  clearLegacyProjectSubPermissions,
  hasProjectLineWritePermission,
} from '@/lib/projectLinePermissionKeys';
import { BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE } from '@/lib/businessLine';

describe('hasProjectLineWritePermission', () => {
  it('allows admin', () => {
    expect(hasProjectLineWritePermission(new Set(), BUSINESS_LINE_REPAIRS_MAINTENANCE, true)).toBe(
      true,
    );
  });

  it('allows only the matching line-scoped write key', () => {
    const rm = new Set(['business:rm:projects:write']);
    expect(hasProjectLineWritePermission(rm, BUSINESS_LINE_REPAIRS_MAINTENANCE, false)).toBe(true);
    expect(hasProjectLineWritePermission(rm, BUSINESS_LINE_CONSTRUCTION, false)).toBe(false);

    const construction = new Set(['business:construction:projects:write']);
    expect(hasProjectLineWritePermission(construction, BUSINESS_LINE_CONSTRUCTION, false)).toBe(
      true,
    );
    expect(
      hasProjectLineWritePermission(construction, BUSINESS_LINE_REPAIRS_MAINTENANCE, false),
    ).toBe(false);
  });

  it('does not treat retired legacy business:projects:write as edit access', () => {
    const legacy = new Set(['business:projects:write']);
    expect(hasProjectLineWritePermission(legacy, BUSINESS_LINE_REPAIRS_MAINTENANCE, false)).toBe(
      false,
    );
    expect(hasProjectLineWritePermission(legacy, BUSINESS_LINE_CONSTRUCTION, false)).toBe(false);
  });
});

describe('clearLegacyProjectMainPermissions', () => {
  it('forces legacy main keys off and is included in sub clear', () => {
    const perms: Record<string, boolean | string[]> = {
      'business:projects:read': true,
      'business:projects:write': true,
      'business:projects:files:write': true,
    };
    clearLegacyProjectMainPermissions(perms);
    expect(perms['business:projects:read']).toBe(false);
    expect(perms['business:projects:write']).toBe(false);
    expect(perms['business:projects:files:write']).toBe(true);

    clearLegacyProjectSubPermissions(perms);
    expect(perms['business:projects:files:write']).toBe(false);
  });
});
