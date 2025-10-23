import { Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { queryClient } from './lib/queryClient';
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
import CustomerDetail from './pages/CustomerDetail';
import SiteDetail from './pages/SiteDetail';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import SystemSettings from './pages/SystemSettings';
import Users from './pages/Users';
import UserInfo from './pages/UserInfo';
import ReviewsAdmin from './pages/ReviewsAdmin';
import MyReviews from './pages/MyReviews';
import ReviewsCompare from './pages/ReviewsCompare';
import UserDetail from './pages/UserDetail';
import LogHours from './pages/LogHours';

import { getToken } from './lib/api';
function Home(){ return <Navigate to={getToken()? '/home':'/login'} replace />; }

export default function App(){
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<Home/>} />
        <Route path="/index.html" element={<Home/>} />
        <Route path="/login" element={<Login/>} />
        <Route element={<Protected/>}>
          <Route path="/home" element={<AppShell><HomePage/></AppShell>} />
          <Route path="/profile" element={<AppShell><Profile/></AppShell>} />
          <Route path="/customers" element={<AppShell><Customers/></AppShell>} />
          <Route path="/customers/new" element={<AppShell><CustomerNew/></AppShell>} />
          <Route path="/customers/:id" element={<AppShell><CustomerDetail/></AppShell>} />
          <Route path="/customers/:customerId/sites/:siteId" element={<AppShell><SiteDetail/></AppShell>} />
          <Route path="/inventory" element={<AppShell><Inventory/></AppShell>} />
          <Route path="/inventory/suppliers" element={<AppShell><InventorySuppliers/></AppShell>} />
          <Route path="/inventory/products" element={<AppShell><InventoryProducts/></AppShell>} />
          <Route path="/inventory/orders" element={<AppShell><InventoryOrders/></AppShell>} />
          <Route path="/proposals" element={<AppShell><Proposals/></AppShell>} />
          <Route path="/projects" element={<AppShell><Projects/></AppShell>} />
          <Route path="/projects/:id" element={<AppShell><ProjectDetail/></AppShell>} />
          <Route path="/settings" element={<AppShell><SystemSettings/></AppShell>} />
          <Route path="/log-hours" element={<AppShell><LogHours/></AppShell>} />
          <Route path="/users" element={<AppShell><Users/></AppShell>} />
          <Route path="/users/:userId" element={<AppShell><UserInfo/></AppShell>} />
          <Route path="/reviews/admin" element={<AppShell><ReviewsAdmin/></AppShell>} />
          <Route path="/reviews/compare" element={<AppShell><ReviewsCompare/></AppShell>} />
          <Route path="/reviews/my" element={<AppShell><MyReviews/></AppShell>} />
          <Route path="/users/:id" element={<AppShell><UserDetail/></AppShell>} />
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}


