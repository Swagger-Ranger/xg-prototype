import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
const StudentManagement = lazy(() => import('./pages/student'));
const StudentProfile = lazy(() => import('./pages/student/profile'));
const StudentFieldManagement = lazy(() => import('./pages/student/fields'));
const SystemManagement = lazy(() => import('./pages/system'));
const WorkLogManagement = lazy(() => import('./pages/workLog'));
const ViolationManagement = lazy(() => import('./pages/violation'));
const WorkStudyManagement = lazy(() => import('./pages/workStudy'));
const AlertManagement = lazy(() => import('./pages/alert'));
const CounselorTalkManagement = lazy(() => import('./pages/counselorTalk'));
const WorkflowManagement = lazy(() => import('./pages/workflow'));
const FormManagement = lazy(() => import('./pages/forms'));
const LeaveConfigPage = lazy(() => import('./pages/leaveConfig'));
const ProfilePage = lazy(() => import('./pages/profile'));

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

// employer 仅允许访问勤工助学相关 URL（外加个人中心，否则连自己改密码都进不去）；
// 强制其他路径都跳回去，防止直接输入 URL 绕过 NavRail 的菜单过滤。
const EMPLOYER_ALLOWED_PREFIXES = ['/work-study', '/profile'];

function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace />;
  const isEmployer = user?.role_codes?.includes('employer') ?? false;
  if (isEmployer && !EMPLOYER_ALLOWED_PREFIXES.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/work-study" replace />;
  }
  return <AppLayout />;
}

// employer 没有工作台权限，所有 fallback 都得改路由到唯一开放的页面。
function DefaultLanding() {
  const user = useAuthStore((s) => s.user);
  const target = user?.role_codes?.includes('employer') ? '/work-study' : '/workspace';
  return <Navigate to={target} replace />;
}

function LoginRoute() {
  const token = useAuthStore((s) => s.token);
  if (token) return <DefaultLanding />;
  return <Login />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/" element={<ProtectedRoute />}>
          <Route index element={<DefaultLanding />} />
          <Route path="workspace" element={<Workspace />} />
          <Route path="leave" element={<LeaveManagement />} />
          <Route path="collection" element={<CollectionManagement />} />
          <Route path="checkin" element={<CheckinManagement />} />
          <Route path="notification" element={<NotificationManagement />} />
          <Route path="student" element={<StudentManagement />} />
          <Route path="student/fields" element={<StudentFieldManagement />} />
          <Route path="student/:id" element={<StudentProfile />} />
          <Route path="work-log" element={<WorkLogManagement />} />
          <Route path="violation" element={<ViolationManagement />} />
          <Route path="work-study" element={<WorkStudyManagement />} />
          <Route path="alerts" element={<AlertManagement />} />
          <Route path="counselor-talks" element={<CounselorTalkManagement />} />
          <Route path="workflows" element={<WorkflowManagement />} />
          <Route path="forms" element={<FormManagement />} />
          <Route path="leave-config" element={<LeaveConfigPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="system/*" element={<SystemManagement />} />
          <Route path="*" element={<DefaultLanding />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
