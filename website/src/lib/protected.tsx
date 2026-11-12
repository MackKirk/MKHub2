import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken } from './api';

export default function Protected() {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
