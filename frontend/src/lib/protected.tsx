import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getToken } from './api';

export default function Protected(){
  const t = getToken();
  const loc = useLocation();
  if (!t) return <Navigate to="/login" replace state={{ from: loc.pathname+loc.search }} />;
  return <Outlet/>;
}


