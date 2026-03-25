import { api } from '@/lib/api';

/** Required personal fields — must stay in sync with AppShell / onboarding expectations */
const REQ_PERSONAL = [
  'gender',
  'date_of_birth',
  'marital_status',
  'nationality',
  'phone',
  'address_line1',
  'city',
  'province',
  'postal_code',
  'country',
  'sin_number',
  'work_eligibility_status',
] as const;

/**
 * Same rules as AppShell: required profile fields + at least one emergency contact when userId is set.
 */
export function computeIsProfileComplete(
  meProfile: any,
  emergencyContactsData: any[] | undefined,
  userId: string,
  emergencyContactsLoading: boolean
): boolean {
  if (!meProfile?.profile) return false;
  const p = meProfile.profile;
  const missingPersonal = REQ_PERSONAL.filter((k) => !String((p as any)[k] || '').trim());
  const hasEmergencyContact = userId
    ? emergencyContactsData !== undefined && emergencyContactsData.length > 0
    : true;
  const missingPersonalWithContact: string[] = [...missingPersonal];
  if (!hasEmergencyContact && userId && !emergencyContactsLoading) {
    missingPersonalWithContact.push('emergency_contact');
  }
  return missingPersonalWithContact.length === 0;
}

/** Matches AppShell: only exact /profile and /onboarding skip redirect to profile wizard */
export function isExemptFromProfileWizardRedirect(pathname: string): boolean {
  return pathname === '/profile' || pathname === '/onboarding';
}

/** Matches AppShell onboarding document overdue redirect exemption */
export function matchesOnboardingDocumentsRedirectExempt(pathname: string): boolean {
  const onboardingDocPaths = ['/onboarding/documents', '/profile'];
  return onboardingDocPaths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * After auth, pick the first route to open without flashing the hub.
 * Mirrors AppShell redirect rules.
 */
export async function resolvePostAuthDestination(requestedPath: string): Promise<string> {
  const [me, meProfile] = await Promise.all([
    api<any>('GET', '/auth/me'),
    api<any>('GET', '/auth/me/profile'),
  ]);
  const userId = me?.id ? String(me.id) : '';
  let emergencyContacts: any[] | undefined;
  if (userId) {
    emergencyContacts = await api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`);
  }

  const isComplete = computeIsProfileComplete(meProfile, emergencyContacts, userId, false);

  if (!isComplete) {
    if (isExemptFromProfileWizardRedirect(requestedPath)) return requestedPath;
    return '/onboarding';
  }

  let status: { has_pending: boolean; past_deadline: boolean } = {
    has_pending: false,
    past_deadline: false,
  };
  try {
    status = await api<{ has_pending: boolean; past_deadline: boolean }>(
      'GET',
      '/auth/me/onboarding/status'
    );
  } catch {
    // same fallback as AppShell query
  }

  const blocked = status.past_deadline && status.has_pending;
  if (blocked && !matchesOnboardingDocumentsRedirectExempt(requestedPath)) {
    return '/onboarding/documents';
  }

  return requestedPath;
}
