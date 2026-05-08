import type { PageResult } from '@xg1/shared';
import api from './index';

export interface Student {
  id: string;
  user_id: string;
  student_no: string;
  name: string;
  gender: string;
  grade: string;
  college: string;
  major: string;
  class_name: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'graduated' | 'withdrawn';
  education_level: string;
  enrollment_date: string;
  created_at: string;
  extended_info?: Record<string, unknown> | null;
}

export interface StudentQueryParams {
  page: number;
  size: number;
  keyword?: string;
  grade?: string;
  status?: string;
  college?: string;
  major?: string;
  className?: string;
}

export function getStudents(params: StudentQueryParams): Promise<PageResult<Student>> {
  return api.get('/students', { params }).then((res) => res.data);
}

export function getStudent(id: string): Promise<Student> {
  return api.get(`/students/${id}`).then((res) => res.data);
}

/**
 * Distinct class names under an optional college / major filter, used by the
 * cascading 班级 filter on the student-info page. Backend mount is /student-classes
 * (not /students/classes — would clash with the {id} handler).
 */
export function getStudentClasses(params: { college?: string; major?: string }): Promise<string[]> {
  return api.get('/student-classes', { params }).then((res) => res.data);
}

/**
 * Current student's extended_info JSONB (紧急联系人电话 等)。
 * 表单在打开时拿这个数据预填，让学生少手填。非学生角色返回空对象。
 * 路径与 {id} 冲突的处理见后端 StudentController 注释。
 */
export function getMyExtendedInfo(): Promise<Record<string, unknown>> {
  return api.get('/students-me/extended-info').then((res) => res.data ?? {});
}

/**
 * Current student's own profile (学院/专业/班级/学籍状态等). Resolves the
 * student_profile row by sys_user.id rather than student_profile.id, so a
 * student can fetch their own data without already knowing the profile id.
 * Returns null for non-student callers (no student_profile row).
 */
export function getMyStudent(): Promise<Student | null> {
  return api.get('/students-me').then((res) => res.data ?? null);
}
