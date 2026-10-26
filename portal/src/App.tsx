import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Protected from '@/lib/protected';
import PortalShell from '@/components/PortalShell';
import Login from '@/pages/Login';
import AcceptInvite from '@/pages/AcceptInvite';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';

export default function App() {
  return (
    <>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route element={<Protected />}>
          <Route element={<PortalShell />}>
            <Route index element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="files" element={<Navigate to="/" replace />} />
            <Route path="documents" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
