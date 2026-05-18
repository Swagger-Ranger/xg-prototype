import { useAuth } from '@/hooks/useAuth';

/**
 * 勤工助学「仅管辖范围只读了解」视角判定（前端版，须与后端
 * com.xg.business.workstudy.security.WorkStudyManagedScope 同口径）。
 *
 * 命中条件：是 辅导员 / 班主任 / 院长 之一，且不兼任任何更宽视角的
 * 运营/管理角色（学工处 / 资助中心 / 学工部部长 / 校管理员 / 超管 / employer）
 * 与 student。这类用户在勤工助学里只看总览（在岗学生名单），其余 tab 全部隐藏，
 * 数据由后端按管辖学生集合硬收口。
 */
export function useIsWorkStudyScopedViewer(): boolean {
  const { isStudent, isCounselor, isClassMaster, isDean, isAdmin, isEmployer, hasRole } = useAuth();

  const isScopedRole = isCounselor || isClassMaster || isDean;
  const hasBroaderRole =
    isAdmin ||
    isEmployer ||
    isStudent ||
    hasRole('student_affairs_officer') ||
    hasRole('student_affairs_director') ||
    hasRole('aid_center_officer') ||
    hasRole('super_admin');

  return isScopedRole && !hasBroaderRole;
}
