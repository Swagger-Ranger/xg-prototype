/**
 * Single source of truth for role-code → Chinese label mapping.
 *
 * Anywhere we render an `approvalChain.roles[]` entry or a role-code Tag, we
 * pipe through {@link roleName}. Backend stores codes (counselor / class_master
 * / college_secretary / ...); the UI must always show Chinese.
 *
 * Keep aligned with backend `LeaveConfigHealthService.ROLE_NAMES_CN`.
 */
export const ROLE_NAMES: Record<string, string> = {
  counselor: '辅导员',
  class_master: '班主任',
  class_monitor: '班长',
  college_secretary: '院系书记',
  college_admin: '院系管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处人员',
  student_affairs_director: '学工部部长',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  aid_center_officer: '资助中心人员',
  employer: '用工单位',
  student: '学生',
};

/** Returns Chinese label or the raw code as a graceful fallback. */
export function roleName(code: string): string {
  return ROLE_NAMES[code] ?? code;
}

/** Render a list of role codes as `辅导员 + 院系书记`. */
export function roleNames(codes: string[]): string {
  return codes.map(roleName).join(' + ');
}

/** Antd Select options shape — lets editors share this single dictionary. */
export const ROLE_SELECT_OPTIONS = Object.entries(ROLE_NAMES).map(
  ([value, label]) => ({ value, label }),
);
