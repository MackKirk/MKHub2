import { PropsWithChildren, useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  computeIsProfileComplete,
  isExemptFromProfileWizardRedirect,
  matchesOnboardingDocumentsRedirectExempt,
} from '@/lib/profileCompleteness';
import ChangelogNewsPanel from '@/components/ChangelogNewsPanel';
import NotificationBell from '@/components/NotificationBell';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { useConfirm } from '@/components/ConfirmProvider';
import FixedBugReportButton from '@/components/FixedBugReportButton';
import HubTodayCalendar from '@/components/HubTodayCalendar';
import InstallPrompt from '@/components/InstallPrompt';
import GlobalSearch, { GlobalSearchSection, GlobalSearchItem } from '@/components/GlobalSearch';
import HubChatLauncher from '@/components/HubChatLauncher';
import { canAccessProjectLineMenu, isAdminRole } from '@/lib/projectLinePermissionKeys';
import { usePageViewTracker } from '@/lib/usePageViewTracker';
import { AppUserAvatar, uiCx, uiDropdown } from '@/components/ui';

type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  category?: string;
  requiredPermission?: string;  // Permission required to see this item
  children?: MenuItem[];
};

type MenuCategory = {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: MenuItem[];
};

/** Personal → My Training: hub + course pages only (not /training/dashboard or /training/admin). */
function pathnameIsLearnerTraining(pathname: string): boolean {
  if (pathname === '/training') return true;
  if (!pathname.startsWith('/training/')) return false;
  const parts = pathname.split('/').filter(Boolean);
  const seg = parts[1];
  if (seg === 'dashboard' || seg === 'admin' || seg === 'hr-records') return false;
  return true;
}

function menuChildMatchesLocation(child: MenuItem, pathname: string, _search: string): boolean {
  if (child.id === 'fleet-assets') {
    return ['/fleet/assets', '/fleet/vehicles', '/fleet/heavy-machinery', '/fleet/other-assets'].some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
  }
  if (child.id === 'employee-review-cycles') {
    return (
      pathname === '/reviews/compare' ||
      pathname.startsWith('/reviews/compare/') ||
      pathname === child.path ||
      pathname.startsWith(child.path + '/')
    );
  }
  return pathname === child.path || pathname.startsWith(child.path + '/');
}

const IconHome = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const IconUser = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const IconOverview = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const IconCalendar = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const IconClock = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconClipboard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const IconClipboardCheck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const IconRequest = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconPrinter = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

const IconUsers = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const IconBox = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const IconFolder = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const IconHardHat = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3c-3 0-5.5 2.2-6 5h12c-.5-2.8-3-5-6-5zM5 10v1a7 7 0 0014 0v-1M8 21h8v-2a4 4 0 00-4-4v0a4 4 0 00-4 4v2z"
    />
  </svg>
);

const IconTruck = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconDocument = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconAcademic = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
);

const IconLogs = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h11" />
  </svg>
);

const IconSettings = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconBriefcase = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const IconShoppingCart = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
  </svg>
);

const IconWrench = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconCreditCard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
    />
  </svg>
);

const IconUsersGroup = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconStar = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const IconHumanResources = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const IconServices = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const IconBusiness = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const IconSales = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const IconDashboard = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const IconOpportunities = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const IconProjects = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const IconQuotations = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

export default function AppShell({ children }: PropsWithChildren){
  const location = useLocation();
  usePageViewTracker();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data:meProfile, isLoading: meProfileLoading } = useQuery({ queryKey:['me-profile'], queryFn: ()=>api<any>('GET','/auth/me/profile') });
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const userId = me?.id ? String(me.id) : '';
  
  // Check emergency contacts
  const { data: emergencyContactsData, isLoading: emergencyContactsLoading } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
    enabled: !!userId
  });

  const isProfileComplete = useMemo(
    () =>
      computeIsProfileComplete(meProfile, emergencyContactsData, userId, emergencyContactsLoading),
    [meProfile, emergencyContactsData, userId, emergencyContactsLoading]
  );

  const { data: onboardingStatus, isLoading: onboardingStatusLoading } = useQuery({
    queryKey: ['me-onboarding-status'],
    queryFn: async () => {
      try {
        return await api<{
          has_pending: boolean;
          past_deadline: boolean;
          pending_count: number;
          earliest_deadline: string | null;
        }>('GET', '/auth/me/onboarding/status');
      } catch {
        return {
          has_pending: false,
          past_deadline: false,
          pending_count: 0,
          earliest_deadline: null,
        };
      }
    },
    enabled: !!userId && isProfileComplete,
    retry: false,
  });

  const onboardingBlocked =
    isProfileComplete &&
    onboardingStatus?.past_deadline &&
    onboardingStatus?.has_pending;

  // Redirect when onboarding documents overdue
  useEffect(() => {
    if (!isProfileComplete || !onboardingBlocked) return;
    const path = location.pathname;
    if (matchesOnboardingDocumentsRedirectExempt(path)) return;
    navigate('/onboarding/documents', { replace: true });
  }, [isProfileComplete, onboardingBlocked, location.pathname, navigate]);
  
  // Redirect to onboarding wizard if profile incomplete (same exempt paths as before)
  useEffect(() => {
    if (meLoading || meProfileLoading || (userId && emergencyContactsLoading)) return;
    if (
      meProfile &&
      !isProfileComplete &&
      !isExemptFromProfileWizardRedirect(location.pathname)
    ) {
      navigate('/onboarding', { replace: true });
    }
  }, [meProfile, isProfileComplete, location.pathname, navigate, meLoading, meProfileLoading, emergencyContactsLoading, userId]);
  
  const displayName = (meProfile?.profile?.preferred_name) || ([meProfile?.profile?.first_name, meProfile?.profile?.last_name].filter(Boolean).join(' ') || meProfile?.user?.username || 'User');
  const userMenuUser = useMemo(
    () => ({
      username: meProfile?.user?.username,
      first_name: meProfile?.profile?.first_name,
      last_name: meProfile?.profile?.last_name,
      preferred_name: meProfile?.profile?.preferred_name,
      profile_photo_file_id: meProfile?.profile?.profile_photo_file_id,
    }),
    [meProfile],
  );
  const [open, setOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [activeNavCategoryId, setActiveNavCategoryId] = useState<string | null>(null);
  const [navFit, setNavFit] = useState({ scale: 1, width: 0, height: 0 });
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRootRef = useRef<HTMLDivElement>(null);
  const navPanelInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      if (navRootRef.current && !navRootRef.current.contains(e.target as Node)) {
        setNavOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [navOpen]);

  useEffect(() => {
    const onSearchOpen = () => setNavOpen(false);
    window.addEventListener('mkhub-global-search-open', onSearchOpen);
    return () => window.removeEventListener('mkhub-global-search-open', onSearchOpen);
  }, []);

  const { hasUnsavedChanges } = useUnsavedChanges();
  const confirm = useConfirm();

  const isAdmin = isAdminRole(me?.roles);
  const permissionsSet = useMemo(() => new Set((me?.permissions || []).map((p: any) => String(p))), [me]);

  const hasPermission = (requiredPermission?: string) => {
    if (!requiredPermission) return true;
    if (isAdmin) return true;
    const has = permissionsSet.has(requiredPermission);
    const legacyBizRead = permissionsSet.has('business:projects:read');
    const legacyBizWrite = permissionsSet.has('business:projects:write');
    if (requiredPermission === 'business:construction:projects:read') {
      return canAccessProjectLineMenu(permissionsSet, 'construction', isAdmin);
    }
    if (requiredPermission === 'business:rm:projects:read') {
      return canAccessProjectLineMenu(permissionsSet, 'repairs', isAdmin);
    }
    if (requiredPermission === 'business:projects:read') {
      return has || legacyBizRead || canAccessProjectLineMenu(permissionsSet, 'construction', isAdmin);
    }
    if (requiredPermission === 'business:construction:projects:write' || requiredPermission === 'business:projects:write') {
      return has || legacyBizWrite || permissionsSet.has('business:construction:projects:write');
    }
    if (requiredPermission === 'business:rm:projects:write') {
      return has || legacyBizWrite || permissionsSet.has('business:rm:projects:write');
    }
    if (requiredPermission.startsWith('hr:')) {
      const legacyPerm = requiredPermission.replace('hr:', '');
      return has || permissionsSet.has(legacyPerm);
    }
    // Fleet & Equipment: accept legacy/alternate permission keys so tabs show correctly
    if (requiredPermission === 'fleet:access') {
      return (
        has ||
        permissionsSet.has('fleet:read') ||
        permissionsSet.has('fleet:vehicles:read') ||
        permissionsSet.has('fleet:vehicles:write') ||
        permissionsSet.has('fleet:equipment:read') ||
        permissionsSet.has('fleet:equipment:write')
      );
    }
    if (requiredPermission === 'fleet:vehicles:read') {
      return has || permissionsSet.has('fleet:read');
    }
    if (requiredPermission === 'fleet:work_orders:read') {
      return has || permissionsSet.has('work_orders:read');
    }
    if (requiredPermission === 'fleet:inspections:read') {
      return (
        has ||
        permissionsSet.has('inspections:read') ||
        permissionsSet.has('fleet:inspections:write')
      );
    }
    if (requiredPermission === 'equipment:read') {
      return (
        has ||
        permissionsSet.has('fleet:equipment:read') ||
        permissionsSet.has('fleet:equipment:write')
      );
    }
    if (requiredPermission === 'fleet:equipment:read') {
      return (
        has ||
        permissionsSet.has('fleet:equipment:write') ||
        permissionsSet.has('equipment:read') ||
        permissionsSet.has('equipment:write')
      );
    }
    if (requiredPermission === 'hr:onboarding:read') {
      return has || permissionsSet.has('hr:onboarding:write');
    }
    if (requiredPermission === 'company_cards:read') {
      return has || permissionsSet.has('company_cards:write');
    }
    if (requiredPermission === 'documents:read') {
      return (
        has ||
        permissionsSet.has('documents:write') ||
        permissionsSet.has('documents:delete') ||
        permissionsSet.has('documents:move')
      );
    }
    if (requiredPermission === 'business:projects:safety:read') {
      return (
        has ||
        permissionsSet.has('business:construction:projects:safety:read') ||
        permissionsSet.has('business:construction:projects:safety:write') ||
        permissionsSet.has('business:rm:projects:safety:read') ||
        permissionsSet.has('business:rm:projects:safety:write')
      );
    }
    if (requiredPermission === 'business:projects:safety:write') {
      return (
        has ||
        permissionsSet.has('business:construction:projects:safety:write') ||
        permissionsSet.has('business:rm:projects:safety:write')
      );
    }
    return has;
  };

  const canSeeMenuItem = (item: MenuItem): boolean => {
    if (hasPermission(item.requiredPermission)) return true;
    return Array.isArray(item.children) && item.children.some(canSeeMenuItem);
  };
  
  const handleLogout = async () => {
    if (hasUnsavedChanges) {
      const result = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
        confirmText: 'Save and Logout',
        cancelText: 'Cancel',
        showDiscard: true,
        discardText: 'Discard Changes'
      });
      
      if (result === 'cancel') {
        return; // Don't logout
      }
      // For 'confirm' and 'discard', proceed with logout
      // Note: We can't save from here, so we just proceed
    }
    
    localStorage.removeItem('user_token');
    queryClient.clear(); // Clear all React Query cache
    navigate('/login', { replace: true });
  };
  
  const menuCategories: MenuCategory[] = useMemo(() => {
    // If profile is incomplete, don't show menu (user must complete onboarding)
    if (!isProfileComplete) {
      return [];
    }
    
    // If profile is complete, show all categories
    return [
    {
      id: 'home',
      label: 'Home',
      icon: <IconHome />,
      items: [
        { id: 'home', label: 'Home', path: '/home', icon: <IconHome /> },
      ]
    },
    {
      id: 'personal',
      label: 'Personal',
      icon: <IconUser />,
      items: [
        { id: 'overview', label: 'Overview', path: '/overview', icon: <IconOverview /> },
        { id: 'schedule', label: 'Schedule', path: '/schedule', icon: <IconCalendar /> },
        { id: 'clock-in-out', label: 'Clock In/Out', path: '/clock-in-out', icon: <IconClock /> },
        { id: 'task-requests', label: 'Requests', path: '/task-requests', icon: <IconRequest /> },
        { id: 'tasks', label: 'Tasks', path: '/tasks', icon: <IconClipboard /> },
        { id: 'my-reviews', label: 'My Reviews', path: '/reviews/my', icon: <IconStar /> },
        { id: 'my-training', label: 'My Training', path: '/training', icon: <IconAcademic /> },
      ]
    },
    {
      id: 'services',
      label: 'Production (Sales)',
      icon: <IconSales />,
      items: [
        { id: 'business-dashboard', label: 'Dashboard', path: '/business', icon: <IconDashboard />, requiredPermission: 'business:construction:projects:read' },
        { id: 'opportunities', label: 'Opportunities', path: '/opportunities', icon: <IconOpportunities />, requiredPermission: 'business:construction:projects:read' },
        { id: 'projects', label: 'Projects', path: '/projects', icon: <IconProjects />, requiredPermission: 'business:construction:projects:read' },
      ]
    },
    {
      id: 'repairs_maintenance',
      label: 'Repairs & Maintenance',
      icon: <IconWrench />,
      items: [
        { id: 'rm-business-dashboard', label: 'Dashboard', path: '/rm-business', icon: <IconDashboard />, requiredPermission: 'business:rm:projects:read' },
        { id: 'rm-opportunities', label: 'Opportunities', path: '/rm-opportunities', icon: <IconOpportunities />, requiredPermission: 'business:rm:projects:read' },
        { id: 'rm-projects', label: 'Projects', path: '/rm-projects', icon: <IconProjects />, requiredPermission: 'business:rm:projects:read' },
      ]
    },
    {
      id: 'business',
      label: 'Business',
      icon: <IconBusiness />,
      items: [
        { id: 'customers', label: 'Customers', path: '/customers', icon: <IconUsers />, requiredPermission: 'business:customers:read' },
        { id: 'subcontractors', label: 'Subcontractors', path: '/business/subcontractors', icon: <IconBriefcase />, requiredPermission: 'business:customers:read' },
        { id: 'suppliers', label: 'Suppliers', path: '/inventory/suppliers', icon: <IconShoppingCart />, requiredPermission: 'inventory:suppliers:read', children: [
          { id: 'products', label: 'Products', path: '/inventory/products', icon: <IconBox />, requiredPermission: 'inventory:products:read' },
        ] },
      ]
    },
    {
      id: 'print_shop',
      label: 'Print Shop',
      icon: <IconPrinter />,
      items: [
        { id: 'print-shop-new', label: 'New request', path: '/print-request', icon: <IconRequest />, requiredPermission: 'print_shop:read' },
        { id: 'print-shop-queue', label: 'Requests', path: '/print-shop', icon: <IconPrinter />, requiredPermission: 'print_shop:read' },
        { id: 'print-shop-supplies', label: 'Supply stock', path: '/print-shop/supplies', icon: <IconBox />, requiredPermission: 'print_shop:read' },
        { id: 'print-shop-supply-orders', label: 'Supply orders', path: '/print-shop/supplies/orders', icon: <IconShoppingCart />, requiredPermission: 'print_shop:read' },
      ]
    },
    {
      id: 'sales',
      label: '2B Removed',
      icon: <IconSales />,
      items: [
        { id: 'quotations', label: 'Quotations', path: '/quotes', icon: <IconQuotations />, requiredPermission: 'sales:quotations:read' },
      ]
    },
    {
      id: 'safety',
      label: 'Safety',
      icon: <IconHardHat />,
      items: [
        { id: 'safety-inspections', label: 'Inspections', path: '/safety/inspections', icon: <IconClipboardCheck />, requiredPermission: 'business:projects:safety:read' },
        { id: 'safety-calendar', label: 'Schedule', path: '/safety/calendar', icon: <IconCalendar />, requiredPermission: 'business:projects:safety:read' },
        { id: 'safety-form-templates', label: 'Form Templates', path: '/safety/form-templates', icon: <IconDocument />, requiredPermission: 'business:projects:safety:read' },
        { id: 'safety-form-custom-lists', label: 'Form Custom Lists', path: '/safety/form-custom-lists', icon: <IconDocument />, requiredPermission: 'business:projects:safety:read' },
      ]
    },
    {
      id: 'fleet',
      label: 'Fleet',
      icon: <IconTruck />,
      items: [
        { id: 'fleet-dashboard', label: 'Dashboard', path: '/fleet', icon: <IconTruck />, requiredPermission: 'fleet:access' },
        { id: 'fleet-assets', label: 'Fleet Assets', path: '/fleet/assets', icon: <IconTruck />, requiredPermission: 'fleet:vehicles:read' },
        { id: 'fleet-calendar', label: 'Schedule', path: '/fleet/calendar', icon: <IconCalendar />, requiredPermission: 'fleet:access' },
        { id: 'work-orders', label: 'Work Orders', path: '/fleet/work-orders', icon: <IconClipboard />, requiredPermission: 'fleet:work_orders:read' },
        { id: 'inspections', label: 'Inspections', path: '/fleet/inspections', icon: <IconClipboardCheck />, requiredPermission: 'fleet:inspections:read' },
      ]
    },
    {
      id: 'company-assets',
      label: 'Company Assets',
      icon: <IconBox />,
      items: [
        { id: 'equipment', label: 'Equipment', path: '/company-assets/equipment', icon: <IconWrench />, requiredPermission: 'fleet:equipment:read' },
        { id: 'corporate-cards', label: 'Corporate Cards', path: '/company-assets/credit-cards', icon: <IconCreditCard />, requiredPermission: 'company_cards:read' },
      ]
    },
    {
      id: 'documents',
      label: 'Company File Library',
      icon: <IconDocument />,
      items: [
        { id: 'company-files', label: 'Company Files', path: '/company-files', icon: <IconFolder />, requiredPermission: 'documents:read' },
      ]
    },
    {
      id: 'training',
      label: 'Training & Learning',
      icon: <IconAcademic />,
      items: [
        ...(((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('training:dashboard:read') || (me?.permissions||[]).includes('training:manage') || (me?.permissions||[]).includes('users:write') || (me?.permissions||[]).includes('users:read') || (me?.permissions||[]).includes('hr:users:read') || (me?.permissions||[]).includes('hr:users:view:general')) ? [
          { id: 'training-dashboard', label: 'Dashboard', path: '/training/dashboard', icon: <IconOverview /> },
        ] : []),
        ...(((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('training:admin:read') || (me?.permissions||[]).includes('training:admin:write') || (me?.permissions||[]).includes('training:manage') || (me?.permissions||[]).includes('users:write')) ? [
          { id: 'training-admin', label: 'Training Admin', path: '/training/admin', icon: <IconSettings /> }
        ] : []),
      ]
    },
    {
      id: 'employee-review',
      label: 'Employee Review',
      icon: <IconStar />,
      items: [
        ...(((me?.roles || []).includes('admin') ||
          (me?.permissions || []).includes('hr:reviews:admin') ||
          (me?.permissions || []).includes('reviews:admin')) ? [
          {
            id: 'employee-review-cycles',
            label: 'Review Cycles',
            path: '/reviews/cycles',
            icon: <IconCalendar />,
            requiredPermission: 'hr:reviews:admin',
          },
          {
            id: 'employee-review-meeting-schedule',
            label: 'Meeting Schedule',
            path: '/reviews/director-meetings',
            icon: <IconCalendar />,
            requiredPermission: 'hr:reviews:admin',
          },
          {
            id: 'employee-review-form-templates',
            label: 'Form Templates',
            path: '/reviews/form-templates',
            icon: <IconDocument />,
            requiredPermission: 'hr:reviews:admin',
          },
        ] : []),
      ],
    },
    {
      id: 'human-resources',
      label: 'Human Resources',
      icon: <IconHumanResources />,
      items: [
        { id: 'users', label: 'Users', path: '/users', icon: <IconUsersGroup />, requiredPermission: 'hr:users:read' },
        { id: 'hr-pending', label: 'Pending Items', path: '/human-resources/overview', icon: <IconOverview />, requiredPermission: 'hr:pending:read' },
        { id: 'onboarding-admin', label: 'Onboarding', path: '/onboarding/admin', icon: <IconDocument />, requiredPermission: 'hr:onboarding:read' },
        { id: 'offboarding', label: 'Offboarding', path: '/human-resources/offboarding', icon: <IconDocument />, requiredPermission: 'hr:offboarding:read' },
        { id: 'attendance', label: 'Attendance', path: '/settings/attendance', icon: <IconCalendar />, requiredPermission: 'hr:attendance:read' },
        { id: 'community', label: 'Community', path: '/community', icon: <IconUsersGroup />, requiredPermission: 'hr:community:read' },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <IconSettings />,
      items: [
        { id: 'system-settings', label: 'System Settings', path: '/settings', icon: <IconSettings />, requiredPermission: 'settings:access' },
      ]
    },
  ];
  }, [me, isProfileComplete]);

  const globalSearchLocalSections: GlobalSearchSection[] = useMemo(() => {
    // Pages built from the same menu config (respecting permissions).
    const items: GlobalSearchItem[] = [];
    for (const cat of menuCategories) {
      for (const it of cat.items || []) {
        if (hasPermission(it.requiredPermission)) {
          items.push({
            type: 'page',
            id: it.id,
            title: it.label,
            subtitle: cat.label,
            href: it.path,
          });
        }
        for (const child of it.children || []) {
          if (hasPermission(child.requiredPermission)) {
            items.push({
              type: 'page',
              id: child.id,
              title: child.label,
              subtitle: `${cat.label} / ${it.label}`,
              href: child.path,
            });
          }
        }
      }
    }
    if (isAdmin) {
      items.push({
        type: 'page',
        id: 'audit-log',
        title: 'Audit Log',
        subtitle: 'System',
        href: '/logs',
      });
    }
    const seen = new Set<string>();
    const unique = items.filter((x) => {
      if (!x.href || seen.has(x.href)) return false;
      seen.add(x.href);
      return true;
    });
    return unique.length ? [{ id: 'pages', label: 'Pages', items: unique }] : [];
  }, [menuCategories, permissionsSet, isAdmin]);

  const canSeeGlobalSearchItem = useMemo(() => {
    return (item: GlobalSearchItem) => {
      // Pages already filtered, but keep it safe.
      if (item.type === 'page') return true;
      if (item.type === 'project' || item.type === 'opportunity') {
        return (
          canAccessProjectLineMenu(permissionsSet, 'construction', isAdmin) ||
          canAccessProjectLineMenu(permissionsSet, 'repairs', isAdmin)
        );
      }
      if (item.type === 'customer') return hasPermission('business:customers:read');
      if (item.type === 'quote') return hasPermission('sales:quotations:read');
      if (item.type === 'user') return hasPermission('hr:users:read') || hasPermission('users:read');
      if (item.type === 'fleet_asset' || item.type === 'equipment' || item.type === 'work_order') {
        return hasPermission('fleet:access') || hasPermission('fleet:read');
      }
      if (item.type === 'company_credit_card') return hasPermission('company_cards:read');
      // Unknown types: default allow (backend should still enforce on data fetch)
      return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsSet, isAdmin]);

  // Check if current route is a project or opportunity (construction or R&M)
  const projectIdMatch = location.pathname.match(/^\/projects\/([^\/]+)$/);
  const opportunityIdMatch = location.pathname.match(/^\/opportunities\/([^\/]+)$/);
  const rmProjectIdMatch = location.pathname.match(/^\/rm-projects\/([^\/]+)$/);
  const rmOpportunityIdMatch = location.pathname.match(/^\/rm-opportunities\/([^\/]+)$/);
  const projectId =
    projectIdMatch?.[1] ||
    opportunityIdMatch?.[1] ||
    rmProjectIdMatch?.[1] ||
    rmOpportunityIdMatch?.[1];
  const { data: currentProject } = useQuery({
    queryKey: ['project-for-nav', projectId],
    queryFn: () =>
      projectId ? api<{ is_bidding?: boolean }>('GET', `/projects/${projectId}`) : null,
    enabled: !!projectId,
    staleTime: 60_000
  });
  
  const onConstructionOpp =
    !!opportunityIdMatch || (!!projectIdMatch && !!currentProject?.is_bidding);
  const onRmOpp =
    !!rmOpportunityIdMatch ||
    (!!rmProjectIdMatch && !!currentProject?.is_bidding);
  const isViewingOpportunity = onConstructionOpp || onRmOpp;

  const isCategoryActive = (category: MenuCategory) => {
    // Special handling: exclude Settings category when on /settings/attendance
    // This must be checked first to prevent Settings from being active when viewing Attendance
    // Attendance belongs to Human Resources, not Settings
    if (category.id === 'settings') {
      if (location.pathname === '/settings/attendance' || location.pathname.startsWith('/settings/attendance/')) {
        return false; // Explicitly return false and don't check items
      }
    }
    if (category.id === 'services' && isViewingOpportunity) {
      const opportunitiesItem = category.items.find(item => item.id === 'opportunities');
      const projectsItem = category.items.find(item => item.id === 'projects');
      if (onConstructionOpp && opportunitiesItem && projectsItem) {
        return (
          location.pathname === opportunitiesItem.path ||
          location.pathname.startsWith(opportunitiesItem.path + '/') ||
          (location.pathname.startsWith('/projects/') && !!currentProject?.is_bidding)
        );
      }
    }
    if (category.id === 'repairs_maintenance' && isViewingOpportunity) {
      const rmOppItem = category.items.find(item => item.id === 'rm-opportunities');
      const rmProjItem = category.items.find(item => item.id === 'rm-projects');
      if (onRmOpp && rmOppItem && rmProjItem) {
        return (
          location.pathname === rmOppItem.path ||
          location.pathname.startsWith(rmOppItem.path + '/') ||
          (location.pathname.startsWith('/rm-projects/') && !!currentProject?.is_bidding)
        );
      }
    }
    if (category.id === 'services' && location.pathname === '/business') {
      return true;
    }
    if (category.id === 'repairs_maintenance' && location.pathname === '/rm-business') {
      return true;
    }
    return category.items.some(item => {
      if (item.id === 'projects' && isViewingOpportunity && onConstructionOpp) {
        return false;
      }
      if (item.id === 'rm-projects' && isViewingOpportunity && onRmOpp) {
        return false;
      }
      // Special handling for system-settings: exclude /settings/attendance
      if (item.id === 'system-settings' && item.path === '/settings') {
        // Only match exactly /settings or paths starting with /settings/ but not /settings/attendance
        if (location.pathname === '/settings') {
          return true;
        }
        if (location.pathname.startsWith('/settings/')) {
          // Exclude /settings/attendance which belongs to Human Resources
          if (location.pathname === '/settings/attendance' || location.pathname.startsWith('/settings/attendance/')) {
            return false;
          }
          return true;
        }
        return false;
      }
      // For all other items, check if path matches but exclude /settings/attendance from matching /settings
      if (item.path === '/settings') {
        // Don't match /settings/attendance paths - this belongs to Human Resources
        if (location.pathname === '/settings/attendance' || location.pathname.startsWith('/settings/attendance/')) {
          return false;
        }
      }
      // Special handling for Fleet Dashboard: only match exactly /fleet, not sub-paths
      if (item.id === 'fleet-dashboard' && item.path === '/fleet') {
        return location.pathname === '/fleet';
      }
      // Special handling for Business Dashboard: only match exactly /business, not sub-paths
      if (item.id === 'business-dashboard' && item.path === '/business') {
        return location.pathname === '/business';
      }
      if (item.id === 'rm-business-dashboard' && item.path === '/rm-business') {
        return location.pathname === '/rm-business';
      }
      // Fleet Assets: also active on /fleet/vehicles, /fleet/heavy-machinery, /fleet/other-assets
      if (item.id === 'fleet-assets') {
        if (['/fleet/assets', '/fleet/vehicles', '/fleet/heavy-machinery', '/fleet/other-assets'].some(p => location.pathname === p || location.pathname.startsWith(p + '/'))) {
          return true;
        }
      }
      if (item.id === 'my-training' && item.path === '/training') {
        return pathnameIsLearnerTraining(location.pathname);
      }
      if (item.id === 'employee-review-cycles') {
        if (menuChildMatchesLocation(item, location.pathname, location.search)) {
          return true;
        }
      }
      const isSelfActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
      if (isSelfActive) return true;
      if (Array.isArray(item.children) && item.children.some((child) => menuChildMatchesLocation(child, location.pathname, location.search))) {
        return true;
      }
      return false;
    });
  };

  const activeCategory = useMemo(() => {
    return menuCategories.find(cat => isCategoryActive(cat));
  }, [location.pathname, location.search, menuCategories, currentProject, isViewingOpportunity, onConstructionOpp, onRmOpp]);

  // When opening the menu, select the category for the current route (if it has a sub-panel)
  useEffect(() => {
    if (!navOpen) return;
    const cat = activeCategory;
    if (cat) {
      const visibleCount = cat.items.filter(canSeeMenuItem).length;
      const hasSubPanel = visibleCount > 1 || cat.id === 'sales';
      setActiveNavCategoryId(hasSubPanel ? cat.id : null);
    } else {
      setActiveNavCategoryId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on open
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  const categoryHasSubPanel = (category: MenuCategory) => {
    const visibleCount = category.items.filter(canSeeMenuItem).length;
    return visibleCount > 1 || category.id === 'sales';
  };

  const visibleMenuCategories = useMemo(() => {
    return menuCategories.filter((category) => {
      if (category.id === 'services') {
        if (!canAccessProjectLineMenu(permissionsSet, 'construction', isAdmin)) return false;
      }
      if (category.id === 'repairs_maintenance') {
        if (!canAccessProjectLineMenu(permissionsSet, 'repairs', isAdmin)) return false;
      }
      if (category.id === 'business') {
        const hasBusinessAccess =
          hasPermission('business:customers:read') ||
          hasPermission('inventory:suppliers:read') ||
          hasPermission('inventory:products:read');
        if (!hasBusinessAccess) return false;
      }
      if (category.id === 'print_shop') {
        if (!hasPermission('print_shop:read')) return false;
      }
      if (category.id === 'sales') {
        if (!hasPermission('sales:quotations:read')) return false;
      }
      const visibleItems = category.items.filter(canSeeMenuItem);
      return visibleItems.length > 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuCategories, permissionsSet, isAdmin]);

  const selectedNavCategory = useMemo(
    () => visibleMenuCategories.find((c) => c.id === activeNavCategoryId) ?? null,
    [visibleMenuCategories, activeNavCategoryId],
  );

  // Fit flyout into viewport without scrollbars (scales under high zoom / short windows)
  useLayoutEffect(() => {
    if (!navOpen) {
      setNavFit({ scale: 1, width: 0, height: 0 });
      return;
    }

    const measure = () => {
      const inner = navPanelInnerRef.current;
      if (!inner) return;

      const prevTransform = inner.style.transform;
      inner.style.transform = 'none';
      const width = Math.ceil(inner.offsetWidth);
      const height = Math.ceil(inner.offsetHeight);
      inner.style.transform = prevTransform;

      const buttonBottom = menuButtonRef.current?.getBoundingClientRect().bottom ?? 56;
      const buttonLeft = menuButtonRef.current?.getBoundingClientRect().left ?? 12;
      const vv = window.visualViewport;
      const viewH = vv?.height ?? window.innerHeight;
      const viewW = vv?.width ?? window.innerWidth;
      const availH = Math.max(120, viewH - buttonBottom - 10);
      const availW = Math.max(160, viewW - buttonLeft - 12);
      const nextScale = Math.min(1, availH / Math.max(height, 1), availW / Math.max(width, 1));
      setNavFit((prev) => {
        const scale = Math.max(0.42, Number(nextScale.toFixed(4)));
        if (prev.scale === scale && prev.width === width && prev.height === height) return prev;
        return { scale, width, height };
      });
    };

    // Defer one frame so the panel has painted at natural size
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    if (navPanelInnerRef.current) ro.observe(navPanelInnerRef.current);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [navOpen, activeNavCategoryId, visibleMenuCategories, isAdmin]);

  const getCategoryDefaultPath = (category: MenuCategory) => {
    if (category.id === 'services') return '/business';
    if (category.id === 'repairs_maintenance') return '/rm-business';
    if (category.id === 'business') {
      if (hasPermission('business:customers:read')) return '/customers';
      if (hasPermission('inventory:suppliers:read')) return '/inventory/suppliers';
      if (hasPermission('inventory:products:read')) return '/inventory/products';
      return category.items[0]?.path || '#';
    }
    if (category.id === 'print_shop') return '/print-shop';
    if (category.id === 'sales') return '/quotes';
    if (category.id === 'company-assets') {
      if (hasPermission('fleet:equipment:read')) return '/company-assets/equipment';
      if (hasPermission('company_cards:read')) return '/company-assets/credit-cards';
      const first = category.items.find((it) => hasPermission(it.requiredPermission));
      return first?.path || '/company-assets/equipment';
    }
    if (category.id === 'human-resources') {
      if (hasPermission('hr:users:read')) return '/users';
      const first = category.items.find((it) => hasPermission(it.requiredPermission));
      return first?.path || '/users';
    }
    return category.items[0]?.path || '#';
  };

  const showHubLoadingGate =
    meLoading ||
    meProfileLoading ||
    (userId && emergencyContactsLoading) ||
    (!!userId && isProfileComplete && onboardingStatusLoading);

  const needsWizardRedirectWhileInShell =
    !!meProfile &&
    !isProfileComplete &&
    !isExemptFromProfileWizardRedirect(location.pathname);

  const needsDocumentsRedirectWhileInShell =
    isProfileComplete &&
    onboardingBlocked &&
    !matchesOnboardingDocumentsRedirectExempt(location.pathname);

  useEffect(() => {
    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevHtmlHeight = documentElement.style.height;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    body.style.height = '100%';
    documentElement.style.height = '100%';

    return () => {
      body.style.overflow = prevBodyOverflow;
      documentElement.style.overflow = prevHtmlOverflow;
      body.style.height = prevBodyHeight;
      documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  if (showHubLoadingGate || needsWizardRedirectWhileInShell || needsDocumentsRedirectWhileInShell) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-gray-500">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="relative z-[60] flex h-14 shrink-0 items-center gap-2 border-b border-gray-700/40 bg-gradient-to-r from-gray-700 via-gray-700 to-gray-800 px-3 text-white shadow-sm sm:gap-3 sm:px-5">
        <div className="relative shrink-0" ref={navRootRef}>
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={navOpen}
            aria-controls="hub-nav-panel"
            aria-haspopup="true"
            onClick={() => {
              setOpen(false);
              setNavOpen((v) => !v);
            }}
            className={uiCx(
              'flex h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-3',
              'text-sm font-medium text-white transition-colors hover:bg-black/25 hover:border-white/18',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
              navOpen && 'bg-black/30 border-white/20',
            )}
          >
            <IconLogs />
            <span>Menu</span>
          </button>

          {navOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-[55] cursor-default bg-black/25"
                aria-label="Close menu"
                onClick={closeNav}
              />
              <div
                id="hub-nav-panel"
                role="navigation"
                aria-label="Main menu"
                className="absolute left-0 top-full z-[56] mt-1.5 overflow-hidden rounded-xl border border-gray-700/50 text-white shadow-2xl shadow-black/40"
                style={{
                  width: navFit.width > 0 ? navFit.width * navFit.scale : undefined,
                  height: navFit.height > 0 ? navFit.height * navFit.scale : undefined,
                }}
              >
                <div
                  ref={navPanelInnerRef}
                  className={uiCx(
                    'relative flex origin-top-left bg-gradient-to-b from-gray-800/95 via-gray-800 to-gray-900',
                    selectedNavCategory && categoryHasSubPanel(selectedNavCategory)
                      ? 'w-[min(36rem,calc(100vw-1.5rem))]'
                      : 'w-[min(17.5rem,calc(100vw-1.5rem))]',
                  )}
                  style={{
                    transform: `scale(${navFit.scale})`,
                    transformOrigin: 'top left',
                  }}
                >
                {/* Subtle abstract pattern overlay (from former sidebar) */}
                <div
                  className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
                  style={{
                    backgroundImage: `
                      repeating-linear-gradient(
                        0deg,
                        transparent,
                        transparent 2px,
                        rgba(255, 255, 255, 0.03) 2px,
                        rgba(255, 255, 255, 0.03) 4px
                      ),
                      repeating-linear-gradient(
                        90deg,
                        transparent,
                        transparent 2px,
                        rgba(255, 255, 255, 0.02) 2px,
                        rgba(255, 255, 255, 0.02) 4px
                      ),
                      radial-gradient(
                        circle at 20% 30%,
                        rgba(255, 255, 255, 0.015) 0%,
                        transparent 50%
                      ),
                      radial-gradient(
                        circle at 80% 70%,
                        rgba(255, 255, 255, 0.015) 0%,
                        transparent 50%
                      ),
                      radial-gradient(
                        circle at 50% 50%,
                        rgba(255, 255, 255, 0.01) 0%,
                        transparent 50%
                      )
                    `,
                    backgroundSize: '100% 100%, 100% 100%, 200% 200%, 200% 200%, 300% 300%',
                    backgroundPosition: '0 0, 0 0, 0 0, 0 0, 0 0',
                    mixBlendMode: 'overlay',
                  }}
                />

                {/* Left: categories */}
                <div
                  className={uiCx(
                    'relative z-10 flex w-[17.5rem] shrink-0 flex-col py-1.5',
                    selectedNavCategory && categoryHasSubPanel(selectedNavCategory) && 'border-r border-white/10',
                  )}
                >
                  <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Navigate
                  </div>
                  {visibleMenuCategories.map((category) => {
                    const isRouteActive = isCategoryActive(category);
                    const isSelected = activeNavCategoryId === category.id;
                    const hasSub = categoryHasSubPanel(category);
                    const defaultPath = getCategoryDefaultPath(category);

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          if (!hasSub) {
                            closeNav();
                            navigate(defaultPath);
                            return;
                          }
                          setActiveNavCategoryId(category.id);
                        }}
                        className={uiCx(
                          'mx-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          isSelected
                            ? 'bg-brand-red text-white'
                            : isRouteActive
                              ? 'bg-white/10 text-white'
                              : 'text-gray-300 hover:bg-white/5 hover:text-white',
                        )}
                      >
                        <span className={uiCx('flex-shrink-0', isSelected || isRouteActive ? 'opacity-100' : 'opacity-70')}>
                          {category.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.label}</span>
                        {hasSub ? (
                          <svg className="h-3.5 w-3.5 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        ) : null}
                      </button>
                    );
                  })}

                  {isAdmin ? (
                    <>
                      <div className="my-1.5 border-t border-white/10" aria-hidden />
                      <NavLink
                        to="/logs"
                        end
                        onClick={closeNav}
                        className={() =>
                          uiCx(
                            'mx-1.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                            location.pathname === '/logs'
                              ? 'bg-brand-red text-white'
                              : 'text-gray-300 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        <span className="flex-shrink-0 opacity-80">
                          <IconLogs />
                        </span>
                        <span className="text-sm font-medium">Audit log</span>
                      </NavLink>
                    </>
                  ) : null}
                </div>

                {/* Right: sub-items for selected category */}
                {selectedNavCategory && categoryHasSubPanel(selectedNavCategory) ? (
                  <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden bg-black/15">
                    {/* Brand globe — large & cropped like the old sidebar */}
                    <div
                      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
                      aria-hidden
                    >
                      <div
                        className="absolute"
                        style={{
                          backgroundImage: 'url(/assets/brand/globe.svg)',
                          backgroundSize: '400px 400px',
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'left bottom',
                          width: '400px',
                          height: '400px',
                          left: '60px',
                          bottom: '0px',
                          opacity: 0.06,
                          filter: 'blur(0.2px)',
                        }}
                      />
                    </div>
                    <div className="relative z-[1] flex flex-col py-1.5">
                    <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {selectedNavCategory.label}
                    </div>
                    <div className="space-y-0.5 px-1.5 pb-1">
                      {selectedNavCategory.items.filter(canSeeMenuItem).map((item) => {
                        let isItemActive = false;
                        if (isViewingOpportunity) {
                          isItemActive = false;
                        } else if (item.id === 'fleet-dashboard' && item.path === '/fleet') {
                          isItemActive = location.pathname === '/fleet';
                        } else if (item.id === 'business-dashboard' && item.path === '/business') {
                          isItemActive = location.pathname === '/business';
                        } else if (item.id === 'rm-business-dashboard' && item.path === '/rm-business') {
                          isItemActive = location.pathname === '/rm-business';
                        } else if (item.id === 'fleet-assets') {
                          isItemActive = ['/fleet/assets', '/fleet/vehicles', '/fleet/heavy-machinery', '/fleet/other-assets'].some(
                            (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
                          );
                        } else if (item.id === 'my-training' && item.path === '/training') {
                          isItemActive = pathnameIsLearnerTraining(location.pathname);
                        } else if (item.id === 'employee-review-cycles') {
                          isItemActive = menuChildMatchesLocation(item, location.pathname, location.search);
                        } else {
                          isItemActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                        }

                        const visibleChildren = (item.children || []).filter(canSeeMenuItem);
                        const hasChildren = visibleChildren.length > 0;
                        const isAnyChildActive = hasChildren
                          ? visibleChildren.some((child) => menuChildMatchesLocation(child, location.pathname, location.search))
                          : false;
                        const isItemOrChildActive = isItemActive || isAnyChildActive;
                        const selfNavigable = hasPermission(item.requiredPermission);

                        if (hasChildren) {
                          return (
                            <div key={item.id} className="space-y-0.5">
                              {selfNavigable ? (
                                <NavLink
                                  to={item.path}
                                  end={item.id === 'fleet-dashboard' || item.id === 'business-dashboard' || item.id === 'rm-business-dashboard'}
                                  onClick={closeNav}
                                  className={() =>
                                    uiCx(
                                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                                      isItemOrChildActive
                                        ? 'bg-brand-red/90 text-white'
                                        : 'text-gray-300 hover:bg-white/5 hover:text-white',
                                    )
                                  }
                                >
                                  <span className="flex-shrink-0 opacity-80">{item.icon}</span>
                                  <span className="text-sm font-medium">{item.label}</span>
                                </NavLink>
                              ) : (
                                <div
                                  className={uiCx(
                                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2',
                                    isItemOrChildActive ? 'bg-brand-red/90 text-white' : 'text-gray-400',
                                  )}
                                >
                                  <span className="flex-shrink-0 opacity-80">{item.icon}</span>
                                  <span className="text-sm font-medium">{item.label}</span>
                                </div>
                              )}
                              {visibleChildren.map((child) => {
                                const childActive =
                                  !isViewingOpportunity &&
                                  menuChildMatchesLocation(child, location.pathname, location.search);
                                return (
                                  <NavLink
                                    key={child.id}
                                    to={child.path}
                                    onClick={closeNav}
                                    className={() =>
                                      uiCx(
                                        'ml-4 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors',
                                        childActive
                                          ? 'bg-brand-red/80 text-white'
                                          : 'text-gray-400 hover:bg-white/5 hover:text-white',
                                      )
                                    }
                                  >
                                    <span className="flex-shrink-0 opacity-70">{child.icon}</span>
                                    <span className="text-xs font-medium">{child.label}</span>
                                  </NavLink>
                                );
                              })}
                            </div>
                          );
                        }

                        const leafLinkActive = (navActive: boolean) =>
                          item.id === 'my-training'
                            ? pathnameIsLearnerTraining(location.pathname)
                            : isItemActive || navActive;

                        return (
                          <NavLink
                            key={item.id}
                            to={item.path}
                            end={item.id === 'fleet-dashboard' || item.id === 'business-dashboard' || item.id === 'rm-business-dashboard'}
                            onClick={closeNav}
                            className={({ isActive: navActive }) => {
                              const on = leafLinkActive(navActive);
                              return uiCx(
                                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                                on ? 'bg-brand-red/90 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white',
                              );
                            }}
                          >
                            {({ isActive: navActive }) => {
                              const on = leafLinkActive(navActive);
                              return (
                                <>
                                  <span className={uiCx('flex-shrink-0', on ? 'opacity-100' : 'opacity-70')}>{item.icon}</span>
                                  <span className="text-sm font-medium">{item.label}</span>
                                </>
                              );
                            }}
                          </NavLink>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <GlobalSearch
          widthClassName="min-w-0 flex-1"
          maxRecents={4}
          compactToggle
          isItemAllowed={canSeeGlobalSearchItem}
          getLocalSections={() => globalSearchLocalSections}
        />

        <div className="ml-auto flex h-10 shrink-0 items-center gap-2 sm:gap-2.5">
          <div
            role="toolbar"
            aria-label="Hub shortcuts"
            className="flex h-10 items-center gap-0.5 rounded-lg border border-white/10 bg-gradient-to-b from-gray-800/85 to-gray-900/90 p-0 shadow-inner"
          >
            <ChangelogNewsPanel />
            <span className="h-5 w-px shrink-0 self-center rounded-full bg-white/12" aria-hidden />
            <NotificationBell />
            <span className="h-5 w-px shrink-0 self-center rounded-full bg-white/12" aria-hidden />
            <FixedBugReportButton />
          </div>
          <div className="relative shrink-0" ref={userMenuRef}>
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => {
                setNavOpen(false);
                setOpen((v) => !v);
              }}
              className="flex h-10 max-w-[min(14rem,40vw)] items-center gap-2 rounded-lg border border-white/10 bg-black/15 px-2 transition-all hover:border-white/18 hover:bg-black/25 sm:max-w-[15rem] sm:pr-3"
            >
              <AppUserAvatar user={userMenuUser} size="sm" className="flex-shrink-0 border-2 border-gray-500/55 shadow-md" />
              <span className="min-w-0 truncate text-sm font-semibold text-white">{displayName}</span>
            </button>
            {open ? (
              <div
                role="menu"
                className={uiCx(
                  uiDropdown.menu,
                  '!absolute right-0 top-full z-[100050] mt-1 flex w-max min-w-0 max-w-[min(100vw-2rem,16rem)] flex-col !max-h-none py-1',
                )}
              >
                <Link
                  to="/profile"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={uiCx(uiDropdown.option, 'block w-full whitespace-nowrap !text-right')}
                >
                  My Information
                </Link>
                <Link
                  to="/reviews/my"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={uiCx(uiDropdown.option, 'block w-full whitespace-nowrap !text-right')}
                >
                  My reviews
                </Link>
                <div className="my-1 border-t border-gray-100" aria-hidden />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    void handleLogout();
                  }}
                  className={uiCx(uiDropdown.option, 'block w-full whitespace-nowrap !text-right text-red-600 hover:bg-red-50')}
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>
          <HubTodayCalendar />
        </div>
      </header>

      <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="p-5 min-h-full min-w-0">
            {onboardingStatus?.has_pending &&
              !onboardingStatus?.past_deadline &&
              location.pathname !== '/onboarding/documents' && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    You have {onboardingStatus.pending_count} required onboarding document
                    {onboardingStatus.pending_count !== 1 ? 's' : ''} to sign
                    {onboardingStatus.earliest_deadline
                      ? ` (deadline ${new Date(onboardingStatus.earliest_deadline).toLocaleDateString()})`
                      : ''}
                    .
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/onboarding/documents')}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800"
                  >
                    Complete Documents
                  </button>
                </div>
              )}
            {children}
          </div>
        </div>
      </main>

      {/* Init marker only — FAB is mounted on document.body by chat-widget.js */}
      <div id="hub-chat-fab-host" className="hidden" aria-hidden />
      <HubChatLauncher />
      <InstallPrompt />
    </div>
  );
}
