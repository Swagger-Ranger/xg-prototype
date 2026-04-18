import type { RoleCode } from '../types/auth';

export const ROLE_LABELS: Record<RoleCode, string> = {
  student: '学生',
  counselor: '辅导员',
  college_admin: '院系管理员',
  dean: '院系领导',
  student_affairs_officer: '学工处人员',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
};

/** Roles that are considered "staff" (non-student) */
export const STAFF_ROLES: RoleCode[] = [
  'counselor',
  'college_admin',
  'dean',
  'student_affairs_officer',
  'school_admin',
  'super_admin',
];

export function isStaffRole(role: RoleCode): boolean {
  return STAFF_ROLES.includes(role);
}
