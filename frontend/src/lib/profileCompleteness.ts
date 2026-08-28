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

export type ProfileCompletenessOptions = {
  /** True only when the emergency-contacts list query succeeded (not loading / not error). */
  contactsKnown?: boolean;
};

/**
 * Same rules as AppShell: required profile fields + at least one emergency contact when known.
 * Do not treat unknown/errored contacts as missing — that caused false onboarding redirects.
 */
export function computeIsProfileComplete(
  meProfile: any,
  emergencyContactsData: any[] | undefined,
  userId: string,
  emergencyContactsLoading: boolean,
  options?: ProfileCompletenessOptions,
): boolean {
  if (!meProfile?.profile) return false;
  const p = meProfile.profile;
  const missingPersonal = REQ_PERSONAL.filter((k) => !String((p as any)[k] || '').trim());
  if (missingPersonal.length > 0) return false;

  if (!userId) return true;
  if (emergencyContactsLoading) return false;

  const contactsKnown =
    options?.contactsKnown ??
    (Array.isArray(emergencyContactsData) && emergencyContactsData !== undefined);

  // Contacts not loaded successfully yet — do not claim incomplete (or complete) via contacts.
  if (!contactsKnown) return false;

  return (emergencyContactsData?.length ?? 0) > 0;
}

/** True when personal profile fields alone are filled (ignores emergency contacts). */
export function computePersonalFieldsComplete(meProfile: any): boolean {
  if (!meProfile?.profile) return false;
  const p = meProfile.profile;
  return REQ_PERSONAL.every((k) => String((p as any)[k] || '').trim());
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

/** Paths reachable while Hub access is restricted (signatures overdue). */
export function matchesSignatureRestrictedExempt(pathname: string): boolean {
  const paths = ['/personal/signatures', '/profile', '/onboarding/documents'];
  return paths.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export type SignatureStatusLike = {
  has_pending?: boolean;
  past_deadline?: boolean;
  blocked?: boolean;
  status_available?: boolean;
};

/** Hub lock from signature / onboarding overdue compliance. */
export function isHubAccessBlockedFromStatus(status: SignatureStatusLike | null | undefined): boolean {
  if (!status) return false;
  if (status.blocked && status.status_available !== false) return true;
  if (status.past_deadline && status.has_pending) return true;
  return false;
}

/**
 * After auth, pick the first route to open without flashing the hub.
 * Priority: signature block → /personal/signatures; else incomplete profile → /onboarding; else requested.
 */
export async function resolvePostAuthDestination(requestedPath: string): Promise<string> {
  const [me, meProfile] = await Promise.all([
    api<any>('GET', '/auth/me'),
    api<any>('GET', '/auth/me/profile'),
  ]);
  const userId = me?.id ? String(me.id) : '';

  let status: SignatureStatusLike = {
    has_pending: false,
    past_deadline: false,
    blocked: false,
    status_available: true,
  };
  try {
    status = await api<SignatureStatusLike>('GET', '/auth/me/signature-status');
  } catch {
    try {
      status = await api<SignatureStatusLike>('GET', '/auth/me/onboarding/status');
    } catch {
      // same fallback as AppShell query
    }
  }

  if (isHubAccessBlockedFromStatus(status) && !matchesSignatureRestrictedExempt(requestedPath)) {
    return '/personal/signatures';
  }

  let emergencyContacts: any[] | undefined;
  let contactsKnown = false;
  if (userId) {
    try {
      emergencyContacts = await api<any[]>(
        'GET',
        `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`,
      );
      contactsKnown = true;
    } catch {
      contactsKnown = false;
      emergencyContacts = undefined;
    }
  }

  const isComplete = computeIsProfileComplete(meProfile, emergencyContacts, userId, false, {
    contactsKnown: !userId || contactsKnown,
  });

  // Only send to onboarding when we know fields/contacts are actually missing.
  if (!isComplete) {
    const personalOk = computePersonalFieldsComplete(meProfile);
    const contactsMissing = contactsKnown && (emergencyContacts?.length ?? 0) === 0;
    const personalMissing = !personalOk;
    if (personalMissing || contactsMissing) {
      if (isExemptFromProfileWizardRedirect(requestedPath)) return requestedPath;
      return '/onboarding';
    }
    // Contacts unknown / still incomplete for other reasons — avoid false onboarding trap.
  }

  return requestedPath;
}
