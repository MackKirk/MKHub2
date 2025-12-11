import { PropsWithChildren, useState, useMemo, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import NotificationBell from '@/components/NotificationBell';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { useConfirm } from '@/components/ConfirmProvider';
import FixedBugReportButton from '@/components/FixedBugReportButton';
import InstallPrompt from '@/components/InstallPrompt';

type MenuItem = {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  category?: string;
  requiredPermission?: string;  // Permission required to see this item
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
      id: 'personal',
      label: 'Personal',
      icon: <IconUser />,
      items: [
        { id: 'home', label: 'Home', path: '/home', icon: <IconHome /> },
        { id: 'profile', label: 'My Information', path: '/profile', icon: <IconUser /> },
        { id: 'schedule', label: 'Schedule', path: '/schedule', icon: <IconCalendar /> },
        { id: 'clock-in-out', label: 'Clock in/out', path: '/clock-in-out', icon: <IconClock /> },
        { id: 'task-requests', label: 'Task Request', path: '/task-requests', icon: <IconClipboard /> },
        { id: 'tasks', label: 'Tasks', path: '/tasks', icon: <IconClipboard /> },
      ]
    },
    {
      id: 'business',
      label: 'Business',
      icon: <IconBriefcase />,
      items: [
        { id: 'business-dashboard', label: 'Dashboard', path: '/business', icon: <IconBriefcase /> },
        { id: 'customers', label: 'Customers', path: '/customers', icon: <IconUsers /> },
        { id: 'opportunities', label: 'Opportunities', path: '/opportunities', icon: <IconFileText /> },
        { id: 'projects', label: 'Projects', path: '/projects', icon: <IconBriefcase /> },
        { id: 'proposals', label: 'Proposals', path: '/proposals', icon: <IconFileText /> },
      ]
    },
    {
      id: 'inventory',
      label: 'Inventory',
      icon: <IconBox />,
      items: [
        { id: 'suppliers', label: 'Suppliers', path: '/inventory/suppliers', icon: <IconShoppingCart /> },
        { id: 'products', label: 'Products', path: '/inventory/products', icon: <IconBox /> },
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
            { id: 'reviews-admin', label: 'Reviews Admin', path: '/reviews/admin', icon: <IconStar />, requiredPermission: 'hr:reviews:admin' },
            { id: 'reviews-compare', label: 'Reviews Compare', path: '/reviews/compare', icon: <IconStar />, requiredPermission: 'hr:reviews:admin' }
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
    // Special handling for Business category: if we're viewing an opportunity, 
    // check against opportunities path instead of projects path
    if (category.id === 'business' && isViewingOpportunity) {
      const opportunitiesItem = category.items.find(item => item.id === 'opportunities');
      const projectsItem = category.items.find(item => item.id === 'projects');
      if (opportunitiesItem && projectsItem) {
        // If it's an opportunity, only consider opportunities as active, not projects
        return location.pathname === opportunitiesItem.path || location.pathname.startsWith(opportunitiesItem.path + '/') || 
               (location.pathname.startsWith('/projects/') && currentProject?.is_bidding);
      }
    }
    // Special handling for Business category: check if we're on the business dashboard
    if (category.id === 'business' && location.pathname === '/business') {
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
      return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    });
  };

  const activeCategory = useMemo(() => {
    return menuCategories.find(cat => isCategoryActive(cat));
  }, [location.pathname, menuCategories, currentProject, isViewingOpportunity]);


  return (
    <div className="min-h-screen flex">
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} text-white bg-gradient-to-b from-gray-800 via-gray-700 to-gray-600 transition-all duration-300 flex flex-col`}>
        <div className={`p-4 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between'} border-b border-gray-600`}>
          {!sidebarCollapsed ? (
            <>
              <div className="flex items-center gap-2">
                <img src="/ui/assets/login/logo-light.svg" className="h-8"/>
                <span className="text-sm text-gray-300 font-semibold">MK Hub</span>
              </div>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="text-gray-300 hover:text-white p-1 rounded hover:bg-gray-600 transition-colors"
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
              className="text-gray-300 hover:text-white p-1 rounded hover:bg-gray-600 transition-colors w-full flex items-center justify-center"
              title="Expand sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {menuCategories
            .filter(category => {
              // Filter categories that have no visible items
              const visibleItems = category.items.filter(item => {
                if (!item.requiredPermission) return true;
                if ((me?.roles||[]).includes('admin')) return true;
                const hasPermission = (me?.permissions||[]).includes(item.requiredPermission);
                // For HR permissions, also check legacy permissions for backward compatibility
                if (item.requiredPermission.startsWith('hr:')) {
                  const legacyPerm = item.requiredPermission.replace('hr:', '');
                  const hasLegacy = (me?.permissions||[]).includes(legacyPerm);
                  return hasPermission || hasLegacy;
                }
                return hasPermission;
              });
              return visibleItems.length > 0;
            })
            .map(category => {
            const isActive = isCategoryActive(category);
            const showSubItems = !sidebarCollapsed && isActive;
            
            if (sidebarCollapsed) {
              // When collapsed, show only category icons
              return (
                <div key={category.id} className="mb-2">
                  <NavLink
                    to={category.items[0]?.path || '#'}
                    className={() => 
                      `flex items-center justify-center px-3 py-2 rounded-lg transition-colors ${
                        isActive ? 'bg-brand-red text-white' : 'text-gray-300 hover:bg-gray-600 hover:text-white'
                      }`
                    }
                    title={category.label}
                    end={category.id === 'settings'} // Use exact match for Settings to prevent /settings/attendance from matching
                  >
                    <span className="flex-shrink-0">{category.icon}</span>
                  </NavLink>
                </div>
              );
            }
            
            return (
              <div key={category.id} className="mb-2">
                <NavLink
                  to={category.items[0]?.path || '#'}
                  className={() => 
                    `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive ? 'bg-brand-red text-white' : 'text-gray-300 hover:bg-gray-600 hover:text-white'
                    }`
                  }
                  end={category.id === 'settings'} // Use exact match for Settings to prevent /settings/attendance from matching
                >
                  <span className="flex-shrink-0">{category.icon}</span>
                  <span className="font-medium flex-1">{category.label}</span>
                </NavLink>
                {showSubItems && (
                  <div className="mt-1 ml-4 space-y-1">
                    {category.items
                      .filter(item => {
                        // Filter items based on permissions
                        if (!item.requiredPermission) return true;  // No permission required
                        if ((me?.roles||[]).includes('admin')) return true;  // Admin sees all
                        // Check if user has the required permission
                        const hasPermission = (me?.permissions||[]).includes(item.requiredPermission);
                        // For HR permissions, also check legacy permissions for backward compatibility
                        if (item.requiredPermission.startsWith('hr:')) {
                          // Map HR permissions to legacy: hr:users:read -> users:read
                          const legacyPerm = item.requiredPermission.replace('hr:', '');
                          const hasLegacy = (me?.permissions||[]).includes(legacyPerm);
                          return hasPermission || hasLegacy;
                        }
                        return hasPermission;
                      })
                      .map(item => {
                        // Special handling: if we're viewing an opportunity, 
                        // don't highlight any individual items, only the category
                        let isItemActive = false;
                        if (isViewingOpportunity) {
                          // When viewing an opportunity, don't highlight individual items
                          isItemActive = false;
                        } else {
                          // Normal logic when not viewing an opportunity
                          isItemActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                        }
                        return (
                          <NavLink
                            key={item.id}
                            to={item.path}
                            className={({isActive: navActive}) =>
                              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                (isItemActive || navActive) ? 'bg-brand-red/80 text-white' : 'text-gray-400 hover:bg-gray-600 hover:text-white'
                              }`
                            }
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="text-sm">{item.label}</span>
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
      <main className="flex-1 min-w-0">
        <div className="h-14 border-b text-white flex items-center justify-between px-4 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600">
          <input placeholder="Search" className="w-80 rounded-full px-3 py-1 text-sm bg-[#0c0e11] border border-[#1f242b]"/>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <div className="relative flex items-center gap-2">
              <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-3">
                <span className="text-base font-medium max-w-[220px] truncate">{displayName}</span>
                <img src={avatarUrl} className="w-10 h-10 rounded-full border-2 border-brand-red object-cover"/>
              </button>
              <FixedBugReportButton />
              {open && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-white text-black shadow-lg z-50">
                  <Link to="/profile" onClick={()=>setOpen(false)} className="block px-3 py-2 hover:bg-gray-50">My Information</Link>
                  <Link to="/reviews/my" onClick={()=>setOpen(false)} className="block px-3 py-2 hover:bg-gray-50">My Reviews</Link>
                  <button onClick={handleLogout} className="w-full text-left px-3 py-2 hover:bg-gray-50">Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </main>
      <InstallPrompt />
    </div>
  );
}


