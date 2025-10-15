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
import Inventory from './pages/Inventory';
import Proposals from './pages/Proposals';
import CustomerDetail from './pages/CustomerDetail';

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
          <Route path="/customers/:id" element={<AppShell><CustomerDetail/></AppShell>} />
          <Route path="/inventory" element={<AppShell><Inventory/></AppShell>} />
          <Route path="/proposals" element={<AppShell><Proposals/></AppShell>} />
        </Route>
        <Route path="*" element={<Navigate to={getToken()? '/home':'/login'} replace />} />
      </Routes>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}


