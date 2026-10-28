import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { resolvePostAuthDestination } from '@/lib/profileCompleteness';
import { queryClient } from './lib/queryClient';
import ConfirmProvider from './components/ConfirmProvider';
import UnsavedChangesProvider from './components/UnsavedChangesProvider';
import { ProductProvider } from './lib/ProductProvider';
import AppShell from './AppShell';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import Register from './pages/Register';
import PasswordReset from './pages/PasswordReset';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Protected from './lib/protected';

import OnboardingWizard from './pages/OnboardingWizard';
import OnboardingDocuments from './pages/OnboardingDocuments';
const OnboardingAdmin = lazy(() => import('./pages/OnboardingAdmin'));
const ConstructionProjectDetail = lazy(() => import('./pages/ConstructionProjectDetail'));
const RmProjectDetail = lazy(() => import('./pages/RmProjectDetail'));
const RmOpportunityDetail = lazy(() => import('./pages/RmOpportunityDetail'));
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'));
const DocumentCreator = lazy(() => import('./pages/DocumentCreator'));
const DocumentsTemplatesPage = lazy(() => import('./pages/DocumentsTemplatesPage'));
const PersonalSignaturesPage = lazy(() => import('./pages/PersonalSignaturesPage'));
const SignatureRequestsAdminPage = lazy(() => import('./pages/SignatureRequestsAdminPage'));
const SignatureEditorPage = lazy(() => import('./pages/SignatureEditorPage'));
const FleetAssetDetail = lazy(() => import('./pages/FleetAssetDetail'));
const WorkOrderDetail = lazy(() => import('./pages/WorkOrderDetail'));
const Training = lazy(() => import('./pages/Training'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const BusinessDashboard = lazy(() => import('./pages/BusinessDashboard'));
const SubcontractorsListPage = lazy(() => import('./pages/SubcontractorsListPage'));
const SubcontractorCompanyPage = lazy(() => import('./pages/SubcontractorCompanyPage'));
const SubcontractorWorkerPage = lazy(() => import('./pages/SubcontractorWorkerPage'));
const SubcontractorScanPage = lazy(() => import('./pages/SubcontractorScanPage'));
const PropertiesDashboard = lazy(() => import('./pages/PropertiesDashboard'));
const PropertiesList = lazy(() => import('./pages/PropertiesList'));
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const PropertyApprovalsBoard = lazy(() => import('./pages/PropertyApprovalsBoard'));
const PropertiesCalendar = lazy(() => import('./pages/PropertiesCalendar'));

import Announcements from './pages/Announcements';
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
import SiteDetail from './pages/SiteDetail';
import Projects from './pages/Projects';
import WarrantyReview from './pages/WarrantyReview';
import ProjectNew from './pages/ProjectNew';
import Opportunities from './pages/Opportunities';
import OpportunityDetail from './pages/OpportunityDetail';
import { RmLeakInvestigationDetailRedirect, RmLeakInvestigationsListRedirect } from './pages/RmLeakInvestigationRedirects';
import Users from './pages/Users';
import HrDataQualityOverview from './pages/HrDataQualityOverview';
import HrRequestsPage from './pages/HrRequestsPage';
const OffboardingListPage = lazy(() => import('./pages/OffboardingListPage'));
const OffboardingDetailPage = lazy(() => import('./pages/OffboardingDetailPage'));
import UserInfo from './pages/UserInfo';
import EmployeeReviews from './pages/EmployeeReviews';
import ReviewCyclesPage from './pages/ReviewCyclesPage';
import ReviewCycleDetailPage from './pages/ReviewCycleDetailPage';
import MyReviews from './pages/MyReviews';
import DirectorMeetingsPage from './pages/DirectorMeetingsPage';
import ReviewsCompare from './pages/ReviewsCompare';
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
import PrintRequestForm from './pages/PrintRequestForm';
import PrintShopList from './pages/PrintShopList';
import PrintShopNewRequest from './pages/PrintShopNewRequest';
import PrintShopDetail from './pages/PrintShopDetail';
import PrintShopSupplies from './pages/PrintShopSupplies';
import PrintShopSupplyOrders from './pages/PrintShopSupplyOrders';
import PrintShopSupplyOrderNew from './pages/PrintShopSupplyOrderNew';
import PrintShopSupplyOrderDetail from './pages/PrintShopSupplyOrderDetail';
import FleetDashboard from './pages/FleetDashboard';
import FleetAssets from './pages/FleetAssets';
import FleetAssetNew from './pages/FleetAssetNew';
import EquipmentList from './pages/EquipmentList';
import EquipmentNew from './pages/EquipmentNew';
import EquipmentDetail from './pages/EquipmentDetail';
import CompanyCreditCardsList from './pages/CompanyCreditCardsList';
import CompanyCreditCardNew from './pages/CompanyCreditCardNew';
import CompanyCreditCardDetail from './pages/CompanyCreditCardDetail';
import FuelCardsList from './pages/FuelCardsList';
import FuelCardNew from './pages/FuelCardNew';
import FuelCardDetail from './pages/FuelCardDetail';
import WorkOrders from './pages/WorkOrders';
import WorkOrderNew from './pages/WorkOrderNew';
import Inspections from './pages/Inspections';
import InspectionNew from './pages/InspectionNew';
import FleetInspectionsIdGate, { FleetInspectionScheduleLegacyRedirect } from './pages/FleetInspectionsIdGate';
import FleetSchedulePage from './pages/FleetSchedulePage';
import SafetyInspectionsPage from './pages/SafetyInspectionsPage';
import SafetyFollowUpsPage from './pages/SafetyFollowUpsPage';
import SafetyInspectionSignPage from './pages/SafetyInspectionSignPage';
import SafetySchedulePage from './pages/SafetySchedulePage';
import FormTemplatesPage from './pages/FormTemplatesPage';
import FormTemplateEditorPage from './pages/FormTemplateEditorPage';
import FormCustomListsPage from './pages/FormCustomListsPage';
import TrainingCourse from './pages/TrainingCourse';
import TrainingAdmin from './pages/TrainingAdmin';
import TrainingCourseEdit from './pages/TrainingCourseEdit';
import TrainingLearningDashboard from './pages/TrainingLearningDashboard';
import SystemAdmin from './pages/SystemAdmin';
import Tutorials from './pages/Tutorials';
import TutorialDetail from './pages/TutorialDetail';
import Attendance from './pages/Attendance';
import VeriClockImport from './pages/VeriClockImport';
import Notifications from './pages/Notifications';
import Install from './pages/Install';
import DesignSystemShowcase from './pages/dev/DesignSystemShowcase';
import { BusinessLineProvider } from './context/BusinessLineContext';
import { BUSINESS_LINE_REPAIRS_MAINTENANCE } from './lib/businessLine';

const RouteFallback = () => <div className="min-h-[40vh] flex items-center justify-center text-gray-600">Loading...</div>;

/** AppShell + area permission gate (ungated paths pass through RequirePermission). */
const shell = (page: ReactNode) => (
  <AppShell>
    <RequirePermission>{page}</RequirePermission>
  </AppShell>
);

/** Legacy URLs under /fleet/equipment → /company-assets/equipment (avoid /assets/* — static files) */
function LegacyFleetEquipmentDetailRedirect() {
  const { id } = useParams();
  if (!id) return <Navigate to="/company-assets/equipment" replace />;
  return <Navigate to={`/company-assets/equipment/${id}`} replace />;
}

/** Legacy Safety form template editor URLs → Documents & Forms */
function LegacySafetyFormTemplateRedirect() {
  const { id } = useParams();
  if (!id) return <Navigate to="/documents/form-templates" replace />;
  return <Navigate to={`/documents/form-templates/${id}`} replace />;
}

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
    <div className="min-h-screen flex items-center justify-center text-gray-600">Loading...</div>
  );
}

export default function App(){
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | undefined;
  return (
    <QueryClientProvider client={queryClient}>
      <UnsavedChangesProvider>
      <ConfirmProvider>
      <ProductProvider>
      <Suspense fallback={<RouteFallback />}>
      <Routes location={state?.backgroundLocation || location}>
        <Route path="/" element={<Home/>} />
        <Route path="/index.html" element={<Home/>} />
        <Route path="/login" element={<Login/>} />
        <Route path="/register" element={<Register/>} />
        <Route path="/password-reset" element={<PasswordReset/>} />
        <Route path="/install" element={<Install/>} />
        <Route path="/privacy" element={<PrivacyPolicy/>} />
        <Route path="/privacy-policy" element={<PrivacyPolicy/>} />
        <Route path="/print-request" element={<PrintRequestForm />} />
        <Route element={<Protected/>}>
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/onboarding/documents" element={<OnboardingDocuments />} />
          <Route path="/onboarding/admin" element={shell(<OnboardingAdmin/>)} />
          <Route path="/home" element={shell(<HomePage/>)} />
          <Route path="/home/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/overview" element={<Navigate to="/announcements" replace />} />
          <Route path="/announcements" element={shell(<Announcements/>)} />
          <Route path="/profile" element={shell(<Profile/>)} />
          <Route path="/schedule" element={shell(<Schedule/>)} />
          <Route path="/clock-in-out" element={shell(<ClockInOut/>)} />
          <Route path="/time-off" element={shell(<ClockInOut/>)} />
          <Route path="/sick-leave" element={shell(<ClockInOut/>)} />
          <Route path="/task-requests" element={shell(<TaskRequests/>)} />
          <Route path="/tasks" element={shell(<Tasks/>)} />
          <Route path="/print-shop" element={shell(<PrintShopList/>)} />
          <Route path="/print-shop/new" element={shell(<PrintShopNewRequest/>)} />
          <Route path="/print-shop/supplies" element={shell(<PrintShopSupplies/>)} />
          <Route path="/print-shop/supplies/orders" element={shell(<PrintShopSupplyOrders/>)} />
          <Route path="/print-shop/supplies/orders/new" element={shell(<PrintShopSupplyOrderNew/>)} />
          <Route path="/print-shop/supplies/orders/:id" element={shell(<PrintShopSupplyOrderDetail/>)} />
          <Route path="/print-shop/:id" element={shell(<PrintShopDetail/>)} />
          <Route path="/customers" element={shell(<Customers/>)} />
          <Route path="/customers/new" element={shell(<CustomerNew/>)} />
          <Route path="/customers/:id" element={shell(<CustomerDetail/>)} />
          <Route path="/customers/:customerId/sites/:siteId" element={shell(<SiteDetail/>)} />
          <Route path="/metals/customers" element={shell(<Customers/>)} />
          <Route path="/metals/customers/new" element={shell(<CustomerNew/>)} />
          <Route path="/metals/customers/:id" element={shell(<CustomerDetail/>)} />
          <Route path="/metals/customers/:customerId/sites/:siteId" element={shell(<SiteDetail/>)} />
          <Route path="/inventory" element={shell(<Inventory/>)} />
          <Route path="/inventory/suppliers" element={shell(<InventorySuppliers/>)} />
          <Route path="/inventory/products" element={shell(<InventoryProducts/>)} />
          <Route path="/proposals" element={shell(<Proposals/>)} />
          <Route path="/proposals/new" element={shell(<ProposalNew/>)} />
          <Route path="/proposals/:id" element={shell(<ProposalView/>)} />
          <Route path="/proposals/:id/edit" element={shell(<ProposalEdit/>)} />
          <Route path="/quotes" element={shell(<Quotes/>)} />
          <Route path="/quotes/new" element={shell(<QuoteNew/>)} />
          <Route path="/quotes/:id" element={shell(<QuoteDetail/>)} />
          <Route path="/projects" element={shell(<Projects/>)} />
          <Route path="/projects/new" element={shell(<ProjectNew/>)} />
          <Route path="/projects/:id" element={shell(<ConstructionProjectDetail/>)} />
          <Route path="/opportunities" element={shell(<Opportunities/>)} />
          <Route path="/opportunities/:id" element={shell(<OpportunityDetail/>)} />
          <Route path="/business" element={shell(<BusinessDashboard/>)} />
          <Route path="/business/subcontractors" element={shell(<SubcontractorsListPage />)} />
          <Route path="/business/subcontractors/scan" element={shell(<SubcontractorScanPage />)} />
          <Route path="/business/subcontractors/companies/:id" element={shell(<SubcontractorCompanyPage />)} />
          <Route path="/business/subcontractors/workers/:id" element={shell(<SubcontractorWorkerPage />)} />
          <Route path="/rm-opportunities" element={shell(<BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><Opportunities /></BusinessLineProvider>)} />
          <Route path="/rm-opportunities/:id" element={shell(<RmOpportunityDetail />)} />
          <Route path="/rm-leak-investigations" element={<RmLeakInvestigationsListRedirect />} />
          <Route path="/rm-leak-investigations/:id" element={<RmLeakInvestigationDetailRedirect />} />
          <Route path="/rm-projects" element={shell(<BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><Projects /></BusinessLineProvider>)} />
          <Route path="/rm-warranty-review" element={shell(<WarrantyReview />)} />
          <Route path="/rm-projects/new" element={shell(<BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><ProjectNew /></BusinessLineProvider>)} />
          <Route path="/rm-projects/:id" element={shell(<RmProjectDetail />)} />
          <Route path="/rm-business" element={shell(<BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><BusinessDashboard /></BusinessLineProvider>)} />
          <Route path="/settings" element={shell(<SystemSettings/>)} />
          <Route path="/company-files" element={shell(<CompanyFiles/>)} />
          <Route path="/documents/templates" element={shell(<DocumentsTemplatesPage/>)} />
          <Route path="/personal/signatures" element={shell(<PersonalSignaturesPage/>)} />
          <Route path="/documents/to-sign" element={<Navigate to="/personal/signatures" replace />} />
          <Route path="/documents/signature-requests" element={shell(<SignatureRequestsAdminPage/>)} />
          <Route path="/documents/create" element={shell(<DocumentCreator/>)} />
          <Route path="/documents/create/:id" element={shell(<DocumentCreator/>)} />
          <Route path="/documents/signature-editor" element={shell(<SignatureEditorPage/>)} />
          <Route path="/documents/form-templates" element={shell(<FormTemplatesPage />)} />
          <Route path="/documents/form-templates/:id" element={shell(<FormTemplateEditorPage />)} />
          <Route path="/documents/form-custom-lists" element={shell(<FormCustomListsPage />)} />
          <Route path="/log-hours" element={shell(<LogHours/>)} />
          <Route path="/users" element={shell(<Users/>)} />
          <Route path="/human-resources/overview" element={shell(<HrDataQualityOverview />)} />
          <Route path="/human-resources/requests" element={shell(<HrRequestsPage />)} />
          <Route path="/human-resources/offboarding" element={shell(<Suspense fallback={null}><OffboardingListPage /></Suspense>)} />
          <Route path="/human-resources/offboarding/:caseId" element={shell(<Suspense fallback={null}><OffboardingDetailPage /></Suspense>)} />
          <Route path="/users/:userId" element={shell(<UserInfo/>)} />
          <Route path="/settings/attendance" element={shell(<Attendance/>)} />
          <Route path="/human-resources/vericlock-import" element={shell(<VeriClockImport />)} />
          <Route path="/community" element={shell(<Community/>)} />
          <Route path="/community/groups" element={shell(<CommunityGroups/>)} />
          <Route path="/community/insights" element={shell(<CommunityInsights/>)} />
          <Route path="/community/new-post" element={shell(<CommunityNewPost/>)} />
          <Route path="/community/posts/:postId/edit" element={shell(<CommunityNewPost/>)} />
          <Route path="/reviews/admin" element={shell(<EmployeeReviews/>)} />
          <Route path="/reviews/cycles" element={shell(<ReviewCyclesPage />)} />
          <Route path="/reviews/cycles/:cycleId" element={shell(<ReviewCycleDetailPage />)} />
          <Route path="/reviews/form-templates" element={shell(<FormTemplatesPage variant="employee_review" />)} />
          <Route path="/reviews/form-templates/:id" element={shell(<FormTemplateEditorPage />)} />
          <Route path="/reviews/compare" element={shell(<ReviewsCompare/>)} />
          <Route path="/reviews/my" element={shell(<MyReviews/>)} />
          <Route path="/reviews/director-meetings" element={shell(<DirectorMeetingsPage />)} />
          <Route path="/safety/inspections" element={shell(<SafetyInspectionsPage />)} />
          <Route path="/safety/follow-ups" element={shell(<SafetyFollowUpsPage />)} />
          <Route path="/safety/sign/:projectId/:inspectionId" element={shell(<SafetyInspectionSignPage />)} />
          <Route path="/safety/calendar" element={shell(<SafetySchedulePage />)} />
          <Route path="/safety/form-templates" element={<Navigate to="/documents/form-templates" replace />} />
          <Route path="/safety/form-custom-lists" element={<Navigate to="/documents/form-custom-lists" replace />} />
          <Route path="/safety/form-templates/:id" element={<LegacySafetyFormTemplateRedirect />} />
          <Route path="/fleet" element={shell(<FleetDashboard/>)} />
          <Route path="/fleet/assets" element={shell(<FleetAssets/>)} />
          <Route path="/fleet/vehicles" element={shell(<FleetAssets/>)} />
          <Route path="/fleet/heavy-machinery" element={shell(<FleetAssets/>)} />
          <Route path="/fleet/other-assets" element={shell(<FleetAssets/>)} />
          <Route path="/fleet/assets/new" element={shell(<FleetAssetNew/>)} />
          <Route path="/fleet/assets/:id" element={shell(<FleetAssetDetail/>)} />
          <Route path="/company-assets/equipment" element={shell(<EquipmentList/>)} />
          <Route path="/company-assets/equipment/new" element={shell(<EquipmentNew/>)} />
          <Route path="/company-assets/equipment/:id" element={shell(<EquipmentDetail/>)} />
          <Route path="/company-assets/work-orders" element={shell(<WorkOrders scope="equipment"/>)} />
          <Route path="/company-assets/work-orders/:id" element={shell(<WorkOrderDetail/>)} />
          <Route path="/company-assets/credit-cards" element={shell(<CompanyCreditCardsList/>)} />
          <Route path="/company-assets/credit-cards/new" element={shell(<CompanyCreditCardNew/>)} />
          <Route path="/company-assets/credit-cards/:id" element={shell(<CompanyCreditCardDetail/>)} />
          <Route path="/company-assets/fuel-cards" element={shell(<FuelCardsList/>)} />
          <Route path="/company-assets/fuel-cards/new" element={shell(<FuelCardNew/>)} />
          <Route path="/company-assets/fuel-cards/:id" element={shell(<FuelCardDetail/>)} />
          <Route path="/properties" element={shell(<PropertiesDashboard/>)} />
          <Route path="/properties/list" element={shell(<PropertiesList/>)} />
          <Route path="/properties/approvals" element={shell(<PropertyApprovalsBoard/>)} />
          <Route path="/properties/calendar" element={shell(<PropertiesCalendar/>)} />
          <Route path="/properties/:id" element={shell(<PropertyDetail/>)} />
          <Route path="/fleet/equipment" element={<Navigate to="/company-assets/equipment" replace />} />
          <Route path="/fleet/equipment/new" element={<Navigate to="/company-assets/equipment/new" replace />} />
          <Route path="/fleet/equipment/:id" element={<LegacyFleetEquipmentDetailRedirect />} />
          <Route path="/fleet/calendar" element={shell(<FleetSchedulePage/>)} />
          <Route path="/fleet/inspection-schedules" element={<Navigate to="/fleet/calendar" replace />} />
          <Route path="/fleet/inspection-schedules/:id" element={<FleetInspectionScheduleLegacyRedirect />} />
          <Route path="/fleet/work-orders" element={shell(<WorkOrders scope="fleet"/>)} />
          <Route path="/fleet/work-orders/new" element={shell(<WorkOrderNew/>)} />
          <Route path="/fleet/work-orders/:id" element={shell(<WorkOrderDetail/>)} />
          <Route path="/fleet/inspections" element={shell(<Inspections/>)} />
          <Route path="/fleet/inspections/new" element={shell(<InspectionNew/>)} />
          <Route path="/fleet/inspections/:id" element={shell(<FleetInspectionsIdGate />)} />
          <Route path="/training" element={shell(<Training/>)} />
          <Route path="/training/certificates" element={<Navigate to="/training?tab=certificates" replace />} />
          <Route path="/training/dashboard" element={shell(<TrainingLearningDashboard />)} />
          <Route path="/training/hr-records" element={<Navigate to="/training/dashboard" replace />} />
          <Route path="/training/admin" element={shell(<TrainingAdmin/>)} />
          <Route path="/training/admin/new" element={shell(<TrainingCourseEdit/>)} />
          <Route path="/training/admin/:courseId" element={shell(<TrainingCourseEdit/>)} />
          <Route path="/training/:courseId" element={shell(<TrainingCourse/>)} />
          <Route path="/tutorials" element={shell(<Tutorials />)} />
          <Route path="/tutorials/:tutorialId" element={shell(<TutorialDetail />)} />
          <Route path="/logs" element={shell(<SystemAdmin />)} />
          <Route path="/admin/system" element={<Navigate to="/logs" replace />} />
          <Route path="/notifications" element={shell(<Notifications/>)} />
          <Route path="/dev/design-system" element={shell(<DesignSystemShowcase/>)} />
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      </Suspense>
      {state?.backgroundLocation && (
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/customers/:customerId/sites/:siteId" element={shell(<SiteDetail/>)} />
            <Route path="/projects/new" element={shell(<ProjectNew/>)} />
            <Route path="/rm-projects/new" element={shell(<BusinessLineProvider line={BUSINESS_LINE_REPAIRS_MAINTENANCE}><ProjectNew /></BusinessLineProvider>)} />
            <Route path="/quotes/new" element={shell(<QuoteNew/>)} />
          </Routes>
        </Suspense>
      )}
      <Toaster position="top-right" containerStyle={{ zIndex: 100002 }} />
      </ProductProvider>
      </ConfirmProvider>
      </UnsavedChangesProvider>
    </QueryClientProvider>
  );
}


