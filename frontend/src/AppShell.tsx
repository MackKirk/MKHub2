import { PropsWithChildren, useState, useMemo, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import NotificationBell from '@/components/NotificationBell';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { useConfirm } from '@/components/ConfirmProvider';
import FixedBugReportButton from '@/components/FixedBugReportButton';
import InstallPrompt from '@/components/InstallPrompt';
import GlobalSearch, { GlobalSearchSection, GlobalSearchItem } from '@/components/GlobalSearch';

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

const IconRequest = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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

const IconFileText = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data:meProfile, isLoading: meProfileLoading } = useQuery({ queryKey:['me-profile'], queryFn: ()=>api<any>('GET','/auth/me/profile') });
  const { data:me } = useQuery({ queryKey:['me'], queryFn: ()=>api<any>('GET','/auth/me') });
  const userId = me?.id ? String(me.id) : '';
  
  // Check emergency contacts
  const { data: emergencyContactsData, isLoading: emergencyContactsLoading } = useQuery({ 
    queryKey:['emergency-contacts', userId], 
    queryFn: ()=> api<any[]>('GET', `/auth/users/${encodeURIComponent(userId)}/emergency-contacts`),
    enabled: !!userId
  });

  const { data: reviewsAvailable } = useQuery({
    queryKey: ['reviews-me-available'],
    queryFn: () => api<{ available?: boolean }>('GET', '/reviews/me/available'),
  });

  // Check if profile is complete (all required fields filled)
  const isProfileComplete = useMemo(() => {
    // If we're still loading, don't consider it complete yet (but also don't redirect until we know)
    if (!meProfile?.profile) return false;
    const p = meProfile.profile;
    const reqPersonal = ['gender','date_of_birth','marital_status','nationality','phone','address_line1','city','province','postal_code','country','sin_number','work_eligibility_status'];
    const missingPersonal = reqPersonal.filter(k => !String((p as any)[k]||'').trim());
    // Only check emergency contacts if userId exists (query enabled) and query has finished loading
    const hasEmergencyContact = userId ? (emergencyContactsData !== undefined && emergencyContactsData.length > 0) : true;
    const missingPersonalWithContact = [...missingPersonal];
    // Only require emergency contact if we have a userId (meaning the query was enabled)
    if (!hasEmergencyContact && userId && !emergencyContactsLoading) {
      missingPersonalWithContact.push('emergency_contact');
    }
    return missingPersonalWithContact.length === 0;
  }, [meProfile, emergencyContactsData, userId, emergencyContactsLoading]);
  
  // Redirect to onboarding if incomplete and trying to access other routes
  // Only redirect if queries have finished loading and profile is confirmed incomplete
  // IMPORTANT: Add debounce to prevent rapid redirects during form updates
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    // Clear any pending redirect
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    
    // Don't redirect if we're still loading data
    if (meProfileLoading || (userId && emergencyContactsLoading)) {
      return;
    }
    
    // Only redirect if profile data exists, is incomplete, and we're not already on onboarding/profile pages
    if (meProfile && !isProfileComplete && location.pathname !== '/profile' && location.pathname !== '/onboarding') {
      // Add a small delay to prevent rapid redirects during form updates
      redirectTimeoutRef.current = setTimeout(() => {
        // Double-check conditions before redirecting
        if (meProfile && !isProfileComplete && location.pathname !== '/profile' && location.pathname !== '/onboarding') {
          navigate('/onboarding', { replace: true });
        }
        redirectTimeoutRef.current = null;
      }, 1000); // 1 second delay to allow form updates to settle
    }
    
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [meProfile, isProfileComplete, location.pathname, navigate, meProfileLoading, emergencyContactsLoading, userId]);
  
  const displayName = (meProfile?.profile?.preferred_name) || ([meProfile?.profile?.first_name, meProfile?.profile?.last_name].filter(Boolean).join(' ') || meProfile?.user?.username || 'User');
  const avatarId = meProfile?.profile?.profile_photo_file_id;
  const avatarUrl = avatarId ? `/files/${avatarId}/thumbnail?w=96` : '/ui/assets/login/logo-light.svg';
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const { hasUnsavedChanges } = useUnsavedChanges();
  const confirm = useConfirm();

  const isAdmin = (me?.roles || []).includes('admin');
  const permissionsSet = useMemo(() => new Set((me?.permissions || []).map((p: any) => String(p))), [me]);

  const hasPermission = (requiredPermission?: string) => {
    if (!requiredPermission) return true;
    if (isAdmin) return true;
    const has = permissionsSet.has(requiredPermission);
    if (requiredPermission.startsWith('hr:')) {
      const legacyPerm = requiredPermission.replace('hr:', '');
      return has || permissionsSet.has(legacyPerm);
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
        { id: 'schedule', label: 'Schedule', path: '/schedule', icon: <IconCalendar /> },
        { id: 'clock-in-out', label: 'Clock in/out', path: '/clock-in-out', icon: <IconClock /> },
        { id: 'task-requests', label: 'Requests', path: '/task-requests', icon: <IconRequest /> },
        { id: 'tasks', label: 'Tasks', path: '/tasks', icon: <IconClipboard /> },
      ]
    },
    {
      id: 'services',
      label: 'Sales',
      icon: <IconSales />,
      items: [
        { id: 'business-dashboard', label: 'Dashboard', path: '/business', icon: <IconDashboard />, requiredPermission: 'business:projects:read' },
        { id: 'opportunities', label: 'Opportunities', path: '/opportunities', icon: <IconOpportunities />, requiredPermission: 'business:projects:read' },
        { id: 'projects', label: 'Projects', path: '/projects', icon: <IconProjects />, requiredPermission: 'business:projects:read' },
      ]
    },
    {
      id: 'business',
      label: 'Business',
      icon: <IconBusiness />,
      items: [
        { id: 'customers', label: 'Customers', path: '/customers', icon: <IconUsers />, requiredPermission: 'business:customers:read' },
        { id: 'suppliers', label: 'Suppliers', path: '/inventory/suppliers', icon: <IconShoppingCart />, requiredPermission: 'inventory:suppliers:read', children: [
          { id: 'products', label: 'Products', path: '/inventory/products', icon: <IconBox />, requiredPermission: 'inventory:products:read' },
        ] },
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
      id: 'fleet',
      label: 'Fleet & Equipment',
      icon: <IconTruck />,
      items: [
        { id: 'fleet-dashboard', label: 'Dashboard', path: '/fleet', icon: <IconTruck />, requiredPermission: 'fleet:access' },
        { id: 'fleet-assets', label: 'Fleet Assets', path: '/fleet/assets', icon: <IconTruck />, requiredPermission: 'fleet:access' },
        { id: 'equipment', label: 'Equipment', path: '/fleet/equipment', icon: <IconWrench />, requiredPermission: 'fleet:access' },
        { id: 'work-orders', label: 'Work Orders', path: '/fleet/work-orders', icon: <IconClipboard />, requiredPermission: 'fleet:access' },
      ]
    },
    {
      id: 'documents',
      label: 'Documents',
      icon: <IconDocument />,
      items: [
        { id: 'company-files', label: 'Company Files', path: '/company-files', icon: <IconFolder />, requiredPermission: 'documents:access' },
        { id: 'document-creator', label: 'Create document', path: '/documents/create', icon: <IconFileText />, requiredPermission: 'documents:access' },
      ]
    },
    {
      id: 'training',
      label: 'Training & Learning',
      icon: <IconAcademic />,
      items: [
        { id: 'my-training', label: 'My Training', path: '/training', icon: <IconAcademic /> },
        { id: 'certificates', label: 'My Certificates', path: '/training/certificates', icon: <IconDocument /> },
        ...(((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('users:write')) ? [
          { id: 'training-admin', label: 'Training Admin', path: '/training/admin', icon: <IconSettings /> }
        ] : []),
      ]
    },
    {
      id: 'human-resources',
      label: 'Human Resources',
      icon: <IconHumanResources />,
      items: [
        // Check hr:access permission first - if not granted, hide entire category
        ...((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('hr:access') || (me?.permissions||[]).includes('users:read')) ? [
          { id: 'users', label: 'Users', path: '/users', icon: <IconUsersGroup />, requiredPermission: 'hr:users:read' },
          { id: 'attendance', label: 'Attendance', path: '/settings/attendance', icon: <IconCalendar />, requiredPermission: 'hr:attendance:read' },
          { id: 'community', label: 'Community', path: '/community', icon: <IconUsersGroup />, requiredPermission: 'hr:community:read' },
          ...(((me?.roles||[]).includes('admin') || (me?.permissions||[]).includes('hr:reviews:admin') || (me?.permissions||[]).includes('reviews:admin')) ? [
            { id: 'employee-reviews', label: 'Employee Reviews', path: '/reviews/admin', icon: <IconStar />, requiredPermission: 'hr:reviews:admin' }
          ] : []),
        ] : [],
      ]
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
      if (item.type === 'project' || item.type === 'opportunity') return hasPermission('business:projects:read');
      if (item.type === 'customer') return hasPermission('business:customers:read');
      if (item.type === 'quote') return hasPermission('sales:quotations:read');
      if (item.type === 'user') return hasPermission('hr:users:read') || hasPermission('users:read');
      if (item.type === 'fleet_asset' || item.type === 'equipment' || item.type === 'work_order') return hasPermission('fleet:access') || hasPermission('fleet:read');
      // Unknown types: default allow (backend should still enforce on data fetch)
      return true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsSet, isAdmin]);

  // Check if current route is a project that is an opportunity
  const projectIdMatch = location.pathname.match(/^\/projects\/([^\/]+)$/);
  const opportunityIdMatch = location.pathname.match(/^\/opportunities\/([^\/]+)$/);
  const projectId = projectIdMatch?.[1] || opportunityIdMatch?.[1];
  const { data: currentProject } = useQuery({
    queryKey: ['project-for-nav', projectId],
    queryFn: () => projectId ? api<{ is_bidding?: boolean }>('GET', `/projects/${projectId}`) : null,
    enabled: !!projectId,
    staleTime: 60_000
  });
  
  // Determine if we're viewing an opportunity (either via /projects/:id or /opportunities/:id)
  const isViewingOpportunity = (projectIdMatch && currentProject?.is_bidding) || !!opportunityIdMatch;

  const isCategoryActive = (category: MenuCategory) => {
    // Special handling: exclude Settings category when on /settings/attendance
    // This must be checked first to prevent Settings from being active when viewing Attendance
    // Attendance belongs to Human Resources, not Settings
    if (category.id === 'settings') {
      if (location.pathname === '/settings/attendance' || location.pathname.startsWith('/settings/attendance/')) {
        return false; // Explicitly return false and don't check items
      }
    }
    // Special handling for Services category: if we're viewing an opportunity,
    // check against opportunities path instead of projects path
    if (category.id === 'services' && isViewingOpportunity) {
      const opportunitiesItem = category.items.find(item => item.id === 'opportunities');
      const projectsItem = category.items.find(item => item.id === 'projects');
      if (opportunitiesItem && projectsItem) {
        // If it's an opportunity, only consider opportunities as active, not projects
        return location.pathname === opportunitiesItem.path || location.pathname.startsWith(opportunitiesItem.path + '/') || 
               (location.pathname.startsWith('/projects/') && currentProject?.is_bidding);
      }
    }
    // Special handling for Services category: check if we're on the business dashboard
    if (category.id === 'services' && location.pathname === '/business') {
      return true;
    }
    // Check if any item in the category is active
    return category.items.some(item => {
      // If we're viewing an opportunity, don't match projects item
      if (item.id === 'projects' && isViewingOpportunity) {
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
      const isSelfActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
      if (isSelfActive) return true;
      if (Array.isArray(item.children) && item.children.some(child => location.pathname === child.path || location.pathname.startsWith(child.path + '/'))) {
        return true;
      }
      return false;
    });
  };

  const activeCategory = useMemo(() => {
    return menuCategories.find(cat => isCategoryActive(cat));
  }, [location.pathname, menuCategories, currentProject, isViewingOpportunity]);


  return (
    <div className="min-h-screen flex">
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} text-white bg-gradient-to-b from-gray-800/95 via-gray-800 to-gray-900 transition-all duration-300 flex flex-col fixed left-0 top-0 h-screen z-40`}>
        {/* Subtle abstract pattern overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
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
            mixBlendMode: 'overlay'
          }}
        />
        {/* Subtle brand globe watermark */}
        <div 
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            backgroundImage: 'url(/assets/brand/globe.svg)',
            backgroundSize: '460px 460px',
            backgroundPosition: 'left bottom',
            backgroundRepeat: 'no-repeat',
            opacity: 0.04,
            filter: 'blur(0.2px)'
          }}
        />
        <div className={`py-3 px-4 ${sidebarCollapsed ? 'flex items-center justify-center' : 'flex items-center justify-between'} border-b border-gray-700/50 relative z-10`}>
          {!sidebarCollapsed ? (
            <>
              <div className="flex-1 flex items-center justify-center">
                <img src="/ui/assets/login/logo-light.svg" className="h-14 w-full max-w-[180px] object-contain"/>
              </div>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700/50 transition-all duration-200 flex-shrink-0"
                title="Collapse sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-700/50 transition-all duration-200 w-full flex items-center justify-center"
              title="Expand sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 relative z-10">
          {menuCategories
            .filter(category => {
              // Special handling for Services category: requires projects access
              if (category.id === 'services') {
                if (!hasPermission('business:projects:read')) return false;
              }
              // Special handling for Business category: requires customers or inventory access
              if (category.id === 'business') {
                const hasBusinessAccess =
                  hasPermission('business:customers:read') ||
                  hasPermission('inventory:suppliers:read') ||
                  hasPermission('inventory:products:read');
                if (!hasBusinessAccess) return false;
              }
              // Special handling for Sales category: requires sales quotations access
              if (category.id === 'sales') {
                if (!hasPermission('sales:quotations:read')) return false;
              }
              // Filter categories that have no visible items
              const visibleItems = category.items.filter(canSeeMenuItem);
              return visibleItems.length > 0;
            })
            .map(category => {
            const isActive = isCategoryActive(category);
            const showSubItems = !sidebarCollapsed && isActive;
            
            // Determine the default path for Services category based on permissions
            const getServicesDefaultPath = () => {
              if (category.id !== 'services') return category.items[0]?.path || '#';
              return '/business';
            };

            // Determine the default path for Business category based on permissions
            const getBusinessDefaultPath = () => {
              if (category.id !== 'business') return category.items[0]?.path || '#';
              if (hasPermission('business:customers:read')) return '/customers';
              if (hasPermission('inventory:suppliers:read')) return '/inventory/suppliers';
              if (hasPermission('inventory:products:read')) return '/inventory/products';
              return category.items[0]?.path || '#';
            };

            // Determine the default path for Sales category based on permissions
            const getSalesDefaultPath = () => {
              if (category.id !== 'sales') return category.items[0]?.path || '#';
              return '/quotes';
            };

            // Get the default path based on category
            const getDefaultPath = () => {
              if (category.id === 'services') return getServicesDefaultPath();
              if (category.id === 'business') return getBusinessDefaultPath();
              if (category.id === 'sales') return getSalesDefaultPath();
              return category.items[0]?.path || '#';
            };

            if (sidebarCollapsed) {
              // When collapsed, show only category icons
              return (
                <div key={category.id} className="mb-1">
                  <NavLink
                    to={getDefaultPath()}
                    className={() => 
                      `relative flex items-center justify-center px-3 py-2.5 rounded-lg transition-all duration-200 ${
                        isActive 
                          ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' 
                          : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                      }`
                    }
                    title={category.label}
                    end={category.id === 'settings'} // Use exact match for Settings to prevent /settings/attendance from matching
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white rounded-r-full" />
                    )}
                    <span className="flex-shrink-0">{category.icon}</span>
                  </NavLink>
                </div>
              );
            }
            
            return (
              <div key={category.id} className="mb-1">
                <NavLink
                  to={getDefaultPath()}
                  className={() => 
                    `relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                      isActive 
                        ? 'bg-brand-red text-white font-semibold shadow-lg shadow-brand-red/20' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`
                  }
                  end={category.id === 'settings'} // Use exact match for Settings to prevent /settings/attendance from matching
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
                  )}
                  <span className={`flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-70'}`}>{category.icon}</span>
                  <span className="text-sm font-medium flex-1">{category.label}</span>
                </NavLink>
                {showSubItems && (category.items.length > 1 || category.id === 'sales') && (
                  <div className="mt-1.5 ml-4 space-y-0.5">
                    {category.items
                      .filter(canSeeMenuItem)
                      .map(item => {
                        // Special handling: if we're viewing an opportunity, 
                        // don't highlight any individual items, only the category
                        let isItemActive = false;
                        if (isViewingOpportunity) {
                          // When viewing an opportunity, don't highlight individual items
                          isItemActive = false;
                        } else {
                          // Normal logic when not viewing an opportunity
                          // Special handling for Fleet Dashboard: only match exactly /fleet, not sub-paths
                          if (item.id === 'fleet-dashboard' && item.path === '/fleet') {
                            isItemActive = location.pathname === '/fleet';
                          }
                          // Special handling for Business Dashboard: only match exactly /business, not sub-paths
                          else if (item.id === 'business-dashboard' && item.path === '/business') {
                            isItemActive = location.pathname === '/business';
                          }
                          else {
                            isItemActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                          }
                        }

                        const visibleChildren = (item.children || []).filter(canSeeMenuItem);
                        const hasChildren = visibleChildren.length > 0;
                        const isAnyChildActive = hasChildren
                          ? visibleChildren.some(child => location.pathname === child.path || location.pathname.startsWith(child.path + '/'))
                          : false;
                        const isItemOrChildActive = isItemActive || isAnyChildActive;
                        // Only show children after user navigates to Suppliers (or a child like Products)
                        const isGroupExpanded = isItemActive || isAnyChildActive;

                        const selfNavigable = hasPermission(item.requiredPermission);

                        if (hasChildren) {
                          return (
                            <div key={item.id}>
                              {selfNavigable ? (
                                <NavLink
                                  to={item.path}
                                  // Dashboards should only be active on the exact route (/fleet, /business),
                                  // otherwise they stay highlighted on sub-routes like /fleet/assets.
                                  end={item.id === 'fleet-dashboard' || item.id === 'business-dashboard'}
                                  className={({ isActive: navActive }) =>
                                    `relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                                      (isItemOrChildActive || navActive)
                                        ? 'bg-brand-red/80 text-white font-medium shadow-md shadow-brand-red/10'
                                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                    }`
                                  }
                                >
                                  {(isItemOrChildActive || location.pathname === item.path || location.pathname.startsWith(item.path + '/')) && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
                                  )}
                                  <span className={`flex-shrink-0 ${(isItemOrChildActive || location.pathname === item.path || location.pathname.startsWith(item.path + '/')) ? 'opacity-100' : 'opacity-60'}`}>{item.icon}</span>
                                  <span className="text-xs flex-1">{item.label}</span>
                                </NavLink>
                              ) : (
                                <div
                                  className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                                    isItemOrChildActive
                                      ? 'bg-brand-red/80 text-white font-medium shadow-md shadow-brand-red/10'
                                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                  }`}
                                >
                                  {isItemOrChildActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
                                  )}
                                  <span className={`flex-shrink-0 ${isItemOrChildActive ? 'opacity-100' : 'opacity-60'}`}>{item.icon}</span>
                                  <span className="text-xs flex-1 text-left">{item.label}</span>
                                </div>
                              )}

                              {isGroupExpanded && (
                                <div className="mt-0.5 ml-6 space-y-0.5">
                                  {visibleChildren.map(child => {
                                    const childActive = !isViewingOpportunity && (location.pathname === child.path || location.pathname.startsWith(child.path + '/'));
                                    return (
                                      <NavLink
                                        key={child.id}
                                        to={child.path}
                                        className={() =>
                                          `relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                                            childActive
                                              ? 'bg-brand-red/70 text-white font-medium shadow-md shadow-brand-red/10'
                                              : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                                          }`
                                        }
                                      >
                                        {childActive && (
                                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
                                        )}
                                        <span className={`flex-shrink-0 ${childActive ? 'opacity-100' : 'opacity-60'}`}>{child.icon}</span>
                                        <span className="text-xs">{child.label}</span>
                                      </NavLink>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <NavLink
                            key={item.id}
                            to={item.path}
                            // Dashboards should only be active on the exact route (/fleet, /business),
                            // otherwise they stay highlighted on sub-routes like /fleet/assets.
                            end={item.id === 'fleet-dashboard' || item.id === 'business-dashboard'}
                            className={({isActive: navActive}) =>
                              `relative flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                                (isItemActive || navActive) 
                                  ? 'bg-brand-red/80 text-white font-medium shadow-md shadow-brand-red/10' 
                                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                              }`
                            }
                          >
                            {(isItemActive || location.pathname === item.path || location.pathname.startsWith(item.path + '/')) && (
                              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
                            )}
                            <span className={`flex-shrink-0 ${(isItemActive || location.pathname === item.path || location.pathname.startsWith(item.path + '/')) ? 'opacity-100' : 'opacity-60'}`}>{item.icon}</span>
                            <span className="text-xs">{item.label}</span>
                          </NavLink>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <main className={`flex-1 min-w-0 transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`} style={{ height: '100vh', overflowY: 'auto' }}>
        <div className="h-14 border-b border-gray-700/40 shadow-sm text-white flex items-center justify-between px-6 bg-gradient-to-r from-gray-700 via-gray-700 to-gray-800">
          <GlobalSearch
            widthClassName="w-[760px] max-w-[70vw]"
            maxRecents={4}
            isItemAllowed={canSeeGlobalSearchItem}
            getLocalSections={() => globalSearchLocalSections}
          />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="relative flex items-center gap-3">
              <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-3 hover:opacity-90 transition-opacity duration-200">
                <span className="text-base font-medium text-gray-50 max-w-[220px] truncate">{displayName}</span>
                <img src={avatarUrl} className="w-11 h-11 rounded-full border-2 border-gray-500/60 object-cover shadow-md"/>
              </button>
              <FixedBugReportButton />
              {open && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-gray-200/20 bg-white text-black shadow-xl z-50">
                  <Link to="/profile" onClick={()=>setOpen(false)} className="block px-4 py-2.5 hover:bg-gray-50 transition-colors duration-150">My Information</Link>
                  {reviewsAvailable?.available && (
                    <Link to="/reviews/my" onClick={()=>setOpen(false)} className="block px-4 py-2.5 hover:bg-gray-50 transition-colors duration-150">Employee Review</Link>
                  )}
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors duration-150">Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 min-h-full">{children}</div>
      </main>
      <InstallPrompt />
    </div>
  );
}


