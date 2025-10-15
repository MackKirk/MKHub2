import { Navigate, Outlet } from 'react-router-dom';
import { getToken } from './api';

export default function Protected(){
  const t = getToken();
  if (!t) return <Navigate to="/login" replace />;
  return <Outlet/>;
}


