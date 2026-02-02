import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense } from 'react';
import { queryClient } from './lib/queryClient';
import ConfirmProvider from './components/ConfirmProvider';
import UnsavedChangesProvider from './components/UnsavedChangesProvider';
import AppShell from './AppShell';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import Protected from './lib/protected';

const OnboardingWizard = lazy(() => import('./pages/OnboardingWizard'));
import Profile from './pages/Profile';
import HomePage from './pages/Home';
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
import CustomerDetail from './pages/CustomerDetail';
import SiteDetail from './pages/SiteDetail';
import Projects from './pages/Projects';
import ProjectNew from './pages/ProjectNew';
import ProjectDetail from './pages/ProjectDetail';
import Opportunities from './pages/Opportunities';
import OpportunityDetail from './pages/OpportunityDetail';
import BusinessDashboard from './pages/BusinessDashboard';
import SystemSettings from './pages/SystemSettings';
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
import FleetAssetDetail from './pages/FleetAssetDetail';
import FleetAssetNew from './pages/FleetAssetNew';
import EquipmentList from './pages/EquipmentList';
import EquipmentNew from './pages/EquipmentNew';
import EquipmentDetail from './pages/EquipmentDetail';
import WorkOrders from './pages/WorkOrders';
import WorkOrderNew from './pages/WorkOrderNew';
import WorkOrderDetail from './pages/WorkOrderDetail';
import Inspections from './pages/Inspections';
import InspectionNew from './pages/InspectionNew';
import InspectionDetail from './pages/InspectionDetail';
import Training from './pages/Training';
import TrainingCourse from './pages/TrainingCourse';
import TrainingCertificates from './pages/TrainingCertificates';
import TrainingAdmin from './pages/TrainingAdmin';
import TrainingCourseEdit from './pages/TrainingCourseEdit';
import Attendance from './pages/Attendance';
import Notifications from './pages/Notifications';
import Install from './pages/Install';

import { getToken } from './lib/api';
function Home(){ return <Navigate to={getToken()? '/home':'/login'} replace />; }

export default function App(){
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | undefined;
  return (
    <QueryClientProvider client={queryClient}>
      <UnsavedChangesProvider>
      <ConfirmProvider>
      <Routes location={state?.backgroundLocation || location}>
        <Route path="/" element={<Home/>} />
        <Route path="/index.html" element={<Home/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/password-reset" element={<PasswordReset/>} />
        <Route path="/install" element={<Install/>} />
        <Route element={<Protected/>}>
          <Route path="/onboarding" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div>Loading...</div></div>}><OnboardingWizard/></Suspense>} />
          <Route path="/home" element={<AppShell><HomePage/></AppShell>} />
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
          <Route path="/projects/:id" element={<AppShell><ProjectDetail/></AppShell>} />
          <Route path="/opportunities" element={<AppShell><Opportunities/></AppShell>} />
          <Route path="/opportunities/:id" element={<AppShell><OpportunityDetail/></AppShell>} />
          <Route path="/business" element={<AppShell><BusinessDashboard/></AppShell>} />
          <Route path="/settings" element={<AppShell><SystemSettings/></AppShell>} />
          <Route path="/company-files" element={<AppShell><CompanyFiles/></AppShell>} />
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
          <Route path="/notifications" element={<AppShell><Notifications/></AppShell>} />
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      {state?.backgroundLocation && (
        <Routes>
          <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
          <Route path="/projects/new" element={<AppShell><ProjectNew/></AppShell>} />
          <Route path="/quotes/new" element={<AppShell><QuoteNew/></AppShell>} />
        </Routes>
      )}
      <Toaster position="top-right" />
      </ConfirmProvider>
      </UnsavedChangesProvider>
    </QueryClientProvider>
  );
}


