import { useAuth } from '@/hooks/useAuth';
import StudentWorkspace from './StudentWorkspace';
import CounselorWorkspace from './CounselorWorkspace';
import DeanWorkspace from './DeanWorkspace';

export default function Workspace() {
  const { isStudent, isDean } = useAuth();
  if (isStudent) return <StudentWorkspace />;
  if (isDean) return <DeanWorkspace />;
  return <CounselorWorkspace />;
}
