import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from './lib/queryClient';
import ConfirmProvider from './components/ConfirmProvider';
import AppShell from './AppShell';
import Login from './pages/Login';
import Protected from './lib/protected';
import Profile from './pages/Profile';
import HomePage from './pages/Home';
import Customers from './pages/Customers';
import CustomerNew from './pages/CustomerNew';
import Inventory from './pages/Inventory';
import InventorySuppliers from './pages/InventorySuppliers';
import InventoryProducts from './pages/InventoryProducts';
import InventoryOrders from './pages/InventoryOrders';
import Proposals from './pages/Proposals';
import Estimates from './pages/Estimates';
import EstimateEdit from './pages/EstimateEdit';
import ProposalNew from './pages/ProposalNew';
import ProposalView from './pages/ProposalView';
import ProposalEdit from './pages/ProposalEdit';
import CustomerDetail from './pages/CustomerDetail';
import SiteDetail from './pages/SiteDetail';
import Projects from './pages/Projects';
import ProjectNew from './pages/ProjectNew';
import ProjectDetail from './pages/ProjectDetail';
import SystemSettings from './pages/SystemSettings';
import Users from './pages/Users';
import UserInfo from './pages/UserInfo';
import ReviewsAdmin from './pages/ReviewsAdmin';
import MyReviews from './pages/MyReviews';
import ReviewsCompare from './pages/ReviewsCompare';
import UserDetail from './pages/UserDetail';
import LogHours from './pages/LogHours';
import CompanyFiles from './pages/CompanyFiles';
import TaskRequests from './pages/TaskRequests';
import Tasks from './pages/Tasks';
<<<<<<< HEAD
import Schedule from './pages/Schedule';
import Community from './pages/Community';
=======
import FleetDashboard from './pages/FleetDashboard';
import FleetVehicles from './pages/FleetVehicles';
import FleetHeavyMachinery from './pages/FleetHeavyMachinery';
import FleetOtherAssets from './pages/FleetOtherAssets';
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
>>>>>>> 5950ecbf7e178ffd3d822a932a0eee030aae00c4

import { getToken } from './lib/api';
function Home(){ return <Navigate to={getToken()? '/home':'/login'} replace />; }

export default function App(){
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | undefined;
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
      <Routes location={state?.backgroundLocation || location}>
        <Route path="/" element={<Home/>} />
        <Route path="/index.html" element={<Home/>} />
        <Route path="/login" element={<Login/>} />
        <Route element={<Protected/>}>
          <Route path="/home" element={<AppShell><HomePage/></AppShell>} />
          <Route path="/profile" element={<AppShell><Profile/></AppShell>} />
          <Route path="/schedule" element={<AppShell><Schedule/></AppShell>} />
          <Route path="/task-requests" element={<AppShell><TaskRequests/></AppShell>} />
          <Route path="/tasks" element={<AppShell><Tasks/></AppShell>} />
          <Route path="/customers" element={<AppShell><Customers/></AppShell>} />
          <Route path="/customers/new" element={<AppShell><CustomerNew/></AppShell>} />
          <Route path="/customers/:id" element={<AppShell><CustomerDetail/></AppShell>} />
          <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
          <Route path="/inventory" element={<AppShell><Inventory/></AppShell>} />
          <Route path="/inventory/suppliers" element={<AppShell><InventorySuppliers/></AppShell>} />
          <Route path="/inventory/products" element={<AppShell><InventoryProducts/></AppShell>} />
          <Route path="/inventory/orders" element={<AppShell><InventoryOrders/></AppShell>} />
          <Route path="/proposals" element={<AppShell><Proposals/></AppShell>} />
          <Route path="/estimates" element={<AppShell><Estimates/></AppShell>} />
          <Route path="/estimates/:id/edit" element={<AppShell><EstimateEdit/></AppShell>} />
          <Route path="/proposals/new" element={<AppShell><ProposalNew/></AppShell>} />
          <Route path="/proposals/:id" element={<AppShell><ProposalView/></AppShell>} />
          <Route path="/proposals/:id/edit" element={<AppShell><ProposalEdit/></AppShell>} />
          <Route path="/projects" element={<AppShell><Projects/></AppShell>} />
          <Route path="/projects/new" element={<AppShell><ProjectNew/></AppShell>} />
          <Route path="/projects/:id" element={<AppShell><ProjectDetail/></AppShell>} />
          <Route path="/settings" element={<AppShell><SystemSettings/></AppShell>} />
          <Route path="/company-files" element={<AppShell><CompanyFiles/></AppShell>} />
          <Route path="/log-hours" element={<AppShell><LogHours/></AppShell>} />
          <Route path="/users" element={<AppShell><Users/></AppShell>} />
          <Route path="/users/:userId" element={<AppShell><UserInfo/></AppShell>} />
          <Route path="/community" element={<AppShell><Community/></AppShell>} />
          <Route path="/reviews/admin" element={<AppShell><ReviewsAdmin/></AppShell>} />
          <Route path="/reviews/compare" element={<AppShell><ReviewsCompare/></AppShell>} />
          <Route path="/reviews/my" element={<AppShell><MyReviews/></AppShell>} />
          <Route path="/users/:id" element={<AppShell><UserDetail/></AppShell>} />
          <Route path="/fleet" element={<AppShell><FleetDashboard/></AppShell>} />
          <Route path="/fleet/vehicles" element={<AppShell><FleetVehicles/></AppShell>} />
          <Route path="/fleet/heavy-machinery" element={<AppShell><FleetHeavyMachinery/></AppShell>} />
          <Route path="/fleet/other-assets" element={<AppShell><FleetOtherAssets/></AppShell>} />
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
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      {state?.backgroundLocation && (
        <Routes>
          <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
          <Route path="/projects/new" element={<AppShell><ProjectNew/></AppShell>} />
        </Routes>
      )}
      <Toaster position="top-right" />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}


