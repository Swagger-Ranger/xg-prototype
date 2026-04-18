import type { RoleCode } from '@xg1/shared';
import { useAuthStore } from '@/stores/auth.store';

export function useAuth() {
  const user = useAuthStore((s) => s.user);

  const hasPermission = (code: string) =>
    user?.permissions?.includes(code) ?? false;

  const hasRole = (role: string) =>
    user?.role_codes?.includes(role as RoleCode) ?? false;

  const isStudent = user?.role_codes?.includes('student') ?? false;
  const isCounselor = user?.role_codes?.includes('counselor') ?? false;
  const isDean = user?.role_codes?.includes('dean') ?? false;
  const isAdmin = user?.role_codes?.includes('school_admin') ?? false;

  return { user, hasPermission, hasRole, isStudent, isCounselor, isDean, isAdmin };
}
