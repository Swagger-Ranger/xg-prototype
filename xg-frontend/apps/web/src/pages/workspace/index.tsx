import { useAuth } from '@/hooks/useAuth';
import StudentWorkspace from './StudentWorkspace';
import CounselorWorkspace from './CounselorWorkspace';
import DeanWorkspace from './DeanWorkspace';
import AdminWorkspace from './AdminWorkspace';

export default function Workspace() {
  const { isStudent, isDean, isAdmin } = useAuth();
  if (isStudent) return <StudentWorkspace />;
  if (isAdmin) return <AdminWorkspace />;
  if (isDean) return <DeanWorkspace />;
  return <CounselorWorkspace />;
}
