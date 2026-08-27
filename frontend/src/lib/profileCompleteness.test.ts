import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
}));

import { api } from '@/lib/api';
import {
  computeIsProfileComplete,
  computePersonalFieldsComplete,
  isHubAccessBlockedFromStatus,
  resolvePostAuthDestination,
} from '@/lib/profileCompleteness';

const completeProfile = {
  profile: {
    gender: 'Male',
    date_of_birth: '2000-01-01',
    marital_status: 'Single',
    nationality: 'Canadian',
    phone: '555',
    address_line1: '1 Main',
    city: 'Toronto',
    province: 'ON',
    postal_code: 'A1A1A1',
    country: 'Canada',
    sin_number: '123',
    work_eligibility_status: 'Citizen',
  },
};

describe('computeIsProfileComplete', () => {
  it('does not treat unknown contacts as missing when contactsKnown is false', () => {
    expect(
      computeIsProfileComplete(completeProfile, undefined, 'u1', false, { contactsKnown: false }),
    ).toBe(false);
  });

  it('requires at least one contact when contacts list is known empty', () => {
    expect(
      computeIsProfileComplete(completeProfile, [], 'u1', false, { contactsKnown: true }),
    ).toBe(false);
  });

  it('is complete when personal fields and contacts are present', () => {
    expect(
      computeIsProfileComplete(completeProfile, [{ id: 'c1' }], 'u1', false, {
        contactsKnown: true,
      }),
    ).toBe(true);
  });

  it('computePersonalFieldsComplete ignores contacts', () => {
    expect(computePersonalFieldsComplete(completeProfile)).toBe(true);
    expect(computePersonalFieldsComplete({ profile: { gender: 'Male' } })).toBe(false);
  });
});

describe('isHubAccessBlockedFromStatus', () => {
  it('detects blocked flag', () => {
    expect(isHubAccessBlockedFromStatus({ blocked: true, status_available: true })).toBe(true);
    expect(isHubAccessBlockedFromStatus({ blocked: true, status_available: false })).toBe(false);
  });

  it('detects onboarding overdue pending', () => {
    expect(isHubAccessBlockedFromStatus({ past_deadline: true, has_pending: true })).toBe(true);
  });
});

describe('resolvePostAuthDestination', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('sends blocked users to signatures even if contacts fetch would fail', async () => {
    vi.mocked(api).mockImplementation(async (method: string, path: string) => {
      if (path === '/auth/me') return { id: 'user-1' };
      if (path === '/auth/me/profile') return completeProfile;
      if (path === '/auth/me/signature-status') {
        return { blocked: true, status_available: true, has_pending: true };
      }
      if (path.includes('emergency-contacts')) {
        throw new Error('Hub access restricted');
      }
      throw new Error(`unexpected ${method} ${path}`);
    });

    await expect(resolvePostAuthDestination('/home')).resolves.toBe('/personal/signatures');
  });

  it('sends incomplete profile to onboarding when not blocked', async () => {
    vi.mocked(api).mockImplementation(async (_method: string, path: string) => {
      if (path === '/auth/me') return { id: 'user-1' };
      if (path === '/auth/me/profile') return { profile: { gender: 'Male' } };
      if (path === '/auth/me/signature-status') {
        return { blocked: false, status_available: true, has_pending: false };
      }
      if (path.includes('emergency-contacts')) return [];
      throw new Error(`unexpected ${path}`);
    });

    await expect(resolvePostAuthDestination('/home')).resolves.toBe('/onboarding');
  });

  it('allows requested path when complete and not blocked', async () => {
    vi.mocked(api).mockImplementation(async (_method: string, path: string) => {
      if (path === '/auth/me') return { id: 'user-1' };
      if (path === '/auth/me/profile') return completeProfile;
      if (path === '/auth/me/signature-status') {
        return { blocked: false, status_available: true, has_pending: false };
      }
      if (path.includes('emergency-contacts')) return [{ id: 'c1' }];
      throw new Error(`unexpected ${path}`);
    });

    await expect(resolvePostAuthDestination('/home')).resolves.toBe('/home');
  });
});
