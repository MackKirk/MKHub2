import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense, useEffect } from 'react';
import { resolvePostAuthDestination } from '@/lib/profileCompleteness';
import { queryClient } from './lib/queryClient';
import ConfirmProvider from './components/ConfirmProvider';
import UnsavedChangesProvider from './components/UnsavedChangesProvider';
import AppShell from './AppShell';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import Protected from './lib/protected';

import OnboardingWizard from './pages/OnboardingWizard';
import OnboardingDocuments from './pages/OnboardingDocuments';
const OnboardingAdmin = lazy(() => import('./pages/OnboardingAdmin'));
const ConstructionProjectDetail = lazy(() => import('./pages/ConstructionProjectDetail'));
const RmProjectDetail = lazy(() => import('./pages/RmProjectDetail'));
const RmOpportunityDetail = lazy(() => import('./pages/RmOpportunityDetail'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const DocumentCreator = lazy(() => import('./pages/DocumentCreator'));
const FleetAssetDetail = lazy(() => import('./pages/FleetAssetDetail'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const Training = lazy(() => import('./pages/Training'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const BusinessDashboard = lazy(() => import('./pages/BusinessDashboard'));

import Profile from './pages/Profile';
import HomePage from './pages/Home';
import Overview from './pages/Overview';
import Customers from './pages/Customers';
import CustomerNew from './pages/CustomerNew';
import Inventory from './pages/Inventory';
import InventorySuppliers from './pages/InventorySuppliers';
import InventoryProducts from './pages/InventoryProducts';
import Proposals from './pages/Proposals';
import ProposalNew from './pages/ProposalNew';
import ProposalView from './pages/ProposalView';
import ProposalEdit from './pages/ProposalEdit';
import Quotes from './pages/Quotes';
import QuoteNew from './pages/QuoteNew';
import QuoteDetail from './pages/QuoteDetail';
import SiteDetail from './pages/SiteDetail';
import Projects from './pages/Projects';
import ProjectNew from './pages/ProjectNew';
import Opportunities from './pages/Opportunities';
import OpportunityDetail from './pages/OpportunityDetail';
import Users from './pages/Users';
import UserInfo from './pages/UserInfo';
import EmployeeReviews from './pages/EmployeeReviews';
import MyReviews from './pages/MyReviews';
import ReviewsCompare from './pages/ReviewsCompare';
import UserDetail from './pages/UserDetail';
import LogHours from './pages/LogHours';
import CompanyFiles from './pages/CompanyFiles';
import TaskRequests from './pages/TaskRequests';
import Tasks from './pages/Tasks';
import Schedule from './pages/Schedule';
import ClockInOut from './pages/ClockInOut';
import Community from './pages/Community';
import CommunityGroups from './pages/CommunityGroups';
import CommunityInsights from './pages/CommunityInsights';
import CommunityNewPost from './pages/CommunityNewPost';
import FleetDashboard from './pages/FleetDashboard';
import FleetAssets from './pages/FleetAssets';
import FleetAssetNew from './pages/FleetAssetNew';
import EquipmentList from './pages/EquipmentList';
import EquipmentNew from './pages/EquipmentNew';
import EquipmentDetail from './pages/EquipmentDetail';
import WorkOrders from './pages/WorkOrders';
import WorkOrderNew from './pages/WorkOrderNew';
import Inspections from './pages/Inspections';
import InspectionNew from './pages/InspectionNew';
import InspectionScheduleDetail from './pages/InspectionScheduleDetail';
import InspectionDetail from './pages/InspectionDetail';
import FleetSchedulePage from './pages/FleetSchedulePage';
import TrainingCourse from './pages/TrainingCourse';
import TrainingCertificates from './pages/TrainingCertificates';
import TrainingAdmin from './pages/TrainingAdmin';
import TrainingCourseEdit from './pages/TrainingCourseEdit';
import SystemAdmin from './pages/SystemAdmin';
import Attendance from './pages/Attendance';
import Notifications from './pages/Notifications';
import Install from './pages/Install';
import { BusinessLineProvider } from './context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from './lib/businessLine';

const RouteFallback = () => <div className="min-h-[40vh] flex items-center justify-center text-gray-500">Loading...</div>;

import { getToken } from './lib/api';

/** Root `/` with token: resolve onboarding vs hub before navigating (matches post-login behavior). */
function Home() {
  const navigate = useNavigate();
  const token = getToken();
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const to = await resolvePostAuthDestination('/home');
        if (!cancelled) navigate(to, { replace: true });
      } catch {
        if (!cancelled) navigate('/home', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>
  );
}

export default function App(){
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | undefined;
  return (
    <QueryClientProvider client={queryClient}>
      <UnsavedChangesProvider>
      <ConfirmProvider>
      <Suspense fallback={<RouteFallback />}>
      <Routes location={state?.backgroundLocation || location}>
        <Route path="/" element={<Home/>} />
        <Route path="/index.html" element={<Home/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/password-reset" element={<PasswordReset/>} />
        <Route path="/install" element={<Install/>} />
        <Route element={<Protected/>}>
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/onboarding/documents" element={<OnboardingDocuments />} />
          <Route path="/onboarding/admin" element={<AppShell><OnboardingAdmin/></AppShell>} />
          <Route path="/home" element={<AppShell><HomePage/></AppShell>} />
          <Route path="/overview" element={<AppShell><Overview/></AppShell>} />
          <Route path="/profile" element={<AppShell><Profile/></AppShell>} />
          <Route path="/schedule" element={<AppShell><Schedule/></AppShell>} />
          <Route path="/clock-in-out" element={<AppShell><ClockInOut/></AppShell>} />
          <Route path="/task-requests" element={<AppShell><TaskRequests/></AppShell>} />
          <Route path="/tasks" element={<AppShell><Tasks/></AppShell>} />
          <Route path="/customers" element={<AppShell><Customers/></AppShell>} />
          <Route path="/customers/new" element={<AppShell><CustomerNew/></AppShell>} />
          <Route path="/customers/:id" element={<AppShell><CustomerDetail/></AppShell>} />
          <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
          <Route path="/inventory" element={<AppShell><Inventory/></AppShell>} />
          <Route path="/inventory/suppliers" element={<AppShell><InventorySuppliers/></AppShell>} />
          <Route path="/inventory/products" element={<AppShell><InventoryProducts/></AppShell>} />
          <Route path="/proposals" element={<AppShell><Proposals/></AppShell>} />
          <Route path="/proposals/new" element={<AppShell><ProposalNew/></AppShell>} />
          <Route path="/proposals/:id" element={<AppShell><ProposalView/></AppShell>} />
          <Route path="/proposals/:id/edit" element={<AppShell><ProposalEdit/></AppShell>} />
          <Route path="/quotes" element={<AppShell><Quotes/></AppShell>} />
          <Route path="/quotes/new" element={<AppShell><QuoteNew/></AppShell>} />
          <Route path="/quotes/:id" element={<AppShell><QuoteDetail/></AppShell>} />
          <Route path="/projects" element={<AppShell><Projects/></AppShell>} />
          <Route path="/projects/new" element={<AppShell><ProjectNew/></AppShell>} />
          <Route path="/projects/:id" element={<AppShell><ConstructionProjectDetail/></AppShell>} />
          <Route path="/opportunities" element={<AppShell><Opportunities/></AppShell>} />
          <Route path="/opportunities/:id" element={<AppShell><OpportunityDetail/></AppShell>} />
          <Route path="/business" element={<AppShell><BusinessDashboard/></AppShell>} />
          <Route path="/rm-opportunities" element={<AppShell><BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><Opportunities /></BusinessLineProvider></AppShell>} />
          <Route path="/rm-opportunities/:id" element={<AppShell><RmOpportunityDetail /></AppShell>} />
          <Route path="/rm-projects" element={<AppShell><BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><Projects /></BusinessLineProvider></AppShell>} />
          <Route path="/rm-projects/new" element={<AppShell><BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><ProjectNew /></BusinessLineProvider></AppShell>} />
          <Route path="/rm-projects/:id" element={<AppShell><RmProjectDetail /></AppShell>} />
          <Route path="/rm-business" element={<AppShell><BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><BusinessDashboard /></BusinessLineProvider></AppShell>} />
          <Route path="/settings" element={<AppShell><SystemSettings/></AppShell>} />
          <Route path="/company-files" element={<AppShell><CompanyFiles/></AppShell>} />
          <Route path="/documents/create" element={<AppShell><DocumentCreator/></AppShell>} />
          <Route path="/documents/create/:id" element={<AppShell><DocumentCreator/></AppShell>} />
          <Route path="/log-hours" element={<AppShell><LogHours/></AppShell>} />
          <Route path="/users" element={<AppShell><Users/></AppShell>} />
          <Route path="/users/:userId" element={<AppShell><UserInfo/></AppShell>} />
          <Route path="/settings/attendance" element={<AppShell><Attendance/></AppShell>} />
          <Route path="/community" element={<AppShell><Community/></AppShell>} />
          <Route path="/community/groups" element={<AppShell><CommunityGroups/></AppShell>} />
          <Route path="/community/insights" element={<AppShell><CommunityInsights/></AppShell>} />
          <Route path="/community/new-post" element={<AppShell><CommunityNewPost/></AppShell>} />
          <Route path="/reviews/admin" element={<AppShell><EmployeeReviews/></AppShell>} />
          <Route path="/reviews/compare" element={<AppShell><ReviewsCompare/></AppShell>} />
          <Route path="/reviews/my" element={<AppShell><MyReviews/></AppShell>} />
          <Route path="/users/:id" element={<AppShell><UserDetail/></AppShell>} />
          <Route path="/fleet" element={<AppShell><FleetDashboard/></AppShell>} />
          <Route path="/fleet/assets" element={<AppShell><FleetAssets/></AppShell>} />
          <Route path="/fleet/vehicles" element={<AppShell><FleetAssets/></AppShell>} />
          <Route path="/fleet/heavy-machinery" element={<AppShell><FleetAssets/></AppShell>} />
          <Route path="/fleet/other-assets" element={<AppShell><FleetAssets/></AppShell>} />
          <Route path="/fleet/assets/new" element={<AppShell><FleetAssetNew/></AppShell>} />
          <Route path="/fleet/assets/:id" element={<AppShell><FleetAssetDetail/></AppShell>} />
          <Route path="/fleet/equipment" element={<AppShell><EquipmentList/></AppShell>} />
          <Route path="/fleet/equipment/new" element={<AppShell><EquipmentNew/></AppShell>} />
          <Route path="/fleet/equipment/:id" element={<AppShell><EquipmentDetail/></AppShell>} />
          <Route path="/fleet/calendar" element={<AppShell><FleetSchedulePage/></AppShell>} />
          <Route path="/fleet/inspection-schedules" element={<Navigate to="/fleet/calendar" replace />} />
          <Route path="/fleet/inspection-schedules/:id" element={<AppShell><InspectionScheduleDetail/></AppShell>} />
          <Route path="/fleet/work-orders" element={<AppShell><WorkOrders/></AppShell>} />
          <Route path="/fleet/work-orders/new" element={<AppShell><WorkOrderNew/></AppShell>} />
          <Route path="/fleet/work-orders/:id" element={<AppShell><WorkOrderDetail/></AppShell>} />
          <Route path="/fleet/inspections" element={<AppShell><Inspections/></AppShell>} />
          <Route path="/fleet/inspections/new" element={<AppShell><InspectionNew/></AppShell>} />
          <Route path="/fleet/inspections/:id" element={<AppShell><InspectionDetail/></AppShell>} />
          <Route path="/training" element={<AppShell><Training/></AppShell>} />
          <Route path="/training/:courseId" element={<AppShell><TrainingCourse/></AppShell>} />
          <Route path="/training/certificates" element={<AppShell><TrainingCertificates/></AppShell>} />
          <Route path="/training/admin" element={<AppShell><TrainingAdmin/></AppShell>} />
          <Route path="/training/admin/new" element={<AppShell><TrainingCourseEdit/></AppShell>} />
          <Route path="/training/admin/:courseId" element={<AppShell><TrainingCourseEdit/></AppShell>} />
          <Route path="/admin/system" element={<AppShell><SystemAdmin/></AppShell>} />
          <Route path="/notifications" element={<AppShell><Notifications/></AppShell>} />
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      </Suspense>
      {state?.backgroundLocation && (
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
            <Route path="/projects/new" element={<AppShell><ProjectNew/></AppShell>} />
            <Route path="/quotes/new" element={<AppShell><QuoteNew/></AppShell>} />
          </Routes>
        </Suspense>
      )}
      <Toaster position="top-right" containerStyle={{ zIndex: 100002 }} />
      </ConfirmProvider>
      </UnsavedChangesProvider>
    </QueryClientProvider>
  );
}


