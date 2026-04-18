import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { Spin } from 'antd';
import AppLayout from './layouts/AppLayout';
import { useAuthStore } from './stores/auth.store';

const Login = lazy(() => import('./pages/login'));
const Workspace = lazy(() => import('./pages/workspace'));
const LeaveManagement = lazy(() => import('./pages/leave'));
const CollectionManagement = lazy(() => import('./pages/collection'));
const CheckinManagement = lazy(() => import('./pages/checkin'));
const NotificationManagement = lazy(() => import('./pages/notification'));
const ComplaintManagement = lazy(() => import('./pages/complaint'));
const StudentManagement = lazy(() => import('./pages/student'));
const SystemManagement = lazy(() => import('./pages/system'));

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function LoginRoute() {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/workspace" replace />;
  return <Login />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="/workspace" replace />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="leave" element={<LeaveManagement />} />
          <Route path="collection" element={<CollectionManagement />} />
          <Route path="checkin" element={<CheckinManagement />} />
          <Route path="notification" element={<NotificationManagement />} />
          <Route path="complaint" element={<ComplaintManagement />} />
          <Route path="student" element={<StudentManagement />} />
          <Route path="system/*" element={<SystemManagement />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
