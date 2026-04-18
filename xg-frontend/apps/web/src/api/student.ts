import type { PageResult } from '@xg1/shared';
import api from './index';

export interface Student {
  id: string;
  student_id: string;
  name: string;
  gender: string;
  grade: string;
  college: string;
  major: string;
  class_name: string;
  phone: string;
  email: string;
  status: 'active' | 'suspended' | 'graduated' | 'withdrawn';
  enrollment_date: string;
  created_at: string;
}

export interface StudentQueryParams {
  page: number;
  size: number;
  keyword?: string;
  grade?: string;
  status?: string;
}

export function getStudents(params: StudentQueryParams): Promise<PageResult<Student>> {
  return api.get('/students', { params }).then((res) => res.data);
}

export function getStudent(id: string): Promise<Student> {
  return api.get(`/students/${id}`).then((res) => res.data);
}
