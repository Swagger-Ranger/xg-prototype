/**
 * Student profile API（学生自查 + extended_info）。
 *
 * Mini 只暴露"我自己"的 2 条端点：
 *   · GET /students-me — 当前学生 student_profile（学院/专业/班级/学籍状态）
 *   · GET /students-me/extended-info — 自助 extended_info（紧急联系人 等）
 *
 * 学生信息库 / 别人的档案页是 staff 专属，mini 不暴露。
 */
import { get } from '../utils/request';

export type StudentStatus = 'active' | 'suspended' | 'graduated' | 'withdrawn';

export interface MyStudent {
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
  status: StudentStatus;
  education_level: string;
  enrollment_date: string;
  created_at: string;
  extended_info?: Record<string, unknown> | null;
}

export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: '在读',
  suspended: '休学',
  graduated: '毕业',
  withdrawn: '退学',
};

export function getMyStudent() {
  return get<MyStudent | null>('/students-me');
}

export function getMyExtendedInfo() {
  return get<Record<string, unknown>>('/students-me/extended-info');
}
