import { Navigate, Route, Routes } from 'react-router-dom';
import SiteShell from '@/components/SiteShell';
import Protected from '@/lib/protected';
import Home from '@/pages/Home';
import Catalog from '@/pages/Catalog';
import CatalogDetail from '@/pages/CatalogDetail';
import Quote from '@/pages/Quote';
import Orders from '@/pages/Orders';
import HowItWorks from '@/pages/HowItWorks';
import About from '@/pages/About';
import Contact from '@/pages/Contact';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Account from '@/pages/Account';
import AccountSubmission from '@/pages/AccountSubmission';
import SubmitSuccess from '@/pages/SubmitSuccess';
import Terms from '@/pages/Terms';
import Privacy from '@/pages/Privacy';

export default function App() {
  return (
    <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<Home />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="catalog/:slug" element={<CatalogDetail />} />
        <Route path="quote" element={<Quote />} />
        <Route path="orders" element={<Orders />} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="terms" element={<Terms />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="submit-success" element={<SubmitSuccess />} />
        <Route element={<Protected />}>
          <Route path="account" element={<Account />} />
          <Route path="account/submissions/:id" element={<AccountSubmission />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
