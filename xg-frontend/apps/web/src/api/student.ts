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
  /** 双轨制下的"生活线"归属。单轨学校永远 null。 */
  residential_academy?: string | null;
  residential_dorm_block?: string | null;
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
  /** 'male' / 'female' / undefined(不限)。映射到 sys_user.gender。 */
  gender?: string;
  /** 双轨制 filter,启用书院制时才有意义。 */
  academy?: string;
  dormBlock?: string;
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
 * 双轨制 filter 数据源 —— 书院 / 楼栋名字。返回空数组 = 该租户暂未配置书院。
 * 单独路径 /student-residential-options 避开 /students/{id} 冲突。
 */
export interface ResidentialOptions {
  academies: string[];
  dormBlocks: string[];
}
export function getResidentialOptions(): Promise<ResidentialOptions> {
  return api.get('/student-residential-options').then((res) => res.data);
}

/**
 * 改书院班 modal 用:扁平列出全部书院班(id + name + 所属书院 name)。
 * 比 getResidentialOptions 多一份 id —— 改绑定要按 id 写。
 */
export interface ResidentialClassEntry {
  id: number;
  name: string;
  academy_name: string | null;
}
export function getResidentialClasses(): Promise<ResidentialClassEntry[]> {
  return api.get('/student-residential-classes').then((res) => res.data);
}

/**
 * 改某学生的书院班归属。orgUnitId=null → 清空(不属于任何书院班)。
 * 后端只动 track='residential'+type='dorm_block' 那一行 membership,不影响学院班。
 */
export function updateResidentialClass(
  studentProfileId: string | number,
  orgUnitId: number | null,
): Promise<void> {
  return api
    .put(`/students/${studentProfileId}/residential-class`, { org_unit_id: orgUnitId })
    .then(() => undefined);
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
