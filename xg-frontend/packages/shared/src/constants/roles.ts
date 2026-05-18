import type { RoleCode } from '../types/auth';

export const ROLE_LABELS: Record<RoleCode, string> = {
  student: '学生',
  counselor: '辅导员',
  class_master: '班主任',
  class_monitor: '班长',
  college_admin: '院系管理员',
  college_secretary: '院系书记',
  dean: '院系领导',
  student_affairs_officer: '学工处人员',
  student_affairs_director: '学工处部长',
  school_admin: '校级管理员',
  super_admin: '超级管理员',
  employer: '用工单位',
  aid_center_officer: '资助中心人员',
};

/** Roles that are considered "staff" (non-student) */
export const STAFF_ROLES: RoleCode[] = [
  'counselor',
  'class_master',
  'class_monitor',
  'college_admin',
  'college_secretary',
  'dean',
  'student_affairs_officer',
  'student_affairs_director',
  'school_admin',
  'super_admin',
  'employer',
  'aid_center_officer',
];

export function isStaffRole(role: RoleCode): boolean {
  return STAFF_ROLES.includes(role);
}
